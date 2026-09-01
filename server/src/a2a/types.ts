/**
 * A2A (Agent-to-Agent) Protocol Specification (A2A-1.0)
 * 
 * Standardized message envelope for inter-agent discovery, intent handoff,
 * collaborative negotiation, and settlement delegation.
 * Distinct from MCP (which is Agent-to-Tool).
 */

export type AgentRole = 'shopper_agent' | 'platform_agent' | 'payment_agent' | 'user';

export type A2AMessageType =
  | 'capability_discovery'
  | 'intent_handoff'
  | 'catalog_response'
  | 'proactive_upsell'
  | 'settlement_request'
  | 'settlement_response'
  | 'agent_error';

export interface A2AMessage<T = any> {
  id: string;
  protocol: 'A2A-1.0';
  from_agent: AgentRole;
  to_agent: AgentRole;
  message_type: A2AMessageType;
  conversation_id: string;
  payload: T;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface IntentHandoffPayload {
  user_id: string;
  raw_user_intent: string;
  extracted_category?: string;
  price_budget?: number;
  target_platform_id?: string;
  user_preferences?: Record<string, any>;
}

export interface CatalogHandoffPayload {
  platform_id: string;
  matched_items: any[];
  upsell_bundle?: any[];
  message: string;
}

export interface SettlementRequestPayload {
  order_id: string;
  user_id: string;
  merchant_id: string;
  platform_id: string;
  items: Array<{ item_id: string; quantity: number; title: string; unit_price: number }>;
  total_amount: number;
  applied_offer_code?: string;
  payment_method_preference?: 'payment_link' | 'upi_mandate';
  reason: string;
}

export interface SettlementResponsePayload {
  order_id: string;
  order_number: string;
  status: 'authorized' | 'needs_human_confirmation' | 'denied' | 'paid';
  authorization_ref?: string;
  payment_url?: string;
  mandate_link?: string;
  total_amount: number;
  reason_code: string;
  natural_language_message: string;
  gate_checks_passed: string[];
  merchant_name?: string;
  /** Campaigns that auto-applied a discount to this order, for display without re-deriving. */
  applied_campaigns?: Array<{ id: string; name: string; discount_amount: number }>;
}
