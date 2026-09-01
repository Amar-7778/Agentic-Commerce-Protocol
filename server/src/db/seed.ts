import { getDatabaseClient } from './connection.js';
import { runMigrations } from './migrate.js';
import { AdapterRegistry } from '../adapters/AdapterRegistry.js';
import { CatalogRepository } from './repositories/CatalogRepository.js';
import { AuditLogRepository } from './repositories/AuditLogRepository.js';
import { fileURLToPath } from 'url';

export async function seedDatabase(): Promise<void> {
  console.log('🌱 [Seeder] Starting database seeding process...');
  await runMigrations();

  const db = getDatabaseClient();
  const catalogRepo = CatalogRepository.getInstance();
  const auditRepo = AuditLogRepository.getInstance();
  const adapterRegistry = AdapterRegistry.getInstance();

  // 1. Seed Connected Platforms
  const platforms = adapterRegistry.getAllPlatforms();
  for (const plat of platforms) {
    await db.query(
      `INSERT INTO platforms (id, name, type, description, adapter_key, capabilities, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         description = EXCLUDED.description,
         capabilities = EXCLUDED.capabilities,
         updated_at = CURRENT_TIMESTAMP`,
      [plat.id, plat.name, plat.type, plat.description, plat.id, JSON.stringify(plat.capabilities)]
    );
  }
  console.log(`✅ [Seeder] Seeded ${platforms.length} platforms into database.`);

  // 2. Seed Merchants
  const merchants = [
    {
      id: 'merchant_swiggy_hub',
      platform_id: 'platform_swiggy_builders',
      name: 'Swiggy Merchant Network & Cloud Kitchens',
      email: 'builders@swiggy.in',
      currency: 'INR',
      settings: { live_tracking: true, dynamic_surge: false },
    },
    {
      id: 'swiggy_rest_meghana_01',
      platform_id: 'platform_swiggy_builders',
      name: 'Meghana Foods (Koramangala)',
      email: 'meghana@swiggy.in',
      currency: 'INR',
      settings: { instant_booking: true },
    },
    {
      id: 'swiggy_rest_truffles_02',
      platform_id: 'platform_swiggy_builders',
      name: 'Truffles Cafe & Burgers',
      email: 'truffles@swiggy.in',
      currency: 'INR',
      settings: { instant_booking: true },
    },
    {
      id: 'merchant_instamart_network',
      platform_id: 'platform_swiggy_builders',
      name: 'Instamart Grocery Network',
      email: 'instamart@swiggy.in',
      currency: 'INR',
      settings: { instant_delivery_mins: 15, dark_store_fulfillment: true },
    },
    // Each restaurant in the fixture is its own merchant of record — matches
    // SwiggyAdapter.toUniversalItem's merchant_id = restaurant_id mapping, and
    // keeps per-chain revenue reporting meaningful.
    {
      id: 'swiggy_rest_behrouz_03',
      platform_id: 'platform_swiggy_builders',
      name: 'Behrouz Biryani',
      email: 'behrouz@swiggy.in',
      currency: 'INR',
      settings: { instant_booking: true },
    },
    {
      id: 'swiggy_rest_wowmomo_04',
      platform_id: 'platform_swiggy_builders',
      name: 'Wow! Momo',
      email: 'wowmomo@swiggy.in',
      currency: 'INR',
      settings: { instant_booking: true },
    },
    {
      id: 'swiggy_rest_dominos_05',
      platform_id: 'platform_swiggy_builders',
      name: "Domino's Pizza",
      email: 'dominos@swiggy.in',
      currency: 'INR',
      settings: { instant_booking: true },
    },
    {
      id: 'swiggy_rest_bbqnation_06',
      platform_id: 'platform_swiggy_builders',
      name: 'Barbeque Nation',
      email: 'bbqnation@swiggy.in',
      currency: 'INR',
      settings: { instant_booking: true },
    },
  ];

  for (const m of merchants) {
    await db.query(
      `INSERT INTO merchants (id, platform_id, name, email, currency, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         currency = EXCLUDED.currency,
         settings = EXCLUDED.settings,
         updated_at = CURRENT_TIMESTAMP`,
      [m.id, m.platform_id, m.name, m.email, m.currency, JSON.stringify(m.settings)]
    );
  }
  console.log(`✅ [Seeder] Seeded ${merchants.length} merchants into database.`);

  // 3. Seed Demo Users & AI Agents
  const users = [
    {
      id: 'user_alex_buyer',
      email: 'alex.buyer@example.com',
      name: 'Alex Morgan (Human Buyer)',
      role: 'buyer',
      metadata: { preferences: { default_currency: 'INR', preferred_delivery: 'express' } },
    },
    {
      id: 'agent_procure_ai',
      email: 'procure-agent-01@agentic-commerce.ai',
      name: 'Autonomous AI Procurement Agent #01',
      role: 'ai_agent',
      metadata: { autonomous_tier: 'enterprise_procurement', daily_spending_cap: 75000 },
    },
  ];

  for (const u of users) {
    await db.query(
      `INSERT INTO users (id, email, name, role, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         id = EXCLUDED.id,
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         metadata = EXCLUDED.metadata`,
      [u.id, u.email, u.name, u.role, JSON.stringify(u.metadata)]
    );
  }

  // 4. Seed Governance Spending Limits
  const limits = [
    {
      id: 'limit_alex_daily',
      subject_type: 'user',
      subject_id: 'user_alex_buyer',
      window_type: 'daily',
      max_limit: 100000.0,
      current_spent: 0.0,
      currency: 'INR',
    },
    {
      id: 'limit_alex_tx',
      subject_type: 'user',
      subject_id: 'user_alex_buyer',
      window_type: 'per_transaction',
      max_limit: 50000.0,
      current_spent: 0.0,
      currency: 'INR',
    },
    {
      id: 'limit_agent_daily',
      subject_type: 'ai_agent',
      subject_id: 'agent_procure_ai',
      window_type: 'daily',
      max_limit: 75000.0,
      current_spent: 0.0,
      currency: 'INR',
    },
    {
      id: 'limit_agent_tx',
      subject_type: 'ai_agent',
      subject_id: 'agent_procure_ai',
      window_type: 'per_transaction',
      max_limit: 30000.0,
      current_spent: 0.0,
      currency: 'INR',
    },
  ];

  for (const l of limits) {
    await db.query(
      `INSERT INTO spending_limits (id, subject_type, subject_id, window_type, max_limit, current_spent, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         max_limit = EXCLUDED.max_limit,
         currency = EXCLUDED.currency,
         updated_at = CURRENT_TIMESTAMP`,
      [l.id, l.subject_type, l.subject_id, l.window_type, l.max_limit, l.current_spent, l.currency]
    );
  }
  console.log(`✅ [Seeder] Seeded ${limits.length} spending limit rules.`);

  // 5. Seed Merchant Discount Offers
  const offers = [
    {
      id: 'offer_meghana_early10',
      code: 'BIRYANI10',
      merchant_id: 'swiggy_rest_meghana_01',
      title: '10% Off Biryani Orders',
      description: 'Exclusive 10% markdown on Meghana Foods biryani orders over ₹500.',
      discount_type: 'percentage',
      discount_value: 10.0,
      min_order_amount: 500.0,
      max_discount_amount: 100.0,
      terms: 'Valid on all Meghana Foods biryani and rice dishes.',
    },
    {
      id: 'offer_instamart_save50',
      code: 'GROCERY50',
      merchant_id: 'merchant_instamart_network',
      title: '₹50 Off Grocery Orders',
      description: 'Flat ₹50 off on Instamart grocery orders above ₹300.',
      discount_type: 'fixed',
      discount_value: 50.0,
      min_order_amount: 300.0,
      max_discount_amount: 50.0,
      terms: 'Applicable once per order.',
    },
  ];

  for (const o of offers) {
    await db.query(
      `INSERT INTO offers (id, code, merchant_id, title, description, discount_type, discount_value, min_order_amount, max_discount_amount, is_active, terms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         title = EXCLUDED.title,
         discount_value = EXCLUDED.discount_value,
         min_order_amount = EXCLUDED.min_order_amount,
         max_discount_amount = EXCLUDED.max_discount_amount`,
      [o.id, o.code, o.merchant_id, o.title, o.description, o.discount_type, o.discount_value, o.min_order_amount, o.max_discount_amount, o.terms]
    );
  }
  console.log(`✅ [Seeder] Seeded ${offers.length} merchant offers.`);

  // 6. Seed Merchant Revenue Campaigns (Campaign Orchestrator)
  const campaigns = [
    {
      id: 'cmp_instamart_cart_boost_01',
      merchant_id: 'merchant_instamart_network',
      name: 'Instamart Basket Threshold Boost (10% Off > ₹600)',
      description: 'Auto-apply 10% markdown when a grocery cart total exceeds ₹600 to maximize average basket size.',
      campaign_type: 'cart_threshold_discount',
      trigger_rule: { min_cart_total: 600, target_segment: 'high_value_cart' },
      action_benefit: { benefit_type: 'percentage_discount', discount_percentage: 10, max_discount_cap: 150 },
      budget_limit: 20000.0,
      governance_ref: 'auth_ref_campaign_seed_instamart_01',
    },
    {
      id: 'cmp_truffles_free_delivery_02',
      merchant_id: 'swiggy_rest_truffles_02',
      name: 'Truffles Cafe Free Express Dispatch',
      description: 'Complimentary expedited delivery for Truffles Cafe & Burgers orders above ₹400.',
      campaign_type: 'free_shipping',
      trigger_rule: { min_cart_total: 400, target_segment: 'all' },
      action_benefit: { benefit_type: 'free_shipping', promotional_tag: 'FREE_EXPRESS_DISPATCH' },
      budget_limit: 15000.0,
      governance_ref: 'auth_ref_campaign_seed_truffles_02',
    },
    {
      id: 'cmp_reorder_replenish_03',
      merchant_id: 'merchant_swiggy_hub',
      name: 'Swiggy Repeat Nudge Subsidy (₹50 Credit)',
      description: 'Targeted replenishment incentive for returning buyers flagged as reorder-likely.',
      campaign_type: 'reorder_nudge_boost',
      trigger_rule: { min_cart_total: 200, target_segment: 'reorder_likely' },
      action_benefit: { benefit_type: 'fixed_discount', discount_amount: 50, promotional_tag: 'REORDER_NUDGE_50' },
      budget_limit: 15000.0,
      governance_ref: 'auth_ref_campaign_seed_swiggy_03',
    },
  ];

  for (const c of campaigns) {
    await db.query(
      `INSERT INTO merchant_campaigns (id, merchant_id, name, description, campaign_type, trigger_rule, action_benefit, budget_limit, budget_spent, status, governance_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0.00, 'active', $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         trigger_rule = EXCLUDED.trigger_rule,
         action_benefit = EXCLUDED.action_benefit,
         budget_limit = EXCLUDED.budget_limit`,
      [c.id, c.merchant_id, c.name, c.description, c.campaign_type, JSON.stringify(c.trigger_rule), JSON.stringify(c.action_benefit), c.budget_limit, c.governance_ref]
    );
  }
  console.log(`✅ [Seeder] Seeded ${campaigns.length} merchant growth campaigns.`);

  // 6. Ingest and seed Catalog Items from all adapters
  const ingestionResults = await adapterRegistry.ingestAllToUniversal();
  let totalItemsCount = 0;

  for (const res of ingestionResults) {
    await catalogRepo.bulkUpsertItems(res.items);
    totalItemsCount += res.items.length;

    await auditRepo.record({
      entity_type: 'platform_catalog',
      entity_id: res.platformId,
      action: 'adapter_sync_ingestion',
      actor_type: 'adapter_sync',
      reasoning: `Synchronized ${res.items.length} items from platform adapter "${res.platformId}".`,
      payload: {
        item_count: res.items.length,
        item_ids: res.items.map((i) => i.id),
      },
    });
  }

  console.log(`✨ [Seeder] Successfully seeded database with ${totalItemsCount} universal items across ${ingestionResults.length} platform adapters.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(() => {
      console.log('Seeding complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}
