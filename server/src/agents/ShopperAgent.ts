import { A2AMessage, IntentHandoffPayload } from '../a2a/types.js';
import { A2ARouter } from '../a2a/A2ARouter.js';
import { PlatformAgent } from './PlatformAgent.js';
import { GroqService } from './GroqService.js';
import { AdapterRegistry } from '../adapters/AdapterRegistry.js';
import { CatalogRepository } from '../db/repositories/CatalogRepository.js';
import { GovernanceRepository } from '../db/repositories/GovernanceRepository.js';
import { RazorpayService } from '../services/RazorpayService.js';
import { ConversationRepository, ConversationSession } from '../db/repositories/ConversationRepository.js';
import { getDatabaseClient } from '../db/connection.js';
import { UniversalItem } from '../catalog/types.js';
import { config, formatMoney, taxRatePercentLabel } from '../config/index.js';
import { contentTokens } from '../catalog/text.js';
import crypto from 'crypto';

interface SessionContext {
  conversationId: string;
  lastQuery: string;
  lastPlatformId: string;
  lastCatalogItems: UniversalItem[];
  lastTopItem: any;
  quantity: number;
  selectedVariant?: { attribute: string; value: string };
  recentHistory: Array<{ role: 'user' | 'assistant'; text: string }>;
}

export type ChatEngine = 'llm_tool_calling' | 'deterministic_vector_a2a';

export interface ShopperReply {
  conversation_id: string;
  target_platform: string;
  natural_language_response: string;
  catalog_items: any[];
  proactive_upsell_bundle: any[];
  a2a_trace: A2AMessage[];
  engine_used: ChatEngine;
  /** Model id when the LLM answered, so the UI never claims a model it didn't use. */
  engine_model?: string;
  tool_events?: string[];
  intent_options?: Array<{ label: string; value: string; description?: string }>;
  container_title?: string;
  container_subtitle?: string;
}

