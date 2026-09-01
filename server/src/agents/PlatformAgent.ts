import {
  A2AMessage,
  IntentHandoffPayload,
  CatalogHandoffPayload,
  SettlementRequestPayload,
  SettlementResponsePayload,
} from '../a2a/types.js';
import { A2ARouter } from '../a2a/A2ARouter.js';
import { PaymentAgent } from './PaymentAgent.js';
import { executeMcpTool } from '../mcp/tools.js';
import { config } from '../config/index.js';
import { CampaignService } from '../campaigns/CampaignService.js';
import { OrderRepository } from '../db/repositories/OrderRepository.js';
import { getDatabaseClient } from '../db/connection.js';
import crypto from 'crypto';

function messageId(): string {
  return `a2a_msg_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
}

export class PlatformAgent {
  public platformId: string;
  public platformName: string;
  private router: A2ARouter;
  private paymentAgent: PaymentAgent;
  private campaignService: CampaignService;
  private orderRepo: OrderRepository;

  constructor(platformId: string, platformName: string) {
    this.platformId = platformId;
    this.platformName = platformName;
    this.router = A2ARouter.getInstance();
    this.paymentAgent = PaymentAgent.getInstance();
    this.campaignService = CampaignService.getInstance();
    this.orderRepo = OrderRepository.getInstance();
  }

  /** Resolves a merchant's display name once, for settlement responses. */
  private async resolveMerchantName(merchantId: string): Promise<string | undefined> {
    try {
      const db = getDatabaseClient();
      const res = await db.query('SELECT name FROM merchants WHERE id = $1 LIMIT 1', [merchantId]);
      return res.rows[0]?.name;
    } catch {
      return undefined;
    }
  }

  /**
   * Handle incoming user intent handoff from Shopper Agent
   */
  public async handleIntentHandoff(
    handoffMessage: A2AMessage<IntentHandoffPayload>
  ): Promise<A2AMessage<CatalogHandoffPayload>> {
    const { payload, conversation_id } = handoffMessage;

    // 1. Search Catalog using MCP Search Tool
    const searchRes = await executeMcpTool('search_catalog', {
      query: payload.raw_user_intent,
      category: payload.extracted_category,
      platform_id: payload.target_platform_id || this.platformId,
      max_price: payload.price_budget,
      limit: config.recommendations.defaultLimit,
    });

    let matchedItems = searchRes.items || [];

    // 2. If no direct keyword match, fall back to Vector Semantic Search on this platform
    if (matchedItems.length === 0) {
      const recsRes = await executeMcpTool('get_recommendations', {
        user_id: payload.user_id,
        context: payload.raw_user_intent,
        limit: config.recommendations.upsellLimit,
      });
      if (recsRes.items && recsRes.items.length > 0) {
        const platformItems = recsRes.items.filter(
          (item: any) => !this.platformId || item.platform_id === this.platformId
        );
        matchedItems =
          platformItems.length > 0
            ? platformItems
            : recsRes.items.slice(0, config.recommendations.conversationalResultLimit);
      }
    }

    // 3. Proactive In-Conversation Upsell Bundle Generation
    // Look up complementary companion accessories for the top candidate
    let upsellBundle: any[] = [];
    if (matchedItems.length > 0) {
      const topItemId = matchedItems[0].id;
      const upsellRes = await executeMcpTool('get_upsell_bundle', {
        cart_items: [{ item_id: topItemId }],
        limit: config.recommendations.conversationalResultLimit,
      });
      upsellBundle = upsellRes.items || [];
    }

    const responsePayload: CatalogHandoffPayload = {
      platform_id: this.platformId,
      matched_items: matchedItems,
      upsell_bundle: upsellBundle,
      message: `Found ${matchedItems.length} matching catalog items on ${this.platformName}. Proactive upsell companions identified.`,
    };

    const responseMessage: A2AMessage<CatalogHandoffPayload> = {
      id: messageId(),
      protocol: 'A2A-1.0',
      from_agent: 'platform_agent',
      to_agent: handoffMessage.from_agent,
      message_type: 'catalog_response',
      conversation_id,
      payload: responsePayload,
      timestamp: new Date().toISOString(),
    };

    await this.router.dispatch(responseMessage);
    return responseMessage;
  }

  /**
   * Complete Order Checkout by creating order and delegating settlement to Payment Agent via A2A
   */
  public async checkoutOrder(params: {
    user_id: string;
    items: Array<{ item_id: string; quantity: number }>;
    shipping_address?: any;
    offer_code?: string;
    payment_method_preference?: 'payment_link' | 'upi_mandate';
    conversation_id: string;
  }): Promise<A2AMessage<SettlementResponsePayload>> {
    // 1. Create Order via MCP
    const order = await executeMcpTool('create_order', {
      items: params.items,
      user_id: params.user_id,
      shipping_address: params.shipping_address,
    });

    let currentTotal = order.total_amount;

    // 2. Apply Offer if requested (with pre-auth)
    if (params.offer_code) {
      try {
        const offerPreauth = await executeMcpTool('request_preauthorization', {
          action: 'apply_offer',
          amount: 0,
          reason: `Apply discount code "${params.offer_code}"`,
          user_id: params.user_id,
          order_id: order.id,
        });

        if (offerPreauth.approved && offerPreauth.authorization_ref) {
          const discounted = await executeMcpTool('apply_offer', {
            order_id: order.id,
            offer_code: params.offer_code,
            authorization_ref: offerPreauth.authorization_ref,
          });
          currentTotal = discounted.total_amount;
        }
      } catch (err) {
        console.warn('⚠️ Could not apply offer:', err);
      }
    }

    // 2b. Auto-apply eligible merchant growth campaigns — this is the actual
    // revenue-growth mechanism: a cart that clears a campaign's threshold gets
    // its discount without the shopper needing to know a code exists.
    const appliedCampaigns: Array<{ id: string; name: string; discount_amount: number }> = [];
    try {
      const campaignResult = await this.campaignService.evaluateCartCampaigns(
        order.items,
        order.subtotal_amount,
        order.merchant_id
      );

      if (campaignResult.total_campaign_discount > 0) {
        const updated = await this.orderRepo.applyCampaignDiscount(order.id, campaignResult.total_campaign_discount);
        currentTotal = updated.total_amount;

        for (const cmp of campaignResult.matched_campaigns) {
          const share = campaignResult.matched_campaigns.length > 1
            ? campaignResult.total_campaign_discount / campaignResult.matched_campaigns.length
            : campaignResult.total_campaign_discount;
          await this.campaignService.recordCampaignSpend(cmp.id, share, order.id);
          appliedCampaigns.push({ id: cmp.id, name: cmp.name, discount_amount: Math.round(share) });
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not evaluate campaigns:', err);
    }

    const merchantName = await this.resolveMerchantName(order.merchant_id);

    // 3. Formulate A2A Settlement Request to Payment Agent
    const settlementRequestPayload: SettlementRequestPayload = {
      order_id: order.id,
      user_id: params.user_id,
      merchant_id: order.merchant_id,
      platform_id: this.platformId,
      items: order.items,
      total_amount: currentTotal,
      applied_offer_code: params.offer_code,
      payment_method_preference: params.payment_method_preference || 'payment_link',
      reason: `Autonomous purchase of ${order.items.length} items on ${this.platformName}`,
    };

    const settlementMessage: A2AMessage<SettlementRequestPayload> = {
      id: messageId(),
      protocol: 'A2A-1.0',
      from_agent: 'platform_agent',
      to_agent: 'payment_agent',
      message_type: 'settlement_request',
      conversation_id: params.conversation_id,
      payload: settlementRequestPayload,
      timestamp: new Date().toISOString(),
    };

    await this.router.dispatch(settlementMessage);

    // 4. Delegate to Centralized Payment Agent
    const settlementResponse = await this.paymentAgent.handleSettlementRequest(settlementMessage);
    settlementResponse.payload.merchant_name = merchantName;
    if (appliedCampaigns.length > 0) {
      settlementResponse.payload.applied_campaigns = appliedCampaigns;
    }
    return settlementResponse;
  }
}
