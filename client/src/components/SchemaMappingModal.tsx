import React, { useEffect, useState } from 'react';
import { X, RefreshCw, ArrowRightLeft, Database, Code2, CheckCheck } from 'lucide-react';
import { UniversalItem, SchemaInspectionData } from '../types.js';
import { fetchAdapterInspection } from '../services/api.js';

interface SchemaMappingModalProps {
  item: UniversalItem | null;
  onClose: () => void;
}

export const SchemaMappingModal: React.FC<SchemaMappingModalProps> = ({ item, onClose }) => {
  const [data, setData] = useState<SchemaInspectionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'side_by_side' | 'universal_only' | 'native_only'>('side_by_side');

  useEffect(() => {
    if (!item) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchAdapterInspection(item.id)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [item]);

  if (!item) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 1100, maxHeight: '92vh' }}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(217, 107, 67, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <ArrowRightLeft size={18} color="var(--accent-terracotta)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  Product Data Inspector
                </h3>
                <span className="badge badge-terracotta" style={{ fontSize: '0.7rem' }}>
                  Live Data View
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Item: <strong style={{ color: 'var(--text-secondary)' }}>{item.title}</strong> ({item.id})
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* View Switcher */}
            <div style={{ display: 'flex', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', padding: 2, border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setActiveTab('side_by_side')}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: activeTab === 'side_by_side' ? 'var(--accent-terracotta)' : 'transparent',
                  color: activeTab === 'side_by_side' ? '#FFFFFF' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                Side-by-Side
              </button>
              <button
                onClick={() => setActiveTab('universal_only')}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: activeTab === 'universal_only' ? 'var(--accent-terracotta)' : 'transparent',
                  color: activeTab === 'universal_only' ? '#FFFFFF' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                Normalized
              </button>
              <button
                onClick={() => setActiveTab('native_only')}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: activeTab === 'native_only' ? 'var(--accent-terracotta)' : 'transparent',
                  color: activeTab === 'native_only' ? '#FFFFFF' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                Raw Data
              </button>
            </div>

            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Adapter Metadata Info Banner */}
          {data && (
            <div style={{
              background: 'rgba(217, 107, 67, 0.08)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Store / Platform:</span>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {data.platformMetadata.name} (v{data.platformMetadata.version})
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <CheckCheck size={14} color="var(--accent-emerald)" />
                <span>Real-Time Stock: {data.platformMetadata.capabilities.real_time_inventory ? 'Supported' : 'Slots'}</span>
                <span>•</span>
                <span>Currencies: {data.platformMetadata.supported_currencies.join(', ')}</span>
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin" color="var(--accent-terracotta)" />
              <div style={{ marginTop: 10 }}>Loading product data...</div>
            </div>
          ) : error ? (
            <div style={{ padding: '30px', color: 'var(--accent-rose)', textAlign: 'center' }}>
              Failed to load mapping: {error}
            </div>
          ) : data ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: activeTab === 'side_by_side' ? '1fr 1fr' : '1fr',
              gap: 16,
            }}>
              {/* Column 1: Native Platform Raw JSON */}
              {(activeTab === 'side_by_side' || activeTab === 'native_only') && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    padding: '0 4px',
                  }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Database size={14} />
                      1. Raw Store Data
                    </span>
                    <span className="badge" style={{ fontSize: '0.68rem' }}>
                      Original Format
                    </span>
                  </div>
                  <div className="code-box" style={{ flex: 1, minHeight: 340 }}>
                    <pre>{JSON.stringify(data.nativeItem, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* Column 2: Universal Item Normalized Schema */}
              {(activeTab === 'side_by_side' || activeTab === 'universal_only') && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    padding: '0 4px',
                  }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-terracotta)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Code2 size={14} />
                      2. Normalized Product Data
                    </span>
                    <span className="badge badge-terracotta" style={{ fontSize: '0.68rem' }}>
                      Standardized Format
                    </span>
                  </div>
                  <div className="code-box" style={{ flex: 1, minHeight: 340 }}>
                    <pre>{JSON.stringify(data.universalItem, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div style={{ marginRight: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Razorpay-verified product data — normalized across all connected stores.
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
