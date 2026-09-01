import crypto from 'crypto';
import { config, canCallRazorpayLiveApi, isRazorpayTestMode } from '../config/index.js';

export interface RazorpayPaymentLinkResponse {
  id: string;
  short_url: string;
  status: 'created' | 'paid' | 'expired' | 'failed';
  amount: number;
  currency: string;
  description: string;
  customer: {
    email?: string;
    contact?: string;
  };
  expire_by: number;
  reference_id: string;
  /** Which rail produced this link, so callers never have to guess. */
  source: 'razorpay_live_api' | 'test_rail_simulator';
}

export interface RazorpayMandateResponse {
  id: string;
  type: 'upi_recurring';
  status: 'active' | 'pending' | 'failed';
  frequency: string;
  max_amount: number;
  currency: string;
  upi_vpa?: string;
  auth_link: string;
  source: 'razorpay_live_api' | 'test_rail_simulator';
}

/** Short random suffix for locally minted reference ids. */
function referenceSuffix(): string {
  return crypto.randomBytes(4).toString('hex');
}

export class RazorpayService {
  private static instance: RazorpayService;
  private readonly keyId: string | null;
  private readonly keySecret: string | null;

  private constructor() {
    this.keyId = config.razorpay.keyId;
    this.keySecret = config.razorpay.keySecret;
  }

  public static getInstance(): RazorpayService {
    if (!RazorpayService.instance) {
      RazorpayService.instance = new RazorpayService();
    }
    return RazorpayService.instance;
  }

  /**
   * Derived from the configured key prefix — not asserted. An absent key is
   * test mode because no live call is possible without one.
   */
  public isTestMode(): boolean {
    return isRazorpayTestMode();
  }

  /** True only when credentials exist AND live calls are explicitly enabled. */
  public canReachLiveApi(): boolean {
    return canCallRazorpayLiveApi();
  }

  public getPublishableKeyId(): string | null {
    return this.keyId;
  }

  /** Reports the active rail for display in the UI and audit ledger. */
  public getModeDescriptor(): {
    mode: 'test' | 'live';
    live_api_enabled: boolean;
    credentials_present: boolean;
  } {
    return {
      mode: this.isTestMode() ? 'test' : 'live',
      live_api_enabled: this.canReachLiveApi(),
      credentials_present: Boolean(this.keyId && this.keySecret),
    };
  }

  private simulatorLinkId(orderId: string): string {
    return `plink_sim_${orderId.replace(/^ord_/, '')}_${referenceSuffix()}`;
  }

  private expiryTimestamp(): number {
    const ttlSeconds = config.razorpay.paymentLinkTtlHours * 3600;
    return Math.floor(Date.now() / 1000) + ttlSeconds;
  }

