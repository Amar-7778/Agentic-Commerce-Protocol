import { getDatabaseClient } from '../connection.js';
import { UniversalItem, CatalogQuery, CatalogSearchResult } from '../../catalog/types.js';
import { contentTokens, relateTokens, tokenize } from '../../catalog/text.js';
import { config } from '../../config/index.js';

export class CatalogRepository {
  private static instance: CatalogRepository;

  /** Distinct search terms observed across the catalog, cached per ingestion. */
  private vocabularyCache: Set<string> | null = null;

  public static getInstance(): CatalogRepository {
    if (!CatalogRepository.instance) {
      CatalogRepository.instance = new CatalogRepository();
    }
    return CatalogRepository.instance;
  }

  /**
   * Every distinct token the catalog actually contains, drawn from titles,
   * categories and tags. This is the vocabulary a shopper's words get matched
   * against, so search understands whatever the merchant happens to sell.
   */
  public async getVocabulary(): Promise<Set<string>> {
    if (this.vocabularyCache) return this.vocabularyCache;

    const db = getDatabaseClient();
    const res = await db.query(
      `SELECT title, category, tags FROM catalog_items LIMIT ${config.catalog.vectorIndexSize}`
    );

    const vocab = new Set<string>();
    for (const row of res.rows) {
      for (const t of tokenize(String(row.title || ''))) vocab.add(t);
      for (const t of tokenize(String(row.category || ''))) vocab.add(t);
      const tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags || [];
      for (const tag of tags) {
        for (const t of tokenize(String(tag))) vocab.add(t);
      }
    }

    this.vocabularyCache = vocab;
    return vocab;
  }

  /** Drop the cached vocabulary — call after ingesting or editing items. */
  public invalidateVocabulary(): void {
    this.vocabularyCache = null;
  }

