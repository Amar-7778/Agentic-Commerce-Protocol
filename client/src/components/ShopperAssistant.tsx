import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot,
  Send,
  ShieldCheck,
  RotateCcw,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { ChatMessage, UniversalItem, PublicConfig } from '../types.js';
import {
  sendAgentMessage,
  executeA2ACheckout,
  approveStepUp,
  rejectStepUp,
  executePaymentVerification,
  fetchRecentAuditLogs,
} from '../services/api.js';
import { MessageBubble } from './MessageBubble.js';
import { RecommendationCarousel } from './RecommendationCarousel.js';
import { StepUpApprovalCard } from './StepUpApprovalCard.js';
import { OrderSettlementCard } from './OrderSettlementCard.js';
import { PaymentConfirmationCard } from './PaymentConfirmationCard.js';
import { AuditSidebar } from './AuditSidebar.js';

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome_msg',
  sender: 'agent',
  text: 'Hello. I can search the connected platforms and settle an order for you. What are you looking for?',
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

interface ShopperAssistantProps {
  config: PublicConfig | null;
}

export const ShopperAssistant: React.FC<ShopperAssistantProps> = ({ config }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [currentToolStatus, setCurrentToolStatus] = useState<string | null>(null);
  const [conversationId] = useState<string>(() => `conv_chat_${Date.now()}`);
  const [processingPaymentOrderId, setProcessingPaymentOrderId] = useState<string | null>(null);

  const [showAuditSidebar, setShowAuditSidebar] = useState<boolean>(true);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadAuditLogs = useCallback(async () => {
    try {
      setLoadingAudit(true);
      const res = await fetchRecentAuditLogs(25);
      setAuditLogs(res || []);
    } catch (e) {
      console.warn('Failed to load audit logs:', e);
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentToolStatus]);

  const handleSendPrompt = async (promptToSend?: string) => {
    const prompt = (promptToSend || inputPrompt).trim();
    if (!prompt || loading) return;

    const userMessage: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputPrompt('');
    setLoading(true);
    setCurrentToolStatus('Thinking...');

    try {
      const raw = await sendAgentMessage(prompt, conversationId);
      const res = raw?.data !== undefined ? raw.data : raw;
      setCurrentToolStatus(null);

      const agentMessage: ChatMessage = {
        id: `agent_${Date.now()}`,
        sender: 'agent',
        text: res.natural_language_response || 'Here are the top matches:',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        items: res.catalog_items || [],
        upsellBundle: res.proactive_upsell_bundle || [],
        a2aTrace: res.a2a_trace || [],
        containerTitle: res.container_title || undefined,
        containerSubtitle: res.container_subtitle || undefined,
      };

      // A deterministic checkout confirmation ("yes buy it", "checkout", ...)
      // resolves inline via this same endpoint rather than a separate button
      // click — render whichever card the settlement status calls for.
      if (res.order_settlement) {
        const settlement = res.order_settlement;
        if (settlement.status === 'needs_human_confirmation') {
          agentMessage.stepUpRequired = {
            orderId: settlement.order?.id,
            amount: settlement.order?.total_amount,
            reason: settlement.governance_preauth?.reason || 'High-value transaction threshold',
            reasonCode: settlement.governance_preauth?.reason_code || 'HIGH_VALUE_HUMAN_STEP_UP',
          };
        } else if (settlement.status === 'authorized' || settlement.status === 'paid') {
          agentMessage.orderSettlement = settlement;
        }
        // 'denied' falls through — the natural-language text already explains it.
      }

      setMessages((prev) => [...prev, agentMessage]);
      loadAuditLogs();
    } catch (err: any) {
      setCurrentToolStatus(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'system',
          text: `${err.message || 'Error processing request'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleInstantCheckout = async (item: UniversalItem) => {
    setLoading(true);
    setCurrentToolStatus(`Authorizing order for "${item.title}"...`);

    const checkoutItems = [{ item_id: item.id, quantity: 1 }];

    try {
      const raw = await executeA2ACheckout({
        items: checkoutItems,
        platform_id: item.platform_id,
        conversation_id: conversationId,
      });
      const res = raw?.data !== undefined ? raw.data : raw;
      const settlement = res.settlement || res;
      setCurrentToolStatus(null);

      if (settlement?.status === 'needs_human_confirmation') {
        const stepUpMsg: ChatMessage = {
          id: `stepup_${Date.now()}`,
          sender: 'agent',
          text: `Policy governance step-up required for a transaction of ₹${settlement.order?.total_amount?.toLocaleString()}. Supervisor authorization needed.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          stepUpRequired: {
            orderId: settlement.order?.id,
            amount: settlement.order?.total_amount,
            reason: settlement.governance_preauth?.reason || 'High-value transaction threshold',
            reasonCode: settlement.governance_preauth?.reason_code || 'HIGH_VALUE_HUMAN_STEP_UP',
          },
        };
        setMessages((prev) => [...prev, stepUpMsg]);
      } else if (settlement?.status === 'denied') {
        const deniedMsg: ChatMessage = {
          id: `denied_${Date.now()}`,
          sender: 'system',
          text: settlement.governance_preauth?.reason || `Checkout denied for ${item.title}.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, deniedMsg]);
      } else {
        const successMsg: ChatMessage = {
          id: `settle_${Date.now()}`,
          sender: 'agent',
          text: `Order prepared for ${item.title} (₹${settlement?.order?.total_amount?.toLocaleString()})`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          orderSettlement: {
            ...settlement,
            platform_id: item.platform_id,
            item_title: item.title,
          },
        };
        setMessages((prev) => [...prev, successMsg]);
      }
      loadAuditLogs();
    } catch (err: any) {
      setCurrentToolStatus(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'system',
          text: `Checkout failed: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchRazorpayPayment = async (settlementObj: any) => {
    const orderId = settlementObj.order?.id || settlementObj.order_id;
    const totalAmount = settlementObj.order?.total_amount || settlementObj.total_amount || 0;
    const authRef = settlementObj.order?.authorization_ref || settlementObj.authorization_ref;
    const paymentUrl = settlementObj.payment_details?.payment_url || `https://rzp.io/l/pay_${orderId}`;
    const keyId = settlementObj.payment_details?.key_id || config?.razorpay_key_id;
    const merchantName = settlementObj.merchant_name || 'Merchant';

    setProcessingPaymentOrderId(orderId);

    if (typeof (window as any).Razorpay !== 'undefined' && keyId) {
      const options = {
        key: keyId,
        amount: Math.round(totalAmount * 100),
        currency: 'INR',
        name: 'Agentic Commerce Network',
        description: `Order Settlement ${orderId?.replace(/^ord_/, 'RZP-')}`,
        handler: async function (response: any) {
          setCurrentToolStatus('Verifying payment signature...');
          try {
            const payId = response.razorpay_payment_id || `pay_rzp_test_${Date.now().toString().slice(-6)}`;
            const verifyRes = await executePaymentVerification({
              order_id: orderId,
              method: 'card',
              payment_id: payId,
              authorization_ref: authRef,
            });
            const data = verifyRes.data || verifyRes;

            setProcessingPaymentOrderId(null);
            setCurrentToolStatus(null);

            const confirmationMessage: ChatMessage = {
              id: `pay_confirm_${Date.now()}`,
              sender: 'agent',
              text: '',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              paymentConfirmation: {
                paymentId: data.payment_id || payId,
                orderId: (data.order_id || orderId).replace(/^ord_/, 'RZP-'),
                amount: data.amount || totalAmount,
                subtotal: data.subtotal,
                tax: data.tax,
                method: data.method || 'Razorpay Verified Payment',
                status: 'CAPTURED & SETTLED (Razorpay Test Rails)',
                timestamp: data.timestamp || new Date().toLocaleString(),
                merchant: merchantName,
                authRef,
              },
            };

            setMessages((prev) => [
              ...prev.map((m) =>
                m.orderSettlement?.order?.id === orderId || m.orderSettlement?.order_id === orderId
                  ? { ...m, orderSettlement: undefined }
                  : m
              ),
              confirmationMessage,
            ]);
            loadAuditLogs();
          } catch (err: any) {
            setProcessingPaymentOrderId(null);
            setCurrentToolStatus(null);
            setMessages((prev) => [
              ...prev,
              {
                id: `err_verify_${Date.now()}`,
                sender: 'system',
                text: `Verification error: ${err.message || 'Signature verification failed'}`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ]);
          }
        },
        prefill: {
          name: 'Alex Buyer',
          email: 'alex.buyer@example.com',
          contact: '9876543210',
        },
        theme: { color: '#0284C7' },
        modal: {
          ondismiss: function () {
            setProcessingPaymentOrderId(null);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        setProcessingPaymentOrderId(null);
        const errReason = response?.error?.reason || response?.error?.code || 'PAYMENT_FAILED';
        const errDesc = response?.error?.description || response?.error?.source || 'Transaction declined on Razorpay gateway';
        setMessages((prev) => [
          ...prev,
          {
            id: `err_pay_${Date.now()}`,
            sender: 'system',
            text: `Payment failed: ${errReason} — ${errDesc}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      });
      rzp.open();
    } else {
      window.open(paymentUrl, '_blank');
      setProcessingPaymentOrderId(null);
    }
  };

  const handleApproveStepUp = async (orderId: string) => {
    setLoading(true);
    setCurrentToolStatus('Supervisor approving step-up authorization...');
    try {
      const res = await approveStepUp(orderId, 'Human supervisor confirmed and approved purchase.');
      setCurrentToolStatus(null);
      if (res.approved) {
        const totalAmt = res.preauth?.amount || 0;
        setMessages((prev) => [
          ...prev,
          {
            id: `stepup_appr_${Date.now()}`,
            sender: 'agent',
            text: `Step-up approved by supervisor. Authorization granted for ₹${totalAmt.toLocaleString()}.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            orderSettlement: {
              status: 'authorized',
              order: {
                id: orderId,
                order_number: orderId.replace(/^ord_/, 'RZP-'),
                total_amount: totalAmt,
                authorization_ref: res.authorization_ref,
              },
              payment_details: {
                payment_url: res.preauth?.payment_link || `https://rzp.io/l/test_${orderId}`,
                key_id: config?.razorpay_key_id,
              },
            },
          },
        ]);
      }
      loadAuditLogs();
    } catch (err: any) {
      setCurrentToolStatus(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_stepup_${Date.now()}`,
          sender: 'system',
          text: `Error approving step-up: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectStepUp = async (orderId: string) => {
    setLoading(true);
    try {
      const res = await rejectStepUp(orderId, 'Human supervisor denied step-up.');
      setMessages((prev) => [
        ...prev,
        {
          id: `stepup_den_${Date.now()}`,
          sender: 'system',
          text: `Step-up denied: ${res.message}. Transaction cancelled.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      loadAuditLogs();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      <header style={{
        background: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        zIndex: 50,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, #D96B43 0%, #0284C7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
          }}>
            <Bot size={20} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="font-display" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Shopper Assistant
              </span>
              <span className="badge badge-razorpay" style={{ fontSize: '0.68rem', padding: '1px 7px' }}>
                <ShieldCheck size={11} />
                <span>Razorpay {config?.razorpay_mode === 'live' ? 'Live' : 'Test'} Mode</span>
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowAuditSidebar((prev) => !prev)}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.75rem', padding: '6px 12px', borderColor: showAuditSidebar ? 'var(--accent-terracotta)' : 'var(--border-medium)' }}
            title="Toggle live audit ledger"
          >
            {showAuditSidebar ? <PanelRightClose size={13} color="var(--accent-terracotta)" /> : <PanelRightOpen size={13} />}
            <span>Audit Logs ({auditLogs.length})</span>
          </button>

          <button
            onClick={() => setMessages([WELCOME_MESSAGE])}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.75rem', padding: '6px 10px' }}
            title="Clear chat"
          >
            <RotateCcw size={13} />
            <span>Clear</span>
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
          <main style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            maxWidth: 820,
            width: '100%',
            margin: '0 auto',
          }}>
            {messages.map((msg) => (
              <React.Fragment key={msg.id}>
                <MessageBubble message={msg} />

                {msg.items && msg.items.length > 0 && (
                  <RecommendationCarousel
                    items={msg.items}
                    containerTitle={msg.containerTitle}
                    containerSubtitle={msg.containerSubtitle}
                    loading={loading}
                    onInstantCheckout={handleInstantCheckout}
                  />
                )}

                {msg.stepUpRequired && (
                  <StepUpApprovalCard
                    amount={msg.stepUpRequired.amount}
                    autonomousThreshold={config?.governance.autonomous_step_up_threshold || msg.stepUpRequired.amount}
                    loading={loading}
                    onApprove={() => handleApproveStepUp(msg.stepUpRequired!.orderId)}
                    onReject={() => handleRejectStepUp(msg.stepUpRequired!.orderId)}
                  />
                )}

                {msg.orderSettlement && (
                  <OrderSettlementCard
                    settlement={msg.orderSettlement}
                    loading={loading}
                    isProcessing={processingPaymentOrderId === (msg.orderSettlement.order?.id || msg.orderSettlement.order_id)}
                    onLaunchPayment={() => handleLaunchRazorpayPayment(msg.orderSettlement)}
                  />
                )}

                {msg.paymentConfirmation && (
                  <PaymentConfirmationCard confirmation={msg.paymentConfirmation} />
                )}
              </React.Fragment>
            ))}

            {currentToolStatus && (
              <div className="animate-fade-in" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: '999px',
                background: 'rgba(217, 107, 67, 0.15)',
                border: '1px solid var(--accent-terracotta)',
                color: 'var(--accent-terracotta)',
                fontSize: '0.75rem',
                fontWeight: 600,
                alignSelf: 'flex-start',
              }}>
                <RotateCcw size={13} style={{ animation: 'spin 1.2s linear infinite' }} />
                <span>{currentToolStatus}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </main>

          <footer style={{
            background: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(16px)',
            borderTop: '1px solid var(--border-subtle)',
            padding: '12px 20px',
            maxWidth: 820,
            width: '100%',
            margin: '0 auto',
          }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendPrompt();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-lg)',
                padding: '5px 8px 5px 14px',
              }}
            >
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder="Type your message or what you want to order..."
                disabled={loading}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                  fontFamily: 'var(--font-sans)',
                }}
              />
              <button
                type="submit"
                disabled={!inputPrompt.trim() || loading}
                className="btn btn-primary"
                style={{ padding: '6px 14px', borderRadius: 'var(--radius-md)' }}
              >
                <Send size={14} />
                <span>Send</span>
              </button>
            </form>
          </footer>
        </div>

        {showAuditSidebar && (
          <AuditSidebar
            logs={auditLogs}
            loading={loadingAudit}
            onRefresh={loadAuditLogs}
            onClose={() => setShowAuditSidebar(false)}
          />
        )}
      </div>
    </div>
  );
};
