import { BasePlatformAdapter } from './BaseAdapter.js';
import { SwiggyAdapter } from './SwiggyAdapter.js';
import { UniversalItem, PlatformMetadata } from '../catalog/types.js';

export class AdapterRegistry {
  private static instance: AdapterRegistry;
  private adapters: Map<string, BasePlatformAdapter> = new Map();

  private constructor() {
    // Register connected concrete platform adapters. Food delivery + instant
    // grocery only — the catalog scope for this build is Swiggy-style
    // commerce, not a general multi-vertical marketplace.
    this.registerAdapter(new SwiggyAdapter());
  }

  public static getInstance(): AdapterRegistry {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = new AdapterRegistry();
    }
    return AdapterRegistry.instance;
  }

  public registerAdapter(adapter: BasePlatformAdapter): void {
    const meta = adapter.getMetadata();
    this.adapters.set(meta.id, adapter);
  }

  public getAdapter(platformId: string): BasePlatformAdapter | undefined {
    return this.adapters.get(platformId);
  }

  public getAllAdapters(): BasePlatformAdapter[] {
    return Array.from(this.adapters.values());
  }

  public getAllPlatforms(): PlatformMetadata[] {
    return this.getAllAdapters().map((ad) => ad.getMetadata());
  }

  /**
   * Fetches and adapts raw items across all connected platforms into the Universal schema.
   */
  public async ingestAllToUniversal(): Promise<{ platformId: string; items: UniversalItem[] }[]> {
    const results: { platformId: string; items: UniversalItem[] }[] = [];

    for (const [platformId, adapter] of this.adapters.entries()) {
      const rawItems = await adapter.fetchNativeItems();
      const universalItems = rawItems.map((raw) => adapter.toUniversalItem(raw));
      results.push({
        platformId,
        items: universalItems,
      });
    }

    return results;
  }
}
