# AgenticCommerce: Multi-Platform Agentic Commerce Protocol & Governance Engine

> **Razorpay Buildathon — Track 1: AI Growth & Agentic Commerce**  
> *Architected by pairing Universal Commerce Schemas, MCP Tool Registries, A2A Multi-Agent Communication, Campaign Orchestration, and Cryptographic Policy Governance on Razorpay Rails.*

---

## 1. System Architecture Overview

AgenticCommerce provides a unified, production-ready infrastructure that enables autonomous AI buyer and merchant agents to discover, negotiate, bundle, and settle food delivery and instant-grocery (Instamart-style) commerce transactions with strict financial safety.

### 1.1 High-Level Multi-Agent Architecture

```
                                  ┌────────────────────────┐
                                  │   Human Buyer / User   │
                                  └───────────┬────────────┘
                                              │ (Natural Language Prompt / Chat)
                                              ▼
                                  ┌────────────────────────┐
                                  │     Shopper Agent      │
                                  │ (Intent & Preferences) │
                                  └───────────┬────────────┘
                                              │ A2A Message Envelope (intent_handoff)
                                              ▼
                                  ┌────────────────────────┐
                                  │    Swiggy Platform     │
                                  │  Agent (Food & Grocery)│
                                  └───────────┬────────────┘
                                              │
                                              │ A2A Catalog & Upsell Response
                                              ▼
                                  ┌────────────────────────┐
                                  │ Recommendation Service │
                                  │ (Vector Affinity Graph)│
                                  └───────────┬────────────┘
                                              │ A2A Settlement Request (settlement_request)
                                              ▼
                                  ┌────────────────────────┐
                                  │  Policy Governance Gate│ ◄─── Spending Limits & Rules
                                  │  (Pre-Authorization)  │
                                  └───────────┬────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      │ Under ₹35,000 Cap                             │ Exceeds ₹35,000
                      ▼                                               ▼
         ┌─────────────────────────┐                     ┌─────────────────────────┐
         │      Payment Agent      │                     │ Human Supervisor Step-Up│
         │  (Razorpay Test Rails)  │                     │   (Interactive Prompt)  │
         └────────────┬────────────┘                     └────────────┬────────────┘
                      │                                               │ Approved
                      │ Payment Link / UPI Mandate                    │
                      ▼                                               ▼
         ┌─────────────────────────┐                     ┌─────────────────────────┐
         │  Immutable Audit Ledger │ ◄───────────────────┤ Payment Agent Settlement│
         │   (Postgres / PGlite)   │                     └─────────────────────────┘
         └─────────────────────────┘
```

---

## 2. The 6 Tool Groups (21 Operational Tools)

Every agent interaction is powered by a standardized Model Context Protocol (MCP) server:

1. **Group 1: Catalog Tools** (`search_catalog`, `get_item`, `check_availability`)  
   Universal search across all platforms with attribute filtering and real-time inventory checks.
2. **Group 2: Revenue Growth & Recommendations** (`get_recommendations`, `get_upsell_bundle`, `get_reorder_suggestions`)  
   Dense vector embeddings and cosine similarity scoring over normalized attributes to maximize Average Order Value (AOV).
3. **Group 3: Cart & Order Tools** (`create_order`, `update_cart`, `apply_offer`)  
   Multi-platform order staging with automated GST tax computation and coupon verification.
4. **Group 4: Payment Tools** (`create_payment_link`, `create_upi_mandate`, `verify_payment`, `check_status`, `refund`)  
   Live Razorpay test mode integration with deliberate failure simulation parameters and payment verification.
5. **Group 5: Governance & Audit Tools** (`check_spending_limit`, `request_preauthorization`, `log_action`, `get_audit_trail`)  
   Velocity limit enforcement, cryptographic pre-authorization tokens, and explainable append-only audit trail logging.
