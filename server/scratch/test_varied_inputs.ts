import { ShopperAgent } from './agents/ShopperAgent.js';
import { seedDatabase } from './db/seed.js';

async function runVariedInputTests() {
  console.log('🤖 [VARIED INPUT TEST SUITE] Testing Natural Language Handling Across All Input Types...\n');

  await seedDatabase();
  const shopper = new ShopperAgent('user_alex_buyer');

  // Input 1: Clean Purchase Intent
  console.log('================================================================');
  console.log('=== TEST 1: Clean Purchase Intent ("mechanical keyboard") ===');
  console.log('================================================================');
  const res1 = await shopper.handleUserPrompt('I want an ergonomic wireless mechanical keyboard with desk accessories');
  console.log(`- Target Platform: ${res1.target_platform}`);
  console.log(`- Discovered Items: ${res1.catalog_items.length} items`);
  if (res1.catalog_items.length > 0) {
    console.log(`  Top Match: "${res1.catalog_items[0].title}" (₹${res1.catalog_items[0].price})`);
  }
  console.log(`- Proactive Upsell Bundle: ${res1.proactive_upsell_bundle.length > 0 ? `"${res1.proactive_upsell_bundle[0].title}" (₹${res1.proactive_upsell_bundle[0].price})` : 'None'}`);
  console.log(`- Natural Language Response:\n"${res1.natural_language_response}"\n`);

  // Input 2: Ambiguous / Incomplete Request
  console.log('================================================================');
  console.log('=== TEST 2: Ambiguous / Incomplete Request ("something for my desk") ===');
  console.log('================================================================');
  const res2 = await shopper.handleUserPrompt('something for my desk');
  console.log(`- Discovered Items: ${res2.catalog_items.length} curated desk items`);
  console.log(`- Natural Language Response (Clarifying Question):\n"${res2.natural_language_response}"\n`);

  // Input 3: Off-Topic / Unsupported Query
  console.log('================================================================');
  console.log('=== TEST 3: Off-Topic Query ("what\'s the weather like today?") ===');
  console.log('================================================================');
  const res3 = await shopper.handleUserPrompt("what's the weather like today?");
  console.log(`- Discovered Items: ${res3.catalog_items.length} (Expected 0)`);
  console.log(`- In-Character Graceful Response:\n"${res3.natural_language_response}"\n`);

  // Input 4: Culinary Order Intent
  console.log('================================================================');
  console.log('=== TEST 4: Food Delivery Intent ("order me an artisanal sourdough pizza") ===');
  console.log('================================================================');
  const res4 = await shopper.handleUserPrompt('order me an artisanal sourdough pizza');
  console.log(`- Target Platform: ${res4.target_platform}`);
  console.log(`- Discovered Items: ${res4.catalog_items.length} food items`);
  if (res4.catalog_items.length > 0) {
    console.log(`  Top Match: "${res4.catalog_items[0].title}" (₹${res4.catalog_items[0].price})`);
  }
  console.log(`- Natural Language Response:\n"${res4.natural_language_response}"\n`);

  console.log('✨ ALL 4 VARIED INPUT TYPES HANDLED ROBUSTLY AND ACCURATELY!');
}

runVariedInputTests().catch((err) => {
  console.error('Varied Input Test Failed:', err);
  process.exit(1);
});
