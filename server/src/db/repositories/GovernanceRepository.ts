import { getDatabaseClient } from '../connection.js';
import crypto from 'crypto';
import { config } from '../../config/index.js';

/** Formats an INR amount the way every governance message renders it. */
const inr = (amount: number): string => `₹${amount.toLocaleString('en-IN')}`;

const MINUTE_MS = 60 * 1000;

export interface PreauthorizationResult {
  approved: boolean;
  status: 'approved' | 'denied' | 'needs_human_confirmation';
  authorization_ref?: string;
  reason_code: string;
  message: string;
  max_permitted_amount: number;
  gate_checks_passed: string[];
  expires_at?: string;
}

export class GovernanceRepository {
  private static instance: GovernanceRepository;

  public static getInstance(): GovernanceRepository {
    if (!GovernanceRepository.instance) {
      GovernanceRepository.instance = new GovernanceRepository();
    }
    return GovernanceRepository.instance;
  }

  /**
   * Check spending limit and velocity across windows (per_transaction, hourly, daily, monthly).
   */
  public async checkSpendingLimit(
    subjectId: string,
    amount: number,
    window?: 'per_transaction' | 'hourly' | 'daily' | 'monthly'
  ): Promise<{
    permitted: boolean;
    reason_code: string;
    message: string;
    matched_rule?: any;
    current_spent: number;
    max_limit: number;
  }> {
    const db = getDatabaseClient();
    let query = 'SELECT * FROM spending_limits WHERE subject_id = $1';
    const params: any[] = [subjectId];

    if (window) {
      params.push(window);
      query += ` AND window_type = $${params.length}`;
    }

    const res = await db.query(query, params);
    if (res.rows.length === 0) {
      // No explicit rule for this subject — fall back to the configured cap.
      const defaultCap = config.governance.defaultSpendCap;
      const withinCap = amount <= defaultCap;
      return {
        permitted: withinCap,
        reason_code: withinCap ? 'WITHIN_DEFAULT_CAP' : 'EXCEEDS_DEFAULT_CAP',
        message: withinCap
          ? `Approved under the default autonomous limit of ${inr(defaultCap)}.`
          : `Transaction exceeds the default limit of ${inr(defaultCap)}.`,
        current_spent: 0,
        max_limit: defaultCap,
      };
    }

    for (const rule of res.rows) {
      const maxLimit = parseFloat(rule.max_limit);
      const currentSpent = parseFloat(rule.current_spent || '0');

      if (rule.window_type === 'per_transaction') {
        if (amount > maxLimit) {
          return {
            permitted: false,
            reason_code: 'EXCEEDS_PER_TRANSACTION_LIMIT',
            message: `Amount ${inr(amount)} exceeds per-transaction cap of ${inr(maxLimit)}.`,
            matched_rule: rule,
            current_spent: currentSpent,
            max_limit: maxLimit,
          };
        }
      } else {
        if (currentSpent + amount > maxLimit) {
          return {
            permitted: false,
            reason_code: `EXCEEDS_${rule.window_type.toUpperCase()}_LIMIT`,
            message:
              `Amount ${inr(amount)} plus current spend ${inr(currentSpent)} exceeds the ` +
              `${rule.window_type} limit of ${inr(maxLimit)}.`,
            matched_rule: rule,
            current_spent: currentSpent,
            max_limit: maxLimit,
          };
        }
      }
    }

    return {
      permitted: true,
      reason_code: 'WITHIN_ALL_LIMITS',
      message: 'Spending limits and velocity checks satisfied.',
      current_spent: parseFloat(res.rows[0].current_spent || '0'),
      max_limit: parseFloat(res.rows[0].max_limit),
    };
  }