6. **Group 6: Campaign Orchestrator Tools** (`create_campaign`, `list_active_campaigns`, `get_campaign_audit`)  
   Merchant-facing revenue growth toolset with pre-authorized monetary budgets and rule triggers.

---

## 3. Universal Adapter Pattern

Disparate commerce platforms differ radically in their native representations. The **Universal Adapter Pattern** (`BasePlatformAdapter`) abstracts these differences, allowing new commerce channels to be connected without modifying the governance, payment, or A2A layers:

```
Platform Raw Data (JSON / MCP Endpoints)
             │
             ▼
   [ Platform Adapter ]  <-- Implements toUniversalItem(), fromUniversalItem(), transformOrder()
             │
             ▼
   [ UniversalItem Schema ] (Title, Category, Price, Currency, JSONB Attributes, Availability, Media)
             │
             ▼
[ CatalogService & PGlite Database ]  (Shared across all Buyer Agents and Payment Rails)
```

### Connected Adapter in This System:
- **`SwiggyAdapter`**: Hyper-local food delivery (real restaurant chains — Meghana Foods, Truffles Cafe & Burgers, Behrouz Biryani, Wow! Momo, Domino's, Barbeque Nation) and Instamart-style instant grocery (real packaged-grocery brands — Amul, Britannia, Parle, Tata, Haldiram's, Maggi, Mother Dairy) integration.

The catalog is deliberately scoped to this single vertical — food delivery and instant grocery — rather than spread across unrelated verticals, so every feature (recommendations, campaigns, governance) demonstrates against one coherent, real-world commerce surface.

---

## 4. Transparent State of the Swiggy Adapter

The `SwiggyAdapter` is built as a production-grade thin adapter for Swiggy's Builders Club MCP endpoints:
- **Live MCP Endpoint Path**: Connects to `https://mcp.swiggy.com/food/restaurants` with `SWIGGY_AUTH_TOKEN`.
- **Sandbox Fallback (Evaluation Mode)**: When no live token is present or the live endpoint returns 401 Unauthorized, the adapter seamlessly falls back to its sample cloud kitchens (*Meghana Foods*, *Truffles*), ensuring zero crashes during evaluation.
- **Safety Gate Protection**: Real-money checkout execution is gated behind `SWIGGY_LIVE_CHECKOUT_ENABLED=false`. All live test transactions return a verified `gated_safety_hold` status, protecting evaluator funds while demonstrating complete order dispatch schema transformation.

---

## 5. Mapping to the Four Suggested Track 1 Angles

| Track 1 Suggested Angle | How AgenticCommerce Implements It |
| :--- | :--- |
| **1. Agent-Readable Universal Catalog** | The `UniversalItem` schema unifies diverse commerce verticals into clean JSONB attributes with vector indexing, semantic search, and availability checks. |
| **2. Conversational Checkout** | Multi-turn conversational shopping interface where Shopper and Platform Agents negotiate cart contents and delegate settlement via the A2A envelope protocol to Razorpay test payment links. |
| **3. Upsell / Cross-Sell Growth Agent** | `RecommendationService` calculates cosine similarity over the attribute graph to proactively surface high-affinity bundles before checkout, alongside replenishment reorder nudges. |
| **4. Campaign Orchestrator** | Merchant-facing campaign engine allowing merchants to launch automated cart-threshold markdowns and reorder boosts — structurally gated through policy pre-authorization before activation. |

---

## 6. Database Engineering Decision: PGlite (Embedded WASM Postgres 16)

This project uses **PGlite**, an embedded WebAssembly build of PostgreSQL 16 running in-process inside Node.js.  
- **Engineering Justification**: Chosen deliberately for turnkey, zero-setup portability during hackathon evaluation while preserving authentic PostgreSQL SQL semantics, relational foreign keys, ACID transactions, and native `JSONB` indexing (`attributes->>'brand'`).
- **Production Switch**: Easily switches to cloud-hosted PostgreSQL instances by setting `DATABASE_URL`.

---

## 7. Unified Single-App Architecture

