/**
 * Universal Item Schema & Commerce Protocol Types
 * Platform-agnostic schema designed for AI buyer agents and universal platform adapters.
 */

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
  id: string;                      // Universal unique ID (e.g., "item_swiggy_001")
  platform_id: string;             // Platform identifier (e.g., "platform_swiggy_builders")
  merchant_id: string;             // Merchant identifier (e.g., "merchant_swiggy_hub")
  merchant_name?: string;          // Merchant display name, joined from `merchants` — never guessed client-side
  title: string;                   // Item title / name
  description: string;             // Item description
  category: string;                // Normalized category
  price: number;                   // Standard numerical price
  currency: string;                // ISO 4217 code (e.g., "INR", "USD")
  attributes: Record<string, any>; // Arbitrary dynamic platform-specific attributes
  availability: AvailabilityInfo;  // Standardized availability and inventory
  media: MediaItem[];              // Media assets (images, product renders, videos)
  tags: string[];                  // Search and taxonomy tags
  sku?: string;                    // Stock keeping unit / code
  rating?: RatingInfo;             // Normalized ratings
  created_at?: string;             // ISO timestamp
  updated_at?: string;             // ISO timestamp
}

export interface CatalogQuery {
  query?: string;
  category?: string;
  platform_id?: string;
  merchant_id?: string;
  min_price?: number;
  max_price?: number;
  currency?: string;
  availability_status?: string;
  tags?: string[];
  attribute_filters?: Record<string, any>;
  limit?: number;
  offset?: number;
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
  available_attributes: Record<string, string[] | number[]>;
}

export interface PlatformMetadata {
  id: string;
  name: string;
  /**
   * Merchant of record that operates this platform. Declared once here so item
   * transforms read it from metadata instead of repeating a literal, and so a
   * new adapter states its settlement counterparty up front.
   */
  merchant_id: string;
  type: 'retail_ecommerce' | 'food_delivery' | 'professional_services' | 'hospitality' | 'custom';
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
