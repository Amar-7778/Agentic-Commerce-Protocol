import React from 'react';
import { ShieldCheck, CreditCard, ExternalLink } from 'lucide-react';

interface OrderSettlementCardProps {
  settlement: any;
  loading: boolean;
  isProcessing: boolean;
  onLaunchPayment: () => void;
}

export const OrderSettlementCard: React.FC<OrderSettlementCardProps> = ({
  settlement,
  loading,
  isProcessing,
  onLaunchPayment,
}) => {
  return (
    <div style={{
      marginTop: 10,
      width: '100%',
      background: 'var(--bg-surface)',
      border: '1.5px solid rgba(2, 132, 199, 0.4)',
      borderRadius: 'var(--radius-lg)',
      padding: 14,
      boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={18} color="#0284C7" />
          <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#38BDF8' }}>
            Razorpay Payment Gateway
          </span>
        </div>
        <span className="badge badge-razorpay" style={{ fontSize: '0.65rem' }}>
          Verified Settlement Link
        </span>
      </div>

      {settlement.merchant_name && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
          Merchant: <strong style={{ color: 'var(--text-primary)' }}>{settlement.merchant_name}</strong>
        </div>
      )}

      {settlement.applied_campaigns?.length > 0 && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 12px',
          marginBottom: 10,
          fontSize: '0.75rem',
          color: 'var(--accent-emerald)',
        }}>
          {settlement.applied_campaigns.map((c: any) => (
            <div key={c.id}>Campaign discount applied: {c.name} (-₹{c.discount_amount.toLocaleString()})</div>
          ))}
        </div>
      )}

      {/* Bill Breakdown */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 12px',
        marginBottom: 12,
        fontSize: '0.78rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ color: 'var(--text-muted)' }}>Order ID:</span>
          <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {settlement.order?.order_number || settlement.order?.id || 'RZP-ORD'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ color: 'var(--text-muted)' }}>Subtotal:</span>
          <span>₹{settlement.order?.subtotal_amount?.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'var(--text-muted)' }}>Tax:</span>
          <span>₹{settlement.order?.tax_amount?.toLocaleString()}</span>
        </div>
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.88rem' }}>
          <span style={{ color: 'var(--text-primary)' }}>Total Amount:</span>
          <span style={{ color: '#38BDF8' }}>₹{settlement.order?.total_amount?.toLocaleString()}</span>
        </div>
      </div>

      {/* Direct Razorpay Gateway Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={onLaunchPayment}
          disabled={loading || isProcessing}
          className="btn btn-primary"
          style={{
            width: '100%',
            fontSize: '0.86rem',
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
            borderColor: '#38BDF8',
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
          }}
        >
          <CreditCard size={17} color="#FFFFFF" />
          <span style={{ fontWeight: 700 }}>
            {isProcessing ? 'Opening Razorpay Gateway...' : `Pay ₹${settlement.order?.total_amount?.toLocaleString()} via Razorpay`}
          </span>
        </button>

        {settlement.payment_details?.payment_url && (
          <a
            href={settlement.payment_details.payment_url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary btn-sm"
            style={{
              width: '100%',
              fontSize: '0.75rem',
              padding: '6px 10px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
              color: 'var(--text-muted)',
            }}
          >
            <ExternalLink size={12} />
            <span>Open in Razorpay Hosted Page</span>
          </a>
        )}
      </div>
    </div>
  );
};
