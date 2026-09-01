import { getDatabaseClient } from '../connection.js';
import { CatalogRepository } from './CatalogRepository.js';
import { applyTax, config } from '../../config/index.js';

export interface OrderItem {
  id: string;
  order_id: string;
  item_id: string;
  title: string;
  quantity: number;
  unit_price: number;
  currency: string;
  attributes: Record<string, any>;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  merchant_id: string;
  platform_id: string;
  status: 'pending' | 'authorized' | 'paid' | 'failed' | 'fulfilled' | 'cancelled' | 'refunded';
  currency: string;
  subtotal_amount: number;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  applied_offer_id?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_payment_link?: string;
  razorpay_signature?: string;
  failure_details?: Record<string, any>;
  shipping_address?: Record<string, any>;
  billing_address?: Record<string, any>;
  platform_order_data?: Record<string, any>;
  metadata?: Record<string, any>;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export class OrderRepository {
  private static instance: OrderRepository;

  public static getInstance(): OrderRepository {
    if (!OrderRepository.instance) {
      OrderRepository.instance = new OrderRepository();
    }
    return OrderRepository.instance;
  }

  private mapRowToOrder(row: any, items: OrderItem[] = []): Order {
    return {
      id: row.id,
      order_number: row.order_number,
      user_id: row.user_id,
      merchant_id: row.merchant_id,
      platform_id: row.platform_id,
      status: row.status,
      currency: row.currency,
      subtotal_amount: parseFloat(row.subtotal_amount || row.total_amount || '0'),
      total_amount: parseFloat(row.total_amount || '0'),
      tax_amount: parseFloat(row.tax_amount || '0'),
      discount_amount: parseFloat(row.discount_amount || '0'),
      applied_offer_id: row.applied_offer_id || undefined,
      razorpay_order_id: row.razorpay_order_id || undefined,
      razorpay_payment_id: row.razorpay_payment_id || undefined,
      razorpay_payment_link: row.razorpay_payment_link || undefined,
      razorpay_signature: row.razorpay_signature || undefined,
      failure_details: typeof row.failure_details === 'string' ? JSON.parse(row.failure_details) : row.failure_details,
      shipping_address: typeof row.shipping_address === 'string' ? JSON.parse(row.shipping_address) : row.shipping_address,
      billing_address: typeof row.billing_address === 'string' ? JSON.parse(row.billing_address) : row.billing_address,
      platform_order_data: typeof row.platform_order_data === 'string' ? JSON.parse(row.platform_order_data) : (row.platform_order_data || {}),
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
      items,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  public async getOrderById(orderId: string): Promise<Order | null> {
    const db = getDatabaseClient();
    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1 LIMIT 1', [orderId]);
    if (orderRes.rows.length === 0) return null;

    const itemsRes = await db.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
    const items: OrderItem[] = itemsRes.rows.map((r: any) => ({
      id: r.id,
      order_id: r.order_id,
      item_id: r.item_id,
      title: r.title,
      quantity: r.quantity,
      unit_price: parseFloat(r.unit_price),
      currency: r.currency,
      attributes: typeof r.attributes === 'string' ? JSON.parse(r.attributes) : (r.attributes || {}),
    }));

    return this.mapRowToOrder(orderRes.rows[0], items);
  }

  public async createOrder(params: {
    items: Array<{ item_id: string; quantity: number }>;
    user_id: string;
    shipping_address?: Record<string, any>;
  }): Promise<Order> {
    const db = getDatabaseClient();
    const catalogRepo = CatalogRepository.getInstance();

    if (!params.items || params.items.length === 0) {
      throw new Error('Order must contain at least one item.');
    }

    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const orderNumber = `RZP-${Date.now().toString().slice(-6)}`;

    // Resolve items from universal catalog
    let subtotal = 0;
    let merchantId = '';
    let platformId = '';
    let currency = config.commerce.defaultCurrency;
    const resolvedItems: Array<{ item: any; quantity: number }> = [];

    for (const reqItem of params.items) {
      const catalogItem = await catalogRepo.getItemById(reqItem.item_id);
      if (!catalogItem) {
        throw new Error(`Catalog item "${reqItem.item_id}" not found.`);
      }
      if (catalogItem.availability.status === 'out_of_stock') {
        throw new Error(`Item "${catalogItem.title}" is currently out of stock.`);
      }

      merchantId = catalogItem.merchant_id;
      platformId = catalogItem.platform_id;
      currency = catalogItem.currency;
      const itemSubtotal = catalogItem.price * reqItem.quantity;
      subtotal += itemSubtotal;

      resolvedItems.push({ item: catalogItem, quantity: reqItem.quantity });
    }

    // Tax comes from the single configured rate (TAX_RATE) so server, client,
    // and audit ledger can never disagree about the figure.
    const { tax: taxAmount, total: totalAmount } = applyTax(subtotal);

    // Insert Order
    const insertOrderSql = `
      INSERT INTO orders (
        id, order_number, user_id, merchant_id, platform_id, status,
        currency, subtotal_amount, total_amount, tax_amount, discount_amount,
        shipping_address, platform_order_data, metadata
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, 0.00, $10, '{}'::jsonb, '{}'::jsonb)
    `;

    await db.query(insertOrderSql, [
      orderId,
      orderNumber,
      params.user_id,
      merchantId,
      platformId,
      currency,
      subtotal,
      totalAmount,
      taxAmount,
      JSON.stringify(params.shipping_address || {}),
    ]);

    // Insert Line Items
    const orderItems: OrderItem[] = [];
    for (const resolved of resolvedItems) {
      const lineItemId = `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const insertLineSql = `
        INSERT INTO order_items (id, order_id, item_id, title, quantity, unit_price, currency, attributes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      await db.query(insertLineSql, [
        lineItemId,
        orderId,
        resolved.item.id,
        resolved.item.title,
        resolved.quantity,
        resolved.item.price,
        resolved.item.currency,
        JSON.stringify(resolved.item.attributes || {}),
      ]);

      orderItems.push({
        id: lineItemId,
        order_id: orderId,
        item_id: resolved.item.id,
        title: resolved.item.title,
        quantity: resolved.quantity,
        unit_price: resolved.item.price,
        currency: resolved.item.currency,
        attributes: resolved.item.attributes,
      });
    }

    return (await this.getOrderById(orderId))!;
  }

  public async updateCart(
    orderId: string,
    changes: {
      add_items?: Array<{ item_id: string; quantity: number }>;
      remove_items?: string[];
      update_quantities?: Record<string, number>;
    }
  ): Promise<Order> {
    const db = getDatabaseClient();
    const catalogRepo = CatalogRepository.getInstance();
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error(`Order "${orderId}" not found.`);

    if (order.status !== 'pending') {
      throw new Error(`Cannot modify cart of order in status "${order.status}".`);
    }

    // 1. Remove items
    if (changes.remove_items && changes.remove_items.length > 0) {
      for (const itemId of changes.remove_items) {
        await db.query('DELETE FROM order_items WHERE order_id = $1 AND item_id = $2', [orderId, itemId]);
      }
    }

    // 2. Update quantities
    if (changes.update_quantities) {
      for (const [itemId, qty] of Object.entries(changes.update_quantities)) {
        if (qty <= 0) {
          await db.query('DELETE FROM order_items WHERE order_id = $1 AND item_id = $2', [orderId, itemId]);
        } else {
          await db.query('UPDATE order_items SET quantity = $1 WHERE order_id = $2 AND item_id = $3', [
            qty,
            orderId,
            itemId,
          ]);
        }
      }
    }

    // 3. Add new items
    if (changes.add_items && changes.add_items.length > 0) {
      for (const itemReq of changes.add_items) {
        const catItem = await catalogRepo.getItemById(itemReq.item_id);
        if (!catItem) throw new Error(`Item "${itemReq.item_id}" not found.`);

        const lineItemId = `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.query(
          `INSERT INTO order_items (id, order_id, item_id, title, quantity, unit_price, currency, attributes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            lineItemId,
            orderId,
            catItem.id,
            catItem.title,
            itemReq.quantity,
            catItem.price,
            catItem.currency,
            JSON.stringify(catItem.attributes || {}),
          ]
        );
      }
    }

    // 4. Recalculate totals
    const itemsRes = await db.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
    if (itemsRes.rows.length === 0) {
      throw new Error('Cart cannot be empty. Please keep at least one item in the order.');
    }

    let newSubtotal = 0;
    for (const r of itemsRes.rows) {
      newSubtotal += parseFloat(r.unit_price) * parseInt(r.quantity, 10);
    }

    const { tax: taxAmount } = applyTax(newSubtotal);
    const discount = order.discount_amount || 0;
    const newTotal = Math.max(0, newSubtotal + taxAmount - discount);

    await db.query(
      `UPDATE orders SET subtotal_amount = $1, tax_amount = $2, total_amount = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
      [newSubtotal, taxAmount, newTotal, orderId]
    );

    return (await this.getOrderById(orderId))!;
  }

  public async applyDiscount(orderId: string, offer: any): Promise<Order> {
    const db = getDatabaseClient();
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error(`Order "${orderId}" not found.`);

    let discountAmount = 0;
    if (offer.discount_type === 'percentage') {
      discountAmount = (order.subtotal_amount * offer.discount_value) / 100;
    } else {
      discountAmount = offer.discount_value;
    }

    if (offer.max_discount_amount && discountAmount > offer.max_discount_amount) {
      discountAmount = offer.max_discount_amount;
    }

    const newTotal = Math.max(0, order.subtotal_amount + order.tax_amount - discountAmount);

    await db.query(
      `UPDATE orders SET discount_amount = $1, total_amount = $2, applied_offer_id = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
      [discountAmount, newTotal, offer.id, orderId]
    );

    return (await this.getOrderById(orderId))!;
  }

  /**
   * Apply a merchant campaign discount, stacking on top of any existing
   * discount already recorded (e.g. an offer code applied earlier in the same
   * checkout). Unlike `applyDiscount`, this never replaces `discount_amount` —
   * it adds to it, so campaigns and offer codes can combine on one order.
   */
  public async applyCampaignDiscount(orderId: string, campaignDiscountAmount: number): Promise<Order> {
    const db = getDatabaseClient();
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error(`Order "${orderId}" not found.`);

    const combinedDiscount = order.discount_amount + campaignDiscountAmount;
    const newTotal = Math.max(0, order.subtotal_amount + order.tax_amount - combinedDiscount);

    await db.query(
      `UPDATE orders SET discount_amount = $1, total_amount = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [combinedDiscount, newTotal, orderId]
    );

    return (await this.getOrderById(orderId))!;
  }

  /**
   * Recent orders across all merchants, joined to merchant display name, for
   * the admin console's Orders view. Line items are omitted here — callers
   * that need them should fetch the single order by id.
   */
  public async listRecentOrders(limit: number = 30): Promise<Array<Order & { merchant_name?: string; item_count: number }>> {
    const db = getDatabaseClient();
    const res = await db.query(
      `SELECT orders.*, merchants.name AS merchant_name,
              (SELECT COUNT(*) FROM order_items WHERE order_items.order_id = orders.id) AS item_count
       FROM orders
       LEFT JOIN merchants ON merchants.id = orders.merchant_id
       ORDER BY orders.created_at DESC
       LIMIT $1`,
      [limit]
    );

    return res.rows.map((row: any) => ({
      ...this.mapRowToOrder(row),
      merchant_name: row.merchant_name || undefined,
      item_count: parseInt(row.item_count || '0', 10),
    }));
  }

  public async updatePaymentDetails(
    orderId: string,
    details: {
      status: Order['status'];
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_payment_link?: string;
      razorpay_signature?: string;
      failure_details?: Record<string, any>;
    }
  ): Promise<Order> {
    const db = getDatabaseClient();
    await db.query(
      `UPDATE orders SET
        status = COALESCE($1, status),
        razorpay_order_id = COALESCE($2, razorpay_order_id),
        razorpay_payment_id = COALESCE($3, razorpay_payment_id),
        razorpay_payment_link = COALESCE($4, razorpay_payment_link),
        razorpay_signature = COALESCE($5, razorpay_signature),
        failure_details = CASE WHEN $6::text IS NOT NULL THEN $6::jsonb ELSE failure_details END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [
        details.status,
        details.razorpay_order_id || null,
        details.razorpay_payment_id || null,
        details.razorpay_payment_link || null,
        details.razorpay_signature || null,
        details.failure_details ? JSON.stringify(details.failure_details) : null,
        orderId,
      ]
    );

    return (await this.getOrderById(orderId))!;
  }
}
