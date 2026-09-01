import React from 'react';
import { ShieldCheck, RefreshCw, PanelRightClose, Activity } from 'lucide-react';

interface AuditSidebarProps {
  logs: any[];
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
}

export const AuditSidebar: React.FC<AuditSidebarProps> = ({ logs, loading, onRefresh, onClose }) => {
  return (
    <aside className="audit-sidebar animate-fade-in">
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#FAF9F6',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={17} color="#0284C7" />
          <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Live Audit Ledger
          </span>
          <span className="badge badge-emerald" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>
            <Activity size={10} style={{ animation: 'pulse 1.5s infinite' }} />
            <span>PostgreSQL</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
            title="Refresh audit logs"
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s infinite linear' : 'none' }} />
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
            title="Close sidebar"
          >
            <PanelRightClose size={14} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', padding: '40px 0' }}>
            No audit logs recorded yet.
          </div>
        ) : (
          logs.map((log: any, idx: number) => {
            const isPayment = log.action === 'verify_payment' || log.action === 'create_payment_link';
            const isPreauth = log.action === 'request_preauthorization' || log.action === 'preauth_spend';
            const isStepUp = log.action === 'approve_step_up';
            const isCampaign = log.action === 'apply_campaign_discount';

            const badgeClass = isPayment
              ? 'badge-emerald'
              : isStepUp
              ? 'badge-amber'
              : isCampaign
              ? 'badge-emerald'
              : isPreauth
              ? 'badge-razorpay'
              : 'badge-terracotta';

            return (
              <div key={log.id || idx} className="audit-entry animate-fade-in">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className={`badge ${badgeClass}`} style={{ fontSize: '0.62rem', padding: '1px 6px' }}>
                    {log.action}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {log.timestamp ? log.timestamp.slice(11, 19) : log.created_at ? log.created_at.slice(11, 19) : ''}
                  </span>
                </div>

                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 4, lineHeight: 1.3 }}>
                  {log.reasoning || log.reason || 'Audit action logged'}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  <span>Actor: <strong style={{ color: 'var(--text-primary)' }}>{log.actor_type || log.actor || 'system'}</strong></span>
                  {log.authorization_ref && (
                    <span className="font-mono" style={{ color: '#38BDF8' }} title={`Authorization Ref: ${log.authorization_ref}`}>
                      {log.authorization_ref.slice(0, 14)}...
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
