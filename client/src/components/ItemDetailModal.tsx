import React from 'react';
import { X, Star, Building2, Tag, ShieldCheck, Layers } from 'lucide-react';
import { UniversalItem } from '../types.js';

interface ItemDetailModalProps {
  item: UniversalItem | null;
  onClose: () => void;
  onInspectSchema: (item: UniversalItem) => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
  item,
  onClose,
  onInspectSchema,
}) => {
  if (!item) return null;

  const formattedPrice = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: item.currency || 'INR',
    maximumFractionDigits: 0,
  }).format(item.price);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 840 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge badge-terracotta">{item.platform_id.replace(/^platform_/, '').replace(/_/g, ' ')}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {item.id}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 24 }}>
            {/* Left: Price & Merchant Box */}
            <div>
              <div style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Listed Price</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                  {formattedPrice}
                </div>

                {item.attributes?.mrp && item.attributes.mrp > item.price && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    MRP: <span style={{ textDecoration: 'line-through' }}>₹{item.attributes.mrp.toLocaleString()}</span>
                    <span style={{ color: 'var(--accent-emerald)', marginLeft: 6, fontWeight: 600 }}>
                      {Math.round(((item.attributes.mrp - item.price) / item.attributes.mrp) * 100)}% off
                    </span>
                  </div>
                )}

                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                    <Building2 size={14} color="var(--accent-amber)" />
                    <span>Merchant: <strong>{item.merchant_name || item.merchant_id}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                    <Layers size={14} color="var(--accent-cyan)" />
                    <span>Category: <strong>{item.category}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                    <ShieldCheck size={14} color="var(--accent-emerald)" />
                    <span>Razorpay Verified Merchant</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Details & Attributes */}
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--accent-terracotta)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                {item.category}
              </div>

              <h2 style={{ fontSize: '1.4rem', color: 'var(--text-primary)', lineHeight: 1.25, marginBottom: 12 }}>
                {item.title}
              </h2>

              {item.rating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 14 }}>
                  <Star size={14} color="#F59E0B" fill="#F59E0B" />
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{item.rating.average.toFixed(1)}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({item.rating.count} verified reviews)</span>
                </div>
              )}

              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                {item.description}
              </p>

              {/* Product Specifications */}
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Product Specifications
              </h4>

              <div style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                marginBottom: 20,
              }}>
                {Object.entries(item.attributes).map(([key, value], idx) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      padding: '8px 14px',
                      fontSize: '0.8rem',
                      borderBottom: idx < Object.keys(item.attributes).length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                    }}
                  >
                    <span style={{ width: '40%', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'capitalize' }}>
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span style={{ width: '60%', color: 'var(--text-primary)', fontFamily: typeof value === 'number' ? 'var(--font-mono)' : 'inherit' }}>
                      {Array.isArray(value) ? value.join(', ') : String(value)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Tags */}
              {item.tags.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag size={13} />
                    <span>Product Tags</span>
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {item.tags.map((tag) => (
                      <span key={tag} className="badge" style={{ fontSize: '0.725rem' }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary btn-sm">
            Close
          </button>
          <button
            onClick={() => {
              onClose();
              onInspectSchema(item);
            }}
            className="btn btn-primary btn-sm"
          >
            View Full Specifications
          </button>
        </div>
      </div>
    </div>
  );
};