The frontend is a single React app on one port, with a left sidebar switching between the shopper-facing chat and the merchant operations console, both hitting the unified backend API & MCP layer on `http://localhost:5000`:

```
                                  ┌───────────────────────────────┐
                                  │      AgenticCommerce Server   │
                                  │   (Port 5000: MCP + A2A + DB) │
                                  └───────────────┬───────────────┘
                                                  │
                                                  ▼
                     ┌─────────────────────────────────────────────────┐
                     │         Unified App (Port 5173)                │
                     │  Left sidebar switches between:                │
                     │  - Shopper Assistant  [PRIMARY DEMO SURFACE]    │
                     │    Full-page conversational UI, inline          │
                     │    discovery cards, proactive upsell nudges,    │
                     │    gated checkout & step-up approval, live      │
                     │    audit ledger                                 │
                     │  - Overview / Inventory / Orders / Campaigns /  │
                     │    Governance & Audit  [MERCHANT CONSOLE]       │
                     │    Revenue dashboard, catalog explorer, MCP     │
                     │    tool registry, campaign orchestrator         │
                     └─────────────────────────────────────────────────┘
```

### Installation & Execution
```bash
# 1. Start the Server (Database, MCP Tools, A2A Protocol, Payment Rails)
cd server
npm install
npm run build
npx tsx src/index.ts

# 2. Start the unified app (Port 5173)
cd ../client
npm install
npm run dev
```

---

## 8. Complete Demo Script (Judge Walkthrough)

### Step 1: Open the App
Navigate to `http://localhost:5173` in your browser. The **Shopper Assistant** is the default landing view in the left sidebar — this is the AI Buyer experience.

### Step 2: Test Varied Natural Language Inputs
1. **Clean Purchase Intent**:
   - Send: `"I want a chicken biryani under 400 rupees"`
   - *Agent Action*: Normalizes intent, executes vector search across the Swiggy catalog, returns **Meghana Special Chicken Biryani**, and proactively recommends a complementary dish via vector affinity.
2. **Ambiguous / Incomplete Request**:
   - Send: `"something quick for dinner"`
   - *Agent Action*: Senses ambiguity, surfaces curated food categories, and asks **one clarifying question** to narrow down cuisine/budget rather than failing silently.
3. **Off-Topic / Chit-Chat Handling**:
   - Send: `"what's the weather like today?"`
   - *Agent Action*: Responds gracefully in-character as an autonomous procurement agent and re-orients toward commerce without crashing.

### Step 3: Test Autonomous Settlement (< ₹35,000)
- Click **"Instant Checkout"** on a food or Instamart item.
- The agent automatically checks spending limits, acquires cryptographic pre-authorization, contacts Razorpay test rails, and outputs an active payment link.
- Expand the **Live Audit Ledger** sidebar to view the underlying A2A message trace (`intent_handoff` ➔ `catalog_response` ➔ `settlement_request` ➔ `settlement_response`).

### Step 4: Test High-Value Step-Up Governance (> ₹35,000)
- Add multiple high-value grocery/food items to push a cart total above ₹35,000, then check out.
- Because the amount exceeds the autonomous threshold, the **Amber Human Supervisor Step-Up Card** appears directly in the chat.
- Click **"Approve & Authorize"** to issue the cryptographic supervisor override and unlock the Razorpay checkout link.

### Step 5: Test Deliberate Failure Resiliency
- From the **Governance & Audit** sidebar section, open the **Failure & Recovery Demo** tab and run it. Watch the agent diagnose a simulated bank gateway timeout and autonomously execute a resilience fallback to a **UPI AutoPay Mandate**.

### Step 6: Verify Backend Data in the Merchant Console
- Click **Overview** in the sidebar for the live revenue dashboard.
- Click **Campaigns** to inspect merchant budget utilization or launch a new campaign.
- Click **Governance & Audit** to view the live MCP tool registry, execution metrics, and full audit ledger.

