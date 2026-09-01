import React, { useState, useEffect } from 'react';
import {
  Play,
  ShieldAlert,
  Terminal,
  RefreshCw,
  CheckCircle,
  Lock,
  Zap,
} from 'lucide-react';

const DEFAULT_TOOL_ARGS: Record<string, any> = {
  search_catalog: { query: 'biryani', max_price: 500 },
  get_item: { item_id: 'item_swiggy_meghana_biryani_01' },
  check_availability: { item_id: 'item_swiggy_meghana_biryani_01', quantity: 2 },
  create_order: {
    items: [{ item_id: 'item_swiggy_meghana_biryani_01', quantity: 1 }],
    user_id: 'user_alex_buyer',
    shipping_address: { city: 'Bangalore', pincode: '560103' },
  },
  check_spending_limit: { subject_id: 'user_alex_buyer', amount: 500, window: 'daily' },
  request_preauthorization: {
    action: 'payment_link',
    amount: 340.0,
    reason: 'Autonomous AI buyer checkout for biryani order.',
    user_id: 'user_alex_buyer',
  },
  create_payment_link: {
    order_id: 'ord_sample',
    authorization_ref: 'auth_ref_payment_link_sample',
  },
  check_status: { order_id: 'ord_sample' },
  get_audit_trail: { order_id: 'ord_sample' },
};

