import { executeMcpTool } from './mcp/tools.js';
import { seedDatabase } from './db/seed.js';
import { OrderRepository } from './db/repositories/OrderRepository.js';
import { GovernanceRepository } from './db/repositories/GovernanceRepository.js';
import { getDatabaseClient } from './db/connection.js';

interface TestResult {
  tool: string;
  attack: string;
  blocked: boolean;
  error_message?: string;
  state_changed: boolean;
  pass: boolean;
}

async function runAdversarialAudit() {
  console.log('🛡️ [Adversarial Audit] Starting direct tool bypass testing...\n');
  await seedDatabase();
  const orderRepo = OrderRepository.getInstance();
  const governanceRepo = GovernanceRepository.getInstance();
  const db = getDatabaseClient();

  const results: TestResult[] = [];

  // Helper to create a fresh base order for testing
  const createTestOrder = async () => {
    return await orderRepo.createOrder({
      items: [{ item_id: 'item_food_food_rest_001', quantity: 1 }], // ~₹942 small amount
      user_id: 'user_alex_buyer',
    });
  };

  // Helper to obtain a genuinely valid, spent authorization reference
  const getSpentAuthRef = async (action: string, amount: number, orderId: string) => {
    // Reset spending limits for clean test isolation
    await db.query("UPDATE spending_limits SET current_spent = 0.00 WHERE subject_id = 'user_alex_buyer'");

    const preauth = await executeMcpTool('request_preauthorization', {
      action,
      amount,
      reason: `Legitimate test authorization for ${action}`,
      user_id: 'user_alex_buyer',
      order_id: orderId,
    });

    if (!preauth.authorization_ref) {
      throw new Error(`Failed to generate preauth for ${action}: ${preauth.message}`);
    }

    // Spend it legitimately once
    const spendResult = await governanceRepo.validateAndSpendAuthorization(preauth.authorization_ref, action, amount);
    if (!spendResult.valid) {
      throw new Error(`Failed to spend preauth: ${spendResult.reason}`);
    }

    return preauth.authorization_ref;
  };

  const toolsToTest = ['create_payment_link', 'create_upi_mandate', 'verify_payment', 'refund', 'apply_offer'];

  for (const tool of toolsToTest) {
    console.log(`\n--- Testing Tool: ${tool} ---`);

    // Attack 1: Missing authorization_ref (undefined / empty string)
    {
      const order = await createTestOrder();
      const initialStatus = order.status;
      let blocked = false;
      let errMessage = '';

      try {
        if (tool === 'create_payment_link') {
          await executeMcpTool(tool, { order_id: order.id, authorization_ref: '' });
        } else if (tool === 'create_upi_mandate') {
          await executeMcpTool(tool, { order_id: order.id, frequency: 'as_presented', max_amount: order.total_amount, authorization_ref: '' });
        } else if (tool === 'verify_payment') {
          await executeMcpTool(tool, { order_id: order.id, payment_id: 'pay_attack_01', signature: 'sig_attack_01', authorization_ref: '' });
        } else if (tool === 'refund') {
          await orderRepo.updatePaymentDetails(order.id, { status: 'paid' });
          await executeMcpTool(tool, { order_id: order.id, payment_id: 'pay_attack_01', amount: 500, reason: 'refund attack', authorization_ref: '' });
        } else if (tool === 'apply_offer') {
          await executeMcpTool(tool, { order_id: order.id, offer_code: 'GOURMET200', authorization_ref: '' });
        }
      } catch (err: any) {
        blocked = true;
        errMessage = err.message;
      }

      const updatedOrder = await orderRepo.getOrderById(order.id);
      let stateChanged = false;
      if (tool === 'refund') {
        stateChanged = updatedOrder?.status === 'refunded';
      } else if (tool === 'apply_offer') {
        stateChanged = (updatedOrder?.discount_amount || 0) > 0;
      } else {
        stateChanged = updatedOrder?.status !== initialStatus;
      }

      results.push({
        tool,
        attack: '1. Missing Ref (Empty)',
        blocked,
        error_message: errMessage,
        state_changed: stateChanged,
        pass: blocked && !stateChanged,
      });
      console.log(`  [Attack 1 - Missing Ref] Blocked: ${blocked} | State Changed: ${stateChanged} | Reason: "${errMessage}"`);
    }

    // Attack 2: Garbage / fake authorization_ref
    {
      const order = await createTestOrder();
      const initialStatus = order.status;
      let blocked = false;
      let errMessage = '';
      const garbageRef = 'auth_ref_fake_garbage_123456';

      try {
        if (tool === 'create_payment_link') {
          await executeMcpTool(tool, { order_id: order.id, authorization_ref: garbageRef });
        } else if (tool === 'create_upi_mandate') {
          await executeMcpTool(tool, { order_id: order.id, frequency: 'as_presented', max_amount: order.total_amount, authorization_ref: garbageRef });
        } else if (tool === 'verify_payment') {
          await executeMcpTool(tool, { order_id: order.id, payment_id: 'pay_attack_02', signature: 'sig_attack_02', authorization_ref: garbageRef });
        } else if (tool === 'refund') {
          await orderRepo.updatePaymentDetails(order.id, { status: 'paid' });
          await executeMcpTool(tool, { order_id: order.id, payment_id: 'pay_attack_02', amount: 500, reason: 'refund attack', authorization_ref: garbageRef });
        } else if (tool === 'apply_offer') {
          await executeMcpTool(tool, { order_id: order.id, offer_code: 'GOURMET200', authorization_ref: garbageRef });
        }
      } catch (err: any) {
        blocked = true;
        errMessage = err.message;
      }

      const updatedOrder = await orderRepo.getOrderById(order.id);
      let stateChanged = false;
      if (tool === 'refund') {
        stateChanged = updatedOrder?.status === 'refunded';
      } else if (tool === 'apply_offer') {
        stateChanged = (updatedOrder?.discount_amount || 0) > 0;
      } else {
        stateChanged = updatedOrder?.status !== initialStatus;
      }

      results.push({
        tool,
        attack: '2. Garbage Ref',
        blocked,
        error_message: errMessage,
        state_changed: stateChanged,
        pass: blocked && !stateChanged,
      });
      console.log(`  [Attack 2 - Garbage Ref] Blocked: ${blocked} | State Changed: ${stateChanged} | Reason: "${errMessage}"`);
    }

    // Attack 3: Genuine Double-Spend of Already-Spent Token
    {
      const order = await createTestOrder();
      const initialStatus = order.status;
      let blocked = false;
      let errMessage = '';
      const actionKey = tool === 'verify_payment' ? 'verify_payment' : (tool === 'create_payment_link' ? 'payment_link' : (tool === 'create_upi_mandate' ? 'upi_mandate' : (tool === 'apply_offer' ? 'apply_offer' : 'refund')));
      const amountToAuth = (tool === 'apply_offer' ? 0 : (tool === 'refund' ? 500 : order.total_amount));
      const spentToken = await getSpentAuthRef(actionKey, amountToAuth, order.id);

      try {
        if (tool === 'create_payment_link') {
          await executeMcpTool(tool, { order_id: order.id, authorization_ref: spentToken });
        } else if (tool === 'create_upi_mandate') {
          await executeMcpTool(tool, { order_id: order.id, frequency: 'as_presented', max_amount: order.total_amount, authorization_ref: spentToken });
        } else if (tool === 'verify_payment') {
          await executeMcpTool(tool, { order_id: order.id, payment_id: 'pay_attack_03', signature: 'sig_attack_03', authorization_ref: spentToken });
        } else if (tool === 'refund') {
          await orderRepo.updatePaymentDetails(order.id, { status: 'paid' });
          await executeMcpTool(tool, { order_id: order.id, payment_id: 'pay_attack_03', amount: 500, reason: 'refund attack', authorization_ref: spentToken });
        } else if (tool === 'apply_offer') {
          await executeMcpTool(tool, { order_id: order.id, offer_code: 'GOURMET200', authorization_ref: spentToken });
        }
      } catch (err: any) {
        blocked = true;
        errMessage = err.message;
      }

      const updatedOrder = await orderRepo.getOrderById(order.id);
      let stateChanged = false;
      if (tool === 'refund') {
        stateChanged = updatedOrder?.status === 'refunded';
      } else if (tool === 'apply_offer') {
        stateChanged = (updatedOrder?.discount_amount || 0) > 0;
      } else {
        stateChanged = updatedOrder?.status !== initialStatus;
      }

      results.push({
        tool,
        attack: '3. Double Spend (Spent Ref)',
        blocked,
        error_message: errMessage,
        state_changed: stateChanged,
        pass: blocked && !stateChanged,
      });
      console.log(`  [Attack 3 - Double Spend] Blocked: ${blocked} | State Changed: ${stateChanged} | Reason: "${errMessage}"`);
    }
  }

  console.log('\n================ AUDIT SUMMARY TABLE (5 Tools x 3 Attack Vectors) ================');
  console.table(results);
}

runAdversarialAudit().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
