export interface MediaItem {
  type: 'image' | 'video' | '3d_model';
  url: string;
  alt?: string;
  is_primary?: boolean;
}

export interface AvailabilityInfo {
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'preorder' | 'available_slots';
  quantity?: number;
  lead_time_days?: number;
  instant_booking?: boolean;
  next_available_slot?: string;
}

export interface RatingInfo {
  average: number;
  count: number;
}

export interface UniversalItem {
  id: string;
  platform_id: string;
  merchant_id: string;
  merchant_name?: string;
  title: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  attributes: Record<string, any>;
  availability: AvailabilityInfo;
  media: MediaItem[];
  tags: string[];
  sku?: string;
  rating?: RatingInfo;
  created_at?: string;
  updated_at?: string;
}

export interface MerchantSummary {
  id: string;
  name: string;
  platform_id: string;
  currency: string;
}

export interface OrderSummary {
  id: string;
  order_number: string;
  merchant_id: string;
  merchant_name?: string;
  platform_id: string;
  status: 'pending' | 'authorized' | 'paid' | 'failed' | 'fulfilled' | 'cancelled' | 'refunded';
  currency: string;
  total_amount: number;
  discount_amount: number;
  razorpay_payment_id?: string;
  item_count: number;
  created_at: string;
}

export interface RevenueAnalytics {
  total_revenue: number;
  order_count: number;
  average_order_value: number;
  total_discount_given: number;
  total_campaign_spend: number;
  active_campaign_count: number;
  revenue_by_platform: Array<{ platform_id: string; order_count: number; revenue: number }>;
  revenue_trend_30d: Array<{ date: string; revenue: number; order_count: number }>;
}

export interface PublicConfig {
  razorpay_key_id: string | null;
  razorpay_mode: 'test' | 'live';
  razorpay_live_api_enabled: boolean;
  currency: string;
  tax_rate_percent: number;
  governance: {
    autonomous_step_up_threshold: number;
    hard_per_transaction_ceiling: number;
  };
}

export interface CatalogQueryFilters {
  query?: string;
  category?: string;
  platform_id?: string;
  merchant_id?: string;
  min_price?: number;
  max_price?: number;
  availability_status?: string;
  sort_by?: 'price_asc' | 'price_desc' | 'rating' | 'created_at' | 'relevance';
}

export interface CatalogSearchResult {
  items: UniversalItem[];
  total: number;
  limit: number;
  offset: number;
  categories: { name: string; count: number }[];
  platforms: { id: string; name: string; count: number }[];
  price_range: { min: number; max: number; currency: string };
  available_attributes: Record<string, any[]>;
}

export interface PlatformMetadata {
  id: string;
  name: string;
  type: string;
  description: string;
  version: string;
  capabilities: {
    real_time_inventory: boolean;
    instant_booking: boolean;
    variants: boolean;
    delivery_estimation: boolean;
    order_sync: boolean;
  };
  supported_currencies: string[];
}

export interface SchemaInspectionData {
  universalItem: UniversalItem;
  nativeItem: any;
  platformMetadata: PlatformMetadata;
  reverseMappedItem: any;
}

export interface CatalogStats {
  totalItems: number;
  platformCount: number;
  categoryCount: number;
  attributeKeyCount: number;
  minPrice: number;
  maxPrice: number;
}

// ---------------------------------------------------------------------------
// Shopper Assistant (chat) types
// ---------------------------------------------------------------------------

export interface A2AMessage {
  id: string;
  protocol: string;
  from_agent: string;
  to_agent: string;
  message_type: 'intent_handoff' | 'catalog_response' | 'settlement_request' | 'settlement_response' | 'error';
  conversation_id: string;
  payload: any;
  timestamp: string;
}

export interface IntentOption {
  label: string;
  value: string;
  icon?: string;
  description?: string;
}

export interface PaymentConfirmation {
  paymentId: string;
  orderId: string;
  amount: number;
  subtotal: number;
  tax: number;
  method: string;
  status: string;
  timestamp: string;
  merchant: string;
  authRef?: string;
  deliveryEta?: string;
  itemTitle?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: string;
  items?: UniversalItem[];
  upsellBundle?: UniversalItem[];
  orderSettlement?: any;
  toolEvents?: string[];
  intentOptions?: IntentOption[];
  containerTitle?: string;
  containerSubtitle?: string;
  paymentConfirmation?: PaymentConfirmation;
  stepUpRequired?: {
    orderId: string;
    amount: number;
    reason: string;
    reasonCode: string;
  };
  a2aTrace?: A2AMessage[];
  auditTrail?: any[];
  isThinking?: boolean;
}
