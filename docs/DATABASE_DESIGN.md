# Production-Grade Database Design

This project uses **PGlite**, an embedded WASM build of Postgres 16, running in-process rather than as a standalone server — chosen as a deliberate engineering decision for zero-setup portability while preserving full Postgres SQL syntax, ACID transactions, relational foreign keys, and advanced JSONB querying and indexing.

## Selection & Justification: **PostgreSQL (Embedded PGlite Engine + External Cluster Support)**

For Track 1: AI Growth & Agentic Commerce, **PostgreSQL** was chosen over document-only or embedded SQLite databases for the following core architectural reasons:

1. **Dual-Mode Engine (Embedded PGlite WASM + External PostgreSQL):**  
   - **Local / Evaluation Mode:** Uses `@electric-sql/pglite` (an official in-process PostgreSQL 16 WASM engine running inside Node.js, storing WAL and relational tables in `./data/postgres-pglite/`). This guarantees turnkey, zero-config setup without requiring an external PostgreSQL daemon or container setup.
   - **Production Mode:** Seamlessly switches to standard PostgreSQL server instances and cloud clusters via `DATABASE_URL` with connection pooling (`pg.Pool`).
2. **JSONB with Indexing for Universal Attributes:**  
   The `catalog_items` table stores domain-specific specs (driver size for headphones, allergens for food, booking durations for services) in a `JSONB` column. PostgreSQL allows indexing and high-performance querying inside JSON structures (`attributes->>'brand' = 'AuraSound'`).
3. **ACID Financial Integrity for Commerce & Razorpay:**  
   Order processing and webhook idempotency require strict transactions. PostgreSQL guarantees atomic operations for inventory reservations and payments.
4. **Hybrid Search Ready (FTS + Vector Embeddings):**  
   PostgreSQL provides full-text search (`tsvector`/`tsquery`) and straightforward pgvector integration for semantic AI search.
5. **Immutable Audit Ledger:**  
   Every transaction intent, policy pre-authorization, and catalog sync is recorded in an append-only `audit_logs` table.

---

## Entity Relationship Overview

```
 ┌──────────────────────┐         ┌──────────────────────┐
 │      platforms       │         │      merchants       │
 │──────────────────────│         │──────────────────────│
 │ id (PK)              │1       *│ id (PK)              │
 │ name                 ├─────────┤ platform_id (FK)     │
 │ type                 │         │ name                 │
 │ adapter_key          │         │ currency             │
 │ capabilities (JSONB) │         │ settings (JSONB)     │
 └──────────┬───────────┘         └──────────┬───────────┘
            │ 1                              │ 1
            │                                │
            │ *                              │ *
 ┌──────────┴────────────────────────────────┴───────────┐
 │                    catalog_items                      │
 │───────────────────────────────────────────────────────│
 │ id (PK)                                               │
 │ platform_id (FK -> platforms.id)                      │
 │ merchant_id (FK -> merchants.id)                      │
 │ title, description, category                          │
 │ price (NUMERIC), currency (VARCHAR)                   │
 │ attributes (JSONB), availability (JSONB)              │
 │ media (JSONB), tags (JSONB), rating (JSONB)           │
 │ search_vector (TEXT)                                  │
 └──────────────────────────┬────────────────────────────┘
                            │ 1
                            │
                            │ *
 ┌──────────────────────────┴────────────────────────────┐
 │                     order_items                       │
 │───────────────────────────────────────────────────────│
 │ id (PK), order_id (FK -> orders.id)                   │
 │ item_id (FK -> catalog_items.id)                      │
 │ title, quantity, unit_price, currency                 │
 └──────────────────────────┬────────────────────────────┘
                            │ *
                            │ 1
 ┌──────────────────────────┴────────────────────────────┐
 │                        orders                         │
 │───────────────────────────────────────────────────────│
 │ id (PK), order_number (UNIQUE)                        │
 │ user_id (FK -> users.id)                              │
 │ merchant_id (FK -> merchants.id)                      │
 │ platform_id (FK -> platforms.id)                      │
 │ status, currency, subtotal, tax, discount, total      │
 │ razorpay_order_id, razorpay_payment_id                │
 │ razorpay_payment_link, razorpay_signature             │
 │ failure_details (JSONB)                               │
 └───────────────────────────────────────────────────────┘
```
