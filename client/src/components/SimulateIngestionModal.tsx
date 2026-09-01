import React, { useState } from 'react';
import { X, PlusCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { PlatformMetadata, UniversalItem } from '../types.js';
import { simulateIngestItem } from '../services/api.js';

interface SimulateIngestionModalProps {
  platforms: PlatformMetadata[];
  onClose: () => void;
  onIngestSuccess: (item: UniversalItem) => void;
}

const SAMPLE_PAYLOADS: Record<string, any> = {
  swiggy_food: {
    kind: 'food',
    id: 'swiggy_item_custom_sandwich_01',
    name: 'Smoked Provolone & Caramelized Onion Brioche Melt',
    description: 'Slow-caramelized shallots with aged provolone, gruyere, and truffle butter on toasted brioche.',
    price: 620.0,
    isVeg: true,
    inStock: true,
    portionsAvailable: 14,
    category: 'Gourmet Sandwiches',
    rating: 4.6,
    ratingCount: 210,
    imageUrl: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=800&q=80',
    restaurant_id: 'swiggy_rest_truffles_02',
    restaurant_name: 'Truffles Cafe & Burgers',
    restaurant_area: 'Indiranagar 100ft Road',
    cuisine: ['Sandwiches'],
    delivery_time: 25,
  },
  swiggy_grocery: {
    kind: 'grocery',
    id: 'instamart_item_custom_snack_01',
    name: 'Digestive Biscuits',
    brand: 'Sunfeast',
    description: 'Wheat-fibre digestive biscuits, lightly sweetened.',
    price: 45.0,
    mrp: 48.0,
    packSize: '250 g',
    inStock: true,
    quantityAvailable: 60,
    rating: 4.3,
    ratingCount: 180,
    imageUrl: 'https://images.unsplash.com/photo-1590080876207-6b0b8fb0f0a3?w=600&q=80',
    department_id: 'dept_snacks_biscuits',
    department_name: 'Snacks & Biscuits',
  },
};

const ITEM_TYPES = [
  { key: 'swiggy_food', label: 'Food Dish' },
  { key: 'swiggy_grocery', label: 'Instamart Grocery' },
];

export const SimulateIngestionModal: React.FC<SimulateIngestionModalProps> = ({
  platforms,
  onClose,
  onIngestSuccess,
}) => {
  const targetPlatformId = platforms[0]?.id || 'platform_swiggy_builders';
  const [selectedType, setSelectedType] = useState<string>('swiggy_food');
  const [jsonText, setJsonText] = useState<string>(
    JSON.stringify(SAMPLE_PAYLOADS['swiggy_food'] || {}, null, 2)
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successItem, setSuccessItem] = useState<UniversalItem | null>(null);

  const handleTypeChange = (key: string) => {
    setSelectedType(key);
    setJsonText(JSON.stringify(SAMPLE_PAYLOADS[key] || {}, null, 2));
    setError(null);
    setSuccessItem(null);
  };

  const handleIngest = async () => {
    try {
      setLoading(true);
      setError(null);
      const parsed = JSON.parse(jsonText);
      const res = await simulateIngestItem(targetPlatformId, parsed);
      setSuccessItem(res.universalItem);
      onIngestSuccess(res.universalItem);
    } catch (err: any) {
      setError(err.message || 'Ingestion failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 840 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(217, 107, 67, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <PlusCircle size={18} color="var(--accent-terracotta)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                Add New Product
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Submit item data in the Swiggy adapter's native format — we'll normalize and list it automatically
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Item Type Selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Item Type:
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ITEM_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => handleTypeChange(t.key)}
                  className={`btn btn-sm ${selectedType === t.key ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ borderRadius: 'var(--radius-full)' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* JSON Editor */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Product Data (JSON):
              </label>
              <button
                type="button"
                onClick={() => setJsonText(JSON.stringify(SAMPLE_PAYLOADS[selectedType] || {}, null, 2))}
                style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: 'var(--accent-terracotta)', cursor: 'pointer' }}
              >
                Reset Sample
              </button>
            </div>
            <textarea
              rows={12}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.825rem',
                padding: '14px',
                lineHeight: 1.55,
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: 'var(--accent-rose)',
              fontSize: '0.8rem',
              marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          {successItem && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--accent-emerald)',
              fontSize: '0.825rem',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 14,
            }}>
              <CheckCircle size={18} />
              <div>
                <strong>Product added successfully!</strong> <code>{successItem.id}</code> — "{successItem.title}" is now live in the catalog.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary btn-sm">
            Close
          </button>
          <button
            onClick={handleIngest}
            disabled={loading}
            className="btn btn-primary btn-sm"
          >
            {loading ? (
              <>
                <RefreshCw size={14} className="spin" />
                <span>Adding...</span>
              </>
            ) : (
              <>
                <PlusCircle size={14} />
                <span>Add Product</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
