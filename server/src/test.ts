import { CatalogService } from './catalog/CatalogService.js';
import { AdapterRegistry } from './adapters/AdapterRegistry.js';
import { seedDatabase } from './db/seed.js';

async function runTests() {
  console.log('🧪 [Test Suite] Starting Universal Catalog & Adapter Verification...\n');

  // 1. Re-seed DB
  await seedDatabase();
  const catalogService = CatalogService.getInstance();
  const adapterRegistry = AdapterRegistry.getInstance();

  console.log('\n--- 1. Testing Adapter Registry ---');
  const platforms = adapterRegistry.getAllPlatforms();
  console.log(`Registered Platforms (${platforms.length}):`, platforms.map((p) => `${p.name} [${p.type}]`));
  if (platforms.length < 1) throw new Error('Expected at least 1 registered platform adapter');

  console.log('\n--- 2. Testing Bidirectional Adapter Mappings ---');
  const swiggy = adapterRegistry.getAdapter('platform_swiggy_builders')!;
  const rawSwiggyItems = await swiggy.fetchNativeItems();
  const universalItem = swiggy.toUniversalItem(rawSwiggyItems[0]);
  const reverseMapped = swiggy.fromUniversalItem(universalItem);

  console.log('Universal Item ID:', universalItem.id);
  console.log('Universal Title:', universalItem.title);
  console.log('Universal Attributes Count:', Object.keys(universalItem.attributes).length);
  console.log('Reverse Mapped ID:', reverseMapped.id);
  console.log('Reverse Mapped Price:', reverseMapped.price);

  if (reverseMapped.id !== rawSwiggyItems[0].id) {
    throw new Error('Bidirectional mapping failed for SwiggyAdapter');
  }
  console.log('✅ SwiggyAdapter Bidirectional Mapping Passed.');

  console.log('\n--- 3. Testing Universal Catalog Queries ---');
  // Query 1: All items
  const allResults = await catalogService.searchItems({});
  console.log(`Total indexed items in catalog: ${allResults.total}`);
  if (allResults.total !== 28) throw new Error(`Expected 28 items, got ${allResults.total}`);

  // Query 2: Search text
  const searchResults = await catalogService.searchItems({ query: 'biryani' });
  console.log(`Search for "biryani" returned: ${searchResults.items.length} items (${searchResults.items.map((i) => i.title).join(', ')})`);
  if (searchResults.items.length === 0) throw new Error('Search query returned 0 results');

  // Query 3: Food category filter
  const foodResults = await catalogService.searchItems({ query: 'Food' });
  console.log(`Food category items: ${foodResults.items.length} items`);
  if (foodResults.items.length === 0) throw new Error('Expected food items, got 0');

  // Query 4: Instamart category filter
  const groceryResults = await catalogService.searchItems({ query: 'Instamart' });
  console.log(`Instamart category items: ${groceryResults.items.length} items`);
  if (groceryResults.items.length === 0) throw new Error('Expected Instamart items, got 0');

  // Query 5: Price range filter
  const priceFiltered = await catalogService.searchItems({ min_price: 100, max_price: 500 });
  console.log(`Price filtered (100 - 500 INR): ${priceFiltered.items.length} items`);

  console.log('\n--- 4. Testing Schema Inspector ---');
  const inspectRes = await catalogService.getPlatformMappingInspection(universalItem.id);
  if (!inspectRes) throw new Error('Schema inspection failed');
  console.log('Schema Inspection Verified:');
  console.log('- Universal ID:', inspectRes.universalItem.id);
  console.log('- Platform Adapter:', inspectRes.platformMetadata.name);
  console.log('- Native Payload Keys:', Object.keys(inspectRes.nativeItem));
  console.log('- Reverse Mapped Payload Keys:', Object.keys(inspectRes.reverseMappedItem));

  console.log('\n--- 5. Testing Dynamic Adapter Ingestion Simulator ---');
  const customRawGrocery = {
    kind: 'grocery',
    id: 'instamart_item_custom_test_999',
    name: 'Digestive Biscuits',
    brand: 'Sunfeast',
    description: 'Wheat-fibre digestive biscuits, lightly sweetened.',
    price: 45.0,
    mrp: 48.0,
    packSize: '250 g',
    inStock: true,
    quantityAvailable: 60,
    department_id: 'dept_snacks_biscuits',
    department_name: 'Snacks & Biscuits',
  };

  const dynamicIngestion = await catalogService.simulateAdapterIngestion('platform_swiggy_builders', customRawGrocery);
  console.log('Dynamic Ingestion Succeeded:', dynamicIngestion.universalItem.id, dynamicIngestion.universalItem.title);

  const verifyDynamic = await catalogService.getItem(dynamicIngestion.universalItem.id);
  if (!verifyDynamic || verifyDynamic.title !== 'Sunfeast Digestive Biscuits') {
    throw new Error('Failed to verify dynamically ingested item in database');
  }
  console.log('✅ Dynamic Ingestion Verified in Database.');

  console.log('\n✨ ALL TESTS PASSED SUCCESSFULLY! Universal Catalog & Adapter Architecture is 100% operational.');
}

runTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
