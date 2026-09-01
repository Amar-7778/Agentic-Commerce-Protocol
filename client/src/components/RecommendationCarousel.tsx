import React from 'react';
import { ShoppingBag, Zap } from 'lucide-react';
import { UniversalItem } from '../types.js';

interface RecommendationCarouselProps {
  items: UniversalItem[];
  containerTitle?: string;
  containerSubtitle?: string;
  loading: boolean;
  onInstantCheckout: (item: UniversalItem) => void;
}

export const RecommendationCarousel: React.FC<RecommendationCarouselProps> = ({
  items,
  containerTitle,
  containerSubtitle,
  loading,
  onInstantCheckout,
}) => {
  if (items.length === 0) return null;

  return (
    <div style={{
      marginTop: 10,
      width: '100%',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-medium)',
      borderRadius: 'var(--radius-lg)',
      padding: 14,
      boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {containerTitle || 'Recommendations'}
          </h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {containerSubtitle || 'Verified catalog matches'}
          </p>
        </div>
        <span className="badge badge-terracotta" style={{ fontSize: '0.68rem' }}>
          {items.length} match{items.length === 1 ? '' : 'es'}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 10,
      }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              {item.media?.[0]?.url ? (
                <img
                  src={item.media[0].url}
                  alt={item.title}
                  style={{ width: 52, height: 52, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <ShoppingBag size={20} color="var(--text-muted)" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <span className="badge badge-amber" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
                    {item.category}
                  </span>
                </div>
                <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                </h4>
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--accent-terracotta)' }}>
                  ₹{item.price?.toLocaleString()}
                </span>
                {item.merchant_name && (
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{item.merchant_name}</div>
                )}
              </div>
            </div>

            <button
              onClick={() => onInstantCheckout(item)}
              disabled={loading}
              className="btn btn-primary btn-sm"
              style={{ width: '100%', fontSize: '0.78rem', padding: '6px 10px' }}
            >
              <Zap size={13} />
              <span>Instant Checkout</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
