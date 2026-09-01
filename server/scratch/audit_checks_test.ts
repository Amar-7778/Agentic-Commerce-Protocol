import { seedDatabase } from './db/seed.js';
import { GovernanceRepository } from './db/repositories/GovernanceRepository.js';
import { CampaignService } from './campaigns/CampaignService.js';
import { executeMcpTool } from './mcp/tools.js';

async function runAuditChecks() {
  console.log('🔍 [INVESTIGATION] Running Direct Audit Checks 1 & 2...\n');
  await seedDatabase();

  const governanceRepo = GovernanceRepository.getInstance();
  const campaignService = CampaignService.getInstance();

  // ==========================================
  // CHECK 1 TEST: Hard Denial vs Step-Up Override
  // ==========================================
  console.log('================================================================');
  console.log('=== CHECK 1 TEST: Attempting Step-Up Override on Hard Denial ===');
  console.log('================================================================');

  const hardDenialAmount = 75000; // Exceeds per_transaction limit of ₹50,000 for user_alex_buyer
  const testOrderId = `ord_hard_denial_test_${Date.now()}`;

  console.log(`1.1 Requesting pre-authorization for ₹${hardDenialAmount} (per-transaction cap is ₹50,000):`);
  const initialPreauth = await executeMcpTool('request_preauthorization', {
    action: 'payment_link',
    amount: hardDenialAmount,
    reason: 'Attempt purchase of ₹75,000 exceeding hard limit ₹50,000',
    user_id: 'user_alex_buyer',
    order_id: testOrderId,
  });

  console.log(`- Pre-Auth Status: "${initialPreauth.status}" (Approved: ${initialPreauth.approved})`);
  console.log(`- Reason Code: "${initialPreauth.reason_code}"`);
  console.log(`- Message: "${initialPreauth.message}"`);
  console.log(`- Authorization Ref Issued: ${initialPreauth.authorization_ref || 'None'}`);

  console.log(`\n1.2 Calling approveHumanStepUp for this hard-denied transaction:`);
  const overrideAttempt = await governanceRepo.approveHumanStepUp(
    testOrderId,
    'Human supervisor attempting to approve a hard-denied transaction'
  );

  console.log(`- Override Call Status: "${overrideAttempt.status}" (Approved: ${overrideAttempt.approved})`);
  console.log(`- Override Authorization Ref: ${overrideAttempt.authorization_ref || 'None'}`);
  console.log(`- Message: "${overrideAttempt.message}"`);

  // ==========================================
  // CHECK 2 TEST: Combined Campaign Discount vs 40% Ceiling
  // ==========================================
  console.log('\n================================================================');
  console.log('=== CHECK 2 TEST: Combined Campaign Discount vs 40% Ceiling ===');
  console.log('================================================================');

  console.log('2.1 Creating Campaign A (25% discount, min cart ₹5,000):');
  const campA = await executeMcpTool('create_campaign', {
    merchant_id: 'merchant_apex_tech',
    name: 'Campaign A - 25% Flash Sale',
    description: '25% discount on orders over ₹5,000',
    campaign_type: 'cart_threshold_discount',
    trigger_rule: { min_cart_total: 5000, target_segment: 'all' },
    action_benefit: { benefit_type: 'percentage_discount', discount_percentage: 25, max_discount_cap: 10000 },
    budget_limit: 25000,
  });
  console.log(`- Created Campaign A: ${campA.campaign.name} (${campA.campaign.action_benefit.discount_percentage}%)`);

  console.log('\n2.2 Creating Campaign B (25% discount, min cart ₹5,000):');
  const campB = await executeMcpTool('create_campaign', {
    merchant_id: 'merchant_apex_tech',
    name: 'Campaign B - 25% Category Boost',
    description: '25% discount on category items',
    campaign_type: 'cart_threshold_discount',
    trigger_rule: { min_cart_total: 5000, target_segment: 'all' },
    action_benefit: { benefit_type: 'percentage_discount', discount_percentage: 25, max_discount_cap: 10000 },
    budget_limit: 25000,
  });
  console.log(`- Created Campaign B: ${campB.campaign.name} (${campB.campaign.action_benefit.discount_percentage}%)`);

  const cartSubtotal = 20000; // ₹20,000
  console.log(`\n2.3 Running evaluateCartCampaigns with Cart Subtotal: ₹${cartSubtotal.toLocaleString()}:`);
  const evalResult = await campaignService.evaluateCartCampaigns(
    [{ item_id: 'item_ret_ret_el_001', price: cartSubtotal }],
    cartSubtotal,
    'merchant_apex_tech'
  );

  const effectivePercentage = (evalResult.total_campaign_discount / cartSubtotal) * 100;
  console.log(`- Matched Campaigns: ${evalResult.matched_campaigns.length}`);
  console.log(`- Total Campaign Discount Applied: ₹${evalResult.total_campaign_discount.toLocaleString()}`);
  console.log(`- Effective Combined Discount Percentage: ${effectivePercentage}%`);
  console.log(`- 40% Maximum Permitted Ceiling on ₹${cartSubtotal.toLocaleString()}: ₹${(cartSubtotal * 0.40).toLocaleString()}`);
  console.log(`- Did Combined Discount Exceed 40% Ceiling?: ${effectivePercentage > 40 ? 'YES (VIOLATION)' : 'NO (COMPLIANT)'}`);
  console.log(`- Benefits Summary:`, evalResult.benefits_summary);
}

runAuditChecks().catch((err) => {
  console.error('Audit Check Failed:', err);
  process.exit(1);
});
