# A2A (Agent-to-Agent) Multi-Agent Architecture & Protocol Specification

## 1. Executive Summary

In Track 1: AI Growth & Agentic Commerce, commerce interactions require decentralized discovery, platform-specific catalog expertise, and centralized financial governance.

To solve this, we separate **MCP (Agent-to-Tool)** from **A2A (Agent-to-Agent)**:

| Protocol | Scope | Standard | Message Examples |
|---|---|---|---|
| **MCP** | Agent-to-Tool | JSON-RPC 2.0 | `search_catalog()`, `get_upsell_bundle()`, `create_payment_link()` |
| **A2A** | Agent-to-Agent | A2A-1.0 Envelopes | `intent_handoff`, `catalog_response`, `settlement_request` |

---

## 2. The Three Agent Roles

```
               [ Human Buyer / Autonomous Procure Bot ]
                                  │
                                  ▼
                        ┌──────────────────┐
                        │  Shopper Agent   │ 
                        └─────────┬────────┘
                                  │
                                  │ A2A: intent_handoff
                                  ▼
                        ┌──────────────────┐
                        │  Platform Agent  │ (Retail / Food / Consulting / Swiggy)
                        └─────────┬────────┘
                                  │
                                  │ A2A: settlement_request
                                  ▼
                        ┌──────────────────┐
                        │  Payment Agent   │ (Centralized Governance & Money Actions)
                        └─────────┬────────┘
                                  │
                                  │ MCP: request_preauthorization + create_payment_link
                                  ▼
                      [ Razorpay Test-Mode Rails ]
```

### 1. Shopper Agent
- Represents the user/buyer intent and budget constraints.
- Maintains user preferences (e.g. preferred delivery speed, currency).
- Determines which connected platform merchant can fulfill the user's intent.
- Delegates to the appropriate Platform Agent via `intent_handoff`.

### 2. Platform Agent(s)
- Represents a specific platform or merchant (e.g. Swiggy food delivery, Instamart grocery).
- Owns catalog querying and vector similarity ranking.
- **Proactive Revenue Engine:** Automatically generates complementary upsell bundles (`get_upsell_bundle`) mid-conversation before checkout.
- Formulates the order and delegates checkout to the central Payment Agent.

### 3. Payment Agent
- Central authority owning all payment tools (`request_preauthorization`, `check_spending_limit`, `create_payment_link`, `create_upi_mandate`, `verify_payment`, `refund`).
- Enforces the universal governance gate and two-tier spending limits:
  - `< ₹35,000`: Autonomous approval.
  - `₹35,000 – ₹50,000`: `needs_human_confirmation` (Supervisor step-up).
  - `> ₹50,000`: `denied` (Hard limit).
- Returns the verifiable Razorpay test-mode payment link and records the immutable audit trail.

---

## 3. Strict Single System Prompt Architecture

Across all agents, there is **strictly ONE unified system prompt** located in [`server/src/agents/index.ts`](file:///d:/Academic%20Projects/Razor%20Pay/server/src/agents/index.ts). Agent specialization is achieved purely through tool access boundaries, role configurations, and A2A state-machine envelopes with zero secondary prompts.
