import { UniversalItem, PlatformMetadata, CatalogQuery } from '../catalog/types.js';

/**
 * Abstract Base Platform Adapter
 * Every commerce platform (Shopify, WooCommerce, Swiggy/Zomato, UrbanCompany/Calendly, custom APIs)
 * implements this interface to normalize its native data into the Universal Item schema and back.
 */
export abstract class BasePlatformAdapter {
  protected platformMetadata: PlatformMetadata;

  constructor(metadata: PlatformMetadata) {
    this.platformMetadata = metadata;
  }

  /**
   * Returns metadata and capabilities of this platform adapter.
   */
  public getMetadata(): PlatformMetadata {
    return this.platformMetadata;
  }

  /**
   * Fetches raw native items directly from the platform's API or source storage.
   */
  public abstract fetchNativeItems(): Promise<any[]>;

  /**
   * Translates a platform-native raw item into the standard UniversalItem schema.
   */
  public abstract toUniversalItem(nativeItem: any): UniversalItem;

  /**
   * Translates a standard UniversalItem schema object back into platform-native representation.
   */
  public abstract fromUniversalItem(universalItem: UniversalItem): any;

  /**
   * Direct lookup of an item in the platform by native or universal ID.
   */
  public async getItem(id: string): Promise<UniversalItem | null> {
    const rawItems = await this.fetchNativeItems();
    for (const raw of rawItems) {
      const universal = this.toUniversalItem(raw);
      if (universal.id === id || raw.id === id || raw._id === id) {
        return universal;
      }
    }
    return null;
  }

  /**
   * Optional platform-native search execution.
   */
  public async search(query: CatalogQuery): Promise<UniversalItem[]> {
    const rawItems = await this.fetchNativeItems();
    const universalItems = rawItems.map((raw) => this.toUniversalItem(raw));

    return universalItems.filter((item) => {
      if (query.query) {
        const q = query.query.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        const matchCategory = item.category.toLowerCase().includes(q);
        const matchTags = item.tags.some((t) => t.toLowerCase().includes(q));
        const matchAttr = Object.values(item.attributes).some((v) =>
          String(v).toLowerCase().includes(q)
        );
        if (!matchTitle && !matchDesc && !matchCategory && !matchTags && !matchAttr) {
          return false;
        }
      }

      if (query.category && item.category.toLowerCase() !== query.category.toLowerCase()) {
        return false;
      }

      if (query.min_price !== undefined && item.price < query.min_price) {
        return false;
      }

      if (query.max_price !== undefined && item.price > query.max_price) {
        return false;
      }

      if (query.availability_status && item.availability.status !== query.availability_status) {
        return false;
      }

      return true;
    });
  }

  /**
   * Transforms a universal checkout order into the platform's native order format.
   */
  public abstract transformOrder(universalOrder: any): Promise<any>;
}
