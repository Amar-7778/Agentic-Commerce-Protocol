import { VectorEngine } from './VectorEngine.js';
import { CatalogRepository } from '../db/repositories/CatalogRepository.js';
import { OrderRepository } from '../db/repositories/OrderRepository.js';
import { getDatabaseClient } from '../db/connection.js';
import { UniversalItem } from '../catalog/types.js';
import { config } from '../config/index.js';

export interface RecommendationResult {
  strategy: 'vector_personalized' | 'upsell_bundle' | 'reorder_nudge';
  reasoning: string;
  items: Array<UniversalItem & { recommendation_score: number; match_reason: string }>;
}

/**
 * Words that carry no product signal. Kept deliberately small: anything
 * product-specific belongs in the catalog, not in this list.
 */
const QUERY_STOP_WORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'buy', 'can', 'find', 'for', 'get', 'give',
  'have', 'how', 'i', 'is', 'it', 'looking', 'me', 'my', 'need', 'of', 'or',
  'please', 'show', 'some', 'that', 'the', 'to', 'want', 'what', 'with', 'you',
]);

export class RecommendationService {
  private static instance: RecommendationService;
  private vectorEngine: VectorEngine;
  private catalogRepo: CatalogRepository;
  private orderRepo: OrderRepository;

  private constructor() {
    this.vectorEngine = VectorEngine.getInstance();
    this.catalogRepo = CatalogRepository.getInstance();
    this.orderRepo = OrderRepository.getInstance();
  }

  public static getInstance(): RecommendationService {
    if (!RecommendationService.instance) {
      RecommendationService.instance = new RecommendationService();
    }
    return RecommendationService.instance;
  }

  /**
   * Ensure the vector index is hydrated with fresh catalog items.
   */
  public async ensureIndex(): Promise<void> {
    if (this.vectorEngine.getIndexedCount() === 0) {
      const searchRes = await this.catalogRepo.queryItems({ limit: config.catalog.vectorIndexSize });
      this.vectorEngine.buildIndex(searchRes.items);
    }
  }

  /** Rebuild the index — call after catalog ingestion so results stay current. */
  public async refreshIndex(): Promise<number> {
    const searchRes = await this.catalogRepo.queryItems({ limit: config.catalog.vectorIndexSize });
    this.vectorEngine.buildIndex(searchRes.items);
    return this.vectorEngine.getIndexedCount();
  }

