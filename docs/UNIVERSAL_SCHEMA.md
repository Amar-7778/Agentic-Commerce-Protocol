# Universal Item Schema Specification

## Schema Definition (TypeScript)

```typescript
export interface UniversalItem {
  id: string;                      // Universal unique identifier (e.g., "item_ret_001")
  platform_id: string;             // Connected platform ID (e.g., "platform_swiggy_builders")
  merchant_id: string;             // Merchant ID (e.g., "merchant_apex_tech")
  title: string;                   // Item title / name
  description: string;             // Item description
  category: string;                // Normalized category
  price: number;                   // Standard numerical price in minor/standard units
  currency: string;                // ISO 4217 code (e.g., "INR", "USD")
  attributes: Record<string, any>; // Arbitrary dynamic platform-specific attributes (JSONB)
  availability: {
    status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'preorder' | 'available_slots';
    quantity?: number;
    lead_time_days?: number;
    instant_booking?: boolean;
    next_available_slot?: string;
  };
  media: Array<{
    type: 'image' | 'video' | '3d_model';
    url: string;
    alt?: string;
    is_primary?: boolean;
  }>;
  tags: string[];                  // Search & taxonomy tags
  sku?: string;                    // Native SKU / code
  rating?: {
    average: number;
    count: number;
  };
  created_at?: string;
  updated_at?: string;
}
```

---

## Domain Mapping Examples

### 1. Electronics Retail Adapter
| Platform-Native Field | Universal Item Field | Universal Mapping Type |
|---|---|---|
| `sku_code` | `id` / `sku` | Unique identifier (`item_ret_...`) |
| `product_name` | `title` | Normalized string |
| `product_summary` | `description` | String |
| `dept` | `category` | e.g. "Audio & Electronics" |
| `cost.listing_price` | `price` | Number (`24999.00`) |
| `cost.curr` | `currency` | `"INR"` |
| `stock_info.units_in_warehouse` | `availability.quantity` | Integer |
| `tech_specs` | `attributes` | JSONB (`{ brand, driver_size_mm, anc_modes, battery_hours }`) |

### 2. Gourmet Food Delivery Adapter
| Platform-Native Field | Universal Item Field | Universal Mapping Type |
|---|---|---|
| `menu_item_id` | `id` / `sku` | `item_food_...` |
| `item_title` | `title` | String |
| `culinary_notes` | `description` | String |
| `menu_section` | `category` | e.g. "Wood-Fired Sourdough Pizzas" |
| `pricing.base_amount` | `price` | Number (`1150.00`) |
| `kitchen_inventory.portions_remaining` | `availability.quantity` | Integer |
| `dietary_and_nutrition` | `attributes` | JSONB (`{ dietary_type, spice_scale, allergens, prep_time_minutes }`) |

### 3. Professional & Cloud Services Adapter
| Platform-Native Field | Universal Item Field | Universal Mapping Type |
|---|---|---|
| `service_code` | `id` / `sku` | `item_srv_...` |
| `service_headline` | `title` | String |
| `scope_of_work` | `description` | String |
| `practice_area` | `category` | e.g. "AI & Cloud Engineering" |
| `fee_structure.rate` | `price` | Number (`35000.00`) |
| `schedule_info.open_slots_this_week` | `availability.quantity` | Integer (Available Slots) |
| `engagement_details` + `schedule_info` | `attributes` | JSONB (`{ consultant_level, deliverables, session_length_minutes }`) |
