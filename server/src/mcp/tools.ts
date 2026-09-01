import { McpToolDefinition, AuditEntry } from './types.js';
import { CatalogService } from '../catalog/CatalogService.js';
import { OrderRepository } from '../db/repositories/OrderRepository.js';
import { GovernanceRepository } from '../db/repositories/GovernanceRepository.js';
import { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';
import { RazorpayService } from '../services/RazorpayService.js';
import { RecommendationService } from '../recommendations/RecommendationService.js';
import { CampaignService } from '../campaigns/CampaignService.js';
import { AdapterRegistry } from '../adapters/AdapterRegistry.js';
import { config } from '../config/index.js';

const catalogService = CatalogService.getInstance();
const orderRepo = OrderRepository.getInstance();
const governanceRepo = GovernanceRepository.getInstance();
const auditRepo = AuditLogRepository.getInstance();
const razorpayService = RazorpayService.getInstance();
const recommendationService = RecommendationService.getInstance();
const campaignService = CampaignService.getInstance();

const inr = (amount: number): string => `₹${amount.toLocaleString('en-IN')}`;

/**
 * The model calling this tool only sees platform IDs mentioned in prompts,
 * descriptions, or its own memory — it can plausibly guess "platform_swiggy"
 * when the real ID is "platform_swiggy_builders". Rather than silently
 * filtering to zero rows on a typo'd ID, resolve it against what's actually
 * registered: exact match first, then substring match either direction, and
 * only give up (search all platforms) when nothing plausible exists.
 */
function resolvePlatformId(requested: string | undefined): string | undefined {
  if (!requested || requested === 'all') return requested;

  const registered = AdapterRegistry.getInstance().getAllPlatforms().map((p) => p.id);
  if (registered.includes(requested)) return requested;

  const match = registered.find((id) => id.includes(requested) || requested.includes(id));
  return match || undefined;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  // ==========================================
  // Group 1: CATALOG Tools
  // ==========================================
  {
    name: 'search_catalog',
    description: 'Universal semantic and attribute-based search across all connected commerce platforms, merchants, categories, and dynamic JSONB attributes.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product keywords, features, or natural language query' },
        category: { type: 'string', description: 'Optional category filter' },
        platform_id: { type: 'string', description: 'Optional platform ID (e.g. platform_swiggy_builders)' },
        min_price: { type: 'number', description: 'Minimum price bound in INR' },
        max_price: { type: 'number', description: 'Maximum price ceiling in INR' },
        availability_status: { type: 'string', description: 'Filter by stock/availability (in_stock, low_stock, available_slots)' },
        sort_by: { type: 'string', enum: ['price_asc', 'price_desc', 'rating', 'created_at'], description: 'Sort criteria' },
        limit: { type: 'number', description: `Max items to return (default ${config.catalog.searchDefaultLimit})` },
      },
    },
  },
  {
    name: 'get_item',
    description: 'Retrieve full normalized universal schema, tech/dietary/service attributes, real-time inventory, and merchant profile for an item ID.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'Universal item identifier (e.g., item_swiggy_meghana_biryani_01)' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'check_availability',
    description: 'Real-time verification of warehouse stock, kitchen portions, or service appointment slots before order initiation.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'Universal item identifier' },
        quantity: { type: 'number', description: 'Desired purchase units/slots (default 1)' },
      },
      required: ['item_id'],
    },
  },

  // ==========================================
  // Group 2: REVENUE GROWTH & RECOMMENDATION Tools
  // ==========================================
  {
    name: 'get_recommendations',
    description: 'Personalized product ranking powered by dense vector embeddings and cosine similarity over universal schema attributes, user affinities, and purchase history.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'Buyer account or AI agent ID' },
        context: { type: 'string', description: 'Natural language shopping context or intent description' },
        limit: { type: 'number', description: `Max recommendations to return (default ${config.recommendations.defaultLimit})` },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'get_upsell_bundle',
    description: 'Computes high-affinity complementary add-on items, cross-category pairings, and accessories for items currently in cart before checkout completion.',
    inputSchema: {
      type: 'object',
      properties: {
        cart_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item_id: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['item_id'],
          },
          description: 'Current line items in cart',
        },
        order_id: { type: 'string', description: 'Optional order ID' },
        limit: { type: 'number', description: `Max upsell items to return (default ${config.recommendations.upsellLimit})` },
      },
      required: ['cart_items'],
    },
  },
  {
    name: 'get_reorder_suggestions',
    description: 'Repeat-purchase and replenishment nudges based on user historical purchasing cadence, consumable frequency, and favorite platform items.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'Target buyer ID' },
        limit: { type: 'number', description: `Max items to return (default ${config.recommendations.reorderLookback})` },
      },
      required: ['user_id'],
    },
  },

  // ==========================================
  // Group 3: CART / ORDER Tools
  // ==========================================
  {
    name: 'create_order',
    description: 'Create a platform-agnostic order with multiple items, automatic GST tax calculation, merchant resolution, and initial pending state.',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item_id: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['item_id', 'quantity'],
          },
          description: 'List of universal item IDs and quantities',
        },
        user_id: { type: 'string', description: 'Buyer account or AI agent ID' },
        shipping_address: { type: 'object', description: 'Optional delivery address details' },
      },
      required: ['items', 'user_id'],
    },
  },
  {
    name: 'update_cart',
    description: 'Modify active cart line items (add items, remove items, or update quantities) with automatic total and tax re-computation.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID to modify' },
        changes: {
          type: 'object',
          properties: {
            add_items: { type: 'array', items: { type: 'object' } },
            remove_items: { type: 'array', items: { type: 'string' } },
            update_quantities: { type: 'object' },
          },
        },
      },
      required: ['order_id', 'changes'],
    },
  },
  {
    name: 'apply_offer',
    description: 'Apply a merchant coupon code or seasonal discount to an order. STRUCTURALLY GATED: requires a valid pre-authorization ref.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Target order ID' },
        offer_code: { type: 'string', description: 'Merchant coupon code (e.g., BIRYANI10, GROCERY50)' },
        authorization_ref: { type: 'string', description: 'Signed authorization reference obtained from request_preauthorization' },
      },
      required: ['order_id', 'offer_code', 'authorization_ref'],
    },
  },

  // ==========================================
  // Group 4: PAYMENT Tools (Razorpay Test Mode)
  // ==========================================
  {
    name: 'create_payment_link',
    description: 'Generate a verifiable Razorpay test-mode payment link for an order. STRUCTURALLY GATED: requires valid authorization_ref.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Target order ID' },
        authorization_ref: { type: 'string', description: 'Valid pre-authorization reference' },
        simulate_failure: {
          type: 'string',
          enum: ['payment_declined', 'bank_timeout', 'insufficient_funds'],
          description: 'Optional deliberate failure simulation for resilience testing',
        },
      },
      required: ['order_id', 'authorization_ref'],
    },
  },
  {
    name: 'create_upi_mandate',
    description: 'Set up an automated recurring UPI AutoPay mandate / subscription via Razorpay test rails. STRUCTURALLY GATED.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Target order ID' },
        frequency: { type: 'string', enum: ['as_presented', 'weekly', 'monthly'], description: 'Mandate recurrence' },
        max_amount: { type: 'number', description: 'Upper ceiling amount for automated debit' },
        authorization_ref: { type: 'string', description: 'Valid pre-authorization reference' },
      },
      required: ['order_id', 'frequency', 'max_amount', 'authorization_ref'],
    },
  },
  {
    name: 'verify_payment',
    description: 'Verify cryptographic Razorpay test payment signature and transition order status to "paid". STRUCTURALLY GATED: requires valid authorization_ref.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Target order ID' },
        payment_id: { type: 'string', description: 'Razorpay payment ID (e.g. pay_test_...)' },
        signature: { type: 'string', description: 'Razorpay HMAC signature' },
        authorization_ref: { type: 'string', description: 'Valid pre-authorization reference' },
      },
      required: ['order_id', 'payment_id', 'authorization_ref'],
    },
  },
  {
    name: 'check_status',
    description: 'Inspect real-time order & payment state with plain-language automated diagnosis if in failed or timeout state.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID to query' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'refund',
    description: 'Process a full or partial test-mode refund through Razorpay. STRUCTURALLY GATED: requires authorization_ref.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Target order ID' },
        payment_id: { type: 'string', description: 'Razorpay payment ID' },
        amount: { type: 'number', description: 'Amount to refund in INR' },
        reason: { type: 'string', description: 'Justification for refund' },
        authorization_ref: { type: 'string', description: 'Valid pre-authorization reference' },
      },
      required: ['order_id', 'payment_id', 'amount', 'reason', 'authorization_ref'],
    },
  },

  // ==========================================
  // Group 5: GOVERNANCE & AUDIT Tools
  // ==========================================
  {
    name: 'check_spending_limit',
    description: 'Query velocity caps and spending budget limits for a buyer, merchant, or AI agent before formulating transactions.',
    inputSchema: {
      type: 'object',
      properties: {
        subject_id: { type: 'string', description: 'User ID, Merchant ID, or Agent ID' },
        amount: { type: 'number', description: 'Proposed transaction amount in INR' },
        window: { type: 'string', enum: ['per_transaction', 'hourly', 'daily', 'monthly'], description: 'Velocity window' },
      },
      required: ['subject_id', 'amount'],
    },
  },
  {
    name: 'request_preauthorization',
    description: 'Request formal policy pre-authorization before executing ANY money-moving action. Returns signed authorization_ref.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['payment_link', 'upi_mandate', 'apply_offer', 'refund', 'verify_payment'], description: 'Target money action' },
        amount: { type: 'number', description: 'Exact amount in INR' },
        reason: { type: 'string', description: 'Natural language reasoning explaining WHY this transaction is justified' },
        user_id: { type: 'string', description: 'User ID or AI Buyer Agent ID' },
        order_id: { type: 'string', description: 'Associated order ID' },
        merchant_id: { type: 'string', description: 'Merchant ID' },
      },
      required: ['action', 'amount', 'reason', 'user_id'],
    },
  },
  {
    name: 'log_action',
    description: 'Record an immutable audit log entry documenting an autonomous action, policy check outcome, and agent reasoning.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'string', enum: ['ai_buyer_agent', 'user', 'merchant_system', 'governance_gateway', 'shopper_agent', 'platform_agent', 'payment_agent'] },
        action_type: { type: 'string', description: 'Action classification' },
        amount: { type: 'number', description: 'Transaction amount involved' },
        target: { type: 'string', description: 'Target entity ID (order_id, item_id, user_id)' },
        reasoning: { type: 'string', description: 'Short natural-language rationale explaining WHY the action occurred' },
        authorization_ref: { type: 'string', description: 'Associated authorization reference' },
        status: { type: 'string', enum: ['success', 'failed', 'blocked'] },
        gate_checks_passed: { type: 'array', items: { type: 'string' } },
        payload: { type: 'object', description: 'Arbitrary event payload metadata' },
      },
      required: ['actor', 'action_type', 'target', 'reasoning', 'status'],
    },
  },
  {
    name: 'get_audit_trail',
    description: 'Retrieve the complete, chronological, explainable audit trail for an order, including all gate checks and decision logs.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID to extract full audit history for' },
      },
      required: ['order_id'],
    },
  },

  // ==========================================
  // Group 6: CAMPAIGN ORCHESTRATOR Tools
  // ==========================================
  {
    name: 'create_campaign',
    description: 'Merchant-facing campaign orchestrator tool to launch revenue and growth discount rules (e.g. cart threshold markdown, reorder replenishment boosts). STRUCTURALLY GATED through policy pre-authorization before activation.',
    inputSchema: {
      type: 'object',
      properties: {
        merchant_id: { type: 'string', description: 'Merchant ID launching the campaign (e.g. merchant_instamart_network)' },
        name: { type: 'string', description: 'Human-readable campaign title' },
        description: { type: 'string', description: 'Detailed promotion rules and intent' },
        campaign_type: {
          type: 'string',
          enum: ['cart_threshold_discount', 'reorder_nudge_boost', 'upsell_bundle_boost', 'free_shipping'],
          description: 'Campaign rule strategy',
        },
        trigger_rule: {
          type: 'object',
          properties: {
            min_cart_total: { type: 'number', description: 'Minimum order cart value required' },
            target_segment: { type: 'string', enum: ['all', 'reorder_likely', 'first_time_buyer', 'high_value_cart'] },
            required_item_count: { type: 'number', description: 'Minimum number of items in cart' },
          },
          description: 'Eligibility criteria',
        },
        action_benefit: {
          type: 'object',
          properties: {
            benefit_type: { type: 'string', enum: ['percentage_discount', 'fixed_discount', 'free_shipping', 'bundle_credit'] },
            discount_percentage: {
              type: 'number',
              description: `Percentage markdown (max ${config.governance.maxDiscountPercentage}% autonomous ceiling)`,
            },
            discount_amount: { type: 'number', description: 'Fixed discount in INR' },
            max_discount_cap: { type: 'number', description: 'Maximum cap on discount amount' },
          },
          required: ['benefit_type'],
          description: 'Promotional benefit offered to qualifying buyers',
        },
        budget_limit: {
          type: 'number',
          description: `Total campaign monetary budget ceiling in ${config.commerce.defaultCurrency} (default ${inr(config.campaigns.defaultBudgetLimit)})`,
        },
      },
      required: ['merchant_id', 'name', 'description', 'campaign_type', 'trigger_rule', 'action_benefit'],
    },
  },
  {
    name: 'list_active_campaigns',
    description: 'List active merchant revenue campaigns, rules, budget utilization, and status across connected platforms.',
    inputSchema: {
      type: 'object',
      properties: {
        merchant_id: { type: 'string', description: 'Optional merchant ID filter' },
      },
    },
  },
  {
    name: 'get_campaign_audit',
    description: 'Retrieve full immutable audit history and pre-authorizations for a specific campaign ID.',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID to query audit logs for' },
      },
      required: ['campaign_id'],
    },
  },

  // ==========================================
  // Group 7: PLATFORM POLICY & CAPABILITY Tool
  // ==========================================
  {
    name: 'get_platform_policy',
    description: 'Retrieve the live governance thresholds, Razorpay settlement mode, and connected platform list. Call this before answering any question about spending limits, approval requirements, payment modes, or what the network supports — never state a number without checking here first.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * MCP Tool Dispatcher & Execution Engine
 */
export async function executeMcpTool(name: string, args: Record<string, any> = {}): Promise<any> {
  switch (name) {
    // ----------------------------------------------------
    // Catalog Tools
    // ----------------------------------------------------
    case 'search_catalog': {
      const searchResult = await catalogService.searchItems({
        query: args.query,
        category: args.category,
        platform_id: resolvePlatformId(args.platform_id),
        min_price: args.min_price,
        max_price: args.max_price,
        availability_status: args.availability_status,
        sort_by: args.sort_by,
        limit: args.limit || config.catalog.searchDefaultLimit,
      });

      return {
        total_matches: searchResult.total,
        returned_count: searchResult.items.length,
        items: searchResult.items.map((i) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          price: i.price,
          currency: i.currency,
          platform_id: i.platform_id,
          merchant_id: i.merchant_id,
          availability: i.availability,
          attributes: i.attributes,
        })),
      };
    }

    case 'get_item': {
      const item = await catalogService.getItem(args.item_id);
      if (!item) {
        throw new Error(`Item not found with ID "${args.item_id}".`);
      }
      return item;
    }

    case 'check_availability': {
      const item = await catalogService.getItem(args.item_id);
      if (!item) throw new Error(`Item "${args.item_id}" not found.`);

      const requestedQty = args.quantity || 1;
      const isAvailable =
        item.availability.status !== 'out_of_stock' &&
        (item.availability.quantity === undefined || item.availability.quantity >= requestedQty);

      return {
        item_id: item.id,
        title: item.title,
        status: item.availability.status,
        available: isAvailable,
        quantity_in_stock: item.availability.quantity,
        requested_quantity: requestedQty,
        lead_time_days: item.availability.lead_time_days || 0,
        instant_booking: item.availability.instant_booking || false,
      };
    }

    // ----------------------------------------------------
    // Recommendation Tools (Vector Similarity)
    // ----------------------------------------------------
    case 'get_recommendations': {
      return recommendationService.getPersonalizedRecommendations(
        args.user_id,
        args.context,
        args.limit || config.recommendations.defaultLimit
      );
    }

    case 'get_upsell_bundle': {
      let cartItems = args.cart_items || [];
      if (args.order_id && (!cartItems || cartItems.length === 0)) {
        const order = await orderRepo.getOrderById(args.order_id);
        if (order) {
          cartItems = order.items.map((i) => ({ item_id: i.item_id, quantity: i.quantity }));
        }
      }
      return recommendationService.getUpsellBundle(
        cartItems,
        args.limit || config.recommendations.upsellLimit
      );
    }

    case 'get_reorder_suggestions': {
      return recommendationService.getReorderSuggestions(
        args.user_id,
        args.limit || config.recommendations.reorderLookback
      );
    }

    // ----------------------------------------------------
    // Cart & Order Tools
    // ----------------------------------------------------
    case 'create_order': {
      const order = await orderRepo.createOrder({
        items: args.items,
        user_id: args.user_id,
        shipping_address: args.shipping_address,
      });

      await auditRepo.record({
        entity_type: 'order',
        entity_id: order.id,
        action: 'create_order',
        actor_type: 'ai_buyer_agent',
        actor_id: args.user_id,
        reasoning: `AI Agent initiated order ${order.order_number} containing ${order.items.length} line items.`,
        payload: {
          subtotal: order.subtotal_amount,
          tax: order.tax_amount,
          total: order.total_amount,
          items_count: order.items.length,
        },
      });

      return order;
    }

    case 'update_cart': {
      const order = await orderRepo.updateCart(args.order_id, args.changes);

      await auditRepo.record({
        entity_type: 'order',
        entity_id: order.id,
        action: 'update_cart',
        actor_type: 'ai_buyer_agent',
        reasoning: `Cart updated for order ${order.order_number}. New total: ${inr(order.total_amount)}.`,
        payload: {
          new_total: order.total_amount,
          changes: args.changes,
        },
      });

      return order;
    }

    case 'apply_offer': {
      // 1. Governance Gate Check
      const gateValidation = await governanceRepo.validateAndSpendAuthorization(
        args.authorization_ref,
        'apply_offer',
        0 // Offers have 0 net charge
      );
      if (!gateValidation.valid) {
        throw new Error(gateValidation.reason);
      }

      // 2. Fetch Offer
      const offer = await governanceRepo.getOfferByCode(args.offer_code);
      if (!offer) {
        throw new Error(`Invalid or expired coupon code: "${args.offer_code}".`);
      }

      const order = await orderRepo.getOrderById(args.order_id);
      if (!order) throw new Error(`Order "${args.order_id}" not found.`);

      if (offer.min_order_amount && order.subtotal_amount < offer.min_order_amount) {
        throw new Error(`Order subtotal ${inr(order.subtotal_amount)} is below the minimum of ${inr(offer.min_order_amount)} required by offer "${args.offer_code}".`);
      }

      const updatedOrder = await orderRepo.applyDiscount(args.order_id, offer);

      await auditRepo.record({
        entity_type: 'order',
        entity_id: order.id,
        action: 'apply_offer',
        actor_type: 'ai_buyer_agent',
        reasoning: `Applied discount code "${offer.code}" (${offer.title}) with authorization ref ${args.authorization_ref}. Discount: ${inr(updatedOrder.discount_amount)}.`,
        authorization_ref: args.authorization_ref,
        gate_checks_passed: ['PREAUTH_VERIFIED', 'MIN_ORDER_VALUE_SATISFIED', 'OFFER_ACTIVE'],
        payload: {
          offer_code: offer.code,
          discount_amount: updatedOrder.discount_amount,
          new_total: updatedOrder.total_amount,
        },
      });

      return updatedOrder;
    }

    // ----------------------------------------------------
    // Payment Tools (Razorpay Test Mode)
    // ----------------------------------------------------
    case 'create_payment_link': {
      const order = await orderRepo.getOrderById(args.order_id);
      if (!order) throw new Error(`Order "${args.order_id}" not found.`);

      // 1. STRUCTURAL GOVERNANCE GATE ENFORCEMENT
      const gateValidation = await governanceRepo.validateAndSpendAuthorization(
        args.authorization_ref,
        'payment_link',
        order.total_amount
      );
      if (!gateValidation.valid) {
        throw new Error(gateValidation.reason);
      }

      // 2. Issue Razorpay Test-Mode Payment Link
      const linkRes = await razorpayService.createPaymentLink({
        order_id: order.id,
        amount: order.total_amount,
        currency: order.currency,
        description: `Payment for Order ${order.order_number}`,
        simulate_failure: args.simulate_failure,
      });

      const updatedStatus = args.simulate_failure ? 'failed' : 'authorized';
      const failureDetails = args.simulate_failure
        ? {
            code: args.simulate_failure.toUpperCase(),
            reason:
              args.simulate_failure === 'bank_timeout'
                ? 'Test-Mode Bank Gateway Timeout during 3DS challenge.'
                : args.simulate_failure === 'insufficient_funds'
                ? 'Test-Mode Card balance insufficient.'
                : 'Test-Mode Card payment declined by issuer bank.',
            timestamp: new Date().toISOString(),
          }
        : undefined;

      await orderRepo.updatePaymentDetails(order.id, {
        status: updatedStatus,
        razorpay_order_id: linkRes.id,
        razorpay_payment_link: linkRes.short_url,
        failure_details: failureDetails,
      });

      await auditRepo.record({
        entity_type: 'order',
        entity_id: order.id,
        action: 'create_payment_link',
        actor_type: 'ai_buyer_agent',
        reasoning: args.simulate_failure
          ? `Simulated payment failure scenario "${args.simulate_failure}" for order ${order.order_number}.`
          : `Issued Razorpay test-mode payment link with pre-authorization ref ${args.authorization_ref}.`,
        authorization_ref: args.authorization_ref,
        status: args.simulate_failure ? 'failed' : 'success',
        gate_checks_passed: [
          'PREAUTH_SPEND_CONFIRMED',
          linkRes.source === 'razorpay_live_api' ? 'RAZORPAY_LIVE_API_CALLED' : 'RAZORPAY_TEST_RAILS_ACTIVE',
        ],
        payload: {
          payment_link: linkRes.short_url,
          amount: order.total_amount,
          rail: linkRes.source,
          failure_simulated: args.simulate_failure || null,
        },
      });

      return {
        order_id: order.id,
        order_number: order.order_number,
        total_amount: order.total_amount,
        currency: order.currency,
        status: updatedStatus,
        payment_link_id: linkRes.id,
        payment_url: linkRes.short_url,
        rail: linkRes.source,
        expires_at: new Date(linkRes.expire_by * 1000).toISOString(),
        authorization_ref: args.authorization_ref,
        failure_details: failureDetails,
      };
    }

    case 'create_upi_mandate': {
      const order = await orderRepo.getOrderById(args.order_id);
      if (!order) throw new Error(`Order "${args.order_id}" not found.`);

      // 1. Governance Gate Check
      const gateValidation = await governanceRepo.validateAndSpendAuthorization(
        args.authorization_ref,
        'upi_mandate',
        args.max_amount || order.total_amount
      );
      if (!gateValidation.valid) {
        throw new Error(gateValidation.reason);
      }

      // 2. Issue UPI Mandate
      const mandateRes = await razorpayService.createUpiMandate({
        order_id: order.id,
        frequency: args.frequency || 'as_presented',
        max_amount: args.max_amount || order.total_amount,
        currency: order.currency,
      });

      await orderRepo.updatePaymentDetails(order.id, {
        status: 'authorized',
        razorpay_order_id: mandateRes.id,
        razorpay_payment_link: mandateRes.auth_link,
      });

      await auditRepo.record({
        entity_type: 'order',
        entity_id: order.id,
        action: 'create_upi_mandate',
        actor_type: 'ai_buyer_agent',
        reasoning: `Created UPI Recurring Mandate (${mandateRes.frequency}, cap ${inr(mandateRes.max_amount)}) with authorization ref ${args.authorization_ref}.`,
        authorization_ref: args.authorization_ref,
        gate_checks_passed: ['PREAUTH_SPEND_CONFIRMED', 'UPI_AUTOPAY_VALIDATED'],
        payload: {
          mandate_id: mandateRes.id,
          auth_link: mandateRes.auth_link,
        },
      });

      return mandateRes;
    }

    case 'verify_payment': {
      const order = await orderRepo.getOrderById(args.order_id);
      if (!order) throw new Error(`Order "${args.order_id}" not found.`);

      // 1. STRUCTURAL GOVERNANCE GATE ENFORCEMENT
      const gateValidation = await governanceRepo.validateAndSpendAuthorization(
        args.authorization_ref,
        'verify_payment',
        order.total_amount
      );
      if (!gateValidation.valid) {
        throw new Error(gateValidation.reason);
      }

      // 2. Verify the Razorpay signature.
      //
      // A supplied signature that does not match is a hard failure — that is a
      // forged callback. A *missing* signature is different: on the test rail
      // there is no gateway to sign anything, so the order still settles but the
      // audit ledger records that nothing was cryptographically proven. The two
      // cases are never conflated.
      const verification = razorpayService.verifyPaymentSignature(
        order.razorpay_order_id || order.id,
        args.payment_id,
        args.signature
      );

      if (!verification.verified && args.signature) {
        throw new Error(
          `Razorpay payment signature verification failed: ${verification.reason || 'signature mismatch'}`
        );
      }

      if (!verification.verified && !args.payment_id) {
        throw new Error(`Cannot verify payment: ${verification.reason}`);
      }

      // 3. Atomically Transition Order to PAID State
      const updatedOrder = await orderRepo.updatePaymentDetails(order.id, {
        status: 'paid',
        razorpay_payment_id: args.payment_id,
        razorpay_signature: args.signature || undefined,
      });

      const gateChecks = ['PREAUTH_SPEND_CONFIRMED', 'ORDER_PAID_STATE_TRANSITION'];
      gateChecks.push(verification.verified ? 'SIGNATURE_VERIFIED' : 'SIGNATURE_NOT_PRESENT_TEST_RAIL');

      await auditRepo.record({
        entity_type: 'order',
        entity_id: order.id,
        action: 'verify_payment',
        actor_type: 'ai_buyer_agent',
        reasoning: verification.verified
          ? `Payment ${args.payment_id} for order ${order.order_number} verified by ${verification.method}. Order marked PAID under authorization ref ${args.authorization_ref}.`
          : `Payment ${args.payment_id} for order ${order.order_number} settled on the Razorpay test rail without a gateway signature (${verification.reason}). Order marked PAID under authorization ref ${args.authorization_ref}.`,
        authorization_ref: args.authorization_ref,
        gate_checks_passed: gateChecks,
        payload: {
          payment_id: args.payment_id,
          total_paid: order.total_amount,
          signature_verified: verification.verified,
          verification_method: verification.method,
        },
      });

      return {
        order_id: updatedOrder.id,
        order_number: updatedOrder.order_number,
        status: 'paid',
        payment_id: args.payment_id,
        signature_verified: verification.verified,
        verification_method: verification.method,
        verification_note: verification.reason,
      };
    }

    case 'check_status': {
      const order = await orderRepo.getOrderById(args.order_id);
      if (!order) throw new Error(`Order "${args.order_id}" not found.`);

      let naturalLanguageDiagnosis = 'Order is in good standing.';
      let canRetry = false;
      let suggestedNextAction = 'None';

      if (order.status === 'failed') {
        const failureCode = order.failure_details?.code || 'UNKNOWN_FAILURE';
        canRetry = true;
        if (failureCode === 'BANK_TIMEOUT') {
          naturalLanguageDiagnosis = 'The bank gateway experienced a timeout while validating the test transaction.';
          suggestedNextAction = 'Retry payment link once or fallback to UPI AutoPay Mandate.';
        } else if (failureCode === 'PAYMENT_DECLINED') {
          naturalLanguageDiagnosis = 'The issuer bank declined the payment attempt.';
          suggestedNextAction = 'Retry with an alternative payment method or card.';
        } else {
          naturalLanguageDiagnosis = `Payment failed: ${order.failure_details?.reason || 'Transaction could not be processed.'}`;
          suggestedNextAction = 'Generate fresh payment authorization.';
        }
      } else if (order.status === 'paid') {
        const mode = razorpayService.getModeDescriptor();
        naturalLanguageDiagnosis =
          `Order is fully paid and settled on the Razorpay ${mode.mode} rails ` +
          `(total ${inr(order.total_amount)}). Ready for fulfilment.`;
      } else if (order.status === 'authorized') {
        naturalLanguageDiagnosis = 'Payment link is active and awaiting customer authorization.';
      }

      return {
        order_id: order.id,
        order_number: order.order_number,
        status: order.status,
        total_amount: order.total_amount,
        currency: order.currency,
        razorpay_payment_id: order.razorpay_payment_id,
        failure_details: order.failure_details,
        can_retry: canRetry,
        natural_language_diagnosis: naturalLanguageDiagnosis,
        suggested_next_action: suggestedNextAction,
      };
    }

    case 'refund': {
      const order = await orderRepo.getOrderById(args.order_id);
      if (!order) throw new Error(`Order "${args.order_id}" not found.`);
      if (order.status !== 'paid') {
        throw new Error(`Cannot refund order in status "${order.status}". Must be in "paid" status.`);
      }

      // 1. Governance Gate Check
      const gateValidation = await governanceRepo.validateAndSpendAuthorization(
        args.authorization_ref,
        'refund',
        args.amount
      );
      if (!gateValidation.valid) {
        throw new Error(gateValidation.reason);
      }

      // 2. Process Refund in Razorpay Test Mode
      const refundRes = await razorpayService.processRefund({
        payment_id: args.payment_id,
        amount: args.amount,
        reason: args.reason,
      });

      await governanceRepo.recordRefund({
        payment_id: args.payment_id,
        order_id: order.id,
        amount: args.amount,
        reason: args.reason,
        authorization_ref: args.authorization_ref,
        razorpay_refund_id: refundRes.refund_id,
      });

      await auditRepo.record({
        entity_type: 'order',
        entity_id: order.id,
        action: 'refund',
        actor_type: 'ai_buyer_agent',
        reasoning: `Refund of ${inr(args.amount)} processed for order ${order.order_number}. Reason: ${args.reason}.`,
        authorization_ref: args.authorization_ref,
        gate_checks_passed: ['PREAUTH_VERIFIED', 'REFUND_SETTLEMENT_RECORDED'],
        payload: {
          refund_id: refundRes.refund_id,
          amount: args.amount,
          reason: args.reason,
        },
      });

      return {
        order_id: order.id,
        status: 'refunded',
        refund_id: refundRes.refund_id,
        refunded_amount: args.amount,
        reason: args.reason,
      };
    }

    // ----------------------------------------------------
    // Governance & Audit Tools
    // ----------------------------------------------------
    case 'check_spending_limit': {
      return governanceRepo.checkSpendingLimit(args.subject_id, args.amount, args.window);
    }

    case 'request_preauthorization': {
      const preauth = await governanceRepo.requestPreauthorization({
        action: args.action,
        amount: args.amount,
        reason: args.reason,
        user_id: args.user_id,
        order_id: args.order_id,
        merchant_id: args.merchant_id,
      });

      await auditRepo.record({
        entity_type: 'governance_preauthorization',
        entity_id: preauth.authorization_ref || `denied_${Date.now()}`,
        action: 'request_preauthorization',
        actor_type: 'governance_gateway',
        actor_id: args.user_id,
        reasoning: `Pre-authorization request for ${args.action} (${inr(args.amount)}) evaluated: ${preauth.status}. Reason: ${args.reason}`,
        authorization_ref: preauth.authorization_ref,
        status: preauth.approved ? 'success' : 'blocked',
        gate_checks_passed: preauth.gate_checks_passed,
        payload: {
          action: args.action,
          amount: args.amount,
          status: preauth.status,
          reason_code: preauth.reason_code,
          order_id: args.order_id,
        },
      });

      return preauth;
    }

    case 'log_action': {
      const entry: AuditEntry = {
        actor: args.actor,
        actor_id: args.actor_id,
        action_type: args.action_type,
        amount: args.amount,
        target: args.target,
        reasoning: args.reasoning,
        authorization_ref: args.authorization_ref,
        status: args.status,
        gate_checks_passed: args.gate_checks_passed || [],
        payload: args.payload || {},
      };

      await auditRepo.record({
        entity_type: 'agent_action',
        entity_id: entry.target,
        action: entry.action_type,
        actor_type: entry.actor,
        actor_id: entry.actor_id,
        reasoning: entry.reasoning,
        authorization_ref: entry.authorization_ref,
        status: entry.status,
        gate_checks_passed: entry.gate_checks_passed,
        payload: {
          amount: entry.amount,
          ...entry.payload,
        },
      });

      return { logged: true, action_id: `aud_${Date.now()}` };
    }

    case 'get_audit_trail': {
      const trail = await governanceRepo.getAuditTrail(args.order_id);
      return {
        order_id: args.order_id,
        total_events: trail.length,
        audit_trail: trail,
      };
    }

    // ----------------------------------------------------
    // Campaign Orchestrator Tools
    // ----------------------------------------------------
    case 'create_campaign': {
      return campaignService.createCampaign({
        merchant_id: args.merchant_id,
        name: args.name,
        description: args.description,
        campaign_type: args.campaign_type,
        trigger_rule: args.trigger_rule || {},
        action_benefit: args.action_benefit || {},
        budget_limit: args.budget_limit || config.campaigns.defaultBudgetLimit,
      });
    }

    case 'list_active_campaigns': {
      const list = await campaignService.listActiveCampaigns(args.merchant_id);
      return {
        total_active_campaigns: list.length,
        campaigns: list,
      };
    }

    case 'get_campaign_audit': {
      const trail = await campaignService.getCampaignAudit(args.campaign_id);
      return {
        campaign_id: args.campaign_id,
        total_events: trail.length,
        audit_trail: trail,
      };
    }

    // ----------------------------------------------------
    // Platform Policy & Capability Tool
    // ----------------------------------------------------
    case 'get_platform_policy': {
      const policy = governanceRepo.getPolicySnapshot();
      const paymentMode = razorpayService.getModeDescriptor();
      const platforms = AdapterRegistry.getInstance().getAllPlatforms();

      return {
        governance: policy,
        payment: {
          mode: paymentMode.mode,
          live_api_enabled: paymentMode.live_api_enabled,
          credentials_present: paymentMode.credentials_present,
          supported_flows: ['payment_link', 'upi_mandate'],
          signature_verification: 'hmac_sha256',
          tax_rate_percent: config.commerce.taxRate * 100,
        },
        platforms: platforms.map((p) => ({ id: p.id, name: p.name, type: p.type })),
      };
    }

    default:
      throw new Error(`Unknown MCP Tool: "${name}".`);
  }
}