  /** Meaningful query terms, stop words removed. */
  private queryTerms(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !QUERY_STOP_WORDS.has(w));
  }

  /**
   * 1. Personalized vector recommendations.
   *
   * Blends the shopper's stated context with their purchase history. Query
   * terms are expanded against the live catalog vocabulary (see
   * VectorEngine.expandQueryTokens) rather than a hand-written synonym table.
   */
  public async getPersonalizedRecommendations(
    userId: string,
    context?: string,
    limit: number = config.recommendations.defaultLimit
  ): Promise<RecommendationResult> {
    await this.ensureIndex();
    const db = getDatabaseClient();

    const historyRes = await db.query(
      `SELECT oi.item_id, oi.title, oi.attributes, o.created_at
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = $1 AND o.status = 'paid'
       ORDER BY o.created_at DESC LIMIT $2`,
      [userId, config.recommendations.orderHistoryWindow]
    );

    const tokens: string[] = [];
    let basis: string;

    if (context && context.trim() !== '') {
      const terms = this.queryTerms(context);
      // Weight the shopper's own words above the expansion by repeating them.
      tokens.push(...terms, ...terms);
      tokens.push(...this.vectorEngine.expandQueryTokens(terms));
      basis = 'stated_context';
    } else {
      for (const row of historyRes.rows) {
        tokens.push(...this.queryTerms(String(row.title || '')));
        if (row.attributes) {
          for (const value of Object.values(row.attributes)) {
            tokens.push(...this.queryTerms(String(value)));
          }
        }
      }
      basis = tokens.length > 0 ? 'purchase_history' : 'cold_start';
    }

    // Cold start: no context and no history. Rank against the catalog's own
    // most common vocabulary rather than an invented seed phrase.
    if (tokens.length === 0) {
      const catalogSample = this.vectorEngine.getIndexedItems().slice(0, limit * 2);
      for (const item of catalogSample) {
        tokens.push(...this.queryTerms(item.category));
        tokens.push(...(item.tags || []).map((t) => t.toLowerCase()));
      }
      basis = 'cold_start';
    }

    const affinityVector = this.vectorEngine.vectorizeTokens(tokens);
    const similar = this.vectorEngine.findSimilar(affinityVector, limit);

    const itemsWithScores = similar.map((s) => ({
      ...s.item,
      recommendation_score: Math.round(s.score * 100) / 100,
      match_reason: this.describeMatch(basis, context),
    }));

    return {
      strategy: 'vector_personalized',
      reasoning:
        `Ranked ${itemsWithScores.length} of ${this.vectorEngine.getIndexedCount()} indexed items by ` +
        `cosine similarity over universal-schema attributes (basis: ${basis}).`,
      items: itemsWithScores,
    };
  }

  private describeMatch(basis: string, context?: string): string {
    if (basis === 'stated_context' && context) {
      return `Closest catalog match for "${context.trim()}".`;
    }
    if (basis === 'purchase_history') {
      return 'Matches the categories and attributes in your previous paid orders.';
    }
    return 'Popular across connected platforms — shown while we learn your preferences.';
  }

  /**
   * 2. Proactive in-conversation upsell and cross-sell bundles.
   * Blends the cart's item vectors and finds the nearest items not already in it.
   */
  public async getUpsellBundle(
    cartItems: Array<{ item_id: string; quantity?: number }>,
    limit: number = config.recommendations.upsellLimit
  ): Promise<RecommendationResult> {
    await this.ensureIndex();
    if (!cartItems || cartItems.length === 0) {
      return {
        strategy: 'upsell_bundle',
        reasoning: 'No cart items supplied — nothing to build a bundle around.',
        items: [],
      };
    }

    const cartItemIds = cartItems.map((c) => c.item_id);
    const cartVectors: number[][] = [];
    const cartCategories = new Set<string>();
    const cartTokens: string[] = [];

    for (const itemId of cartItemIds) {
      const vec = this.vectorEngine.getItemVector(itemId);
      if (vec) cartVectors.push(vec);
      const item = await this.catalogRepo.getItemById(itemId);
      if (item) {
        cartCategories.add(item.category);
        cartTokens.push(...this.queryTerms(item.category), ...(item.tags || []));
      }
    }

    let blendedVector: number[];
    if (cartVectors.length > 0) {
      blendedVector = new Array(cartVectors[0].length).fill(0);
      for (const vec of cartVectors) {
        for (let i = 0; i < vec.length; i++) blendedVector[i] += vec[i];
      }
      let norm = 0;
      for (let i = 0; i < blendedVector.length; i++) norm += blendedVector[i] * blendedVector[i];
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (let i = 0; i < blendedVector.length; i++) blendedVector[i] /= norm;
      }
    } else {
      // Cart items aren't in the index (e.g. freshly ingested) — fall back to
      // their own category and tag vocabulary.
      blendedVector = this.vectorEngine.vectorizeTokens(cartTokens);
    }

    const candidates = this.vectorEngine.findSimilar(
      blendedVector,
      config.recommendations.upsellCandidatePool,
      cartItemIds
    );

    const upsellItems = candidates.slice(0, limit).map((c) => ({
      ...c.item,
      recommendation_score: Math.round(c.score * 100) / 100,
      match_reason: cartCategories.has(c.item.category)
        ? `Same ${c.item.category} range as your cart — pairs directly.`
        : `Frequently bought alongside ${Array.from(cartCategories).join(' / ') || 'these items'}.`,
    }));

    return {
      strategy: 'upsell_bundle',
      reasoning:
        `Found ${upsellItems.length} complementary items nearest the blended cart vector ` +
        `(${cartItemIds.length} line item${cartItemIds.length === 1 ? '' : 's'}).`,
      items: upsellItems,
    };
  }

  /**
   * 3. Reorder suggestions and repeat-purchase nudges.
   * Confidence is derived from how often the item was actually bought.
   */
  public async getReorderSuggestions(
    userId: string,
    limit: number = config.recommendations.reorderLookback
  ): Promise<RecommendationResult> {
    await this.ensureIndex();
    const db = getDatabaseClient();

    const pastItemsRes = await db.query(
      `SELECT oi.item_id, COUNT(*) as purchase_count, MAX(o.created_at) as last_ordered_at
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = $1 AND o.status = 'paid'
       GROUP BY oi.item_id
       ORDER BY purchase_count DESC, last_ordered_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    const reorderItems: Array<UniversalItem & { recommendation_score: number; match_reason: string }> = [];
    const maxCount = pastItemsRes.rows.reduce(
      (max, row) => Math.max(max, parseInt(row.purchase_count, 10) || 1),
      1
    );

    for (const row of pastItemsRes.rows) {
      const item = await this.catalogRepo.getItemById(row.item_id);
      if (!item) continue;
      const count = parseInt(row.purchase_count, 10) || 1;
      const lastOrdered = row.last_ordered_at ? new Date(row.last_ordered_at) : null;
      reorderItems.push({
        ...item,
        // Confidence tracks observed repeat frequency instead of a fixed number.
        recommendation_score: Math.round((count / maxCount) * 100) / 100,
        match_reason:
          `Ordered ${count} time${count === 1 ? '' : 's'}` +
          (lastOrdered ? `, most recently on ${lastOrdered.toISOString().slice(0, 10)}` : '') +
          '. Ready for one-tap reorder.',
      });
    }

    let reasoning =
      `Grouped ${pastItemsRes.rows.length} previously purchased item${pastItemsRes.rows.length === 1 ? '' : 's'} ` +
      `for ${userId} by repeat frequency.`;

    // No purchase history yet — say so, and offer catalog items instead of
    // pretending these are reorders.
    if (reorderItems.length === 0) {
      const popular = await this.catalogRepo.queryItems({ limit });
      popular.items.forEach((item) => {
        reorderItems.push({
          ...item,
          recommendation_score: 0,
          match_reason: 'No purchase history yet — shown as a starting point, not a reorder.',
        });
      });
      reasoning = `No paid orders on record for ${userId}; returning catalog starters instead of reorders.`;
    }

    return {
      strategy: 'reorder_nudge',
      reasoning,
      items: reorderItems.slice(0, limit),
    };
  }
}
