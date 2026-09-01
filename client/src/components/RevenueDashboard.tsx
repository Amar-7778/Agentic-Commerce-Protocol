import React from 'react';
import { IndianRupee, ShoppingBag, TrendingUp, Tag, Layers } from 'lucide-react';
import { RevenueAnalytics, CatalogStats } from '../types.js';

interface RevenueDashboardProps {
  revenue: RevenueAnalytics | null;
  catalogStats: CatalogStats | null;
}

function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export const RevenueDashboard: React.FC<RevenueDashboardProps> = ({ revenue, catalogStats }) => {
  if (!revenue) return null;

  const tiles = [
    {
      label: 'Total Revenue (Paid Orders)',
      value: formatInr(revenue.total_revenue),
      sub: `${revenue.order_count} settled orders`,
      icon: <IndianRupee size={18} color="var(--accent-terracotta)" />,
    },
    {
      label: 'Average Order Value',
      value: formatInr(revenue.average_order_value),
      sub: 'Across all connected platforms',
      icon: <ShoppingBag size={18} color="var(--accent-amber)" />,
    },
    {
      label: 'Campaign-Driven Discount',
      value: formatInr(revenue.total_discount_given),
      sub: `${revenue.active_campaign_count} active growth campaigns`,
      icon: <Tag size={18} color="var(--accent-emerald)" />,
    },
    {
      label: 'Connected Stores',
      value: String(catalogStats?.platformCount ?? revenue.revenue_by_platform.length),
      sub: `${catalogStats?.totalItems ?? 0} listed products`,
      icon: <Layers size={18} color="var(--accent-cyan)" />,
    },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
        marginBottom: 16,
      }}>
        {tiles.map((tile) => (
          <div key={tile.label} className="card" style={{ padding: '18px 20px', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{tile.label}</span>
              {tile.icon}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              {tile.value}
            </div>
            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {tile.sub}
            </div>
          </div>
        ))}
      </div>

      {revenue.revenue_by_platform.length > 0 && (
        <div className="card" style={{ padding: '18px 20px', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TrendingUp size={16} color="var(--accent-terracotta)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Revenue by Platform</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {revenue.revenue_by_platform.map((row) => {
              const maxRevenue = Math.max(...revenue.revenue_by_platform.map((r) => r.revenue), 1);
              const pct = Math.max(4, Math.round((row.revenue / maxRevenue) * 100));
              return (
                <div key={row.platform_id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {row.platform_id.replace(/^platform_/, '').replace(/_/g, ' ')}
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {formatInr(row.revenue)} · {row.order_count} orders
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--accent-terracotta), var(--accent-amber))',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
