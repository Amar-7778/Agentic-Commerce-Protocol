import React from 'react';
import { Check, Truck } from 'lucide-react';
import { PaymentConfirmation } from '../types.js';

interface PaymentConfirmationCardProps {
  confirmation: PaymentConfirmation;
}

export const PaymentConfirmationCard: React.FC<PaymentConfirmationCardProps> = ({ confirmation }) => {
  return (
    <div style={{ marginTop: 8, width: '100%' }} className="razorpay-receipt-card animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(2, 132, 199, 0.3)', paddingBottom: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#10B981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Check size={14} color="#FFFFFF" strokeWidth={3} />
          </div>
          <div>
            <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Razorpay Payment Receipt
            </h4>
            <span style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)' }}>
              Verified Merchant Settlement
            </span>
          </div>
        </div>
        <span className="badge badge-emerald" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
          PAID & SETTLED
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 10 }}>
        <div style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Payment ID</span>
          <span className="font-mono" style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
            {confirmation.paymentId}
          </span>
        </div>

        <div style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Order Reference</span>
          <span className="font-mono" style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {confirmation.orderId}
          </span>
        </div>

        <div style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Amount Settled</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
            ₹{confirmation.amount.toLocaleString()}
          </span>
        </div>

        <div style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Payment Method</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {confirmation.method}
          </span>
        </div>
      </div>

      {confirmation.deliveryEta && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.75rem',
          color: '#6EE7B7',
        }}>
          <Truck size={16} color="#10B981" />
          <span>{confirmation.deliveryEta}</span>
        </div>
      )}
    </div>
  );
};
