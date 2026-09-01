import { CatalogRepository } from '../db/repositories/CatalogRepository.js';
import { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';
import { AdapterRegistry } from '../adapters/AdapterRegistry.js';
import { UniversalItem, CatalogQuery, CatalogSearchResult, PlatformMetadata } from './types.js';

export class CatalogService {
  private static instance: CatalogService;
  private catalogRepo: CatalogRepository;
  private auditRepo: AuditLogRepository;
  private adapterRegistry: AdapterRegistry;

  private constructor() {
    this.catalogRepo = CatalogRepository.getInstance();
    this.auditRepo = AuditLogRepository.getInstance();
    this.adapterRegistry = AdapterRegistry.getInstance();
  }

  public static getInstance(): CatalogService {
    if (!CatalogService.instance) {
      CatalogService.instance = new CatalogService();
    }
    return CatalogService.instance;
  }

  /**
   * Search and filter universal catalog items.
   */
  public async searchItems(query: CatalogQuery): Promise<CatalogSearchResult> {
    return this.catalogRepo.queryItems(query);
  }

  /**
   * Fetch single universal catalog item by ID.
   */
  public async getItem(id: string): Promise<UniversalItem | null> {
    return this.catalogRepo.getItemById(id);
  }

  /**
   * Inspect the exact bidirectional adapter mapping for an item.
   * Shows side-by-side: Universal Item JSON, Platform Native Raw JSON, and Platform Metadata.
   */
  public async getPlatformMappingInspection(id: string): Promise<{
    universalItem: UniversalItem;
    nativeItem: any;
    platformMetadata: PlatformMetadata;
    reverseMappedItem: any;
  } | null> {
    const universalItem = await this.catalogRepo.getItemById(id);
    if (!universalItem) return null;

    const adapter = this.adapterRegistry.getAdapter(universalItem.platform_id);
    if (!adapter) {
      throw new Error(`No adapter registered for platform: ${universalItem.platform_id}`);
    }

    const rawItems = await adapter.fetchNativeItems();
    // Find matching native item
    let nativeItem = rawItems.find((raw) => {
      const u = adapter.toUniversalItem(raw);
      return u.id === universalItem.id;
    });

    if (!nativeItem) {
      // Reconstruct native representation using adapter's reverse mapping
      nativeItem = adapter.fromUniversalItem(universalItem);
    }

    const reverseMappedItem = adapter.fromUniversalItem(universalItem);

    return {
      universalItem,
      nativeItem,
      platformMetadata: adapter.getMetadata(),
      reverseMappedItem,
    };
  }

  /**
   * Dynamic Ingestion Simulation:
   * Accepts arbitrary platform-native payload, passes it through the adapter,
   * validates against Universal Item Schema, upserts to PostgreSQL, and logs audit record.
   */
  public async simulateAdapterIngestion(
    platformId: string,
    rawPayload: any
  ): Promise<{ universalItem: UniversalItem; indexed: boolean }> {
    const adapter = this.adapterRegistry.getAdapter(platformId);
    if (!adapter) {
      throw new Error(`Platform adapter "${platformId}" not found in registry.`);
    }

    const universalItem = adapter.toUniversalItem(rawPayload);
    await this.catalogRepo.upsertItem(universalItem);

    await this.auditRepo.record({
      entity_type: 'catalog_item',
      entity_id: universalItem.id,
      action: 'dynamic_adapter_ingestion',
      actor_type: 'adapter_sync',
      payload: {
        platform_id: platformId,
        raw_keys: Object.keys(rawPayload),
        universal_title: universalItem.title,
        price: universalItem.price,
      },
    });

    return {
      universalItem,
      indexed: true,
    };
  }

  public async getPlatforms(): Promise<PlatformMetadata[]> {
    return this.adapterRegistry.getAllPlatforms();
  }

  public async getStats(): Promise<any> {
    return this.catalogRepo.getStats();
  }
}
