import { executeMcpTool } from './mcp/tools.js';
import { seedDatabase } from './db/seed.js';
import { ShopperAgent } from './agents/ShopperAgent.js';
import { PlatformAgent } from './agents/PlatformAgent.js';
import { PaymentAgent } from './agents/PaymentAgent.js';
import { A2ARouter } from './a2a/A2ARouter.js';
import { RecommendationService } from './recommendations/RecommendationService.js';
import { SwiggyAdapter } from './adapters/SwiggyAdapter.js';

async function runPhase3Verification() {
  console.log('🧪 [Phase 3 Verification] Starting Revenue Growth, Vector Recommendations, A2A & Swiggy Test Suite...\n');

  // 1. Re-seed DB to clean state
  await seedDatabase();
  const recService = RecommendationService.getInstance();
  await recService.ensureIndex();

  console.log('--- 1. Testing Group 2: Vector Recommendation Tools ---');

  // 1.1 Personalized Vector Recommendations
  console.log('1.1 Testing get_recommendations (Personalized Ranking):');
  const personalized = await executeMcpTool('get_recommendations', {
    user_id: 'user_alex_buyer',
    context: 'wireless mechanical keyboard ergo',
    limit: 3,
  });
  console.log(`- Strategy: ${personalized.strategy}`);
  console.log(`- Reasoning: ${personalized.reasoning}`);
  console.log(`- Top Match: "${personalized.items[0]?.title}" (Score: ${personalized.items[0]?.recommendation_score})`);
  if (personalized.items.length === 0) throw new Error('Personalized recommendations should return items');

  // 1.2 Proactive Upsell Bundle
  console.log('\n1.2 Testing get_upsell_bundle (Complementary Cross-Sell):');
  const upsell = await executeMcpTool('get_upsell_bundle', {
    cart_items: [{ item_id: 'item_ret_ret_el_002' }], // Mechanical Keyboard
    limit: 2,
  });
  console.log(`- Strategy: ${upsell.strategy}`);
  console.log(`- Upsell items found (${upsell.items.length}):`, upsell.items.map((i: any) => `${i.title} (+₹${i.price})`));
  if (upsell.items.length === 0) throw new Error('Upsell bundle should return complementary items');

  // 1.3 Reorder Nudges
  console.log('\n1.3 Testing get_reorder_suggestions (Replenishment Nudges):');
  const reorders = await executeMcpTool('get_reorder_suggestions', {
    user_id: 'user_alex_buyer',
    limit: 2,
  });
  console.log(`- Strategy: ${reorders.strategy}`);
  console.log(`- Suggestions (${reorders.items.length}):`, reorders.items.map((i: any) => i.title));
  if (reorders.items.length === 0) throw new Error('Reorder suggestions should return items');

  console.log('\n--- 2. Testing A2A (Agent-to-Agent) Multi-Agent Protocol ---');

  const shopperAgent = new ShopperAgent('user_alex_buyer');
  const conversationId = `conv_test_phase3_${Date.now()}`;

  // 2.1 Shopper Agent receives intent -> A2A Intent Handoff -> Retail Platform Agent
  console.log('2.1 Shopper Agent Intent Routing & Proactive Upsell:');
  const shopperResponse = await shopperAgent.handleUserPrompt(
    'I want an ergonomic wireless mechanical keyboard with desk accessories',
    conversationId
  );
  console.log(`- Target Platform Selected: ${shopperResponse.target_platform}`);
  console.log(`- Natural Language Response: "${shopperResponse.natural_language_response}"`);
  console.log(`- Matched Items: ${shopperResponse.catalog_items.length}`);
  console.log(`- Proactive Upsell Surfaced: "${shopperResponse.proactive_upsell_bundle[0]?.title || 'None'}"`);
  if (shopperResponse.catalog_items.length === 0) throw new Error('A2A catalog discovery failed');

  // 2.2 Construct Bundle (< ₹35,000 autonomous tier) and Delegate Checkout via A2A
  console.log('\n2.2 A2A Autonomous Settlement Delegation to Payment Agent:');
  const itemsToBuy = [
    { item_id: 'item_ret_ret_el_002', quantity: 1 }, // Keyboard ₹14,499
    { item_id: 'item_ret_ret_el_009', quantity: 1 }, // Desk Mat ₹2,999
  ];

  const settlementResult = await shopperAgent.checkout({
    items: itemsToBuy,
    platform_id: shopperResponse.target_platform,
    offer_code: 'EARLYBIRD10',
    conversation_id: conversationId,
  });

  console.log(`- Settlement Status: ${settlementResult.payload.status}`);
  console.log(`- Order Number: ${settlementResult.payload.order_number}`);
  console.log(`- Grand Total Settled: ₹${settlementResult.payload.total_amount}`);
  console.log(`- Razorpay Test Link: ${settlementResult.payload.payment_url}`);
  console.log(`- Authorization Ref: ${settlementResult.payload.authorization_ref}`);
  console.log(`- Gate Checks: [${settlementResult.payload.gate_checks_passed.join(', ')}]`);
  if (!settlementResult.payload.payment_url) throw new Error('Payment URL was not generated');

  // 2.3 Verify A2A Message Traces
  const a2aRouter = A2ARouter.getInstance();
  const trace = a2aRouter.getConversationTrace(conversationId);
  console.log(`\n2.3 A2A Message Envelope Trace (${trace.length} inter-agent messages):`);
  trace.forEach((msg, idx) => {
    console.log(`  ${idx + 1}. [${msg.from_agent} ➔ ${msg.to_agent}] Type: ${msg.message_type} (ID: ${msg.id})`);
  });
  if (trace.length < 3) throw new Error('Expected at least 3 A2A inter-agent messages');

  // 2.4 Testing A2A High-Value Step-Up (> ₹35,000)
  console.log('\n2.4 Testing A2A High-Value Step-Up Trigger (> ₹35,000):');
  const stepUpSettlement = await shopperAgent.checkout({
    items: [{ item_id: 'item_ret_ret_el_003', quantity: 1 }], // QD-OLED Monitor ₹79,999
    platform_id: 'platform_retail_demo',
    conversation_id: `conv_stepup_${Date.now()}`,
  });
  console.log(`- Step-Up Status: ${stepUpSettlement.payload.status}`);
  console.log(`- Message: "${stepUpSettlement.payload.natural_language_message}"`);
  console.log(`- Token Issued: ${stepUpSettlement.payload.authorization_ref || 'None (Holding)'}`);

  console.log('\n--- 3. Testing Swiggy Thin Adapter (Builders Club MCP Integration) ---');
  const swiggyAdapter = new SwiggyAdapter();
  const restaurants = await swiggyAdapter.searchRestaurants('biryani');
  console.log(`3.1 Swiggy searchRestaurants("biryani") found: ${restaurants.length} restaurants`);
  console.log(`- Top Restaurant: "${restaurants[0]?.name}" (${restaurants[0]?.area})`);
  console.log(`- Menu items count: ${restaurants[0]?.menu?.length}`);
  if (restaurants.length === 0) throw new Error('Swiggy restaurant search should return results');

  const swiggyItems = await swiggyAdapter.fetchNativeItems();
  console.log(`3.2 Swiggy native menu items ingested into Universal Schema: ${swiggyItems.length} items`);

  // Test Swiggy Gated Live Checkout
  const swiggyCheckoutTest = await swiggyAdapter.executeLiveOrderPlacement(
    { total_amount: 340.0 },
    'auth_ref_test_swiggy_01'
  );
  console.log('3.3 Swiggy Live Checkout Gated Status:');
  console.log(`- Safety Hold Status: "${swiggyCheckoutTest.status}"`);
  console.log(`- Message: "${swiggyCheckoutTest.message}"`);
  console.log(`- Documented Captured Run: Order ${swiggyCheckoutTest.sample_captured_run?.reference_swiggy_order_id} (₹${swiggyCheckoutTest.sample_captured_run?.total_paid})`);

  console.log('\n--- 4. Extracting Complete Explainable Audit Trail ---');
  const auditResult = await executeMcpTool('get_audit_trail', { order_id: settlementResult.payload.order_id });
  console.log(`Audit Trail for Settled Order ${settlementResult.payload.order_id} (${auditResult.total_events} events):`);
  auditResult.audit_trail.forEach((evt: any, idx: number) => {
    console.log(`  ${idx + 1}. [${evt.timestamp.slice(11, 19)}] [${evt.actor}] -> ${evt.action_type} (${evt.status})`);
    console.log(`     Reasoning: "${evt.reasoning}"`);
  });

  console.log('\n✨ ALL PHASE 3 VERIFICATION TESTS PASSED 100%! Ready for Submission.');
}

runPhase3Verification().catch((err) => {
  console.error('Phase 3 Verification Failed:', err);
  process.exit(1);
});