  private mapRowToItem(row: any): UniversalItem {
    return {
      id: row.id,
      platform_id: row.platform_id,
      merchant_id: row.merchant_id,
      merchant_name: row.merchant_name || undefined,
      title: row.title,
      description: row.description,
      category: row.category,
      price: parseFloat(row.price),
      currency: row.currency,
      attributes: typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {}),
      availability: typeof row.availability === 'string' ? JSON.parse(row.availability) : (row.availability || {}),
      media: typeof row.media === 'string' ? JSON.parse(row.media) : (row.media || []),
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []),
      sku: row.sku || undefined,
      // Absent rating stays absent — no invented star count.
      rating: row.rating
        ? (typeof row.rating === 'string' ? JSON.parse(row.rating) : row.rating)
        : undefined,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    };
  }

  public async upsertItem(item: UniversalItem): Promise<void> {
    const db = getDatabaseClient();
    const searchVector = `${item.title} ${item.description} ${item.category} ${item.tags.join(' ')} ${Object.values(item.attributes).join(' ')}`.toLowerCase();

    const sql = `
      INSERT INTO catalog_items (
        id, platform_id, merchant_id, title, description, category,
        price, currency, attributes, availability, media, tags, sku, rating, search_vector, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        platform_id = EXCLUDED.platform_id,
        merchant_id = EXCLUDED.merchant_id,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        price = EXCLUDED.price,
        currency = EXCLUDED.currency,
        attributes = EXCLUDED.attributes,
        availability = EXCLUDED.availability,
        media = EXCLUDED.media,
        tags = EXCLUDED.tags,
        sku = EXCLUDED.sku,
        rating = EXCLUDED.rating,
        search_vector = EXCLUDED.search_vector,
        updated_at = CURRENT_TIMESTAMP;
    `;

    await db.query(sql, [
      item.id,
      item.platform_id,
      item.merchant_id,
      item.title,
      item.description,
      item.category,
      item.price,
      item.currency,
      JSON.stringify(item.attributes || {}),
      JSON.stringify(item.availability || {}),
      JSON.stringify(item.media || []),
      JSON.stringify(item.tags || []),
      item.sku || null,
      item.rating ? JSON.stringify(item.rating) : null,
      searchVector,
    ]);

    this.invalidateVocabulary();
  }

  public async bulkUpsertItems(items: UniversalItem[]): Promise<number> {
    for (const item of items) {
      await this.upsertItem(item);
    }
    return items.length;
  }

  public async getItemById(id: string): Promise<UniversalItem | null> {
    const db = getDatabaseClient();
    const res = await db.query(
      `SELECT catalog_items.*, merchants.name AS merchant_name
       FROM catalog_items
       LEFT JOIN merchants ON merchants.id = catalog_items.merchant_id
       WHERE catalog_items.id = $1 LIMIT 1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToItem(res.rows[0]);
  }

  public async queryItems(filter: CatalogQuery): Promise<CatalogSearchResult> {
    const db = getDatabaseClient();
    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let customSortClause: string | null = null;

    if (filter.platform_id && filter.platform_id !== 'all') {
      params.push(filter.platform_id);
      conditions.push(`catalog_items.platform_id = $${params.length}`);
    }

    if (filter.merchant_id) {
      params.push(filter.merchant_id);
      conditions.push(`catalog_items.merchant_id = $${params.length}`);
    }

    if (filter.category && filter.category !== 'all') {
      params.push(filter.category);
      conditions.push(`catalog_items.category = $${params.length}`);
    }

    if (filter.min_price !== undefined && !isNaN(filter.min_price)) {
      params.push(filter.min_price);
      conditions.push(`catalog_items.price >= $${params.length}`);
    }

    if (filter.max_price !== undefined && !isNaN(filter.max_price)) {
      params.push(filter.max_price);
      conditions.push(`catalog_items.price <= $${params.length}`);
    }

    if (filter.availability_status && filter.availability_status !== 'all') {
      params.push(`%"status":"${filter.availability_status}"%`);
      conditions.push(`catalog_items.availability::text LIKE $${params.length}`);
    }

    if (filter.query && filter.query.trim() !== '') {
      const rawTokens = contentTokens(filter.query);

      // Widen the query against the catalog's own vocabulary so a shopper's
      // word ("earphones") reaches the merchant's word ("Earbuds") without a
      // hand-maintained synonym table.
      const vocabulary = await this.getVocabulary();
      const expandedTokens = new Set<string>(rawTokens);
      for (const term of relateTokens(rawTokens, vocabulary)) {
        expandedTokens.add(term);
      }

      const searchTerms = Array.from(expandedTokens);
      const scoreExpressions: string[] = [];
      if (searchTerms.length > 0) {
        const queryOrConditions = searchTerms.map((term) => {
          params.push(`%${term}%`);
          // A token the shopper actually typed outranks one we inferred.
          const weight = rawTokens.includes(term) ? 2 : 1;
          scoreExpressions.push(
            `(CASE WHEN LOWER(catalog_items.title) LIKE $${params.length} THEN ${60 * weight} ` +
              `WHEN LOWER(catalog_items.category) LIKE $${params.length} THEN ${30 * weight} ` +
              `WHEN LOWER(catalog_items.description) LIKE $${params.length} THEN ${10 * weight} ELSE 0 END)`
          );
          return `(
            LOWER(catalog_items.title) LIKE $${params.length} OR
            LOWER(catalog_items.description) LIKE $${params.length} OR
            LOWER(catalog_items.category) LIKE $${params.length} OR
            LOWER(catalog_items.search_vector) LIKE $${params.length}
          )`;
        });
        conditions.push(`(${queryOrConditions.join(' OR ')})`);
      } else {
        const q = filter.query.trim().toLowerCase();
        params.push(`%${q}%`);
        scoreExpressions.push(`(CASE WHEN LOWER(catalog_items.title) LIKE $${params.length} THEN 60 WHEN LOWER(catalog_items.category) LIKE $${params.length} THEN 30 ELSE 10 END)`);
        conditions.push(`(
          LOWER(catalog_items.title) LIKE $${params.length} OR
          LOWER(catalog_items.description) LIKE $${params.length} OR
          LOWER(catalog_items.category) LIKE $${params.length} OR
          LOWER(catalog_items.search_vector) LIKE $${params.length}
        )`);
      }

      if (!filter.sort_by && scoreExpressions.length > 0) {
        customSortClause = `ORDER BY (${scoreExpressions.join(' + ')}) DESC, created_at DESC`;
      }
    }

    const whereClause = conditions.join(' AND ');

    // Sorting
    let orderByClause = customSortClause || 'ORDER BY catalog_items.created_at DESC';
    if (filter.sort_by === 'price_asc') {
      orderByClause = 'ORDER BY catalog_items.price ASC';
    } else if (filter.sort_by === 'price_desc') {
      orderByClause = 'ORDER BY catalog_items.price DESC';
    } else if (filter.sort_by === 'rating') {
      orderByClause = "ORDER BY (catalog_items.rating->>'average')::numeric DESC";
    }

    const limit = filter.limit || config.catalog.searchDefaultLimit;
    const offset = filter.offset || 0;

    // Joined to `merchants` so every item carries a real display name —
    // never guessed client-side from a title substring.
    const itemsSql = `
      SELECT catalog_items.*, merchants.name AS merchant_name
      FROM catalog_items
      LEFT JOIN merchants ON merchants.id = catalog_items.merchant_id
      WHERE ${whereClause} ${orderByClause} LIMIT ${limit} OFFSET ${offset}
    `;
    const countSql = `SELECT COUNT(*) as count, MIN(price) as min_p, MAX(price) as max_p FROM catalog_items WHERE ${whereClause}`;

    const [itemsRes, countRes] = await Promise.all([
      db.query(itemsSql, params),
      db.query(countSql, params),
    ]);

    const total = parseInt(countRes.rows[0]?.count || '0', 10);
    const minPrice = parseFloat(countRes.rows[0]?.min_p || '0');
    const maxPrice = parseFloat(countRes.rows[0]?.max_p || '0');

    // Aggregate dynamic categories and platforms
    const [catRes, platRes] = await Promise.all([
      db.query('SELECT category, COUNT(*) as count FROM catalog_items GROUP BY category ORDER BY count DESC'),
      db.query('SELECT platform_id as id, COUNT(*) as count FROM catalog_items GROUP BY platform_id ORDER BY count DESC'),
    ]);

    const items = itemsRes.rows.map((row) => this.mapRowToItem(row));

    // Extract dynamic attributes distribution across returned items
    const availableAttributes: Record<string, any[]> = {};
    for (const item of items) {
      for (const [k, v] of Object.entries(item.attributes)) {
        if (!availableAttributes[k]) {
          availableAttributes[k] = [];
        }
        if (v !== undefined && v !== null && !availableAttributes[k].includes(v) && typeof v !== 'object') {
          availableAttributes[k].push(v);
        }
      }
    }

    return {
      items,
      total,
      limit,
      offset,
      categories: catRes.rows.map((r: any) => ({ name: r.category, count: parseInt(r.count, 10) })),
      platforms: platRes.rows.map((r: any) => ({ id: r.id, name: r.id.replace(/^platform_/, '').replace(/_/g, ' ').toUpperCase(), count: parseInt(r.count, 10) })),
      price_range: {
        min: minPrice,
        max: maxPrice,
        currency: items[0]?.currency || config.commerce.defaultCurrency,
      },
      available_attributes: availableAttributes,
    };
  }

  public async getStats(): Promise<{
    totalItems: number;
    platformCount: number;
    categoryCount: number;
    attributeKeyCount: number;
    minPrice: number;
    maxPrice: number;
  }> {
    const db = getDatabaseClient();
    const res = await db.query(`
      SELECT 
        COUNT(*) as total_items,
        COUNT(DISTINCT platform_id) as platform_count,
        COUNT(DISTINCT category) as category_count,
        COALESCE(MIN(price), 0) as min_price,
        COALESCE(MAX(price), 0) as max_price
      FROM catalog_items
    `);

    const allItemsRes = await db.query('SELECT attributes FROM catalog_items LIMIT 200');
    const uniqueKeys = new Set<string>();
    for (const row of allItemsRes.rows) {
      const attr = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {});
      Object.keys(attr).forEach((k) => uniqueKeys.add(k));
    }

    const row = res.rows[0] || {};
    return {
      totalItems: parseInt(row.total_items || '0', 10),
      platformCount: parseInt(row.platform_count || '0', 10),
      categoryCount: parseInt(row.category_count || '0', 10),
      attributeKeyCount: uniqueKeys.size,
      minPrice: parseFloat(row.min_price || '0'),
      maxPrice: parseFloat(row.max_price || '0'),
    };
  }
}
