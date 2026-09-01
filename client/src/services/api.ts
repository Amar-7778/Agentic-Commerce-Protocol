import {
  CatalogSearchResult,
  CatalogQueryFilters,
  UniversalItem,
  PlatformMetadata,
  SchemaInspectionData,
  CatalogStats,
  MerchantSummary,
  OrderSummary,
  RevenueAnalytics,
  PublicConfig,
} from '../types.js';

const API_BASE = '/api';

async function unwrap<T>(res: Response, fallbackError: string): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.error || json.message || fallbackError);
  }
  return json.data;
}

export async function fetchCatalog(filters: CatalogQueryFilters = {}): Promise<CatalogSearchResult> {
  const params = new URLSearchParams();
  if (filters.query) params.append('query', filters.query);
  if (filters.category && filters.category !== 'all') params.append('category', filters.category);
  if (filters.platform_id && filters.platform_id !== 'all') params.append('platform_id', filters.platform_id);
  if (filters.min_price !== undefined) params.append('min_price', String(filters.min_price));
  if (filters.max_price !== undefined) params.append('max_price', String(filters.max_price));
  if (filters.availability_status && filters.availability_status !== 'all') {
    params.append('availability_status', filters.availability_status);
  }
  if (filters.sort_by) params.append('sort_by', filters.sort_by);

  const res = await fetch(`${API_BASE}/catalog?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch catalog: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export const fetchCatalogItems = fetchCatalog;

export async function fetchItemById(id: string): Promise<UniversalItem> {
  const res = await fetch(`${API_BASE}/catalog/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to fetch item: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function fetchAdapterInspection(id: string): Promise<SchemaInspectionData> {
  const res = await fetch(`${API_BASE}/catalog/${encodeURIComponent(id)}/adapter-inspection`);
  if (!res.ok) throw new Error(`Failed to inspect adapter mapping: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function fetchPlatforms(): Promise<PlatformMetadata[]> {
  const res = await fetch(`${API_BASE}/platforms`);
  if (!res.ok) throw new Error(`Failed to fetch platforms: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function fetchStats(): Promise<CatalogStats> {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function simulateIngestItem(platformId: string, rawPayload: any): Promise<{ universalItem: UniversalItem; indexed: boolean }> {
  const res = await fetch(`${API_BASE}/catalog/simulate-ingestion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform_id: platformId, raw_payload: rawPayload }),
  });
  if (!res.ok) throw new Error(`Simulation failed: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function fetchMerchants(): Promise<MerchantSummary[]> {
  const res = await fetch(`${API_BASE}/merchants`);
  return unwrap<MerchantSummary[]>(res, 'Failed to fetch merchants');
}

export async function fetchOrders(limit: number = 30): Promise<OrderSummary[]> {
  const res = await fetch(`${API_BASE}/orders?limit=${limit}`);
  return unwrap<OrderSummary[]>(res, 'Failed to fetch orders');
}

export async function fetchRevenueAnalytics(): Promise<RevenueAnalytics> {
  const res = await fetch(`${API_BASE}/analytics/revenue`);
  return unwrap<RevenueAnalytics>(res, 'Failed to fetch revenue analytics');
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  const res = await fetch(`${API_BASE}/config/public`);
  return unwrap<PublicConfig>(res, 'Failed to fetch public config');
}

export async function fetchAuditLogs(limit: number = 30): Promise<any[]> {
  const res = await fetch(`${API_BASE}/audit-logs?limit=${limit}`);
  return unwrap<any[]>(res, 'Failed to fetch audit logs');
}

export async function fetchCampaigns(merchantId?: string): Promise<{ total_active_campaigns: number; campaigns: any[] }> {
  const params = merchantId ? `?merchant_id=${encodeURIComponent(merchantId)}` : '';
  const res = await fetch(`${API_BASE}/campaigns${params}`);
  return unwrap(res, 'Failed to fetch campaigns');
}

export async function createCampaign(payload: {
  merchant_id: string;
  name: string;
  description: string;
  campaign_type: string;
  trigger_rule: Record<string, any>;
  action_benefit: Record<string, any>;
  budget_limit: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return unwrap(res, 'Failed to create campaign');
}

export async function fetchCampaignAudit(campaignId: string): Promise<{ audit_trail: any[] }> {
  const res = await fetch(`${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/audit`);
  return unwrap(res, 'Failed to fetch campaign audit');
}

// ---------------------------------------------------------------------------
// Shopper Assistant (chat) endpoints
// ---------------------------------------------------------------------------

export async function sendAgentMessage(prompt: string, conversationId?: string) {
  const res = await fetch(`${API_BASE}/a2a/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, message: prompt, conversation_id: conversationId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to communicate with Shopper Agent');
  }
  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export async function executeA2ACheckout(params: {
  items: Array<{ item_id: string; quantity: number }>;
  platform_id?: string;
  offer_code?: string;
  payment_method_preference?: 'payment_link' | 'upi_mandate';
  conversation_id: string;
}) {
  const res = await fetch(`${API_BASE}/a2a/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'A2A Checkout failed');
  }
  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export async function approveStepUp(orderId: string, supervisorReason?: string) {
  const res = await fetch(`${API_BASE}/governance/approve-step-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId, reason: supervisorReason, supervisor_reason: supervisorReason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to approve step-up');
  }
  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export async function rejectStepUp(orderId: string, supervisorReason?: string) {
  const res = await fetch(`${API_BASE}/governance/reject-step-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId, reason: supervisorReason, supervisor_reason: supervisorReason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to reject step-up');
  }
  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export async function executePaymentVerification(params: {
  order_id: string;
  method: 'upi' | 'card' | 'link';
  payment_id?: string;
  authorization_ref?: string;
}) {
  const res = await fetch(`${API_BASE}/a2a/pay-and-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Payment verification failed');
  }
  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export async function triggerDemoFailure(scenario: 'razorpay_bank_timeout' | 'swiggy_gated_safety_hold') {
  const res = await fetch(`${API_BASE}/demo/trigger-failure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to trigger failure demo');
  }
  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

// fetchRecentAuditLogs is an alias for fetchAuditLogs, kept for chat-component compatibility.
export const fetchRecentAuditLogs = fetchAuditLogs;
