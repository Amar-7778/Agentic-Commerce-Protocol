import { executeMcpTool } from './mcp/tools.js';
import { seedDatabase } from './db/seed.js';
import { ShopperAgent } from './agents/ShopperAgent.js';
import { A2ARouter } from './a2a/A2ARouter.js';
import { RecommendationService } from './recommendations/RecommendationService.js';
import { CampaignService } from './campaigns/CampaignService.js';
import { GovernanceRepository } from './db/repositories/GovernanceRepository.js';
import { SwiggyAdapter } from './adapters/SwiggyAdapter.js';

async function runPhase4Verification() {
  console.log('🚀 [Phase 4 Verification] Starting Campaign Orchestrator, Step-Up Governance, and Full Resilience Test Suite...\n');

  // 1. Re-seed DB to clean state
  await seedDatabase();
  const recService = RecommendationService.getInstance();
  await recService.ensureIndex();
  const campaignService = CampaignService.getInstance();
  const governanceRepo = GovernanceRepository.getInstance();

  console.log('--- 1. Testing Campaign Orchestrator (Structurally Gated Merchant Engine) ---');

  // 1.1 Create Gated Campaign with Pre-authorization
  console.log('1.1 Launching new merchant growth campaign (create_campaign):');
  const createdCampaignRes = await executeMcpTool('create_campaign', {
    merchant_id: 'merchant_apex_tech',
    name: 'Apex Studio Creator Bundle Subsidy',
    description: 'Auto-apply 15% discount for creators ordering audio & peripherals over ₹15,000.',
    campaign_type: 'cart_threshold_discount',
    trigger_rule: {
      min_cart_total: 15000,
      target_segment: 'high_value_cart',
    },
    action_benefit: {
      benefit_type: 'percentage_discount',
      discount_percentage: 15,
      max_discount_cap: 4000,
    },
    budget_limit: 35000,
  });

  console.log(`- Campaign Created: "${createdCampaignRes.campaign.name}" (ID: ${createdCampaignRes.campaign.id})`);
  console.log(`- Status: ${createdCampaignRes.campaign.status}`);
  console.log(`- Budget Allocated: ₹${createdCampaignRes.campaign.budget_limit}`);
  console.log(`- Signed Pre-Auth Ref: ${createdCampaignRes.authorization_ref}`);
  if (!createdCampaignRes.campaign.id || !createdCampaignRes.authorization_ref) {
    throw new Error('Campaign creation must return campaign ID and authorization ref');
  }

  // 1.2 List Active Campaigns
  console.log('\n1.2 Listing active campaigns (list_active_campaigns):');
  const activeCampaigns = await executeMcpTool('list_active_campaigns', { merchant_id: 'merchant_apex_tech' });
  console.log(`- Total Active Campaigns found: ${activeCampaigns.total_active_campaigns}`);
  activeCampaigns.campaigns.forEach((c: any, idx: number) => {
    console.log(`  ${idx + 1}. [${c.campaign_type}] ${c.name} (Budget: ₹${c.budget_limit})`);
  });
  if (activeCampaigns.total_active_campaigns < 2) throw new Error('Expected at least 2 active campaigns for merchant');

  // 1.3 Campaign Audit Inspection
  console.log('\n1.3 Inspecting campaign audit ledger (get_campaign_audit):');
  const campaignAudit = await executeMcpTool('get_campaign_audit', { campaign_id: createdCampaignRes.campaign.id });
  console.log(`- Audit Events for Campaign ${createdCampaignRes.campaign.id}: ${campaignAudit.total_events}`);
  campaignAudit.audit_trail.forEach((evt: any, idx: number) => {
    console.log(`  ${idx + 1}. [${evt.timestamp.slice(11, 19)}] [${evt.actor}] -> ${evt.action_type} (${evt.status})`);
    console.log(`     Reasoning: "${evt.reasoning}"`);
    console.log(`     Gate Checks: [${evt.gate_checks_passed.join(', ')}]`);
  });
  if (campaignAudit.total_events === 0) throw new Error('Campaign audit trail should contain recorded events');

  // 1.4 Evaluate Cart Campaigns
  console.log('\n1.4 Evaluating live cart against active campaigns:');
  const evalResult = await campaignService.evaluateCartCampaigns(
    [{ item_id: 'item_ret_ret_el_001', price: 24999 }],
    24999,
    'merchant_apex_tech'
  );
  console.log(`- Matched Campaigns: ${evalResult.matched_campaigns.length}`);
  console.log(`- Total Campaign Discount: ₹${evalResult.total_campaign_discount}`);
  console.log(`- Benefits Summary:`, evalResult.benefits_summary);
  if (evalResult.matched_campaigns.length === 0) throw new Error('Cart evaluation should match active campaigns');

  console.log('\n--- 2. Testing Human Supervisor Step-Up Approval & Override Flow ---');

  const shopperAgent = new ShopperAgent('user_alex_buyer');
  const highValueOrderId = `ord_stepup_test_${Date.now()}`;

  // 2.1 Trigger > ₹35,000 Step-Up
  console.log('2.1 Requesting pre-authorization for High-Value Purchase (₹45,000):');
  const highValuePreauth = await executeMcpTool('request_preauthorization', {
    action: 'payment_link',
    amount: 45000,
    reason: 'Purchase of flagship QD-OLED professional monitor',
    user_id: 'user_alex_buyer',
    order_id: highValueOrderId,
  });

  console.log(`- Pre-Auth Status: ${highValuePreauth.status}`);
  console.log(`- Reason Code: ${highValuePreauth.reason_code}`);
  console.log(`- Message: "${highValuePreauth.message}"`);
  if (highValuePreauth.status !== 'needs_human_confirmation') {
    throw new Error('High value purchase must require human confirmation');
  }

  // 2.2 Execute Human Supervisor Override Approval
  console.log('\n2.2 Human Supervisor approving step-up request:');
  const supervisorApproval = await governanceRepo.approveHumanStepUp(
    highValueOrderId,
    'Human buyer verified and explicitly authorized ₹45,000 purchase'
  );
  console.log(`- Supervisor Approval Status: ${supervisorApproval.status}`);
  console.log(`- Override Authorization Token Issued: ${supervisorApproval.authorization_ref}`);
  console.log(`- Message: "${supervisorApproval.message}"`);
  if (!supervisorApproval.approved || !supervisorApproval.authorization_ref) {
    throw new Error('Supervisor approval must issue authorization ref');
  }

  console.log('\n--- 3. Testing Deliberate Failure Scenario 1: Razorpay Bank Timeout ➔ UPI Fallback ---');

  const failureOrder = await executeMcpTool('create_order', {
    items: [{ item_id: 'item_ret_ret_el_002', quantity: 1 }],
    user_id: 'user_alex_buyer',
  });

  const failPreauth = await executeMcpTool('request_preauthorization', {
    action: 'payment_link',
    amount: failureOrder.total_amount,
    reason: 'Resilience test order for bank gateway timeout',
    user_id: 'user_alex_buyer',
    order_id: failureOrder.id,
  });

  // 3.1 Simulate Bank Timeout
  const failedPaymentRes = await executeMcpTool('create_payment_link', {
    order_id: failureOrder.id,
    authorization_ref: failPreauth.authorization_ref,
    simulate_failure: 'bank_timeout',
  });
  console.log(`3.1 Payment Link Simulated Status: ${failedPaymentRes.status} (Failure: ${failedPaymentRes.failure_details?.code})`);

  // 3.2 Automated Diagnostic State Check
  const statusCheck = await executeMcpTool('check_status', { order_id: failureOrder.id });
  console.log(`3.2 Automated Diagnosis: "${statusCheck.natural_language_diagnosis}"`);
  console.log(`- Suggested Next Action: "${statusCheck.suggested_next_action}"`);

  // 3.3 Automated Fallback to UPI AutoPay Mandate
  const upiPreauth = await executeMcpTool('request_preauthorization', {
    action: 'upi_mandate',
    amount: failureOrder.total_amount,
    reason: 'Automated fallback to UPI AutoPay Mandate after bank timeout',
    user_id: 'user_alex_buyer',
    order_id: failureOrder.id,
  });

  const upiMandate = await executeMcpTool('create_upi_mandate', {
    order_id: failureOrder.id,
    frequency: 'as_presented',
    max_amount: failureOrder.total_amount,
    authorization_ref: upiPreauth.authorization_ref,
  });
  console.log(`3.3 Resilience Fallback Mandate Issued: ${upiMandate.id} (${upiMandate.frequency}, cap ₹${upiMandate.max_amount})`);
  console.log(`- UPI Mandate Auth Link: ${upiMandate.auth_link}`);
  if (!upiMandate.auth_link) throw new Error('UPI mandate fallback failed');

  console.log('\n--- 4. Testing Deliberate Failure Scenario 2: Swiggy Live Gated Safety Hold ---');
  const swiggyAdapter = new SwiggyAdapter();
  const gatedExecution = await swiggyAdapter.executeLiveOrderPlacement(
    { total_amount: 340.0 },
    'auth_ref_swiggy_phase4_demo'
  );
  console.log(`4.1 Swiggy Gated Status: "${gatedExecution.status}"`);
  console.log(`- Safety Message: "${gatedExecution.message}"`);
  console.log(`- Sample Captured Sandbox Order: ${gatedExecution.sample_captured_run?.reference_swiggy_order_id} (₹${gatedExecution.sample_captured_run?.total_paid})`);
  if (gatedExecution.status !== 'gated_safety_hold') throw new Error('Swiggy live order must remain in gated safety hold');

  console.log('\n--- 5. Verifying Complete Order Audit Trail ---');
  const fullAudit = await executeMcpTool('get_audit_trail', { order_id: failureOrder.id });
  console.log(`Order ${failureOrder.order_number} Audit Ledger (${fullAudit.total_events} events):`);
  fullAudit.audit_trail.forEach((evt: any, idx: number) => {
    console.log(`  ${idx + 1}. [${evt.timestamp.slice(11, 19)}] [${evt.actor}] -> ${evt.action_type} (${evt.status})`);
    console.log(`     Reasoning: "${evt.reasoning}"`);
  });

  console.log('\n✨ ALL PHASE 4 VERIFICATION TESTS PASSED 100%! Ready for Submission.');
}

runPhase4Verification().catch((err) => {
  console.error('Phase 4 Verification Failed:', err);
  process.exit(1);
});