  /**
   * Create a Razorpay payment link.
   *
   * Calls the live API only when credentials are present AND
   * RAZORPAY_LIVE_API_ENABLED is true. Otherwise returns a deterministic
   * simulated link, clearly marked via `source`.
   */
  public async createPaymentLink(params: {
    order_id: string;
    amount: number;
    currency?: string;
    description: string;
    customer_email?: string;
    customer_name?: string;
    simulate_failure?: 'payment_declined' | 'bank_timeout' | 'insufficient_funds';
  }): Promise<RazorpayPaymentLinkResponse> {
    const currency = params.currency || config.commerce.defaultCurrency;
    const expireBy = this.expiryTimestamp();

    if (this.canReachLiveApi() && !params.simulate_failure) {
      try {
        const authHeader = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
        const response = await fetch(`${config.razorpay.apiBaseUrl}/payment_links`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${authHeader}`,
          },
          body: JSON.stringify({
            amount: Math.round(params.amount * 100), // Razorpay expects paise
            currency,
            description: params.description,
            reference_id: params.order_id,
            expire_by: expireBy,
            ...(params.customer_email
              ? { customer: { email: params.customer_email, name: params.customer_name } }
              : {}),
          }),
        });

        if (response.ok) {
          const data: any = await response.json();
          return {
            id: data.id,
            short_url: data.short_url,
            status: data.status,
            amount: data.amount / 100,
            currency: data.currency,
            description: data.description,
            customer: data.customer || {},
            expire_by: data.expire_by,
            reference_id: data.reference_id,
            source: 'razorpay_live_api',
          };
        }

        const errorBody = await response.text();
        console.warn(
          `[Razorpay] Live payment_links call returned ${response.status}; using test rail. ${errorBody.slice(0, 200)}`
        );
      } catch (err) {
        console.warn('[Razorpay] Live payment_links call failed; using test rail:', err);
      }
    }

    return {
      id: this.simulatorLinkId(params.order_id),
      short_url: `${config.razorpay.apiBaseUrl.replace(/\/v\d+$/, '')}/payment_links/sim_${params.order_id.replace(/^ord_/, '')}`,
      status: params.simulate_failure ? 'failed' : 'created',
      amount: params.amount,
      currency,
      description: params.description,
      customer: params.customer_email ? { email: params.customer_email } : {},
      expire_by: expireBy,
      reference_id: params.order_id,
      source: 'test_rail_simulator',
    };
  }

  /**
   * Create a UPI recurring mandate.
   *
   * The live Razorpay subscription/mandate flow requires a pre-registered plan,
   * so this always uses the deterministic rail and says so via `source`.
   */
  public async createUpiMandate(params: {
    order_id: string;
    frequency: 'as_presented' | 'weekly' | 'monthly';
    max_amount: number;
    currency?: string;
    upi_vpa?: string;
    terms?: string;
  }): Promise<RazorpayMandateResponse> {
    const mandateId = `mandate_sim_${params.order_id.replace(/^ord_/, '')}_${referenceSuffix()}`;
    return {
      id: mandateId,
      type: 'upi_recurring',
      status: 'active',
      frequency: params.frequency,
      max_amount: params.max_amount,
      currency: params.currency || config.commerce.defaultCurrency,
      upi_vpa: params.upi_vpa,
      auth_link: `${config.razorpay.apiBaseUrl.replace(/\/v\d+$/, '')}/mandates/sim_${mandateId}`,
      source: 'test_rail_simulator',
    };
  }

  /**
   * Verify a Razorpay payment signature.
   *
   * With a key secret and a signature this is a genuine HMAC check. Without a
   * signature it cannot verify anything, so it reports `verified: false` with a
   * reason rather than claiming success.
   */
  public verifyPaymentSignature(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    signature?: string
  ): { verified: boolean; payment_id: string; method: string; reason?: string } {
    if (!razorpayPaymentId) {
      return {
        verified: false,
        payment_id: '',
        method: 'none',
        reason: 'No payment id supplied.',
      };
    }

    if (this.keySecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      const expected = Buffer.from(expectedSignature, 'utf8');
      const provided = Buffer.from(signature, 'utf8');
      const verified =
        expected.length === provided.length && crypto.timingSafeEqual(expected, provided);

      return {
        verified,
        payment_id: razorpayPaymentId,
        method: 'hmac_sha256',
        reason: verified ? undefined : 'Signature did not match the computed HMAC.',
      };
    }

    return {
      verified: false,
      payment_id: razorpayPaymentId,
      method: 'unverified',
      reason: signature
        ? 'RAZORPAY_KEY_SECRET is not configured, so the signature cannot be checked.'
        : 'No signature supplied — payment recorded but cryptographically unverified.',
    };
  }

  /** Mint a payment id for a simulated capture. Marked so it is never mistaken for a real one. */
  public generateSimulatedPaymentId(): string {
    return `pay_sim_${referenceSuffix()}${referenceSuffix()}`;
  }

  public async processRefund(params: {
    payment_id: string;
    amount: number;
    reason: string;
  }): Promise<{ refund_id: string; status: 'processed'; amount: number; source: string }> {
    return {
      refund_id: `rfnd_sim_${referenceSuffix()}`,
      status: 'processed',
      amount: params.amount,
      source: 'test_rail_simulator',
    };
  }
}
