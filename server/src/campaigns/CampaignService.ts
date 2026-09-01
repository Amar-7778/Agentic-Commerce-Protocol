import { getDatabaseClient } from '../db/connection.js';
import { GovernanceRepository } from '../db/repositories/GovernanceRepository.js';
import { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';
import { config } from '../config/index.js';
import crypto from 'crypto';

const inr = (amount: number): string => `₹${amount.toLocaleString('en-IN')}`;

export interface CampaignRule {
  min_cart_total?: number;
  target_category?: string;
  target_segment?: 'all' | 'reorder_likely' | 'first_time_buyer' | 'high_value_cart';
  required_item_count?: number;
}

export interface CampaignBenefit {
  benefit_type: 'percentage_discount' | 'fixed_discount' | 'free_shipping' | 'bundle_credit';
  discount_percentage?: number;
  discount_amount?: number;
  max_discount_cap?: number;
  promotional_tag?: string;
}

export interface CreateCampaignParams {
  merchant_id: string;
  name: string;
  description: string;
  campaign_type: 'cart_threshold_discount' | 'reorder_nudge_boost' | 'upsell_bundle_boost' | 'free_shipping';
  trigger_rule: CampaignRule;
  action_benefit: CampaignBenefit;
  budget_limit?: number;
}

export interface MerchantCampaign {
  id: string;
  merchant_id: string;
  name: string;
  description: string;
  campaign_type: string;
  trigger_rule: CampaignRule;
  action_benefit: CampaignBenefit;
  budget_limit: number;
  budget_spent: number;
  status: 'active' | 'paused' | 'completed' | 'budget_exhausted';
  governance_ref?: string;
  created_at: string;
  updated_at: string;
}

export class CampaignService {
  private static instance: CampaignService;
  private governanceRepo = GovernanceRepository.getInstance();
  private auditRepo = AuditLogRepository.getInstance();

  public static getInstance(): CampaignService {
    if (!CampaignService.instance) {
      CampaignService.instance = new CampaignService();
    }
    return CampaignService.instance;
  }

  /**
   * Create and activate a merchant growth campaign through the governance layer.
   * STRUCTURALLY GATED: requires spending limit pre-authorization before creation.
   */
  public async createCampaign(params: CreateCampaignParams): Promise<{
    campaign: MerchantCampaign;
    governance_result: any;
    authorization_ref: string;
  }> {
    const db = getDatabaseClient();
    const budget = params.budget_limit || config.campaigns.defaultBudgetLimit;
    const discountCeiling = config.governance.maxDiscountPercentage;
    const gateChecksPassed: string[] = [];

    // 1. Guardrail check: the markdown a merchant agent may launch unreviewed.
    if (params.action_benefit.discount_percentage && params.action_benefit.discount_percentage > discountCeiling) {
      throw new Error(
        `GOVERNANCE_BLOCKED: Proposed discount of ${params.action_benefit.discount_percentage}% exceeds the ` +
          `autonomous merchant safety ceiling of ${discountCeiling}%.`
      );
    }
    if (budget <= 0 || isNaN(budget)) {
      throw new Error('GOVERNANCE_BLOCKED: Campaign budget must be a positive number.');
    }
    gateChecksPassed.push('DISCOUNT_BOUNDS_VERIFIED');

    // 2. Spending Limit & Policy Pre-authorization Check
    const preauth = await this.governanceRepo.requestPreauthorization({
      action: 'apply_offer',
      amount: budget,
      reason: `Merchant campaign "${params.name}" budget authorization of ${inr(budget)} for merchant ${params.merchant_id}`,
      user_id: params.merchant_id,
      merchant_id: params.merchant_id,
    });

    if (!preauth.approved && preauth.status !== 'approved') {
      throw new Error(`GOVERNANCE_DENIED: Campaign budget pre-authorization failed: ${preauth.message}`);
    }
    gateChecksPassed.push(...(preauth.gate_checks_passed || []));
    gateChecksPassed.push('CAMPAIGN_BUDGET_PREAUTH_ACQUIRED');

    // 3. Atomically Insert Campaign Record
    const campaignId = `cmp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const res = await db.query(
      `INSERT INTO merchant_campaigns (
        id, merchant_id, name, description, campaign_type,
        trigger_rule, action_benefit, budget_limit, budget_spent,
        status, governance_ref
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0.00, 'active', $9)
      RETURNING *`,
      [
        campaignId,
        params.merchant_id,
        params.name,
        params.description,
        params.campaign_type,
        JSON.stringify(params.trigger_rule),
        JSON.stringify(params.action_benefit),
        budget,
        preauth.authorization_ref,
      ]
    );

    const row = res.rows[0];
    const campaign: MerchantCampaign = {
      id: row.id,
      merchant_id: row.merchant_id,
      name: row.name,
      description: row.description,
      campaign_type: row.campaign_type,
      trigger_rule: typeof row.trigger_rule === 'string' ? JSON.parse(row.trigger_rule) : row.trigger_rule,
      action_benefit: typeof row.action_benefit === 'string' ? JSON.parse(row.action_benefit) : row.action_benefit,
      budget_limit: parseFloat(row.budget_limit),
      budget_spent: parseFloat(row.budget_spent || '0'),
      status: row.status,
      governance_ref: row.governance_ref,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };

    // 4. Record Immutable Audit Log
    await this.auditRepo.record({
      entity_type: 'merchant_campaign',
      entity_id: campaign.id,
      action: 'create_campaign',
      actor_type: 'merchant_system',
      actor_id: params.merchant_id,
      reasoning: `Activated campaign "${params.name}" (type: ${params.campaign_type}, budget: ${inr(budget)}) with pre-authorization ref ${preauth.authorization_ref}.`,
      authorization_ref: preauth.authorization_ref,
      gate_checks_passed: gateChecksPassed,
      status: 'success',
      payload: {
        campaign_id: campaign.id,
        merchant_id: params.merchant_id,
        budget_limit: budget,
        trigger_rule: params.trigger_rule,
        action_benefit: params.action_benefit,
      },
    });

    return {
      campaign,
      governance_result: preauth,
      authorization_ref: preauth.authorization_ref || '',
    };
  }

  /**
   * List all active campaigns for a merchant or globally.
   */
  public async listActiveCampaigns(merchantId?: string): Promise<MerchantCampaign[]> {
    const db = getDatabaseClient();
    const query = merchantId
      ? "SELECT * FROM merchant_campaigns WHERE merchant_id = $1 AND status = 'active' ORDER BY created_at DESC"
      : "SELECT * FROM merchant_campaigns WHERE status = 'active' ORDER BY created_at DESC";
    const params = merchantId ? [merchantId] : [];

    const res = await db.query(query, params);
    return res.rows.map((row) => ({
      id: row.id,
      merchant_id: row.merchant_id,
      name: row.name,
      description: row.description,
      campaign_type: row.campaign_type,
      trigger_rule: typeof row.trigger_rule === 'string' ? JSON.parse(row.trigger_rule) : row.trigger_rule,
      action_benefit: typeof row.action_benefit === 'string' ? JSON.parse(row.action_benefit) : row.action_benefit,
      budget_limit: parseFloat(row.budget_limit),
      budget_spent: parseFloat(row.budget_spent || '0'),
      status: row.status,
      governance_ref: row.governance_ref,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    }));
  }

  /**
   * Extract explainable audit trail for a specific campaign.
   */
  public async getCampaignAudit(campaignId: string): Promise<any[]> {
    const db = getDatabaseClient();
    const res = await db.query(
      "SELECT * FROM audit_logs WHERE entity_id = $1 OR (payload->>'campaign_id') = $1 ORDER BY created_at ASC",
      [campaignId]
    );

    return res.rows.map((row) => ({
      action_id: row.id,
      timestamp: new Date(row.created_at).toISOString(),
      actor: row.actor_type,
      actor_id: row.actor_id,
      action_type: row.action,
      amount: row.payload?.budget_limit || row.payload?.discount_applied || row.payload?.amount,
      target: row.entity_id,
      reasoning: row.reasoning,
      authorization_ref: row.authorization_ref,
      status: row.status,
      gate_checks_passed: typeof row.gate_checks_passed === 'string' ? JSON.parse(row.gate_checks_passed) : (row.gate_checks_passed || []),
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }));
  }

  /**
   * Record actual spend against a campaign's budget once its discount has been
   * applied to a real order. Nothing else increments `budget_spent`, so a
   * campaign can be evaluated repeatedly without double-counting — only a
   * completed checkout calls this.
   */
  public async recordCampaignSpend(campaignId: string, amount: number, orderId: string): Promise<void> {
    const db = getDatabaseClient();
    const res = await db.query(
      `UPDATE merchant_campaigns
       SET budget_spent = budget_spent + $1,
           status = CASE WHEN budget_spent + $1 >= budget_limit THEN 'budget_exhausted' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING name, budget_spent, budget_limit`,
      [amount, campaignId]
    );

    if (res.rows.length === 0) return;
    const row = res.rows[0];

    await this.auditRepo.record({
      entity_type: 'merchant_campaign',
      entity_id: campaignId,
      action: 'apply_campaign_discount',
      actor_type: 'ai_buyer_agent',
      reasoning: `Campaign "${row.name}" auto-applied a ${inr(amount)} discount on order ${orderId}. Budget spent: ${inr(parseFloat(row.budget_spent))} of ${inr(parseFloat(row.budget_limit))}.`,
      status: 'success',
      payload: {
        campaign_id: campaignId,
        order_id: orderId,
        discount_applied: amount,
      },
    });
  }

  /**
   * Evaluates cart contents against active campaigns to surface auto-applied incentives.
   */
  public async evaluateCartCampaigns(cartItems: any[], subtotal: number, merchantId?: string): Promise<{
    matched_campaigns: MerchantCampaign[];
    total_campaign_discount: number;
    benefits_summary: string[];
  }> {
    const activeCampaigns = await this.listActiveCampaigns(merchantId);
    const matched: MerchantCampaign[] = [];
    let totalDiscount = 0;
    const summaries: string[] = [];

    for (const cmp of activeCampaigns) {
      let isEligible = true;

      if (cmp.trigger_rule.min_cart_total && subtotal < cmp.trigger_rule.min_cart_total) {
        isEligible = false;
      }
      if (cmp.trigger_rule.required_item_count && cartItems.length < cmp.trigger_rule.required_item_count) {
        isEligible = false;
      }

      if (isEligible) {
        matched.push(cmp);
        let discount = 0;
        if (cmp.action_benefit.benefit_type === 'percentage_discount' && cmp.action_benefit.discount_percentage) {
          discount = (subtotal * cmp.action_benefit.discount_percentage) / 100;
          if (cmp.action_benefit.max_discount_cap && discount > cmp.action_benefit.max_discount_cap) {
            discount = cmp.action_benefit.max_discount_cap;
          }
        } else if (cmp.action_benefit.benefit_type === 'fixed_discount' && cmp.action_benefit.discount_amount) {
          discount = cmp.action_benefit.discount_amount;
        } else if (cmp.action_benefit.benefit_type === 'free_shipping') {
          summaries.push(`🚚 Free Express Shipping unlocked by "${cmp.name}"`);
        }

        if (discount > 0) {
          totalDiscount += discount;
          summaries.push(`🎁 ${inr(Math.round(discount))} discount applied via campaign "${cmp.name}"`);
        }
      }
    }

    // The same ceiling that bounds a single campaign also bounds the combined
    // stack, so several small campaigns can't add up to an unreviewed markdown.
    const ceiling = config.governance.maxDiscountPercentage;
    const maxPermittedDiscount = (subtotal * ceiling) / 100;
    if (totalDiscount > maxPermittedDiscount) {
      totalDiscount = maxPermittedDiscount;
      summaries.push(
        `🛡️ Combined campaign discount capped at the ${ceiling}% safety ceiling (${inr(Math.round(maxPermittedDiscount))})`
      );
    }

    return {
      matched_campaigns: matched,
      total_campaign_discount: totalDiscount,
      benefits_summary: summaries,
    };
  }
}
