import { BasePlatformAdapter } from './BaseAdapter.js';
import { UniversalItem, PlatformMetadata } from '../catalog/types.js';
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SwiggyRestaurant {
  id: string;
  name: string;
  cuisine: string[];
  area: string;
  avgRating?: number;
  ratingCount?: number;
  costForTwo?: number;
  deliveryTimeMinutes?: number;
  heroImage?: string;
  menu?: SwiggyMenuItem[];
}

export interface SwiggyMenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  isVeg: boolean;
  inStock: boolean;
  portionsAvailable?: number;
  category: string;
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
}

export interface SwiggyGroceryDepartment {
  id: string;
  name: string;
  items: SwiggyGroceryItem[];
}

export interface SwiggyGroceryItem {
  id: string;
  name: string;
  brand?: string;
  description?: string;
  price: number;
  mrp?: number;
  packSize?: string;
  inStock: boolean;
  quantityAvailable?: number;
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
}

/**
 * Swiggy Builders Club adapter — food delivery and Instamart grocery.
 *
 * Talks to the live MCP endpoints when a token is configured, and falls back
 * to a sandbox fixture file so both verticals stay searchable during offline
 * evaluation. Real-money order placement stays behind
 * SWIGGY_LIVE_CHECKOUT_ENABLED.
 */
export class SwiggyAdapter extends BasePlatformAdapter {
  private readonly fixturePath: string;
  private fixtureCache: { restaurants: SwiggyRestaurant[]; groceries: SwiggyGroceryDepartment[] } | null = null;

  constructor() {
    const metadata: PlatformMetadata = {
      id: 'platform_swiggy_builders',
      name: 'Swiggy Food & Instamart (Builders Club)',
      merchant_id: 'merchant_swiggy_hub',
      type: 'food_delivery',
      description:
        'Hyper-local food delivery and instant grocery integration via Swiggy Builders Club MCP endpoints.',
      version: '1.1.0',
      capabilities: {
        real_time_inventory: true,
        instant_booking: true,
        variants: true,
        delivery_estimation: true,
        order_sync: true,
      },
      supported_currencies: [config.commerce.defaultCurrency],
    };
    super(metadata);
    this.fixturePath = path.join(__dirname, 'raw-data', 'swiggy.raw.json');
  }

  private authToken(): string | null {
    return config.swiggy.authToken;
  }