  /**
   * Request pre-authorization for a money-moving action.
   * Structurally gates payments, offers, and mandates.
   */
  public async requestPreauthorization(params: {
    action: 'payment_link' | 'upi_mandate' | 'apply_offer' | 'refund' | 'verify_payment';
    amount: number;
    reason: string;
    user_id: string;
    order_id?: string;
    merchant_id?: string;
  }): Promise<PreauthorizationResult> {
    const db = getDatabaseClient();
    const gateChecksPassed: string[] = [];

    // Gate Check 1: Non-negative and valid amount
    if (params.amount < 0 || isNaN(params.amount)) {
      return {
        approved: false,
        status: 'denied',
        reason_code: 'INVALID_AMOUNT',
        message: 'Pre-authorization denied: invalid or negative amount requested.',
        max_permitted_amount: 0,
        gate_checks_passed: [],
      };
    }
    gateChecksPassed.push('AMOUNT_BOUNDS_VALID');

    // Gate Check 2: Reason justification required
    if (!params.reason || params.reason.trim().length < 5) {
      return {
        approved: false,
        status: 'denied',
        reason_code: 'INSUFFICIENT_REASONING',
        message: 'Pre-authorization denied: Natural language justification explanation required.',
        max_permitted_amount: 0,
        gate_checks_passed: gateChecksPassed,
      };
    }
    gateChecksPassed.push('REASONING_JUSTIFICATION_PRESENT');

    // Gate Check 3: Spending limit enforcement (Hard budget caps)
    const limitCheck = await this.checkSpendingLimit(params.user_id, params.amount);
    if (!limitCheck.permitted) {
      return {
        approved: false,
        status: 'denied',
        reason_code: limitCheck.reason_code,
        message: limitCheck.message,
        max_permitted_amount: limitCheck.max_limit,
        gate_checks_passed: gateChecksPassed,
      };
    }
    gateChecksPassed.push('SPENDING_LIMITS_SATISFIED');

    // Gate Check 4: Autonomous threshold step-up — above the configured
    // threshold a human buyer must confirm before any funds move.
    const stepUpThreshold = config.governance.autonomousStepUpThreshold;
    if (params.amount > stepUpThreshold && params.action !== 'refund' && params.action !== 'apply_offer') {
      const preauthId = `preauth_stepup_${Date.now()}`;
      const expiresAt = new Date(
        Date.now() + config.governance.stepUpPendingTtlMinutes * MINUTE_MS
      ).toISOString();

      await db.query(
        `INSERT INTO preauthorizations (
          id, action, amount, currency, user_id, merchant_id, order_id, status,
          reason, reason_code, gate_checks_passed, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'needs_human_confirmation', $8, 'HIGH_VALUE_HUMAN_STEP_UP', $9, $10)`,
        [
          preauthId,
          params.action,
          params.amount,
          config.commerce.defaultCurrency,
          params.user_id,
          params.merchant_id || null,
          params.order_id || null,
          params.reason,
          JSON.stringify(gateChecksPassed),
          expiresAt,
        ]
      );

      return {
        approved: false,
        status: 'needs_human_confirmation',
        reason_code: 'HIGH_VALUE_HUMAN_STEP_UP',
        message:
          `Amount ${inr(params.amount)} exceeds the autonomous agent threshold of ` +
          `${inr(stepUpThreshold)}. Human buyer confirmation required.`,
        max_permitted_amount: stepUpThreshold,
        gate_checks_passed: gateChecksPassed,
      };
    }
    gateChecksPassed.push('AUTONOMOUS_THRESHOLD_APPROVED');

    // Gate Check 5: Issue cryptographic authorization reference
    const preauthId = `preauth_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const randomSalt = crypto.randomBytes(8).toString('hex');
    const authorizationRef = `auth_ref_${params.action}_${Date.now()}_${randomSalt}`;
    const tokenTtlMinutes = config.governance.authorizationTokenTtlMinutes;
    const expiresAt = new Date(Date.now() + tokenTtlMinutes * MINUTE_MS).toISOString();

    await db.query(
      `INSERT INTO preauthorizations (
        id, action, amount, currency, user_id, merchant_id, order_id, status,
        reason, reason_code, gate_checks_passed, authorization_ref, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, 'PREAUTH_APPROVED', $9, $10, $11)`,
      [
        preauthId,
        params.action,
        params.amount,
        config.commerce.defaultCurrency,
        params.user_id,
        params.merchant_id || null,
        params.order_id || null,
        params.reason,
        JSON.stringify(gateChecksPassed),
        authorizationRef,
        expiresAt,
      ]
    );

    return {
      approved: true,
      status: 'approved',
      authorization_ref: authorizationRef,
      reason_code: 'PREAUTH_APPROVED',
      message:
        `Pre-authorization granted for ${params.action} up to ${inr(params.amount)}. ` +
        `Valid for ${tokenTtlMinutes} minutes.`,
      max_permitted_amount: params.amount,
      gate_checks_passed: gateChecksPassed,
      expires_at: expiresAt,
    };
  }

  /**
   * Structurally validates authorization reference before executing money-moving tools.
   * If valid, atomically marks the authorization reference as spent.
   */
  public async validateAndSpendAuthorization(
    authRef: string,
    action: string,
    expectedAmount: number
  ): Promise<{ valid: boolean; reason?: string; preauth?: any }> {
    const db = getDatabaseClient();
    if (!authRef || authRef.trim() === '') {
      return {
        valid: false,
        reason: 'GOVERNANCE_BLOCKED: Missing required authorization_ref. Call request_preauthorization() before moving funds.',
      };
    }

    const res = await db.query('SELECT * FROM preauthorizations WHERE authorization_ref = $1 LIMIT 1', [authRef]);
    if (res.rows.length === 0) {
      return {
        valid: false,
        reason: `GOVERNANCE_BLOCKED: Authorization reference "${authRef}" does not exist.`,
      };
    }

    const preauth = res.rows[0];
    if (preauth.status !== 'approved') {
      return {
        valid: false,
        reason: `GOVERNANCE_BLOCKED: Authorization ref is in status "${preauth.status}" (reason: ${preauth.reason_code}).`,
      };
    }

    if (preauth.spent) {
      return {
        valid: false,
        reason: `GOVERNANCE_BLOCKED: Authorization ref "${authRef}" has already been spent at ${preauth.spent_at}. Single-use token.`,
      };
    }

    if (new Date(preauth.expires_at).getTime() < Date.now()) {
      return {
        valid: false,
        reason: `GOVERNANCE_BLOCKED: Authorization ref "${authRef}" expired at ${preauth.expires_at}.`,
      };
    }

    const isActionMatch =
      preauth.action === action ||
      action === 'any' ||
      (action === 'verify_payment' && (preauth.action === 'verify_payment' || preauth.action === 'payment_link'));

    if (!isActionMatch) {
      return {
        valid: false,
        reason: `GOVERNANCE_BLOCKED: Authorization ref is for action "${preauth.action}", not requested action "${action}".`,
      };
    }

    const tolerance = 1 + config.governance.amountTolerance;
    if (expectedAmount > 0 && expectedAmount > parseFloat(preauth.amount) * tolerance) {
      return {
        valid: false,
        reason:
          `GOVERNANCE_BLOCKED: Requested amount ${inr(expectedAmount)} exceeds the authorized ` +
          `amount ${inr(parseFloat(preauth.amount))} beyond the permitted ` +
          `${(config.governance.amountTolerance * 100).toFixed(0)}% tolerance.`,
      };
    }

    // Atomically mark spent
    await db.query('UPDATE preauthorizations SET spent = TRUE, spent_at = CURRENT_TIMESTAMP WHERE id = $1', [preauth.id]);

    // Update user spending limits
    if (expectedAmount > 0) {
      await db.query(
        "UPDATE spending_limits SET current_spent = current_spent + $1, updated_at = CURRENT_TIMESTAMP WHERE subject_id = $2 AND window_type != 'per_transaction'",
        [expectedAmount, preauth.user_id]
      );
    }

    return {
      valid: true,
      preauth,
    };
  }

  public async getOfferByCode(code: string, merchantId?: string): Promise<any | null> {
    const db = getDatabaseClient();
    const query = merchantId
      ? 'SELECT * FROM offers WHERE LOWER(code) = LOWER($1) AND merchant_id = $2 AND is_active = TRUE LIMIT 1'
      : 'SELECT * FROM offers WHERE LOWER(code) = LOWER($1) AND is_active = TRUE LIMIT 1';
    const params = merchantId ? [code, merchantId] : [code];

    const res = await db.query(query, params);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      code: r.code,
      merchant_id: r.merchant_id,
      title: r.title,
      description: r.description,
      discount_type: r.discount_type,
      discount_value: parseFloat(r.discount_value),
      min_order_amount: parseFloat(r.min_order_amount || '0'),
      max_discount_amount: r.max_discount_amount ? parseFloat(r.max_discount_amount) : undefined,
      is_active: r.is_active,
      terms: r.terms,
    };
  }

  public async recordRefund(data: {
    payment_id: string;
    order_id: string;
    amount: number;
    reason: string;
    authorization_ref: string;
    razorpay_refund_id?: string;
  }): Promise<any> {
    const db = getDatabaseClient();
    const id = `rfnd_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    await db.query(
      `INSERT INTO refunds (id, payment_id, order_id, amount, currency, reason, status, razorpay_refund_id, authorization_ref)
       VALUES ($1, $2, $3, $4, $5, $6, 'processed', $7, $8)`,
      [
        id,
        data.payment_id,
        data.order_id,
        data.amount,
        config.commerce.defaultCurrency,
        data.reason,
        data.razorpay_refund_id || null,
        data.authorization_ref,
      ]
    );

    await db.query("UPDATE orders SET status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [data.order_id]);

    return {
      refund_id: id,
      payment_id: data.payment_id,
      amount: data.amount,
      status: 'processed',
    };
  }

  public async getAuditTrail(orderId: string): Promise<any[]> {
    const db = getDatabaseClient();
    const res = await db.query(
      'SELECT * FROM audit_logs WHERE entity_id = $1 OR (payload->>\'order_id\') = $1 ORDER BY created_at ASC',
      [orderId]
    );

    return res.rows.map((row) => ({
      action_id: row.id,
      timestamp: new Date(row.created_at).toISOString(),
      actor: row.actor_type,
      actor_id: row.actor_id,
      action_type: row.action,
      amount: row.payload?.amount,
      target: row.entity_id,
      reasoning: row.reasoning,
      authorization_ref: row.authorization_ref,
      status: row.status,
      gate_checks_passed: typeof row.gate_checks_passed === 'string' ? JSON.parse(row.gate_checks_passed) : (row.gate_checks_passed || []),
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }));
  }

  /**
   * Human supervisor approval for a high-value step-up.
   *
   * Approves amounts above the autonomous threshold but at or below the hard
   * per-transaction ceiling. Hard policy denials above that ceiling can never
   * be overridden — see `config.governance`.
   */
  public async approveHumanStepUp(identifier: string, supervisorReason: string = 'Human buyer approved high-value purchase'): Promise<{
    approved: boolean;
    authorization_ref?: string;
    status: string;
    message: string;
    preauth?: any;
  }> {
    const db = getDatabaseClient();
    const res = await db.query(
      "SELECT * FROM preauthorizations WHERE (id = $1 OR order_id = $1) ORDER BY created_at DESC LIMIT 1",
      [identifier]
    );

    if (res.rows.length === 0) {
      return {
        approved: false,
        status: 'denied',
        message: 'GOVERNANCE_BLOCKED: No pre-authorization record found for the specified order/transaction.',
      };
    }

    const preauth = res.rows[0];

    // Check 1: Record MUST specifically be in 'needs_human_confirmation' status
    if (preauth.status !== 'needs_human_confirmation') {
      return {
        approved: false,
        status: 'denied',
        message: `GOVERNANCE_BLOCKED: Cannot approve transaction with pre-authorization status "${preauth.status}" (reason: ${preauth.reason_code}). Hard policy denials cannot be overridden.`,
        preauth,
      };
    }

    // Check 2: A supervisor cannot override the system's hard per-transaction ceiling.
    const hardCeiling = config.governance.hardPerTransactionCeiling;
    const requestedAmount = parseFloat(preauth.amount);
    if (requestedAmount > hardCeiling) {
      return {
        approved: false,
        status: 'denied',
        message:
          `GOVERNANCE_BLOCKED: Amount ${inr(requestedAmount)} exceeds the hard per-transaction ` +
          `ceiling of ${inr(hardCeiling)}. Supervisor override cannot exceed system hard bounds.`,
        preauth,
      };
    }

    // Check 3: Proceed with legitimate step-up approval
    const randomSalt = crypto.randomBytes(8).toString('hex');
    const authorizationRef = `auth_ref_${preauth.action}_human_approved_${Date.now()}_${randomSalt}`;
    const expiresAt = new Date(
      Date.now() + config.governance.authorizationTokenTtlMinutes * MINUTE_MS
    ).toISOString();

    const existingChecks = typeof preauth.gate_checks_passed === 'string'
      ? JSON.parse(preauth.gate_checks_passed)
      : (preauth.gate_checks_passed || []);
    const updatedChecks = [...existingChecks, 'HUMAN_SUPERVISOR_OVERRIDE_APPROVED'];

    await db.query(
      `UPDATE preauthorizations
       SET status = 'approved',
           authorization_ref = $1,
           reason = reason || ' [SUPERVISOR OVERRIDE APPROVED: ' || $2 || ']',
           reason_code = 'HUMAN_SUPERVISOR_CONFIRMED',
           gate_checks_passed = $3,
           expires_at = $4
       WHERE id = $5`,
      [authorizationRef, supervisorReason, JSON.stringify(updatedChecks), expiresAt, preauth.id]
    );

    return {
      approved: true,
      authorization_ref: authorizationRef,
      status: 'approved',
      message: `High-value step-up (${inr(requestedAmount)}) approved by human supervisor. Authorization token issued.`,
      preauth: {
        ...preauth,
        authorization_ref: authorizationRef,
        status: 'approved',
      },
    };
  }

  /**
   * Human Supervisor Denial Action
   */
  public async rejectHumanStepUp(identifier: string, supervisorReason: string = 'Supervisor rejected high-value purchase'): Promise<{
    approved: boolean;
    status: string;
    message: string;
  }> {
    const db = getDatabaseClient();
    await db.query(
      `UPDATE preauthorizations
       SET status = 'denied',
           reason = reason || ' [SUPERVISOR REJECTED: ' || $1 || ']',
           reason_code = 'HUMAN_SUPERVISOR_REJECTED'
       WHERE (id = $2 OR order_id = $2) AND status = 'needs_human_confirmation'`,
      [supervisorReason, identifier]
    );

    return {
      approved: false,
      status: 'denied',
      message: `Transaction denied by human supervisor. Funds hold released.`,
    };
  }

  /**
   * The active policy, in one place, so agents and the UI can quote real
   * numbers instead of repeating literals that drift out of sync.
   */
  public getPolicySnapshot(): {
    autonomous_step_up_threshold: number;
    hard_per_transaction_ceiling: number;
    default_spend_cap: number;
    max_discount_percentage: number;
    authorization_token_ttl_minutes: number;
    step_up_pending_ttl_minutes: number;
    amount_tolerance_percent: number;
    currency: string;
    labels: {
      autonomous_step_up_threshold: string;
      hard_per_transaction_ceiling: string;
      default_spend_cap: string;
    };
  } {
    const g = config.governance;
    return {
      autonomous_step_up_threshold: g.autonomousStepUpThreshold,
      hard_per_transaction_ceiling: g.hardPerTransactionCeiling,
      default_spend_cap: g.defaultSpendCap,
      max_discount_percentage: g.maxDiscountPercentage,
      authorization_token_ttl_minutes: g.authorizationTokenTtlMinutes,
      step_up_pending_ttl_minutes: g.stepUpPendingTtlMinutes,
      amount_tolerance_percent: g.amountTolerance * 100,
      currency: config.commerce.defaultCurrency,
      labels: {
        autonomous_step_up_threshold: inr(g.autonomousStepUpThreshold),
        hard_per_transaction_ceiling: inr(g.hardPerTransactionCeiling),
        default_spend_cap: inr(g.defaultSpendCap),
      },
    };
  }
}
