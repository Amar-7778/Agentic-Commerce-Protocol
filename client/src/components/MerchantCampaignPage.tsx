import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldCheck,
  TrendingUp,
  PlusCircle,
  Clock,
  Layers,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Gift,
  Target
} from 'lucide-react';
import { fetchCampaigns, createCampaign, fetchCampaignAudit, fetchMerchants } from '../services/api.js';
import { MerchantSummary } from '../types.js';

interface MerchantCampaign {
  id: string;
  merchant_id: string;
  name: string;
  description: string;
  campaign_type: string;
  trigger_rule: any;
  action_benefit: any;
  budget_limit: number;
  budget_spent: number;
  status: string;
  governance_ref?: string;
  created_at: string;
}

export const MerchantCampaignPage: React.FC = () => {
  const [campaigns, setCampaigns] = useState<MerchantCampaign[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'create' | 'audit'>('campaigns');
  const [selectedCampaignAudit, setSelectedCampaignAudit] = useState<{ id: string; events: any[] } | null>(null);

  // Form State for Launching New Campaign
  const [merchants, setMerchants] = useState<MerchantSummary[]>([]);
  const [merchantId, setMerchantId] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [campaignDesc, setCampaignDesc] = useState('');
  const [campaignType, setCampaignType] = useState<'cart_threshold_discount' | 'reorder_nudge_boost' | 'upsell_bundle_boost' | 'free_shipping'>('cart_threshold_discount');
  const [discountPercent, setDiscountPercent] = useState<number>(10);
  const [minCartTotal, setMinCartTotal] = useState<number>(10000);
  const [budgetLimit, setBudgetLimit] = useState<number>(30000);
  const [targetSegment, setTargetSegment] = useState<'all' | 'reorder_likely' | 'high_value_cart'>('high_value_cart');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string; preauthRef?: string } | null>(null);

  useEffect(() => {
    loadCampaigns();
    loadMerchants();
  }, []);

  const loadMerchants = async () => {
    try {
      const list = await fetchMerchants();
      setMerchants(list);
      if (list.length > 0 && !merchantId) {
        setMerchantId(list[0].id);
      }
    } catch (e) {
      console.error('Failed to load merchants:', e);
    }
  };

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const data = await fetchCampaigns();
      setCampaigns(data.campaigns || []);
    } catch (e) {
      console.error('Failed to load campaigns:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setActionFeedback(null);

    try {
      const payload = {
        merchant_id: merchantId,
        name: campaignName,
        description: campaignDesc,
        campaign_type: campaignType,
        trigger_rule: {
          min_cart_total: minCartTotal,
          target_segment: targetSegment,
        },
        action_benefit: {
          benefit_type: campaignType === 'free_shipping' ? 'free_shipping' : 'percentage_discount',
          discount_percentage: discountPercent,
          max_discount_cap: discountPercent * 250,
          promotional_tag: campaignName.toUpperCase().replace(/\s+/g, '_').slice(0, 16),
        },
        budget_limit: budgetLimit,
      };

      const data = await createCampaign(payload);
      setActionFeedback({
        type: 'success',
        message: `Campaign "${campaignName}" created and activated successfully under spending limit pre-authorization!`,
        preauthRef: data?.authorization_ref || data?.governance_result?.authorization_ref,
      });
      loadCampaigns();
      // Reset form
      setCampaignName('');
      setCampaignDesc('');
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.message || 'Failed to create campaign. Governance check blocked request.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInspectAudit = async (campaignId: string) => {
    try {
      const data = await fetchCampaignAudit(campaignId);
      setSelectedCampaignAudit({
        id: campaignId,
        events: data.audit_trail || [],
      });
      setActiveTab('audit');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      className="card"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        overflow: 'hidden',
        padding: 0,
      }}
    >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-base)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              }}
            >
              <TrendingUp size={20} color="#FFFFFF" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Merchant Campaign Orchestrator
                </h3>
                <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                  Revenue Growth Engine
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, marginTop: 2 }}>
                Structurally gated revenue campaigns · pre-authorized budget bounds · auto-incentive evaluator
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            padding: '0 24px',
          }}
        >
          <button
            onClick={() => setActiveTab('campaigns')}
            style={{
              padding: '12px 18px',
              border: 'none',
              background: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              color: activeTab === 'campaigns' ? 'var(--accent-terracotta)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'campaigns' ? '2px solid var(--accent-terracotta)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Layers size={16} /> Active Campaigns ({campaigns.length})
          </button>
          <button
            onClick={() => setActiveTab('create')}
            style={{
              padding: '12px 18px',
              border: 'none',
              background: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              color: activeTab === 'create' ? 'var(--accent-terracotta)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'create' ? '2px solid var(--accent-terracotta)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <PlusCircle size={16} /> Launch Gated Campaign
          </button>
          {selectedCampaignAudit && (
            <button
              onClick={() => setActiveTab('audit')}
              style={{
                padding: '12px 18px',
                border: 'none',
                background: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: activeTab === 'audit' ? 'var(--accent-terracotta)' : 'var(--text-secondary)',
                borderBottom: activeTab === 'audit' ? '2px solid var(--accent-terracotta)' : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <ShieldCheck size={16} /> Campaign Audit Trail ({selectedCampaignAudit.events.length})
            </button>
          )}
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* TAB 1: ACTIVE CAMPAIGNS */}
          {activeTab === 'campaigns' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Live Merchant Growth Campaigns
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    All campaigns are validated through policy pre-authorization before discount applications.
                  </p>
                </div>
                <button
                  onClick={loadCampaigns}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <RotateCcw size={13} /> Refresh
                </button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Loading active campaigns...
                </div>
              ) : campaigns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No active campaigns found. Launch a campaign using the form.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                  {campaigns.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 12,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <span className="badge badge-terracotta" style={{ fontSize: '0.7rem' }}>
                            {c.campaign_type.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                            {c.status.toUpperCase()}
                          </span>
                        </div>
                        <h5 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {c.name}
                        </h5>
                        <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          {c.description}
                        </p>

                        {/* Rules Summary */}
                        <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 8, fontSize: '0.75rem', marginBottom: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', marginBottom: 4 }}>
                            <Target size={14} color="var(--accent-terracotta)" />
                            <span><strong>Trigger Rule:</strong> Cart &gt; ₹{c.trigger_rule?.min_cart_total || 0} ({c.trigger_rule?.target_segment || 'all'})</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                            <Gift size={14} color="var(--accent-emerald)" />
                            <span><strong>Benefit:</strong> {
                              c.action_benefit?.benefit_type === 'free_shipping'
                                ? 'Free Express Shipping'
                                : c.action_benefit?.benefit_type === 'fixed_discount'
                                ? `₹${c.action_benefit?.discount_amount || 0} Flat Discount`
                                : `${c.action_benefit?.discount_percentage || 0}% Markdown (Cap: ₹${c.action_benefit?.max_discount_cap || 0})`
                            }</span>
                          </div>
                        </div>

                        {/* Budget Bar */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.725rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                            <span>Budget: ₹{c.budget_limit?.toLocaleString()}</span>
                            <span>Spent: ₹{c.budget_spent?.toLocaleString()}</span>
                          </div>
                          <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${Math.min(100, ((c.budget_spent || 0) / (c.budget_limit || 1)) * 100)}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, var(--accent-emerald), var(--accent-terracotta))',
                              }}
                            />
                          </div>
                        </div>

                        {/* Governance Ref */}
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: 12 }}>
                          <strong>Pre-Auth Ref:</strong> <code>{c.governance_ref || 'SYSTEM_VERIFIED'}</code>
                        </div>
                      </div>

                      <button
                        onClick={() => handleInspectAudit(c.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <ShieldCheck size={14} color="var(--accent-amber)" /> View Immutable Audit Trail
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CREATE CAMPAIGN */}
          {activeTab === 'create' && (
            <div style={{ maxWidth: 640, margin: '0 auto' }}>
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Launch New Structurally Gated Campaign
                </h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Campaign budget and discount ceiling will be checked against policy spending limits prior to activation.
                </p>
              </div>

              {actionFeedback && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    marginBottom: 16,
                    background: actionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${actionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                    color: actionFeedback.type === 'success' ? 'var(--accent-emerald)' : '#F87171',
                    fontSize: '0.825rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                    {actionFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    {actionFeedback.message}
                  </div>
                  {actionFeedback.preauthRef && (
                    <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                      <strong>Signed Pre-Auth Ref:</strong> <code>{actionFeedback.preauthRef}</code>
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleCreateCampaign} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Merchant Account
                  </label>
                  <select
                    value={merchantId}
                    onChange={(e) => setMerchantId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                    }}
                  >
                    {merchants.length === 0 ? (
                      <option value="">Loading merchants...</option>
                    ) : (
                      merchants.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Campaign Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Early Spring Pro Audio Markdown"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Campaign Description & Intent
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Describe target audience and justification..."
                    value={campaignDesc}
                    onChange={(e) => setCampaignDesc(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Campaign Type
                    </label>
                    <select
                      value={campaignType}
                      onChange={(e) => setCampaignType(e.target.value as any)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 8,
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                      }}
                    >
                      <option value="cart_threshold_discount">Cart Threshold Markdown</option>
                      <option value="reorder_nudge_boost">Reorder Replenishment Boost</option>
                      <option value="upsell_bundle_boost">Companion Upsell Boost</option>
                      <option value="free_shipping">Free Express Shipping</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Target Customer Segment
                    </label>
                    <select
                      value={targetSegment}
                      onChange={(e) => setTargetSegment(e.target.value as any)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 8,
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                      }}
                    >
                      <option value="high_value_cart">High Value Basket (&gt; ₹10k)</option>
                      <option value="reorder_likely">Reorder / Repeat Buyers</option>
                      <option value="all">All Qualifying Buyers</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Min Cart Total (₹)
                    </label>
                    <input
                      type="number"
                      value={minCartTotal}
                      onChange={(e) => setMinCartTotal(parseFloat(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 8,
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Discount Rate (%)
                    </label>
                    <input
                      type="number"
                      max={40}
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 8,
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Campaign Budget (₹)
                    </label>
                    <input
                      type="number"
                      value={budgetLimit}
                      onChange={(e) => setBudgetLimit(parseFloat(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 8,
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>
                </div>

                <div style={{ background: 'rgba(217, 107, 67, 0.1)', padding: 12, borderRadius: 8, border: '1px solid rgba(217, 107, 67, 0.3)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <ShieldCheck size={16} color="var(--accent-terracotta)" style={{ float: 'left', marginRight: 8, marginTop: 2 }} />
                  <strong>Governance Policy Check</strong>: Discount rate is capped at 40% autonomous ceiling. Budget allocation requires pre-authorization verification before insertion into PostgreSQL.
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !campaignName.trim()}
                  className="btn btn-primary"
                  style={{
                    padding: '12px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: 'linear-gradient(135deg, var(--accent-terracotta), #9B3D1B)',
                  }}
                >
                  <Sparkles size={16} /> {isSubmitting ? 'Evaluating Policy Bounds...' : 'Authorize & Launch Campaign'}
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: CAMPAIGN AUDIT TRAIL */}
          {activeTab === 'audit' && selectedCampaignAudit && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Immutable Campaign Audit Trail ({selectedCampaignAudit.id})
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Complete cryptographic verification sequence and policy decisions.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('campaigns')}
                  className="btn btn-secondary btn-sm"
                >
                  Back to Campaigns
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedCampaignAudit.events.map((evt, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 10,
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="badge badge-terracotta" style={{ fontSize: '0.7rem' }}>
                          {evt.actor?.toUpperCase()}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          {evt.action_type}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                        <Clock size={12} />
                        <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                        <span className={`badge ${evt.status === 'success' ? 'badge-emerald' : 'badge-amber'}`} style={{ fontSize: '0.65rem' }}>
                          {evt.status?.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {evt.reasoning}
                    </p>

                    {evt.authorization_ref && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        <strong>Auth Ref:</strong> <code>{evt.authorization_ref}</code>
                      </div>
                    )}

                    {evt.gate_checks_passed?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {evt.gate_checks_passed.map((chk: string, i: number) => (
                          <span key={i} className="badge badge-emerald" style={{ fontSize: '0.65rem' }}>
                            ✓ {chk}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
    </div>
  );
};
