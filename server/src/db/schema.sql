-- Production Grade PostgreSQL Database Schema for Agentic Commerce

-- 1. Connected Platforms
CREATE TABLE IF NOT EXISTS platforms (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(64) NOT NULL,
    description TEXT,
    adapter_key VARCHAR(64) NOT NULL,
    capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Merchants Registered on Platforms
CREATE TABLE IF NOT EXISTS merchants (
    id VARCHAR(64) PRIMARY KEY,
    platform_id VARCHAR(64) REFERENCES platforms(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(128),
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Universal Catalog Items (JSONB attributes for arbitrary platform schemas)
CREATE TABLE IF NOT EXISTS catalog_items (
    id VARCHAR(128) PRIMARY KEY,
    platform_id VARCHAR(64) NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(128) NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    availability JSONB NOT NULL DEFAULT '{}'::jsonb,
    media JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    sku VARCHAR(128),
    -- Nullable on purpose: an item with no ratings from its source platform has
    -- no rating, and a default star count would be fabricated data.
    rating JSONB,
    search_vector TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalog_platform ON catalog_items(platform_id);
CREATE INDEX IF NOT EXISTS idx_catalog_merchant ON catalog_items(merchant_id);
CREATE INDEX IF NOT EXISTS idx_catalog_category ON catalog_items(category);
CREATE INDEX IF NOT EXISTS idx_catalog_price ON catalog_items(price);

-- 4. Users / AI Buyer Identities
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(128) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'buyer', -- 'buyer', 'merchant_admin', 'ai_agent'
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Orders (E-commerce, Food orders, Service bookings)
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(64) PRIMARY KEY,
    order_number VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
    platform_id VARCHAR(64) NOT NULL REFERENCES platforms(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'authorized', 'paid', 'failed', 'fulfilled', 'cancelled', 'refunded'
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    subtotal_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    applied_offer_id VARCHAR(64),
    razorpay_order_id VARCHAR(128),
    razorpay_payment_id VARCHAR(128),
    razorpay_payment_link VARCHAR(512),
    razorpay_signature VARCHAR(255),
    failure_details JSONB,
    shipping_address JSONB,
    billing_address JSONB,
    platform_order_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Order Line Items
CREATE TABLE IF NOT EXISTS order_items (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id VARCHAR(128) NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Governance: Pre-Authorizations Ledger
CREATE TABLE IF NOT EXISTS preauthorizations (
    id VARCHAR(64) PRIMARY KEY,
    action VARCHAR(64) NOT NULL, -- 'payment_link', 'upi_mandate', 'apply_offer', 'refund'
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    user_id VARCHAR(64) NOT NULL,
    merchant_id VARCHAR(64),
    order_id VARCHAR(64),
    status VARCHAR(32) NOT NULL, -- 'approved', 'denied', 'needs_human_confirmation'
    reason TEXT NOT NULL,
    reason_code VARCHAR(64) NOT NULL,
    gate_checks_passed JSONB NOT NULL DEFAULT '[]'::jsonb,
    authorization_ref VARCHAR(128) UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    spent BOOLEAN NOT NULL DEFAULT FALSE,
    spent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_preauth_ref ON preauthorizations(authorization_ref);
CREATE INDEX IF NOT EXISTS idx_preauth_user ON preauthorizations(user_id);

-- 8. Governance: Spending Limits & Velocity Caps
CREATE TABLE IF NOT EXISTS spending_limits (
    id VARCHAR(64) PRIMARY KEY,
    subject_type VARCHAR(32) NOT NULL, -- 'user', 'merchant', 'ai_agent'
    subject_id VARCHAR(64) NOT NULL,
    window_type VARCHAR(32) NOT NULL, -- 'per_transaction', 'hourly', 'daily', 'monthly'
    max_limit NUMERIC(12, 2) NOT NULL,
    current_spent NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    reset_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spending_subject ON spending_limits(subject_type, subject_id);

-- 9. Merchant Offers & Discounts
CREATE TABLE IF NOT EXISTS offers (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    merchant_id VARCHAR(64) NOT NULL,
    title VARCHAR(128) NOT NULL,
    description TEXT,
    discount_type VARCHAR(32) NOT NULL, -- 'percentage', 'fixed'
    discount_value NUMERIC(12, 2) NOT NULL,
    min_order_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    max_discount_amount NUMERIC(12, 2),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    terms TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Refunds Ledger
CREATE TABLE IF NOT EXISTS refunds (
    id VARCHAR(64) PRIMARY KEY,
    payment_id VARCHAR(128) NOT NULL,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id),
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    reason TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'processed', -- 'processed', 'pending', 'failed'
    razorpay_refund_id VARCHAR(128),
    authorization_ref VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Immutable Audit Log
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    action VARCHAR(64) NOT NULL,
    actor_type VARCHAR(32) NOT NULL, -- 'user', 'ai_buyer_agent', 'merchant_system', 'webhook', 'adapter_sync', 'governance_gateway'
    actor_id VARCHAR(64),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    reasoning TEXT,
    authorization_ref VARCHAR(128),
    gate_checks_passed JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'success',
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_type, actor_id);

-- 12. Merchant Revenue & Growth Campaigns (Campaign Orchestrator)
CREATE TABLE IF NOT EXISTS merchant_campaigns (
    id VARCHAR(64) PRIMARY KEY,
    merchant_id VARCHAR(64) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    campaign_type VARCHAR(64) NOT NULL, -- 'cart_threshold_discount', 'reorder_nudge_boost', 'upsell_bundle_boost', 'free_shipping'
    trigger_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    action_benefit JSONB NOT NULL DEFAULT '{}'::jsonb,
    budget_limit NUMERIC(12, 2) NOT NULL DEFAULT 50000.00,
    budget_spent NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active', 'paused', 'completed', 'budget_exhausted'
    governance_ref VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaign_merchant ON merchant_campaigns(merchant_id);

-- Conversations (Persistent session memory for multi-turn chat)
CREATE TABLE IF NOT EXISTS conversations (
    conversation_id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL DEFAULT 'user_alex_buyer',
    active_item_id VARCHAR(128),
    active_item_data JSONB,
    quantity INTEGER NOT NULL DEFAULT 1,
    selected_variant JSONB,
    last_platform_id VARCHAR(128),
    recent_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

