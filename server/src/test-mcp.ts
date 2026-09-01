import { McpServer } from './mcp/server.js';
import { executeMcpTool, MCP_TOOLS } from './mcp/tools.js';
import { seedDatabase } from './db/seed.js';
import { getDatabaseClient } from './db/connection.js';

async function runMcpTests() {
  console.log('🧪 [MCP Test Suite] Starting End-to-End MCP & Governance Gate Verification...\n');

  // 1. Re-seed DB to clean state
  await seedDatabase();
  const db = getDatabaseClient();
  const mcpServer = McpServer.getInstance();

  console.log('--- 1. Testing MCP JSON-RPC 2.0 Handshake & Tools Listing ---');
  const initResp = await mcpServer.handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {},
  });
  console.log('Initialize Response:', initResp.result.serverInfo.name, `v${initResp.result.serverInfo.version}`);

  const listResp = await mcpServer.handleMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });
  const tools = listResp.result.tools;
  console.log(`Exposed MCP Tools (${tools.length}):`, tools.map((t: any) => t.name));
  if (tools.length < 15) throw new Error(`Expected at least 15 MCP tools, got ${tools.length}`);

  console.log('\n--- 2. Testing Group 1: Catalog Tools ---');
  const searchResult = await executeMcpTool('search_catalog', { query: 'biryani', max_price: 1000 });
  console.log(`search_catalog("biryani") returned: ${searchResult.items.length} items (${searchResult.items[0]?.title})`);
  if (searchResult.items.length === 0) throw new Error('Search failed to return items');

  const itemId = searchResult.items[0].id;
  const itemDetails = await executeMcpTool('get_item', { item_id: itemId });
  console.log(`get_item("${itemId}"):`, itemDetails.title, `₹${itemDetails.price}`);

  const stockCheck = await executeMcpTool('check_availability', { item_id: itemId, quantity: 2 });
  console.log(`check_availability("${itemId}", 2):`, stockCheck.available ? 'Available' : 'Unavailable', `(Stock: ${stockCheck.quantity_in_stock})`);
  if (!stockCheck.available) throw new Error('Item should be available in stock');

  console.log('\n--- 3. Testing Group 3: Cart & Order Tools ---');
  const createdOrder = await executeMcpTool('create_order', {
    items: [
      { item_id: itemId, quantity: 1 },
      { item_id: 'item_swiggy_paneer_biryani_02', quantity: 1 },
    ],
    user_id: 'user_alex_buyer',
    shipping_address: {
      line1: '402 Cyber Hub, Phase 2',
      city: 'Bangalore',
      pincode: '560103',
    },
  });
  console.log(`create_order(): Order ${createdOrder.order_number} created.`);
  console.log(`- Subtotal: ₹${createdOrder.subtotal_amount}`);
  console.log(`- GST (18%): ₹${createdOrder.tax_amount}`);
  console.log(`- Total: ₹${createdOrder.total_amount}`);
  if (createdOrder.items.length !== 2) throw new Error('Order items count mismatch');

  // Update Cart (Quantity changes)
  const updatedOrder = await executeMcpTool('update_cart', {
    order_id: createdOrder.id,
    changes: {
      update_quantities: { [itemId]: 1 },
    },
  });
  console.log(`update_cart(): Modified qty. New Subtotal: ₹${updatedOrder.subtotal_amount}, Total: ₹${updatedOrder.total_amount}`);

  console.log('\n--- 4. Testing Group 5: Governance Gate Structural Enforcement ---');
  // Attempt 1: Calling apply_offer without authorization_ref -> MUST FAIL
  try {
    await executeMcpTool('apply_offer', {
      order_id: createdOrder.id,
      offer_code: 'BIRYANI10',
      authorization_ref: '', // Missing ref
    });
    throw new Error('Gate breach: apply_offer succeeded without authorization_ref!');
  } catch (err: any) {
    console.log('✅ Gate Blocked (Missing Ref):', err.message);
  }

  // Attempt 2: Calling create_payment_link without authorization_ref -> MUST FAIL
  try {
    await executeMcpTool('create_payment_link', {
      order_id: createdOrder.id,
      authorization_ref: 'invalid_fake_token',
    });
    throw new Error('Gate breach: create_payment_link succeeded with fake token!');
  } catch (err: any) {
    console.log('✅ Gate Blocked (Invalid Ref):', err.message);
  }

  // Request Pre-Authorization for Apply Offer
  console.log('\n--- 5. Testing Policy Pre-Authorizations & Real Policy States ---');
  const offerPreauth = await executeMcpTool('request_preauthorization', {
    action: 'apply_offer',
    amount: 0,
    reason: 'AI Buyer qualifies for Biryani10 discount.',
    user_id: 'user_alex_buyer',
    order_id: createdOrder.id,
  });
  console.log('Offer Pre-Authorization:', offerPreauth.status, `(Ref: ${offerPreauth.authorization_ref})`);
  if (!offerPreauth.approved) throw new Error('Offer preauth should be approved');

  // Now apply offer with valid authorization_ref
  const discountedOrder = await executeMcpTool('apply_offer', {
    order_id: createdOrder.id,
    offer_code: 'BIRYANI10',
    authorization_ref: offerPreauth.authorization_ref,
  });
  console.log(`apply_offer() Succeeded: Discount: ₹${discountedOrder.discount_amount}, Final Total: ₹${discountedOrder.total_amount}`);

  // Test Single-Use Token: Attempting to spend the SAME auth ref again -> MUST FAIL
  try {
    await executeMcpTool('apply_offer', {
      order_id: createdOrder.id,
      offer_code: 'BIRYANI10',
      authorization_ref: offerPreauth.authorization_ref,
    });
    throw new Error('Gate breach: Single-use token reused!');
  } catch (err: any) {
    console.log('✅ Gate Blocked (Double Spend Rejection):', err.message);
  }

  // Reset spending limits for clean step-up & policy limit tests
  await db.query("UPDATE spending_limits SET current_spent = 0.00 WHERE subject_id = 'user_alex_buyer'");

  // Test Real State: High-Value Autonomous Threshold Step-Up (> ₹35,000)
  const stepUpPreauth = await executeMcpTool('request_preauthorization', {
    action: 'payment_link',
    amount: 45000,
    reason: 'AI Agent buying high-end audio hardware.',
    user_id: 'user_alex_buyer',
  });
  console.log('High-Value Step-Up Pre-Authorization (> ₹35,000):', stepUpPreauth.status, `(${stepUpPreauth.message})`);
  if (stepUpPreauth.status !== 'needs_human_confirmation') {
    throw new Error('High-value purchase should trigger needs_human_confirmation');
  }

  // Test Real State: Denied (Hard Spending Limit Exceeded > ₹50,000 tx limit)
  const deniedPreauth = await executeMcpTool('request_preauthorization', {
    action: 'payment_link',
    amount: 85000,
    reason: 'AI Agent attempting purchase beyond user transaction cap.',
    user_id: 'user_alex_buyer',
  });
  console.log('Hard Spending Limit Exceeded (> ₹50,000):', deniedPreauth.status, `(${deniedPreauth.message})`);
  if (deniedPreauth.status !== 'denied') {
    throw new Error('Over-limit purchase should trigger denied state');
  }

  console.log('\n--- 6. Testing Group 4: Razorpay Test-Mode Payment Flow ---');
  // Request pre-authorization for payment
  const paymentPreauth = await executeMcpTool('request_preauthorization', {
    action: 'payment_link',
    amount: discountedOrder.total_amount,
    reason: `Payment authorization for Order ${discountedOrder.order_number} under daily budget cap.`,
    user_id: 'user_alex_buyer',
    order_id: discountedOrder.id,
  });
  console.log('Payment Pre-Authorization:', paymentPreauth.status, `(Ref: ${paymentPreauth.authorization_ref})`);
  if (!paymentPreauth.approved) throw new Error('Payment pre-authorization should be approved');

  // Issue Payment Link
  const paymentLink = await executeMcpTool('create_payment_link', {
    order_id: discountedOrder.id,
    authorization_ref: paymentPreauth.authorization_ref,
  });
  console.log('Razorpay Payment Link Created:');
  console.log('- Link ID:', paymentLink.payment_link_id);
  console.log('- URL:', paymentLink.payment_url);
  console.log('- Order Status:', paymentLink.status);

  // Request Pre-Authorization for Payment Verification & Settlement
  const verifyPreauth = await executeMcpTool('request_preauthorization', {
    action: 'verify_payment',
    amount: discountedOrder.total_amount,
    reason: `Payment signature verification & state settlement for Order ${discountedOrder.order_number}.`,
    user_id: 'user_alex_buyer',
    order_id: discountedOrder.id,
  });

  // Verify Payment — no signature supplied deliberately: there is no real
  // gateway in this test, so a fabricated signature would either be rejected
  // by the genuine HMAC check (when a real key secret is configured) or prove
  // nothing (when it isn't). Omitting it exercises the honest "settled on the
  // test rail, cryptographically unverified" path the service is designed for.
  const paymentVerification = await executeMcpTool('verify_payment', {
    order_id: discountedOrder.id,
    payment_id: `pay_test_${Date.now()}`,
    authorization_ref: verifyPreauth.authorization_ref,
  });
  console.log('Payment Verification:', paymentVerification.status, `(Payment ID: ${paymentVerification.payment_id})`);

  // Check Status
  const statusCheck = await executeMcpTool('check_status', { order_id: discountedOrder.id });
  console.log('check_status():', statusCheck.status, `— "${statusCheck.natural_language_diagnosis}"`);
  if (statusCheck.status !== 'paid') throw new Error('Order should be in paid status');

  console.log('\n--- 7. Testing Deliberate Failure Simulation & Autonomous Recovery ---');
  // Create a food delivery order
  const foodOrder = await executeMcpTool('create_order', {
    items: [{ item_id: 'item_swiggy_all_american_burger_03', quantity: 1 }],
    user_id: 'user_alex_buyer',
  });

  // Preauthorize
  const foodPreauth = await executeMcpTool('request_preauthorization', {
    action: 'payment_link',
    amount: foodOrder.total_amount,
    reason: 'Dinner order checkout',
    user_id: 'user_alex_buyer',
    order_id: foodOrder.id,
  });

  // Simulate deliberate Bank Timeout Failure
  const failedLink = await executeMcpTool('create_payment_link', {
    order_id: foodOrder.id,
    authorization_ref: foodPreauth.authorization_ref,
    simulate_failure: 'bank_timeout',
  });
  console.log('Deliberate Failure Triggered:', failedLink.status, failedLink.failure_details);

  // Agent detects failure via check_status
  const failureDiagnosis = await executeMcpTool('check_status', { order_id: foodOrder.id });
  console.log('Failure Diagnosis by Agent:');
  console.log('- Status:', failureDiagnosis.status);
  console.log('- Diagnosis:', `"${failureDiagnosis.natural_language_diagnosis}"`);
  console.log('- Suggested Action:', `"${failureDiagnosis.suggested_next_action}"`);
  console.log('- Can Retry:', failureDiagnosis.can_retry);

  // Autonomous Recovery: Request preauthorization for UPI AutoPay Mandate alternative
  const recoveryPreauth = await executeMcpTool('request_preauthorization', {
    action: 'upi_mandate',
    amount: foodOrder.total_amount,
    reason: 'Recovery fallback from bank gateway timeout: switching to UPI AutoPay mandate.',
    user_id: 'user_alex_buyer',
    order_id: foodOrder.id,
  });
  console.log('Recovery Preauth Granted:', recoveryPreauth.authorization_ref);

  const recoveryMandate = await executeMcpTool('create_upi_mandate', {
    order_id: foodOrder.id,
    frequency: 'as_presented',
    max_amount: foodOrder.total_amount,
    authorization_ref: recoveryPreauth.authorization_ref,
  });
  console.log('✅ Autonomous Recovery Completed: UPI Mandate Issued:', recoveryMandate.auth_link);

  console.log('\n--- 8. Testing Refund Flow ---');
  const refundPreauth = await executeMcpTool('request_preauthorization', {
    action: 'refund',
    amount: 1000,
    reason: 'Partial customer satisfaction refund for delayed delivery.',
    user_id: 'user_alex_buyer',
    order_id: discountedOrder.id,
  });

  const refundResult = await executeMcpTool('refund', {
    order_id: discountedOrder.id,
    payment_id: paymentVerification.payment_id,
    amount: 1000,
    reason: 'Partial customer satisfaction credit.',
    authorization_ref: refundPreauth.authorization_ref,
  });
  console.log('Refund Processed:', refundResult.status, `(Refund ID: ${refundResult.refund_id})`);

  console.log('\n--- 9. Testing Explainable Audit Trail ---');
  const auditResult = await executeMcpTool('get_audit_trail', { order_id: discountedOrder.id });
  console.log(`Audit Trail for Order ${discountedOrder.id} (${auditResult.total_events} events):`);
  auditResult.audit_trail.forEach((evt: any, idx: number) => {
    console.log(`  ${idx + 1}. [${evt.timestamp.slice(11, 19)}] [${evt.actor}] -> ${evt.action_type} (${evt.status})`);
    console.log(`     Reasoning: "${evt.reasoning}"`);
    if (evt.authorization_ref) console.log(`     Auth Ref: ${evt.authorization_ref}`);
  });

  if (auditResult.total_events < 4) {
    throw new Error('Audit trail should contain complete decision history');
  }

  console.log('\n✨ ALL MCP & GOVERNANCE GATE TESTS PASSED 100%!');
}

runMcpTests().catch((err) => {
  console.error('MCP Test Suite Failed:', err);
  process.exit(1);
});
