import { A2AMessage, SettlementRequestPayload, SettlementResponsePayload } from '../a2a/types.js';
import { A2ARouter } from '../a2a/A2ARouter.js';
import { executeMcpTool } from '../mcp/tools.js';
import { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';
import { config } from '../config/index.js';

/** Formats a money amount using the configured currency. */
function money(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: config.commerce.defaultCurrency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export class PaymentAgent {
  private static instance: PaymentAgent;
  private router: A2ARouter;
  private auditRepo: AuditLogRepository;

  private constructor() {
    this.router = A2ARouter.getInstance();
    this.auditRepo = AuditLogRepository.getInstance();
  }

  public static getInstance(): PaymentAgent {
    if (!PaymentAgent.instance) {
      PaymentAgent.instance = new PaymentAgent();
    }
    return PaymentAgent.instance;
  }

  /**
   * Handle incoming A2A settlement request from a Platform Agent.
   * Centralizes policy pre-authorization, spending limits, and Razorpay test rails.
   */
  public async handleSettlementRequest(
    requestMessage: A2AMessage<SettlementRequestPayload>
  ): Promise<A2AMessage<SettlementResponsePayload>> {
    const { payload, conversation_id } = requestMessage;

    // 1. Step 1: Pre-Authorization through Governance Gate
    const preauth = await executeMcpTool('request_preauthorization', {
      action: payload.payment_method_preference === 'upi_mandate' ? 'upi_mandate' : 'payment_link',
      amount: payload.total_amount,
      reason: payload.reason || `A2A Settlement delegation for order ${payload.order_id}`,
      user_id: payload.user_id,
      order_id: payload.order_id,
      merchant_id: payload.merchant_id,
    });

    let status: SettlementResponsePayload['status'] = preauth.status;
    let paymentUrl: string | undefined = undefined;
    let mandateLink: string | undefined = undefined;
    let naturalMessage = preauth.message;

    // 2. Step 2: If Approved, issue Razorpay Test-Mode Payment Link or Mandate
    if (preauth.approved && preauth.authorization_ref) {
      if (payload.payment_method_preference === 'upi_mandate') {
        const mandateRes = await executeMcpTool('create_upi_mandate', {
          order_id: payload.order_id,
          frequency: 'as_presented',
          max_amount: payload.total_amount,
          authorization_ref: preauth.authorization_ref,
        });
        status = 'authorized';
        mandateLink = mandateRes.auth_link;
        naturalMessage = `Payment authorization granted. UPI AutoPay mandate link generated for ${money(payload.total_amount)}.`;
      } else {
        const linkRes = await executeMcpTool('create_payment_link', {
          order_id: payload.order_id,
          authorization_ref: preauth.authorization_ref,
        });
        status = 'authorized';
        paymentUrl = linkRes.payment_url;
        naturalMessage = `Payment authorization granted. Verifiable Razorpay test-mode payment link created for ${money(payload.total_amount)}.`;
      }
    } else if (preauth.status === 'needs_human_confirmation') {
      // The gate reports the threshold it applied; never restate it as a literal.
      const appliedLimit =
        typeof preauth.max_permitted_amount === 'number'
          ? preauth.max_permitted_amount
          : config.governance.autonomousStepUpThreshold;
      naturalMessage =
        `Payment requires human supervisor step-up approval: the total ${money(payload.total_amount)} ` +
        `exceeds the autonomous agent limit of ${money(appliedLimit)}.`;
    } else {
      naturalMessage = `Payment settlement denied by policy gateway: ${preauth.message}`;
    }

    const responsePayload: SettlementResponsePayload = {
      order_id: payload.order_id,
      order_number: payload.order_id.replace(/^ord_/, 'RZP-'),
      status,
      authorization_ref: preauth.authorization_ref,
      payment_url: paymentUrl,
      mandate_link: mandateLink,
      total_amount: payload.total_amount,
      reason_code: preauth.reason_code,
      natural_language_message: naturalMessage,
      gate_checks_passed: preauth.gate_checks_passed || [],
    };

    const responseMessage: A2AMessage<SettlementResponsePayload> = {
      id: `a2a_msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      protocol: 'A2A-1.0',
      from_agent: 'payment_agent',
      to_agent: requestMessage.from_agent,
      message_type: 'settlement_response',
      conversation_id,
      payload: responsePayload,
      timestamp: new Date().toISOString(),
    };

    await this.router.dispatch(responseMessage);
    return responseMessage;
  }
}
