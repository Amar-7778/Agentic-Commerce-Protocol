import React from 'react';
import { Eye, ShoppingCart, CheckCircle, AlertTriangle, Calendar, RefreshCw, ShoppingBag } from 'lucide-react';
import { UniversalItem } from '../types.js';

interface InventoryTableProps {
  items: UniversalItem[];
  loading: boolean;
  onInspectSchema: (item: UniversalItem) => void;
  onViewDetails: (item: UniversalItem) => void;
  onResetFilters: () => void;
}

function formatInr(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function availabilityBadge(item: UniversalItem) {
  switch (item.availability.status) {
    case 'in_stock':
      return (
        <span className="badge badge-emerald" style={{ fontSize: '0.68rem' }}>
          <CheckCircle size={10} />
          <span>In stock ({item.availability.quantity})</span>
        </span>
      );
    case 'low_stock':
      return (
        <span className="badge badge-amber" style={{ fontSize: '0.68rem' }}>
          <AlertTriangle size={10} />
          <span>Low stock ({item.availability.quantity})</span>
        </span>
      );
    case 'available_slots':
      return (
        <span className="badge badge-cyan" style={{ fontSize: '0.68rem' }}>
          <Calendar size={10} />
          <span>{item.availability.quantity} slots open</span>
        </span>
      );
    default:
      return (
        <span className="badge" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          Out of stock
        </span>
      );
  }
}

export const InventoryTable: React.FC<InventoryTableProps> = ({
  items,
  loading,
  onInspectSchema,
  onViewDetails,
  onResetFilters,
}) => {
  if (loading) {
    return (
      <div style={{
        padding: '60px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        color: 'var(--text-muted)',
      }}>
        <RefreshCw size={28} className="spin" color="var(--accent-terracotta)" />
        <span style={{ fontSize: '0.9rem' }}>Loading inventory...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card" style={{
        padding: '50px 20px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}>
        <div style={{
          width: 50,
          height: 50,
          borderRadius: 'var(--radius-full)',
          background: 'rgba(217, 107, 67, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <ShoppingBag size={24} color="var(--accent-terracotta)" />
        </div>
        <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>No inventory matches your filters</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 420 }}>
          Try adjusting your search, clearing filters, or ingest a new product from a platform adapter.
        </p>
        <button onClick={onResetFilters} className="btn btn-secondary btn-sm">
          Clear all filters
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-canvas)', borderBottom: '1px solid var(--border-subtle)' }}>
              {['Product', 'Merchant', 'Category', 'Price', 'Availability', ''].map((h) => (
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
            {items.map((item, idx) => (
              <tr
                key={item.id}
                style={{
                  borderBottom: idx < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  background: idx % 2 === 0 ? 'transparent' : '#FAF9F6',
                }}
              >
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.id}</div>
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                  {item.merchant_name || item.merchant_id}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{item.category}</td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {formatInr(item.price, item.currency)}
                </td>
                <td style={{ padding: '12px 16px' }}>{availabilityBadge(item)}</td>
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => onViewDetails(item)}
                      className="btn btn-glass btn-sm"
                      title="View details"
                      style={{ padding: '6px 10px' }}
                    >
                      <Eye size={13} color="var(--accent-terracotta)" />
                    </button>
                    <button
                      onClick={() => onInspectSchema(item)}
                      className="btn btn-secondary btn-sm"
                      title="Inspect adapter schema"
                      style={{ padding: '6px 10px' }}
                    >
                      <ShoppingCart size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
