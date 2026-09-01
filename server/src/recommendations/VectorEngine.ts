import { UniversalItem } from '../catalog/types.js';
import { config, priceTierLabel } from '../config/index.js';

export interface VectorItem {
  id: string;
  item: UniversalItem;
  vector: number[];
}

export class VectorEngine {
  private static instance: VectorEngine;
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private indexedVectors: Map<string, VectorItem> = new Map();
  /** Inverted index: token → item ids containing it. Powers query expansion. */
  private postings: Map<string, Set<string>> = new Map();
  private readonly vectorDimension: number = config.catalog.vectorDimension;

  public static getInstance(): VectorEngine {
    if (!VectorEngine.instance) {
      VectorEngine.instance = new VectorEngine();
    }
    return VectorEngine.instance;
  }

  /**
   * Tokenize and normalize text into feature tokens
   */
  public tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  /**
   * Extract comprehensive semantic & attribute representation from an item
   */
  private extractItemFeatures(item: UniversalItem): string[] {
    const tokens: string[] = [
      ...this.tokenize(item.title),
      ...this.tokenize(item.category),
      ...this.tokenize(item.description),
      ...(item.tags || []).map((t) => t.toLowerCase()),
      item.platform_id.toLowerCase(),
      item.merchant_id.toLowerCase(),
    ];

    // Extract attributes JSONB keys & values
    if (item.attributes) {
      for (const [key, value] of Object.entries(item.attributes)) {
        tokens.push(`attr_${key.toLowerCase()}`);
        if (typeof value === 'string' || typeof value === 'number') {
          tokens.push(...this.tokenize(String(value)));
        }
      }
    }

    // Price band as a ranking feature, from the configured tier bounds.
    tokens.push(`tier_${priceTierLabel(item.price)}`);

    return tokens;
  }

  /**
   * Build vocabulary and IDF across items
   */
  public buildIndex(items: UniversalItem[]): void {
    this.vocabulary.clear();
    this.idf.clear();
    this.indexedVectors.clear();
    this.postings.clear();

    const docTokens: Map<string, string[]> = new Map();
    const docFrequency: Map<string, number> = new Map();

    for (const item of items) {
      const tokens = this.extractItemFeatures(item);
      docTokens.set(item.id, tokens);

      const uniqueTokens = new Set(tokens);
      for (const t of uniqueTokens) {
        docFrequency.set(t, (docFrequency.get(t) || 0) + 1);
        let posting = this.postings.get(t);
        if (!posting) {
          posting = new Set<string>();
          this.postings.set(t, posting);
        }
        posting.add(item.id);
      }
    }

    // Top informative terms become vocabulary
    const sortedTerms = Array.from(docFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.vectorDimension);

    sortedTerms.forEach(([term], idx) => {
      this.vocabulary.set(term, idx);
      this.idf.set(term, Math.log((items.length + 1) / ((docFrequency.get(term) || 0) + 1)) + 1);
    });

    // Vectorize all items
    for (const item of items) {
      const tokens = docTokens.get(item.id) || [];
      const vec = this.vectorizeTokens(tokens);
      this.indexedVectors.set(item.id, {
        id: item.id,
        item,
        vector: vec,
      });
    }
  }

  /**
   * Vectorize a set of tokens into a normalized dense float array
   */
  public vectorizeTokens(tokens: string[]): number[] {
    const vec = new Array(this.vectorDimension).fill(0);
    const tokenCounts: Map<string, number> = new Map();

    for (const t of tokens) {
      tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
    }

    for (const [term, idx] of this.vocabulary.entries()) {
      const tf = tokenCounts.get(term) || 0;
      if (tf > 0) {
        const idf = this.idf.get(term) || 1;
        vec[idx] = Math.sqrt(tf) * idf;
      }
    }

    // L2 Normalize
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    }

    return vec;
  }

  /**
   * Vectorize arbitrary text query / context
   */
  public vectorizeText(text: string): number[] {
    return this.vectorizeTokens(this.tokenize(text));
  }

  /**
   * Cosine similarity between two unit vectors
   */
  public cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
    }
    return Math.max(0, dot);
  }

  /**
   * Find nearest items to a query vector
   */
  public findSimilar(
    queryVector: number[],
    limit: number = 5,
    excludeIds: string[] = []
  ): Array<{ item: UniversalItem; score: number }> {
    const excludeSet = new Set(excludeIds);
    const candidates: Array<{ item: UniversalItem; score: number }> = [];

    for (const [id, vectorItem] of this.indexedVectors.entries()) {
      if (excludeSet.has(id)) continue;
      const score = this.cosineSimilarity(queryVector, vectorItem.vector);
      candidates.push({ item: vectorItem.item, score });
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  public getItemVector(itemId: string): number[] | null {
    return this.indexedVectors.get(itemId)?.vector || null;
  }

  public getIndexedCount(): number {
    return this.indexedVectors.size;
  }

  /**
   * Data-driven query expansion.
   *
   * A shopper types "earphones"; the catalog calls the thing "AuraSound Pro
   * Wireless Earbuds". Rather than maintaining a synonym table — which only
   * ever knows about the products someone remembered to add to it — this walks
   * the inverted index: find the items a query token actually points at, then
   * borrow their vocabulary. The expansion is whatever the live catalog says,
   * so it stays correct when the catalog changes.
   */
  public expandQueryTokens(rawTokens: string[], maxSeedItems: number = 6): string[] {
    if (rawTokens.length === 0) return [];

    // Score candidate items by how many distinct query tokens they match.
    const itemHits = new Map<string, number>();

    for (const raw of rawTokens) {
      const matchedItems = new Set<string>();

      for (const [indexToken, posting] of this.postings.entries()) {
        // Exact hit, or a stem relationship in either direction — enough to
        // bridge singular/plural and compound forms without a stemmer.
        const isMatch =
          indexToken === raw ||
          (raw.length >= 4 && indexToken.includes(raw)) ||
          (indexToken.length >= 4 && raw.includes(indexToken));

        if (isMatch) {
          for (const itemId of posting) matchedItems.add(itemId);
        }
      }

      for (const itemId of matchedItems) {
        itemHits.set(itemId, (itemHits.get(itemId) || 0) + 1);
      }
    }

    if (itemHits.size === 0) return [];

    const seedIds = Array.from(itemHits.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxSeedItems)
      .map(([id]) => id);

    const expanded: string[] = [];
    for (const id of seedIds) {
      const entry = this.indexedVectors.get(id);
      if (!entry) continue;
      const { item } = entry;
      expanded.push(
        ...this.tokenize(item.title),
        ...this.tokenize(item.category),
        ...(item.tags || []).map((t) => t.toLowerCase())
      );
    }

    return expanded;
  }

  /** Items currently in the index, for callers that need to rank them directly. */
  public getIndexedItems(): UniversalItem[] {
    return Array.from(this.indexedVectors.values()).map((v) => v.item);
  }
}