export const GovernancePage: React.FC = () => {
  const [tools, setTools] = useState<any[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>('search_catalog');
  const [toolArgsText, setToolArgsText] = useState<string>(
    JSON.stringify(DEFAULT_TOOL_ARGS['search_catalog'] || {}, null, 2)
  );
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Failure Simulation Demo State
  const [demoRunning, setDemoRunning] = useState<boolean>(false);
  const [demoSteps, setDemoSteps] = useState<Array<{ step: string; status: 'pending' | 'success' | 'failed'; detail?: any }>>([]);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'tool_runner' | 'failure_demo' | 'audit_ledger'>('tool_runner');

  // Audit Logs Feed
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/mcp/tools')
      .then((res) => res.json())
      .then((data) => {
        if (data.tools) setTools(data.tools);
      })
      .catch((e) => console.error(e));

    loadAuditLogs();
  }, []);

  const loadAuditLogs = () => {
    fetch('/api/audit-logs')
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setAuditLogs(data.data);
      })
      .catch((e) => console.error(e));
  };

  const handleToolSelect = (toolName: string) => {
    setSelectedTool(toolName);
    setToolArgsText(JSON.stringify(DEFAULT_TOOL_ARGS[toolName] || {}, null, 2));
    setExecutionResult(null);
    setError(null);
  };

  const handleExecuteTool = async () => {
    try {
      setLoading(true);
      setError(null);
      const parsedArgs = toolArgsText ? JSON.parse(toolArgsText) : {};

      const res = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedTool,
          arguments: parsedArgs,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Tool execution failed');
      }
      setExecutionResult(json.data);
      loadAuditLogs();
    } catch (err: any) {
      setError(err.message);
      setExecutionResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Run Deliberate Failure Simulation & Autonomous Recovery
  const runFailureRecoveryDemo = async () => {
    setDemoRunning(true);
    setDemoSteps([]);

    const addStep = (step: string, status: 'pending' | 'success' | 'failed', detail?: any) => {
      setDemoSteps((prev) => [...prev, { step, status, detail }]);
    };

    try {
      // Step 1: Create Order
      addStep('1. Creating order with Truffles Cafe Burger...', 'pending');
      const orderRes = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'create_order',
          arguments: {
            items: [{ item_id: 'item_swiggy_all_american_burger_03', quantity: 1 }],
            user_id: 'user_alex_buyer',
          },
        }),
      }).then((r) => r.json());
      const order = orderRes.data;
      addStep('1. Order Created', 'success', `Order ${order.order_number} (Total: ₹${order.total_amount})`);

      // Step 2: Request Pre-Authorization
      addStep('2. Requesting policy pre-authorization from Governance Gateway...', 'pending');
      const preauthRes = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'request_preauthorization',
          arguments: {
            action: 'payment_link',
            amount: order.total_amount,
            reason: 'Dinner order autonomous procurement',
            user_id: 'user_alex_buyer',
            order_id: order.id,
          },
        }),
      }).then((r) => r.json());
      const preauth = preauthRes.data;
      addStep('2. Pre-Authorization Approved', 'success', `Auth Ref: ${preauth.authorization_ref}`);

      // Step 3: Trigger Deliberate Payment Failure (Bank Gateway Timeout)
      addStep('3. Triggering payment link with deliberate BANK_TIMEOUT failure simulation...', 'pending');
      const paymentRes = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'create_payment_link',
          arguments: {
            order_id: order.id,
            authorization_ref: preauth.authorization_ref,
            simulate_failure: 'bank_timeout',
          },
        }),
      }).then((r) => r.json());
      addStep('3. Payment Attempt Failed (Simulated)', 'failed', paymentRes.data.failure_details);

      // Step 4: Autonomous Diagnosis via check_status
      addStep('4. Autonomous Agent inspecting order state & diagnosing failure...', 'pending');
      const statusRes = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'check_status',
          arguments: { order_id: order.id },
        }),
      }).then((r) => r.json());
      const diagnosis = statusRes.data;
      addStep('4. Agent Diagnosis Complete', 'success', {
        diagnosis: diagnosis.natural_language_diagnosis,
        suggested_action: diagnosis.suggested_next_action,
      });

      // Step 5: Autonomous Recovery -> Request Step-Up Preauth for UPI Mandate
      addStep('5. Initiating autonomous fallback to UPI AutoPay Mandate...', 'pending');
      const recoveryPreauthRes = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'request_preauthorization',
          arguments: {
            action: 'upi_mandate',
            amount: order.total_amount,
            reason: 'Autonomous recovery: switching payment rail from timed out card gateway to UPI Mandate',
            user_id: 'user_alex_buyer',
            order_id: order.id,
          },
        }),
      }).then((r) => r.json());
      const recoveryPreauth = recoveryPreauthRes.data;

      // Step 6: Issue UPI Mandate
      const mandateRes = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'create_upi_mandate',
          arguments: {
            order_id: order.id,
            frequency: 'as_presented',
            max_amount: order.total_amount,
            authorization_ref: recoveryPreauth.authorization_ref,
          },
        }),
      }).then((r) => r.json());
      addStep('5. Autonomous Recovery Successful!', 'success', {
        mandate_id: mandateRes.data.id,
        auth_link: mandateRes.data.auth_link,
      });

      // Step 7: Fetch Complete Audit Trail
      const trailRes = await fetch(`/api/governance/audit-trail/${order.id}`).then((r) => r.json());
      addStep('6. Complete Explainable Audit Trail Extracted', 'success', trailRes.data);
      loadAuditLogs();
    } catch (err: any) {
      addStep('Error during demo', 'failed', err.message);
    } finally {
      setDemoRunning(false);
    }
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, #D96B43 0%, #B8502B 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Terminal size={18} color="#FFFFFF" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  MCP Server & Governance Gateway
                </h3>
                <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>
                  JSON-RPC 2.0
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Structurally gated pre-authorizations · Razorpay test rails · explainable audit ledger
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Tab Controls */}
            <div style={{ display: 'flex', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', padding: 2, border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setActiveTab('tool_runner')}
                style={{
                  padding: '5px 12px',
                  fontSize: '0.75rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: activeTab === 'tool_runner' ? 'var(--accent-terracotta)' : 'transparent',
                  color: activeTab === 'tool_runner' ? '#FFFFFF' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                MCP Tool Runner
              </button>
              <button
                onClick={() => setActiveTab('failure_demo')}
                style={{
                  padding: '5px 12px',
                  fontSize: '0.75rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: activeTab === 'failure_demo' ? 'var(--accent-terracotta)' : 'transparent',
                  color: activeTab === 'failure_demo' ? '#FFFFFF' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Zap size={12} />
                Failure & Recovery Demo
              </button>
              <button
                onClick={() => setActiveTab('audit_ledger')}
                style={{
                  padding: '5px 12px',
                  fontSize: '0.75rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: activeTab === 'audit_ledger' ? 'var(--accent-terracotta)' : 'transparent',
                  color: activeTab === 'audit_ledger' ? '#FFFFFF' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Audit Trail ({auditLogs.length})
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* TAB 1: TOOL RUNNER */}
          {activeTab === 'tool_runner' && (
            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
              {/* Left Column: Tool Selector */}
              <div style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                maxHeight: '68vh',
                overflowY: 'auto',
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, padding: '0 4px' }}>
                  Available MCP Tools
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {tools.map((t) => {
                    const isSelected = selectedTool === t.name;
                    const isGated = ['create_payment_link', 'create_upi_mandate', 'apply_offer', 'refund'].includes(t.name);
                    return (
                      <button
                        key={t.name}
                        onClick={() => handleToolSelect(t.name)}
                        style={{
                          textAlign: 'left',
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid',
                          borderColor: isSelected ? 'var(--accent-terracotta)' : 'transparent',
                          background: isSelected ? 'rgba(217, 107, 67, 0.15)' : 'transparent',
                          color: isSelected ? 'var(--accent-terracotta)' : 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{t.name}</span>
                        {isGated && (
                          <span title="Structurally Gated (requires authorization_ref)">
                            <Lock size={12} color="var(--accent-amber)" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Argument Editor & Execution Result */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Tool Description & Gated Warning */}
                {tools.find((t) => t.name === selectedTool) && (
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                  }}>
                    <strong>{selectedTool}</strong>: {tools.find((t) => t.name === selectedTool)?.description}
                  </div>
                )}

                {/* Arguments Editor */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      JSON Arguments:
                    </label>
                    <button
                      onClick={handleExecuteTool}
                      disabled={loading}
                      className="btn btn-primary btn-sm"
                      style={{ padding: '6px 14px' }}
                    >
                      {loading ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
                      <span>Execute Tool</span>
                    </button>
                  </div>
                  <textarea
                    rows={6}
                    value={toolArgsText}
                    onChange={(e) => setToolArgsText(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.825rem',
                      padding: '12px',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Error Output */}
                {error && (
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(244, 63, 94, 0.1)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    color: 'var(--accent-rose)',
                    fontSize: '0.825rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    <ShieldAlert size={16} />
                    <div>
                      <strong>Execution Blocked / Error:</strong> {error}
                    </div>
                  </div>
                )}

                {/* Success Output */}
                {executionResult && (
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-emerald)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle size={14} />
                      <span>Response Output (JSON-RPC Result):</span>
                    </div>
                    <div className="code-box" style={{ maxHeight: 280, overflowY: 'auto' }}>
                      <pre>{JSON.stringify(executionResult, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DELIBERATE FAILURE & AUTONOMOUS RECOVERY DEMO */}
          {activeTab === 'failure_demo' && (
            <div>
              <div style={{
                background: 'rgba(217, 107, 67, 0.08)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                marginBottom: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}>
                <div>
                  <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                    Deliberate Resilience & Autonomous Recovery Path
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: 640 }}>
                    Simulates a test-mode payment gateway failure (bank timeout). The autonomous agent detects it via
                    <code>check_status</code>, explains the failure in plain language, requests pre-authorization for a fallback,
                    and issues a UPI AutoPay recurring mandate — all logged in the audit ledger.
                  </p>
                </div>

                <button
                  onClick={runFailureRecoveryDemo}
                  disabled={demoRunning}
                  className="btn btn-primary"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {demoRunning ? (
                    <>
                      <RefreshCw size={15} className="spin" />
                      <span>Simulating...</span>
                    </>
                  ) : (
                    <>
                      <Play size={15} />
                      <span>Run Failure & Recovery Demo</span>
                    </>
                  )}
                </button>
              </div>

              {/* Demo Steps Stream */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {demoSteps.map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-canvas)',
                      border: '1px solid',
                      borderColor:
                        s.status === 'success'
                          ? 'rgba(16, 185, 129, 0.3)'
                          : s.status === 'failed'
                          ? 'rgba(244, 63, 94, 0.3)'
                          : 'var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color:
                          s.status === 'success'
                            ? 'var(--accent-emerald)'
                            : s.status === 'failed'
                            ? 'var(--accent-rose)'
                            : 'var(--text-secondary)',
                      }}>
                        {s.step}
                      </span>
                      <span className={`badge ${s.status === 'success' ? 'badge-emerald' : s.status === 'failed' ? 'badge-amber' : ''}`}>
                        {s.status.toUpperCase()}
                      </span>
                    </div>

                    {s.detail && (
                      <div className="code-box" style={{ marginTop: 6, fontSize: '0.75rem' }}>
                        <pre>{typeof s.detail === 'object' ? JSON.stringify(s.detail, null, 2) : String(s.detail)}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: AUDIT LEDGER */}
          {activeTab === 'audit_ledger' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Chronological, immutable audit ledger of all autonomous actions, gate validations, and payment links:
                </span>
                <button onClick={loadAuditLogs} className="btn btn-glass btn-sm">
                  <RefreshCw size={13} />
                  <span>Refresh</span>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '65vh', overflowY: 'auto' }}>
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="badge badge-terracotta" style={{ fontSize: '0.7rem' }}>
                          {log.actor_type}
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {log.action}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Target: {log.entity_id}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                    </div>

                    {log.reasoning && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8, fontStyle: 'italic' }}>
                        "{log.reasoning}"
                      </p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: '0.725rem' }}>
                      {log.authorization_ref && (
                        <span style={{ color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>
                          Auth Ref: {log.authorization_ref}
                        </span>
                      )}
                      {log.gate_checks_passed && log.gate_checks_passed.length > 0 && (
                        <span style={{ color: 'var(--accent-emerald)' }}>
                          Gate Checks: [{log.gate_checks_passed.join(', ')}]
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

    </div>
  );
};