  private requestHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Cookie: `_session_tid=${token}; token=${token}`,
      'User-Agent': 'AgenticCommerce-UniversalAdapter/1.0',
      'Content-Type': 'application/json',
    };
  }

  /** Sandbox fixture, read from disk rather than embedded in the adapter. */
  private loadFixture(): { restaurants: SwiggyRestaurant[]; groceries: SwiggyGroceryDepartment[] } {
    if (this.fixtureCache) return this.fixtureCache;

    const candidates = [
      this.fixturePath,
      path.join(__dirname, '..', '..', 'src', 'adapters', 'raw-data', 'swiggy.raw.json'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
        this.fixtureCache = {
          restaurants: parsed.restaurants || [],
          groceries: parsed.groceries || [],
        };
        return this.fixtureCache;
      }
    }

    console.warn('⚠️ [SwiggyAdapter] Sandbox fixture not found — the Swiggy platform will be empty.');
    this.fixtureCache = { restaurants: [], groceries: [] };
    return this.fixtureCache;
  }

  private async fetchWithTimeout(url: string, token: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.swiggy.requestTimeoutMs);
    try {
      return await fetch(url, { headers: this.requestHeaders(token), signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Flatten restaurants into menu items carrying their restaurant context. */
  private flatten(restaurants: SwiggyRestaurant[]): any[] {
    const items: any[] = [];
    for (const rest of restaurants) {
      for (const menuItem of rest.menu || []) {
        items.push({
          ...menuItem,
          kind: 'food',
          restaurant_id: rest.id,
          restaurant_name: rest.name,
          restaurant_area: rest.area,
          cuisine: rest.cuisine,
          delivery_time: rest.deliveryTimeMinutes,
        });
      }
    }
    return items;
  }

  /** Flatten Instamart departments into grocery items carrying their department context. */
  private flattenGroceries(departments: SwiggyGroceryDepartment[]): any[] {
    const items: any[] = [];
    for (const dept of departments) {
      for (const groceryItem of dept.items || []) {
        items.push({
          ...groceryItem,
          kind: 'grocery',
          department_id: dept.id,
          department_name: dept.name,
        });
      }
    }
    return items;
  }

  public async fetchNativeItems(): Promise<any[]> {
    const token = this.authToken();
    let foodItems: any[] | null = null;
    let groceryItems: any[] | null = null;

    if (token) {
      try {
        console.log(`📡 [SwiggyAdapter] Requesting ${config.swiggy.mcpBaseUrl}/food/restaurants ...`);
        const response = await this.fetchWithTimeout(`${config.swiggy.mcpBaseUrl}/food/restaurants`, token);

        if (response.ok) {
          const data: any = await response.json();
          const restaurants: SwiggyRestaurant[] = data.restaurants || [];
          const items =
            restaurants.length > 0
              ? this.flatten(restaurants)
              : (data.items || []).map((i: any) => ({ ...i, kind: 'food' }));
          if (items.length > 0) {
            console.log(`✅ [SwiggyAdapter] Live food response accepted (${items.length} items).`);
            foodItems = items;
          } else {
            console.warn('⚠️ [SwiggyAdapter] Live food response contained no items — using sandbox fixture.');
          }
        } else {
          console.warn(
            `⚠️ [SwiggyAdapter] Live food endpoint returned ${response.status} ${response.statusText} — using sandbox fixture.`
          );
        }
      } catch (err: any) {
        const reason = err?.name === 'AbortError' ? `timed out after ${config.swiggy.requestTimeoutMs}ms` : err?.message;
        console.warn(`⚠️ [SwiggyAdapter] Live food request failed (${reason}) — using sandbox fixture.`);
      }

      try {
        console.log(`📡 [SwiggyAdapter] Requesting ${config.swiggy.mcpBaseUrl}/instamart/products ...`);
        const response = await this.fetchWithTimeout(`${config.swiggy.mcpBaseUrl}/instamart/products`, token);

        if (response.ok) {
          const data: any = await response.json();
          const departments: SwiggyGroceryDepartment[] = data.departments || [];
          const items =
            departments.length > 0
              ? this.flattenGroceries(departments)
              : (data.items || []).map((i: any) => ({ ...i, kind: 'grocery' }));
          if (items.length > 0) {
            console.log(`✅ [SwiggyAdapter] Live Instamart response accepted (${items.length} items).`);
            groceryItems = items;
          } else {
            console.warn('⚠️ [SwiggyAdapter] Live Instamart response contained no items — using sandbox fixture.');
          }
        } else {
          console.warn(
            `⚠️ [SwiggyAdapter] Live Instamart endpoint returned ${response.status} ${response.statusText} — using sandbox fixture.`
          );
        }
      } catch (err: any) {
        const reason = err?.name === 'AbortError' ? `timed out after ${config.swiggy.requestTimeoutMs}ms` : err?.message;
        console.warn(`⚠️ [SwiggyAdapter] Live Instamart request failed (${reason}) — using sandbox fixture.`);
      }
    }

    const fixture = this.loadFixture();
    return [
      ...(foodItems ?? this.flatten(fixture.restaurants)),
      ...(groceryItems ?? this.flattenGroceries(fixture.groceries)),
    ];
  }

  public toUniversalItem(nativeItem: any): UniversalItem {
    return nativeItem.kind === 'grocery'
      ? this.groceryToUniversalItem(nativeItem)
      : this.foodToUniversalItem(nativeItem);
  }

  private foodToUniversalItem(nativeItem: any): UniversalItem {
    const restaurantName = nativeItem.restaurant_name;
    const title = restaurantName ? `${nativeItem.name} (${restaurantName})` : nativeItem.name;

    const attributes: Record<string, any> = {
      is_vegetarian: nativeItem.isVeg,
    };
    if (restaurantName) attributes.restaurant_name = restaurantName;
    if (nativeItem.restaurant_area) attributes.restaurant_area = nativeItem.restaurant_area;
    if (nativeItem.cuisine) attributes.cuisines = nativeItem.cuisine;
    if (nativeItem.delivery_time !== undefined) attributes.delivery_eta_mins = nativeItem.delivery_time;

    const portions = nativeItem.portionsAvailable;

    return {
      id: `item_swiggy_${String(nativeItem.id).replace(/^swiggy_item_/, '')}`,
      platform_id: this.platformMetadata.id,
      merchant_id: nativeItem.restaurant_id || 'merchant_swiggy_hub',
      title,
      description: nativeItem.description,
      category: `Food • ${nativeItem.category || 'Dishes'}`,
      price: Number(nativeItem.price),
      currency: nativeItem.currency || config.commerce.defaultCurrency,
      attributes,
      availability: {
        status: nativeItem.inStock === false ? 'out_of_stock' : portions !== undefined && portions <= 5 ? 'low_stock' : 'in_stock',
        quantity: portions,
        lead_time_days: 0,
        instant_booking: true,
      },
      // Only the images the source actually provided.
      media: nativeItem.imageUrl
        ? [{ type: 'image', url: nativeItem.imageUrl, alt: nativeItem.name, is_primary: true }]
        : [],
      tags: [
        'swiggy',
        'food-delivery',
        nativeItem.isVeg ? 'veg' : 'non-veg',
        ...(nativeItem.cuisine || []),
      ],
      sku: nativeItem.id,
      // Ratings are passed through, never synthesized.
      rating:
        nativeItem.rating !== undefined
          ? { average: nativeItem.rating, count: nativeItem.ratingCount ?? 0 }
          : undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private groceryToUniversalItem(nativeItem: any): UniversalItem {
    const brand = nativeItem.brand;
    const title = brand ? `${brand} ${nativeItem.name}` : nativeItem.name;
    const department = nativeItem.department_name || 'Groceries';
    const qty = nativeItem.quantityAvailable;

    const attributes: Record<string, any> = {};
    if (brand) attributes.brand = brand;
    if (nativeItem.packSize) attributes.pack_size = nativeItem.packSize;
    if (nativeItem.mrp) attributes.mrp = nativeItem.mrp;
    attributes.department = department;

    return {
      id: `item_instamart_${String(nativeItem.id).replace(/^instamart_item_/, '')}`,
      platform_id: this.platformMetadata.id,
      merchant_id: nativeItem.merchant_id || 'merchant_instamart_network',
      title,
      description:
        nativeItem.description || `${title}${nativeItem.packSize ? ` — ${nativeItem.packSize}` : ''}`,
      category: `Instamart • ${department}`,
      price: Number(nativeItem.price),
      currency: nativeItem.currency || config.commerce.defaultCurrency,
      attributes,
      availability: {
        status: nativeItem.inStock === false ? 'out_of_stock' : qty !== undefined && qty <= 10 ? 'low_stock' : 'in_stock',
        quantity: qty,
        lead_time_days: 0,
        instant_booking: true,
      },
      media: nativeItem.imageUrl
        ? [{ type: 'image', url: nativeItem.imageUrl, alt: title, is_primary: true }]
        : [],
      tags: [
        'instamart',
        'grocery',
        department.toLowerCase().replace(/\s+/g, '-'),
        ...(brand ? [brand.toLowerCase().replace(/\s+/g, '-')] : []),
      ],
      sku: nativeItem.id,
      rating:
        nativeItem.rating !== undefined
          ? { average: nativeItem.rating, count: nativeItem.ratingCount ?? 0 }
          : undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  public fromUniversalItem(universalItem: UniversalItem): any {
    if (universalItem.id.startsWith('item_instamart_')) {
      return {
        id: universalItem.sku || universalItem.id,
        name: universalItem.title,
        brand: universalItem.attributes?.brand,
        description: universalItem.description,
        price: universalItem.price,
        packSize: universalItem.attributes?.pack_size,
        inStock: universalItem.availability.status !== 'out_of_stock',
        quantityAvailable: universalItem.availability.quantity,
        category: universalItem.category.replace(/^Instamart • /, ''),
      };
    }

    return {
      id: universalItem.sku || universalItem.id,
      name: universalItem.title,
      description: universalItem.description,
      price: universalItem.price,
      isVeg: universalItem.attributes?.is_vegetarian,
      inStock: universalItem.availability.status !== 'out_of_stock',
      portionsAvailable: universalItem.availability.quantity,
      category: universalItem.category.replace(/^Food • /, ''),
    };
  }

  /**
   * Live Swiggy MCP tool: search_restaurants.
   */
  public async searchRestaurants(query: string, area?: string): Promise<SwiggyRestaurant[]> {
    const token = this.authToken();

    if (token) {
      try {
        const params = new URLSearchParams({ query });
        if (area) params.set('area', area);
        const res = await this.fetchWithTimeout(
          `${config.swiggy.mcpBaseUrl}/food/restaurants?${params.toString()}`,
          token
        );
        if (res.ok) {
          const data: any = await res.json();
          if (Array.isArray(data.restaurants) && data.restaurants.length > 0) return data.restaurants;
        }
      } catch (err: any) {
        console.warn('⚠️ [SwiggyAdapter] searchRestaurants request failed:', err?.message);
      }
    }

    const q = query.toLowerCase();
    return this.loadFixture().restaurants.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.area.toLowerCase().includes(q) ||
        (r.cuisine || []).some((c) => c.toLowerCase().includes(q)) ||
        (area ? r.area.toLowerCase().includes(area.toLowerCase()) : false)
    );
  }

  /**
   * Real-money order placement, gated by SWIGGY_LIVE_CHECKOUT_ENABLED.
   *
   * With the gate closed this reports the hold plainly rather than returning a
   * fabricated confirmation, so nothing downstream can mistake a blocked order
   * for a delivered one.
   */
  public async executeLiveOrderPlacement(orderPayload: any, authorizationRef: string): Promise<any> {
    if (!config.swiggy.liveCheckoutEnabled) {
      return {
        status: 'gated_safety_hold',
        dispatched: false,
        message:
          'Live Swiggy dispatch is disabled (SWIGGY_LIVE_CHECKOUT_ENABLED=false). Search, cart and settlement ' +
          'flows ran in full; only the outbound order to Swiggy was withheld.',
        withheld_order: {
          total_amount: orderPayload.total_amount,
          item_count: (orderPayload.items || []).length,
          authorization_ref: authorizationRef,
        },
      };
    }

    const token = this.authToken();
    if (!token) {
      return {
        status: 'blocked_missing_credentials',
        dispatched: false,
        message: 'SWIGGY_LIVE_CHECKOUT_ENABLED is true but SWIGGY_AUTH_TOKEN is not set.',
      };
    }

    const response = await fetch(`${config.swiggy.mcpBaseUrl}/food/orders`, {
      method: 'POST',
      headers: this.requestHeaders(token),
      body: JSON.stringify({ ...orderPayload, authorization_ref: authorizationRef }),
    });

    if (!response.ok) {
      throw new Error(`Swiggy order placement failed: ${response.status} ${response.statusText}`);
    }

    const result: any = await response.json();
    return { status: 'live_order_placed', dispatched: true, authorization_ref: authorizationRef, ...result };
  }

  public async transformOrder(universalOrder: any): Promise<any> {
    const items = universalOrder.items || [];
    const isGroceryOrder = items.length > 0 && items.every((it: any) => String(it.item_id || '').startsWith('item_instamart_'));

    const etas = items
      .map((it: any) => it.attributes?.delivery_eta_mins)
      .filter((v: any) => typeof v === 'number');

    return {
      platform: this.platformMetadata.id,
      swiggy_cart_reference: `SWIGGY_ORD_${Date.now()}`,
      order_type: isGroceryOrder ? 'instamart_dispatch' : 'food_dispatch',
      items: items.map((it: any) => ({
        menu_item_id: it.sku || it.item_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        item_title: it.title,
      })),
      delivery_address: universalOrder.shipping_address,
      // Slowest kitchen sets the estimate; groceries default to a fixed pick
      // window since there's no prep time to derive it from.
      estimated_delivery_time_mins: etas.length > 0 ? Math.max(...etas) : isGroceryOrder ? 15 : undefined,
      special_instructions: universalOrder.notes || '',
    };
  }
}
