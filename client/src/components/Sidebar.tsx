import React from 'react';
import { MessageSquare, LayoutDashboard, PackageSearch, Receipt, TrendingUp, ShieldCheck, Database } from 'lucide-react';
import { CatalogStats, PublicConfig } from '../types.js';

export type SidebarSection = 'shopper' | 'overview' | 'inventory' | 'orders' | 'campaigns' | 'governance';

interface SidebarProps {
  activeSection: SidebarSection;
  onSelectSection: (section: SidebarSection) => void;
  stats: CatalogStats | null;
  config: PublicConfig | null;
}

interface NavItem {
  id: SidebarSection;
  label: string;
  icon: React.ReactNode;
  group: 'shop' | 'merchant';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'shopper', label: 'Shopper Assistant', icon: <MessageSquare size={17} />, group: 'shop' },
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={17} />, group: 'merchant' },
  { id: 'inventory', label: 'Inventory', icon: <PackageSearch size={17} />, group: 'merchant' },
  { id: 'orders', label: 'Orders', icon: <Receipt size={17} />, group: 'merchant' },
  { id: 'campaigns', label: 'Campaigns', icon: <TrendingUp size={17} />, group: 'merchant' },
  { id: 'governance', label: 'Governance & Audit', icon: <ShieldCheck size={17} />, group: 'merchant' },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeSection, onSelectSection, stats, config }) => {
  const renderItem = (item: NavItem) => {
    const isActive = activeSection === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onSelectSection(item.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '9px 12px',
          marginBottom: 2,
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: isActive ? 'var(--accent-terracotta-subtle)' : 'transparent',
          color: isActive ? 'var(--accent-terracotta)' : 'var(--text-secondary)',
          fontWeight: isActive ? 700 : 500,
          fontSize: '0.85rem',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s ease',
        }}
      >
        {item.icon}
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <aside style={{
      width: 240,
      minWidth: 240,
      height: '100vh',
      background: '#FFFFFF',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Wordmark — text only, no logo mark */}
      <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="font-display" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Agentic Commerce
        </span>
        <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
          Food &amp; Grocery Delivery Network
        </span>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
        <div style={{ marginBottom: 4, padding: '0 8px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Shop
        </div>
        {NAV_ITEMS.filter((i) => i.group === 'shop').map(renderItem)}

        <div style={{ margin: '18px 0 4px', padding: '0 8px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Merchant Console
        </div>
        {NAV_ITEMS.filter((i) => i.group === 'merchant').map(renderItem)}
      </nav>

      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          className={`badge ${stats ? 'badge-emerald' : ''}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content' }}
        >
          <Database size={12} />
          <span>{stats ? 'Database Connected' : 'Connecting...'}</span>
        </div>
        <div className="badge badge-razorpay" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content' }}>
          <ShieldCheck size={12} />
          <span>Razorpay {config?.razorpay_mode === 'live' ? 'Live' : 'Test'} Mode</span>
        </div>
        {stats && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{stats.totalItems} listed items</span>
        )}
      </div>
    </aside>
  );
};
