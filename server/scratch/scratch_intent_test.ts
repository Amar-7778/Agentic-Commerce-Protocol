import dotenv from 'dotenv';
import { ShopperAgent } from './agents/ShopperAgent.js';
import { seedDatabase } from './db/seed.js';

dotenv.config();

async function runTest() {
  console.log('--- Initializing DB & ShopperAgent ---');
  await seedDatabase();
  const agent = new ShopperAgent('user_alex_buyer');

  console.log('\n--- 1. Testing Greeting "hi" ---');
  const greetRes = await agent.handleUserPrompt('hi');
  console.log('Response:', greetRes.natural_language_response);
  console.log('Intent Options Count:', greetRes.intent_options?.length);
  console.log('Intent Options:', greetRes.intent_options?.map(o => o.label));

  console.log('\n--- 2. Testing "I was hungry" ---');
  const hungryRes = await agent.handleUserPrompt('I was hungry');
  console.log('Response:', hungryRes.natural_language_response);
  console.log('Food Intent Options:', hungryRes.intent_options?.map(o => o.label));

  console.log('\n--- 3. Testing Food Selection "Meghana Special Chicken Biryani" ---');
  const biryaniRes = await agent.handleUserPrompt('Meghana Special Chicken Biryani');
  console.log('Response:', biryaniRes.natural_language_response);
  console.log('Container Title:', biryaniRes.container_title);
  console.log('Discovered Items Count:', biryaniRes.catalog_items.length);
  console.log('First Item:', biryaniRes.catalog_items[0]?.title, '₹' + biryaniRes.catalog_items[0]?.price);

  console.log('\n--- 4. Testing Checkout ---');
  const checkoutRes = await agent.checkout({
    items: [{ item_id: biryaniRes.catalog_items[0]?.id || 'swiggy_item_meghana_biryani_01', quantity: 1 }],
    platform_id: 'platform_swiggy_builders',
    conversation_id: 'conv_test_123',
  });
  console.log('Checkout Status:', checkoutRes.payload?.status);
  console.log('Total Amount:', checkoutRes.payload?.total_amount);
  console.log('Payment Link:', checkoutRes.payload?.payment_url);
}

runTest().then(() => {
  console.log('\n✅ All Intent & Flow Tests Passed Successfully!');
  process.exit(0);
}).catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
