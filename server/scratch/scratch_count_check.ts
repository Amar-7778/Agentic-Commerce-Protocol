import { seedDatabase } from './db/seed.js';
import { getDatabaseClient } from './db/connection.js';
import { CatalogService } from './catalog/CatalogService.js';

async function checkCounts() {
  console.log('--- 1. FRESH SEED & DB COUNT ---');
  await seedDatabase();
  const db = getDatabaseClient();
  const res1 = await db.query('SELECT COUNT(*) FROM catalog_items');
  const count1 = parseInt(res1.rows[0].count, 10);
  console.log(`Fresh DB count: ${count1}`);

  console.log('\n--- 2. CATALOG SERVICE STATS ---');
  const catalogService = CatalogService.getInstance();
  const stats1 = await catalogService.getStats();
  console.log(`CatalogService.getStats().totalItems: ${stats1.totalItems}`);

  console.log('\n--- 3. DYNAMIC INGESTION SIMULATION ---');
  const simulationPayload = {
    sku_code: 'RET-EL-099',
    product_name: 'Dynamic CyberDeck Terminal (Simulation Test)',
    product_summary: 'Modular portable cyberdeck with mechanical keyboard and 7.9-inch touchscreen display.',
    dept: 'Computers & Terminals',
    cost: { listing_price: 49999.00, mrp: 54999.00, curr: 'INR' },
    stock_info: { units_in_warehouse: 5, state: 'available', restock_eta_days: 0 },
    tech_specs: { brand: 'CyberForge', battery: '10000mAh', os: 'Linux 6.8' },
    gallery: [{ media_url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b', is_cover: true, label: 'Front' }],
    keywords: ['cyberdeck', 'terminal', 'mechanical-keyboard']
  };

  const ingested = await catalogService.simulateAdapterIngestion('platform_retail_demo', simulationPayload);
  console.log(`Ingested item: ${ingested.universalItem.title} (${ingested.universalItem.id})`);

  const res2 = await db.query('SELECT COUNT(*) FROM catalog_items');
  const count2 = parseInt(res2.rows[0].count, 10);
  console.log(`DB count after 1 dynamic ingestion: ${count2} (Difference: +${count2 - count1})`);

  const stats2 = await catalogService.getStats();
  console.log(`CatalogService.getStats().totalItems after ingestion: ${stats2.totalItems}`);
}

checkCounts().catch(console.error);
