import dotenv from 'dotenv';
import { ShopperAgent } from './agents/ShopperAgent.js';
import { seedDatabase } from './db/seed.js';

dotenv.config();

async function testIntentVerification() {
  await seedDatabase();
  const agent = new ShopperAgent('user_alex_buyer');

  const testCases = [
    'how can i verify that',
    'what payment methods are accepted?',
    'i want buy an earphones',
    'hi',
  ];

  for (const q of testCases) {
    console.log(`\n========================================`);
    console.log(`PROMPT: "${q}"`);
    console.log(`========================================`);
    const res = await agent.handleUserPrompt(q);
    console.log(`RESPONSE:\n${res.natural_language_response}`);
    console.log(`ITEMS RETURNED: ${res.catalog_items.length}`);
    if (res.catalog_items.length > 0) {
      console.log(`TOP ITEM: ${res.catalog_items[0].title}`);
    }
  }
}

testIntentVerification()
  .then(() => {
    console.log('\n✅ Intent test passed!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error testing:', err);
    process.exit(1);
  });
