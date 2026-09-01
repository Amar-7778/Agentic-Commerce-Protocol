import React from 'react';
import { AlertOctagon, CheckCircle2 } from 'lucide-react';

interface StepUpApprovalCardProps {
  amount: number;
  autonomousThreshold: number;
  loading: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export const StepUpApprovalCard: React.FC<StepUpApprovalCardProps> = ({
  amount,
  autonomousThreshold,
  loading,
  onApprove,
  onReject,
}) => {
  return (
    <div style={{
      marginTop: 10,
      width: '100%',
      background: 'rgba(217, 142, 50, 0.15)',
      border: '1.5px solid var(--accent-amber)',
      borderRadius: 'var(--radius-md)',
      padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <AlertOctagon size={18} color="var(--accent-amber)" />
        <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--accent-amber)' }}>
          Supervisor approval required
        </h4>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
        Amount of ₹{amount.toLocaleString()} exceeds the autonomous limit (₹{autonomousThreshold.toLocaleString()}).
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onApprove}
          disabled={loading}
          className="btn btn-success btn-sm"
          style={{ flex: 1, fontSize: '0.78rem' }}
        >
          <CheckCircle2 size={14} />
          <span>Approve & authorize (₹{amount.toLocaleString()})</span>
        </button>
        <button
          onClick={onReject}
          disabled={loading}
          className="btn btn-secondary btn-sm"
          style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--accent-crimson)', fontSize: '0.78rem' }}
        >
          <span>Deny</span>
        </button>
      </div>
    </div>
  );
};