function messageId(): string {
  return `a2a_msg_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
}

/** `driver_size_mm` → `Driver size mm`. Keys come from merchant data, not us. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function renderAttributeValue(value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) {
    const parts = value.filter((v) => v !== null && v !== undefined).map(String);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  if (typeof value === 'object') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const AVAILABILITY_COPY: Record<string, string> = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
  preorder: 'Available to pre-order',
  available_slots: 'Slots open',
};

/**
 * The Shopper Agent is the conversational front door.
 *
 * Two things it deliberately does not do: guess which platform a request belongs
 * to from a keyword list, and describe a product from memory. Routing comes from
 * where the catalog's best matches actually live, and every sentence about an
 * item is composed from that item's stored fields. Point it at a different
 * catalog and it keeps working.
 */
export class ShopperAgent {
  public userId: string;
  private router: A2ARouter;
  private platformAgents: Map<string, PlatformAgent> = new Map();
  private groqService: GroqService;
  private catalogRepo: CatalogRepository;
  private conversationRepo: ConversationRepository;
  private static memoryCache: Map<string, SessionContext> = new Map();

  constructor(userId: string = config.commerce.demoUserId) {
    this.userId = userId;
    this.router = A2ARouter.getInstance();
    this.groqService = GroqService.getInstance();
    this.catalogRepo = CatalogRepository.getInstance();
    this.conversationRepo = ConversationRepository.getInstance();

    // One agent per registered adapter — adding an adapter is the only step
    // needed to make a new platform conversationally reachable.
    for (const platform of AdapterRegistry.getInstance().getAllPlatforms()) {
      this.platformAgents.set(platform.id, new PlatformAgent(platform.id, platform.name));
    }
  }

  public listPlatforms(): Array<{ id: string; name: string }> {
    return Array.from(this.platformAgents.values()).map((a) => ({
      id: a.platformId,
      name: a.platformName,
    }));
  }

  private fallbackPlatformId(): string {
    const first = this.platformAgents.keys().next();
    return first.done ? 'platform_unknown' : first.value;
  }

  private agentFor(platformId: string): PlatformAgent {
    return (
      this.platformAgents.get(platformId) ||
      this.platformAgents.get(this.fallbackPlatformId()) ||
      new PlatformAgent(this.fallbackPlatformId(), 'Platform Agent')
    );
  }

  /**
   * Route by evidence: search every connected platform at once and let the
   * platform holding the strongest matches win. When nothing matches, stay on
   * the platform with the deepest catalog rather than inventing a preference.
   */
  private async determineTargetPlatform(query: string): Promise<{ platformId: string; probe: UniversalItem[] }> {
    const terms = contentTokens(query);
    if (terms.length === 0) {
      return { platformId: this.fallbackPlatformId(), probe: [] };
    }

    const searchRes = await this.catalogRepo.queryItems({
      query,
      limit: config.recommendations.defaultLimit,
    });

    const reachable = searchRes.items.filter((item) => this.platformAgents.has(item.platform_id));
    if (reachable.length === 0) {
      const busiest = searchRes.platforms.find((p) => this.platformAgents.has(p.id));
      return { platformId: busiest?.id || this.fallbackPlatformId(), probe: [] };
    }

    // Rank order already reflects relevance; weight the leaders so a single
    // strong hit isn't outvoted by a tail of weak ones.
    const weights = new Map<string, number>();
    reachable.forEach((item, index) => {
      const weight = reachable.length - index;
      weights.set(item.platform_id, (weights.get(item.platform_id) || 0) + weight);
    });

    const winner = Array.from(weights.entries()).sort((a, b) => b[1] - a[1])[0];
    return { platformId: winner[0], probe: reachable };
  }

  private dispatchIntent(conversationId: string, userPrompt: string, platformId: string) {
    const handoffMessage: A2AMessage<IntentHandoffPayload> = {
      id: messageId(),
      protocol: 'A2A-1.0',
      from_agent: 'shopper_agent',
      to_agent: 'platform_agent',
      message_type: 'intent_handoff',
      conversation_id: conversationId,
      payload: {
        user_id: this.userId,
        raw_user_intent: userPrompt,
        target_platform_id: platformId,
      },
      timestamp: new Date().toISOString(),
    };
    return handoffMessage;
  }

  /**
   * Describe an item strictly from its stored record.
   *
   * This is the fallback the demo runs on when no LLM key is present. It has to
   * be useful without being able to invent anything, so it reads back the
   * fields the merchant actually supplied and stops there.
   */
  private composeItemNarrative(item: UniversalItem, quantity: number): string {
    const lines: string[] = [];
    const unit = formatMoney(item.price, item.currency);
    const total = formatMoney(item.price * quantity, item.currency);

    lines.push(`${item.title} — ${unit}`);

    const attributeLines: string[] = [];
    for (const [key, value] of Object.entries(item.attributes || {})) {
      if (attributeLines.length >= config.chat.attributeDisplayLimit) break;
      const rendered = renderAttributeValue(value);
      if (rendered) attributeLines.push(`- ${humanizeKey(key)}: ${rendered}`);
    }

    if (item.category) lines.push(`- Category: ${item.category}`);
    lines.push(...attributeLines);

    const availability = AVAILABILITY_COPY[item.availability?.status] || item.availability?.status;
    if (availability) {
      const qty = item.availability?.quantity;
      lines.push(`- Availability: ${availability}${typeof qty === 'number' ? ` (${qty} on hand)` : ''}`);
    }

    if (item.rating && item.rating.count > 0) {
      lines.push(`- Rated ${item.rating.average} across ${item.rating.count} reviews`);
    }

    if (quantity > 1) {
      lines.push(`- Quantity: ${quantity} × ${unit} = ${total}`);
    }

    return lines.join('\n');
  }

  /** Broad-request choices built from the categories the catalog really has. */
  private async buildCategoryOptions(platformId?: string): Promise<Array<{ label: string; value: string; description?: string }>> {
    const res = await this.catalogRepo.queryItems({
      platform_id: platformId,
      limit: config.catalog.searchDefaultLimit,
    });

    const byCategory = new Map<string, UniversalItem[]>();
    for (const item of res.items) {
      const bucket = byCategory.get(item.category) || [];
      bucket.push(item);
      byCategory.set(item.category, bucket);
    }

    return Array.from(byCategory.entries())
      .slice(0, config.chat.intentOptionLimit)
      .map(([category, items]) => {
        const cheapest = items.reduce((min, i) => (i.price < min.price ? i : min), items[0]);
        return {
          label: category,
          value: cheapest.title,
          description: `${items.length} option${items.length === 1 ? '' : 's'} · from ${formatMoney(cheapest.price, cheapest.currency)}`,
        };
      });
  }

  /**
   * Answers about how the platform itself works, assembled from live policy so
   * the numbers quoted are the numbers enforced.
   */
  private async answerPlatformQuestion(lower: string): Promise<string | null> {
    const asksVerification = /verif|audit|ledger|proof|trace|how do (i|you) know/.test(lower);
    const asksPayment = /payment|pay|upi|card|checkout|settle|refund/.test(lower);
    const asksLimits = /limit|cap|threshold|approval|permission|governance|how much can/.test(lower);
    const asksCapability = /^(who are you|what can you do|what do you do|help)/.test(lower);

    if (asksLimits) {
      const policy = GovernanceRepository.getInstance().getPolicySnapshot();
      return [
        'Spending controls currently in force:',
        `- Autonomous ceiling: ${policy.labels.autonomous_step_up_threshold}. Above this I have to ask a human before paying.`,
        `- Hard per-transaction limit: ${policy.labels.hard_per_transaction_ceiling}. No approval can lift this.`,
        `- Default spend cap: ${policy.labels.default_spend_cap} where no per-user rule exists.`,
        `- Authorization tokens are single-use and expire after ${policy.authorization_token_ttl_minutes} minutes.`,
        `- Amounts must match the authorization within ${policy.amount_tolerance_percent}%.`,
      ].join('\n');
    }

    if (asksVerification) {
      return [
        'Every action I take is checkable:',
        '- Audit ledger: each authorization, spend and capture is written to an append-only log with the gate checks it passed.',
        '- Authorization refs: the ref shown on an order is the token that permitted it, and it can only be spent once.',
        '- Order records: totals, tax and payment references are stored server-side, not reconstructed for display.',
        'Open the Governance and Audit pages in the admin console to read the raw entries.',
      ].join('\n');
    }

    if (asksPayment) {
      const mode = RazorpayService.getInstance().getModeDescriptor();
      const lines = [
        `Settlement runs on Razorpay in ${mode.mode} mode.`,
        mode.live_api_enabled
          ? '- Live API calls are enabled, so payment links are created on Razorpay directly.'
          : '- Live API calls are disabled, so links are issued by the local test rail and no money moves.',
        '- Supported flows: hosted payment link and UPI AutoPay mandate for recurring authorization.',
        `- Payment callbacks are verified by HMAC-SHA256 signature; an unsigned callback settles only on the test rail and is recorded as unverified.`,
        `- Prices include ${taxRatePercentLabel()}% tax where the merchant marks them tax-inclusive.`,
      ];
      return lines.join('\n');
    }

    if (asksCapability) {
      const platforms = this.listPlatforms();
      return [
        'I am the shopper-side agent on this network. I can:',
        `- Search ${platforms.length} connected platform${platforms.length === 1 ? '' : 's'} through one universal catalog schema.`,
        '- Assemble an order, apply merchant campaigns, and settle it over Razorpay rails.',
        '- Stop and ask for human approval whenever an action exceeds its spending authority.',
        `Connected right now: ${platforms.map((p) => p.name).join(', ')}.`,
      ].join('\n');
    }

    return null;
  }

  /**
   * Load session from PostgreSQL with in-memory cache fallback.
   */
  private async loadSession(conversationId: string): Promise<SessionContext | undefined> {
    const cached = ShopperAgent.memoryCache.get(conversationId);
    if (cached) return cached;

    try {
      const dbSession = await this.conversationRepo.getSession(conversationId);
      if (dbSession) {
        const session: SessionContext = {
          conversationId: dbSession.conversation_id,
          lastQuery: '',
          lastPlatformId: dbSession.last_platform_id || this.fallbackPlatformId(),
          lastCatalogItems: [],
          lastTopItem: dbSession.active_item_data,
          quantity: dbSession.quantity || 1,
          selectedVariant: dbSession.selected_variant || undefined,
          recentHistory: dbSession.recent_history || [],
        };
        ShopperAgent.memoryCache.set(conversationId, session);
        return session;
      }
    } catch {
      // DB read failed — not fatal, proceed without session.
    }
    return undefined;
  }

  /**
   * Persist session to both in-memory cache and PostgreSQL.
   */
  private async saveSession(session: SessionContext): Promise<void> {
    ShopperAgent.memoryCache.set(session.conversationId, session);
    try {
      await this.conversationRepo.upsertSession({
        conversation_id: session.conversationId,
        user_id: this.userId,
        active_item_id: session.lastTopItem?.id || null,
        active_item_data: session.lastTopItem || null,
        quantity: session.quantity,
        selected_variant: session.selectedVariant || null,
        last_platform_id: session.lastPlatformId,
        recent_history: (session.recentHistory || []).slice(-8),
      });
    } catch (e) {
      console.warn('⚠️ [ShopperAgent] Failed to persist session:', e);
    }
  }

  /**
   * Fetch recent past orders from PostgreSQL for LLM context.
   */
  private async fetchPastOrders(): Promise<any[]> {
    try {
      const db = getDatabaseClient();
      const res = await db.query(
        `SELECT oi.item_id, oi.title, o.created_at
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         WHERE o.user_id = $1 AND o.status = 'paid'
         ORDER BY o.created_at DESC LIMIT 5`,
        [this.userId]
      );
      return res.rows;
    } catch {
      return [];
    }
  }

  /**
   * Process an incoming shopper prompt end to end.
   */
  public async handleUserPrompt(
    userPrompt: string,
    conversationId: string = `conv_${Date.now()}`
  ): Promise<ShopperReply> {
    const trimmed = userPrompt.trim();
    const lower = trimmed.toLowerCase();
    const toolEvents: string[] = [];
    const existingSession = await this.loadSession(conversationId);

    // ---- Multi-turn follow-ups that operate on the item already on screen ----

    const decrementMatch = lower.match(
      /^(?:minus|remove|decrease|reduce|subtract|take away|less)\s*(\d+)?/i
    );
    if (decrementMatch && existingSession?.lastTopItem) {
      const step = parseInt(decrementMatch[1] || '1', 10) || 1;
      return this.applyQuantity(
        conversationId,
        existingSession,
        Math.max(1, (existingSession.quantity || 1) - step),
        toolEvents,
        'decremented'
      );
    }

    const incrementMatch = lower.match(/^(?:plus|add|another|one more|increase)\s*(\d+)?/i);
    if (incrementMatch && existingSession?.lastTopItem) {
      const step = parseInt(incrementMatch[1] || '1', 10) || 1;
      return this.applyQuantity(
        conversationId,
        existingSession,
        (existingSession.quantity || 1) + step,
        toolEvents,
        'incremented'
      );
    }

    const quantityMatch = lower.match(
      /^(?:i\s*(?:want|need)\s*|give me\s*|make it\s*|count\s*(?:of)?\s*|quantity\s*|qty\s*|order\s*)?(\d+)\s*(?:units?|pieces?|nos|items?|portions?|plates?|servings?)?$/i
    );
    if (quantityMatch && existingSession?.lastTopItem) {
      const requested = parseInt(quantityMatch[1], 10);
      if (requested > 0) {
        return this.applyQuantity(conversationId, existingSession, requested, toolEvents, 'set');
      }
    }

    // Variant selection: only accept a value the item actually offers, matched
    // against its own attributes. No default finish is invented.
    if (existingSession?.lastTopItem && trimmed.split(/\s+/).length <= 4) {
      const variant = this.matchVariant(existingSession.lastTopItem, lower);
      if (variant) {
        const quantity = existingSession.quantity || 1;
        const baseItem = existingSession.lastTopItem;
        const updatedItem = { ...baseItem, quantity, selectedVariant: variant };

        existingSession.selectedVariant = variant;
        existingSession.lastTopItem = updatedItem;
        toolEvents.push(`context_resolver:variant_selected -> ${variant.attribute}=${variant.value}`);

        const responseText =
          `${humanizeKey(variant.attribute)} set to ${variant.value} for ${baseItem.title}.\n` +
          `Total for ${quantity} × ${formatMoney(baseItem.price, baseItem.currency)} is ` +
          `${formatMoney(baseItem.price * quantity, baseItem.currency)}. Ready to check out.`;

        const history = [...(existingSession.recentHistory || [])];
        history.push({ role: 'assistant' as const, text: responseText });
        existingSession.recentHistory = history.slice(-8);
        await this.saveSession(existingSession);

        return {
          conversation_id: conversationId,
          target_platform: existingSession.lastPlatformId,
          natural_language_response: responseText,
          catalog_items: [updatedItem],
          proactive_upsell_bundle: [],
          a2a_trace: this.router.getConversationTrace(conversationId),
          engine_used: 'deterministic_vector_a2a',
          tool_events: toolEvents,
          container_title: 'Selected configuration',
          container_subtitle: `${humanizeKey(variant.attribute)}: ${variant.value}`,
        };
      }
    }

    // ---- Route across the universal catalog, then answer ----

    const { platformId: targetPlatformId } = await this.determineTargetPlatform(trimmed);
    const platformAgent = this.agentFor(targetPlatformId);

    const handoffMessage = this.dispatchIntent(conversationId, userPrompt, targetPlatformId);
    toolEvents.push(`a2a_dispatch:intent_handoff -> ${platformAgent.platformName}`);
    await this.router.dispatch(handoffMessage);

    // Preferred path: the LLM answers directly, whatever the input looks
    // like. Greetings, platform questions, and product searches all go
    // through the same tool-calling loop — nothing is intercepted by a
    // hardcoded template while a real model is configured and reachable.
    if (this.groqService.isAvailable()) {
      try {
        const pastOrders = await this.fetchPastOrders();
        const groqResult = await this.groqService.chatWithTools(userPrompt, this.userId, {
          activeItem: existingSession?.lastTopItem,
          quantity: existingSession?.quantity,
          pastOrders,
          recentHistory: existingSession?.recentHistory,
        });

        const resolvedPlatform = groqResult.targetPlatform || targetPlatformId;
        const items = groqResult.items.slice(0, config.recommendations.conversationalResultLimit);

        for (const call of groqResult.toolTrace) {
          toolEvents.push(`mcp:${call.tool}${call.ok ? '' : ` (failed: ${call.error})`}`);
        }

        if (items.length > 0) {
          await this.rememberSession(conversationId, userPrompt, resolvedPlatform, items, existingSession, groqResult.naturalLanguageResponse);
        } else {
          // Even without items, record the exchange for context continuity.
          await this.appendHistory(conversationId, userPrompt, groqResult.naturalLanguageResponse, existingSession);
        }

        return {
          conversation_id: conversationId,
          target_platform: resolvedPlatform,
          natural_language_response: groqResult.naturalLanguageResponse,
          catalog_items: items,
          proactive_upsell_bundle: groqResult.upsellBundle,
          a2a_trace: this.router.getConversationTrace(conversationId),
          engine_used: 'llm_tool_calling',
          engine_model: groqResult.model,
          tool_events: toolEvents,
          container_title: items.length > 0 ? 'Matched across the universal catalog' : undefined,
          container_subtitle: items.length > 0 ? `${this.agentFor(resolvedPlatform).platformName} · settlement ready` : undefined,
        };
      } catch (err: any) {
        // A dead model or a rate limit must not take the demo down. Say what
        // happened in the trace and fall back to the deterministic engine below.
        console.warn(`⚠️ [ShopperAgent] LLM path unavailable (${err?.message}); using the deterministic engine.`);
        toolEvents.push(`llm_unavailable:${err?.message || 'unknown error'}`);
      }
    }

    // ---- Deterministic fallback (no LLM configured, or the call above failed) ----

    const isGreeting = /^(hello|hi|hey|yo|howdy|greetings|good (morning|afternoon|evening))\b/i.test(lower);
    if (isGreeting) {
      const platforms = this.listPlatforms();
      return {
        conversation_id: conversationId,
        target_platform: this.fallbackPlatformId(),
        natural_language_response:
          `Hello. I can search ${platforms.length} connected platform${platforms.length === 1 ? '' : 's'} ` +
          `and settle an order for you. What are you looking for?`,
        catalog_items: [],
        proactive_upsell_bundle: [],
        a2a_trace: this.router.getConversationTrace(conversationId),
        engine_used: 'deterministic_vector_a2a',
        tool_events: toolEvents,
        intent_options: await this.buildCategoryOptions(),
      };
    }

    const platformAnswer = await this.answerPlatformQuestion(lower);
    const looksLikeQuestion = /^(how|what|where|why|who|can|does|is|do)\b/.test(lower) || lower.includes('?');
    if (platformAnswer && looksLikeQuestion) {
      toolEvents.push('policy_reader:governance_snapshot');
      return {
        conversation_id: conversationId,
        target_platform: this.fallbackPlatformId(),
        natural_language_response: platformAnswer,
        catalog_items: [],
        proactive_upsell_bundle: [],
        a2a_trace: this.router.getConversationTrace(conversationId),
        engine_used: 'deterministic_vector_a2a',
        tool_events: toolEvents,
      };
    }

    const meaningfulTerms = contentTokens(trimmed);
    if (meaningfulTerms.length === 0) {
      const options = await this.buildCategoryOptions();
      return {
        conversation_id: conversationId,
        target_platform: this.fallbackPlatformId(),
        natural_language_response:
          options.length > 0
            ? 'Tell me a bit more about what you need. These are the categories currently live on the network:'
            : 'The catalog is empty right now — run an adapter ingestion from the admin console and I will have something to search.',
        catalog_items: [],
        proactive_upsell_bundle: [],
        a2a_trace: this.router.getConversationTrace(conversationId),
        engine_used: 'deterministic_vector_a2a',
        tool_events: toolEvents,
        intent_options: options,
      };
    }

    // Deterministic search: vector + keyword search over the universal catalog.
    toolEvents.push('vector_engine:search_catalog');
    const catalogResponse = await platformAgent.handleIntentHandoff(handoffMessage);
    let items: UniversalItem[] = catalogResponse.payload.matched_items || [];
    const upsell = catalogResponse.payload.upsell_bundle || [];

    items = items.slice(0, config.recommendations.conversationalResultLimit);

    const reorderNotice = await this.detectRepeatPurchase(items);
    const quantity = existingSession?.quantity || 1;

    let nlResponse: string;
    if (items.length === 0) {
      const options = await this.buildCategoryOptions(targetPlatformId);
      nlResponse =
        `I searched ${platformAgent.platformName} but found nothing matching "${trimmed}". ` +
        (options.length > 0 ? 'Here is what is available instead:' : 'The catalog may still be empty.');

      return {
        conversation_id: conversationId,
        target_platform: targetPlatformId,
        natural_language_response: nlResponse,
        catalog_items: [],
        proactive_upsell_bundle: [],
        a2a_trace: this.router.getConversationTrace(conversationId),
        engine_used: 'deterministic_vector_a2a',
        tool_events: toolEvents,
        intent_options: options,
      };
    }

    const topItem = items[0];
    const narrative = this.composeItemNarrative(topItem, quantity);
    const alternatives = items.slice(1);

    nlResponse = `${reorderNotice}Closest match on ${platformAgent.platformName}:\n\n${narrative}`;
    if (alternatives.length > 0) {
      nlResponse +=
        `\n\nAlso matching: ` +
        alternatives.map((i) => `${i.title} (${formatMoney(i.price, i.currency)})`).join(' · ');
    }
    nlResponse += '\n\nSay a quantity to adjust the order, or check out to settle it.';

    await this.rememberSession(conversationId, userPrompt, targetPlatformId, items, existingSession, nlResponse);

    return {
      conversation_id: conversationId,
      target_platform: targetPlatformId,
      natural_language_response: nlResponse,
      catalog_items: items,
      proactive_upsell_bundle: upsell,
      a2a_trace: this.router.getConversationTrace(conversationId),
      engine_used: 'deterministic_vector_a2a',
      tool_events: toolEvents,
      container_title: `${topItem.category} · ${platformAgent.platformName}`,
      container_subtitle:
        items.length === 1
          ? 'Single high-confidence match'
          : `${items.length} matches ranked by relevance`,
    };
  }

  private async rememberSession(
    conversationId: string,
    userPrompt: string,
    platformId: string,
    items: any[],
    previous?: SessionContext,
    agentResponse?: string
  ): Promise<void> {
    const history = [...(previous?.recentHistory || [])];
    history.push({ role: 'user' as const, text: userPrompt });
    if (agentResponse) {
      history.push({ role: 'assistant' as const, text: agentResponse });
    }

    const session: SessionContext = {
      conversationId,
      lastQuery: userPrompt,
      lastPlatformId: platformId,
      lastCatalogItems: items,
      lastTopItem: items[0],
      quantity: previous?.quantity || 1,
      selectedVariant: previous?.selectedVariant,
      recentHistory: history.slice(-8),
    };
    await this.saveSession(session);
  }

  /**
   * Record a conversation exchange that didn't produce catalog items.
   */
  private async appendHistory(
    conversationId: string,
    userPrompt: string,
    agentResponse: string,
    previous?: SessionContext
  ): Promise<void> {
    const history = [...(previous?.recentHistory || [])];
    history.push({ role: 'user' as const, text: userPrompt });
    history.push({ role: 'assistant' as const, text: agentResponse });

    const session: SessionContext = {
      conversationId,
      lastQuery: userPrompt,
      lastPlatformId: previous?.lastPlatformId || this.fallbackPlatformId(),
      lastCatalogItems: previous?.lastCatalogItems || [],
      lastTopItem: previous?.lastTopItem,
      quantity: previous?.quantity || 1,
      selectedVariant: previous?.selectedVariant,
      recentHistory: history.slice(-8),
    };
    await this.saveSession(session);
  }

  private async applyQuantity(
    conversationId: string,
    session: SessionContext,
    newQuantity: number,
    toolEvents: string[],
    verb: 'incremented' | 'decremented' | 'set'
  ): Promise<ShopperReply> {
    const baseItem = session.lastTopItem;
    const updatedItem = { ...baseItem, quantity: newQuantity };

    session.quantity = newQuantity;
    session.lastTopItem = updatedItem;
    toolEvents.push(`context_resolver:quantity_${verb} -> ${newQuantity}`);

    const unit = formatMoney(baseItem.price, baseItem.currency);
    const total = formatMoney(baseItem.price * newQuantity, baseItem.currency);
    const responseText =
      `${newQuantity} × ${baseItem.title}.\n` +
      `- Unit price: ${unit}\n` +
      `- Order total: ${total}\n\n` +
      'Check out when you are ready and I will take it through the governance gate.';

    const history = [...(session.recentHistory || [])];
    history.push({ role: 'assistant' as const, text: responseText });
    session.recentHistory = history.slice(-8);

    await this.saveSession(session);

    return {
      conversation_id: conversationId,
      target_platform: session.lastPlatformId,
      natural_language_response: responseText,
      catalog_items: [updatedItem],
      proactive_upsell_bundle: [],
      a2a_trace: this.router.getConversationTrace(conversationId),
      engine_used: 'deterministic_vector_a2a',
      tool_events: toolEvents,
      container_title: 'Order summary',
      container_subtitle: `Quantity ${newQuantity} · ${total}`,
    };
  }

  /**
   * Match a short reply against the values the active item actually lists —
   * "black" only resolves if some attribute of that item says black.
   */
  private matchVariant(item: any, lower: string): { attribute: string; value: string } | null {
    const cleaned = lower.replace(/[^a-z0-9\s-]/g, ' ').trim();
    if (!cleaned) return null;

    for (const [key, raw] of Object.entries(item.attributes || {})) {
      const candidates: string[] = Array.isArray(raw)
        ? raw.map(String)
        : typeof raw === 'string'
          ? [raw]
          : [];

      for (const candidate of candidates) {
        const candidateLower = candidate.toLowerCase();
        if (candidateLower === cleaned || candidateLower.includes(cleaned)) {
          return { attribute: key, value: candidate };
        }
      }
    }

    return null;
  }

  /**
   * Has this shopper bought one of these items before? Compared by item id, so
   * it cannot mistake a lookalike title for a repeat purchase.
   */
  private async detectRepeatPurchase(items: UniversalItem[]): Promise<string> {
    if (items.length === 0) return '';

    try {
      const db = getDatabaseClient();
      const res = await db.query(
        `SELECT oi.item_id, oi.title, MAX(o.created_at) as last_ordered_at
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         WHERE o.user_id = $1 AND o.status = 'paid'
         GROUP BY oi.item_id, oi.title
         ORDER BY last_ordered_at DESC
         LIMIT $2`,
        [this.userId, config.chat.reorderCheckWindow]
      );

      const previous = res.rows.find((row: any) => items.some((i) => i.id === row.item_id));
      if (!previous) return '';

      const when = previous.last_ordered_at
        ? new Date(previous.last_ordered_at).toISOString().slice(0, 10)
        : null;
      return `You ordered ${previous.title}${when ? ` on ${when}` : ''}. Reorder it or pick something else below.\n\n`;
    } catch {
      // History is a nicety, not a requirement — never block an answer on it.
      return '';
    }
  }

  /**
   * Complete checkout via A2A.
   */
  public async checkout(params: {
    items: Array<{ item_id: string; quantity: number }>;
    platform_id?: string;
    offer_code?: string;
    payment_method_preference?: 'payment_link' | 'upi_mandate';
    conversation_id: string;
  }) {
    const platformAgent = this.agentFor(params.platform_id || this.fallbackPlatformId());

    return await platformAgent.checkoutOrder({
      user_id: this.userId,
      items: params.items,
      offer_code: params.offer_code,
      payment_method_preference: params.payment_method_preference,
      conversation_id: params.conversation_id,
    });
  }
}
