import React from 'react';
import { RefreshCw, PackageSearch, ShieldCheck } from 'lucide-react';
import { OrderSummary } from '../types.js';

interface OrdersViewProps {
  orders: OrderSummary[];
  loading: boolean;
  onInspectAudit: (orderId: string) => void;
}

function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

const STATUS_BADGE: Record<string, string> = {
  paid: 'badge-emerald',
  authorized: 'badge-razorpay',
  pending: 'badge-amber',
  failed: 'badge-crimson',
  fulfilled: 'badge-emerald',
  cancelled: 'badge',
  refunded: 'badge-cyan',
};

export const OrdersView: React.FC<OrdersViewProps> = ({ orders, loading, onInspectAudit }) => {
  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="spin" color="var(--accent-terracotta)" />
        <div style={{ marginTop: 10 }}>Loading orders...</div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="card" style={{ padding: '50px 20px', textAlign: 'center' }}>
        <PackageSearch size={28} color="var(--text-muted)" style={{ marginBottom: 10 }} />
        <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>No orders yet</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 6 }}>
          Orders placed through the shopper agent will appear here once settled.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-canvas)', borderBottom: '1px solid var(--border-subtle)' }}>
              {['Order', 'Merchant', 'Items', 'Total', 'Status', 'Placed', ''].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '10px 16px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order, idx) => (
              <tr
                key={order.id}
                style={{
                  borderBottom: idx < orders.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  background: idx % 2 === 0 ? 'transparent' : '#FAF9F6',
                }}
              >
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {order.order_number}
                  </div>
                  {order.razorpay_payment_id && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{order.razorpay_payment_id}</div>
                  )}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                  {order.merchant_name || order.merchant_id}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{order.item_count}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatInr(order.total_amount)}</div>
                  {order.discount_amount > 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)' }}>
                      -{formatInr(order.discount_amount)} discount
                    </div>
                  )}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span className={`badge ${STATUS_BADGE[order.status] || 'badge'}`} style={{ fontSize: '0.68rem' }}>
                    {order.status.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  {new Date(order.created_at).toLocaleString()}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button
                    onClick={() => onInspectAudit(order.id)}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '6px 10px', fontSize: '0.72rem' }}
                    title="View audit trail"
                  >
                    <ShieldCheck size={12} color="var(--accent-amber)" />
                    <span>Audit</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
