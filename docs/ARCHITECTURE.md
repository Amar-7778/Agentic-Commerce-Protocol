# Architecture Blueprint: Universal Commerce Protocol

**Razorpay Buildathon — Track 1: AI Growth & Agentic Commerce**  
*Goal: "Grow the merchant's revenue, and make them sellable to AI buyers"*

---

## 1. System Vision & Objective

The **Universal Commerce Protocol** enables any merchant — regardless of business vertical (electronics retail, artisanal food delivery, on-demand professional consulting, subscription services) — to expose their products and services in a normalized, machine-readable format that **autonomous AI buyer agents** can discover, evaluate, negotiate, and transact against using Razorpay test-mode rails.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       AI BUYER AGENTS / CLIENTS                         │
│             (Claude Desktop, LangChain Agents, AutoGPT, MCP)            │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ (Universal Item Schema & Tools)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    PHASE 2 & 3: MCP & AGENT RUNTIME                     │
│               Single Unified System Prompt • Tool Execution             │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              PHASE 1: UNIVERSAL CATALOG SERVICE (STANDALONE)             │
│        • Universal Search & Filter  • Dynamic JSONB Attributes          │
│        • Inventory & Availability   • Live Schema Inspector             │
└───────────────────┬─────────────────────────────────┬───────────────────┘
                    │                                 │
     ┌──────────────┴──────────────┐   ┌──────────────┴──────────────┐
     │   PostgreSQL Database       │   │  Platform Adapter Engine    │
     │  (PGlite / Cloud Postgres)  │   │  (Bidirectional Adapters)   │
     │  • catalog_items (JSONB)    │   │  • DemoRetailAdapter        │
     │  • platforms & merchants    │   │  • FoodDeliveryAdapter      │
     │  • orders & audit_logs      │   │  • ServicesAdapter          │
     └─────────────────────────────┘   └──────────────┬──────────────┘
                                                      │
                       ┌──────────────────────────────┼──────────────────────────────┐
                       ▼                              ▼                              ▼
             [Retail ERP / Shopify]         [Food Kitchen / POS]         [Consulting / Cal.com]
```

---

## 2. Universal Adapter Architecture

Commerce platforms have vastly disparate data structures:
- **Retail:** SKUs, MRPs, warehouse inventory, tech specs (RAM, ANC, battery life).
- **Food Delivery:** Dishes, prep times, kitchen inventory portions, dietary tags, allergens, spice levels.
- **Professional Services:** Scope of work, hourly rates, meeting duration, booking slots, deliverables.

### The Adapter Pattern
Every platform implements the abstract `BasePlatformAdapter` interface:
1. `fetchNativeItems()`: Pulls native data.
2. `toUniversalItem(nativeItem)`: Normalizes native data into `UniversalItem`.
3. `fromUniversalItem(universalItem)`: Reconstructs native platform format.
4. `transformOrder(universalOrder)`: Converts a universal checkout intent into platform-native orders (ERP order, kitchen ticket, calendar slot booking).

---

## 3. Strict Architectural Constraints

1. **Only ONE System Prompt:** The system prompt resides exclusively in `server/src/agents/index.ts`. All other capabilities (searching, adapter transformations, price calculations, checkout link generation) are structured strictly as callable tools — with zero secondary prompts.
2. **Universal Generalization:** No domain-specific logic is hardcoded. Arbitrary attributes are stored in PostgreSQL `JSONB` and dynamically filtered/rendered.
3. **Production-Grade Database:** PostgreSQL with ACID compliance, JSONB GIN indexing, and immutable audit logs.
