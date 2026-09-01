import dotenv from 'dotenv';

dotenv.config();

/**
 * Single source of truth for every tunable value in the system.
 *
 * Nothing in `src/` should read `process.env` directly or inline a business
 * constant. If a number or URL matters, it is named here, typed here, and
 * documented in `.env.example`.
 */

class ConfigError extends Error {
  constructor(message: string) {
    super(`[Config] ${message}`);
    this.name = 'ConfigError';
  }
}

function str(key: string, fallback: string): string {
  const raw = process.env[key];
  return raw !== undefined && raw.trim() !== '' ? raw.trim() : fallback;
}

function optionalStr(key: string): string | null {
  const raw = process.env[key];
  return raw !== undefined && raw.trim() !== '' ? raw.trim() : null;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new ConfigError(`${key} must be a finite number, received "${raw}".`);
  }
  return parsed;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  throw new ConfigError(`${key} must be a boolean-like value, received "${raw}".`);
}

function list(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function numList(key: string, fallback: number[]): number[] {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.split(',').map((entry) => {
    const parsed = Number(entry.trim());
    if (!Number.isFinite(parsed)) {
      throw new ConfigError(`${key} must be a comma-separated list of numbers, received "${raw}".`);
    }
    return parsed;
  });
}

const nodeEnv = str('NODE_ENV', 'development');

export const config = {
  env: nodeEnv,
  isProduction: nodeEnv === 'production',

  server: {
    port: num('PORT', 5000),
    /** `*` allows any origin. Set a comma-separated list to lock this down. */
    corsOrigins: list('CORS_ORIGINS', ['*']),
  },

  database: {
    /** When empty the embedded PGlite WASM engine is used instead. */
    url: optionalStr('DATABASE_URL'),
  },

  commerce: {
    defaultCurrency: str('DEFAULT_CURRENCY', 'INR'),
    /** GST fraction, e.g. 0.18 for 18%. Drives every tax figure in the system. */
    taxRate: num('TAX_RATE', 0.18),
    /** Identity used when a request carries no explicit user. Demo convenience only. */
    demoUserId: str('DEMO_USER_ID', 'user_alex_buyer'),
    /** Fulfilment tier handed to a platform when the order does not name one. */
    defaultDispatchPriority: str('DEFAULT_DISPATCH_PRIORITY', 'standard'),
  },

  governance: {
    /** Above this amount an autonomous agent must get human step-up approval. */
    autonomousStepUpThreshold: num('GOV_AUTONOMOUS_STEP_UP_THRESHOLD', 35000),
    /** Absolute per-transaction ceiling. Never overridable by a supervisor. */
    hardPerTransactionCeiling: num('GOV_HARD_PER_TRANSACTION_CEILING', 50000),
    /** Applied when a subject has no row in `spending_limits`. */
    defaultSpendCap: num('GOV_DEFAULT_SPEND_CAP', 100000),
    /** Highest markdown a merchant agent may launch without human review. */
    maxDiscountPercentage: num('GOV_MAX_DISCOUNT_PERCENTAGE', 40),
    /** Minutes a pending human step-up request stays actionable. */
    stepUpPendingTtlMinutes: num('GOV_STEP_UP_PENDING_TTL_MINUTES', 30),
    /** Minutes an issued single-use authorization token stays valid. */
    authorizationTokenTtlMinutes: num('GOV_AUTH_TOKEN_TTL_MINUTES', 15),
    /**
     * Fractional tolerance when comparing a spend against its authorized
     * amount, e.g. 0.02 permits a 2% overshoot for rounding and shipping drift.
     */
    amountTolerance: num('GOV_AMOUNT_TOLERANCE', 0.02),
  },

  razorpay: {
    keyId: optionalStr('RAZORPAY_KEY_ID'),
    keySecret: optionalStr('RAZORPAY_KEY_SECRET'),
    apiBaseUrl: str('RAZORPAY_API_BASE_URL', 'https://api.razorpay.com/v1'),
    /** Hours a generated payment link stays valid. */
    paymentLinkTtlHours: num('RAZORPAY_PAYMENT_LINK_TTL_HOURS', 24),
    /**
     * When false the service never touches the live Razorpay API and answers
     * from the deterministic test-rail simulator instead. Independent of the
     * key prefix so a live key alone can't cause real network calls.
     */
    liveApiEnabled: bool('RAZORPAY_LIVE_API_ENABLED', false),
  },

  swiggy: {
    authToken: optionalStr('SWIGGY_AUTH_TOKEN'),
    mcpBaseUrl: str('SWIGGY_MCP_BASE_URL', 'https://mcp.swiggy.com'),
    /** Guards real-money Swiggy checkout. Keep false during evaluation. */
    liveCheckoutEnabled: bool('SWIGGY_LIVE_CHECKOUT_ENABLED', false),
    requestTimeoutMs: num('SWIGGY_REQUEST_TIMEOUT_MS', 8000),
  },

  llm: {
    apiKey: optionalStr('GROQ_API_KEY'),
    /**
     * Must be a model Groq currently serves *and* that supports tool calling.
     * Verify with: GET https://api.groq.com/openai/v1/models
     * The llama-3.x families this project originally targeted have been retired.
     */
    model: str('GROQ_MODEL', 'openai/gpt-oss-120b'),
    timeoutMs: num('GROQ_TIMEOUT_MS', 10000),
    temperature: num('GROQ_TEMPERATURE', 0.3),
    maxTokens: num('GROQ_MAX_TOKENS', 1024),
    /** Tool-calling loop bound. Prevents an unbounded agent spiral. */
    maxToolTurns: num('GROQ_MAX_TOOL_TURNS', 4),
    /** How many prior messages are replayed for multi-turn context. */
    historyWindow: num('GROQ_HISTORY_WINDOW', 4),
  },

  recommendations: {
    /** Default result count for catalog/recommendation queries. */
    defaultLimit: num('RECOMMENDATION_DEFAULT_LIMIT', 6),
    upsellLimit: num('RECOMMENDATION_UPSELL_LIMIT', 4),
    reorderLookback: num('RECOMMENDATION_REORDER_LOOKBACK', 5),
    /** Max items the conversational agent surfaces in one turn. */
    conversationalResultLimit: num('CONVERSATIONAL_RESULT_LIMIT', 3),
    /** Paid orders read back when building a user's affinity profile. */
    orderHistoryWindow: num('RECOMMENDATION_ORDER_HISTORY_WINDOW', 10),
    /** Nearest-neighbour pool sampled before upsell items are filtered down. */
    upsellCandidatePool: num('RECOMMENDATION_UPSELL_CANDIDATE_POOL', 12),
  },

  catalog: {
    /** Result count when a catalog query omits an explicit limit. */
    searchDefaultLimit: num('CATALOG_SEARCH_DEFAULT_LIMIT', 20),
    /** Items pulled into the in-memory vector index when it is hydrated. */
    vectorIndexSize: num('CATALOG_VECTOR_INDEX_SIZE', 200),
    /** Dimensionality of the TF-IDF feature space. */
    vectorDimension: num('CATALOG_VECTOR_DIMENSION', 256),
    /**
     * Exclusive upper bounds for the price tiers used as ranking features.
     * Three bounds produce four tiers: budget / midrange / premium / flagship.
     */
    priceTierBounds: numList('CATALOG_PRICE_TIER_BOUNDS', [1000, 10000, 40000]),
    /**
     * Units at or below which an adapter reports `low_stock` instead of
     * `in_stock`. Physical goods and perishable kitchen portions run at
     * different depths, so each has its own threshold.
     */
    lowStockThresholdUnits: num('CATALOG_LOW_STOCK_THRESHOLD_UNITS', 10),
    lowStockThresholdPortions: num('CATALOG_LOW_STOCK_THRESHOLD_PORTIONS', 5),
  },

  campaigns: {
    /** Monetary ceiling applied when a campaign is created without one. */
    defaultBudgetLimit: num('CAMPAIGN_DEFAULT_BUDGET_LIMIT', 25000),
  },

  chat: {
    /** Item attributes rendered in a conversational answer before truncating. */
    attributeDisplayLimit: num('CHAT_ATTRIBUTE_DISPLAY_LIMIT', 5),
    /** Choices offered when a shopper's request is too broad to answer directly. */
    intentOptionLimit: num('CHAT_INTENT_OPTION_LIMIT', 4),
    /** Past orders inspected when detecting repeat-purchase intent. */
    reorderCheckWindow: num('CHAT_REORDER_CHECK_WINDOW', 5),
  },
} as const;

/**
 * Currency formatting for user-facing copy. Whole amounts print without a
 * fractional part because "₹24,999.00" reads like a spreadsheet, not a chat.
 */
export function formatMoney(amount: number, currency: string = config.commerce.defaultCurrency): string {
  const hasFraction = Math.abs(amount % 1) > 0.005;
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown ISO code — show the number with the code rather than throwing.
    return `${currency} ${amount.toLocaleString(locale)}`;
  }
}

/** Multiplier form of the tax rate, e.g. 1.18 for an 18% GST. */
export const taxMultiplier = (): number => 1 + config.commerce.taxRate;

/** Splits a tax-inclusive total into its subtotal and tax parts. */
export function splitTaxInclusive(total: number): { subtotal: number; tax: number } {
  const subtotal = total / taxMultiplier();
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round((total - subtotal) * 100) / 100,
  };
}

/** Adds tax on top of a pre-tax subtotal. */
export function applyTax(subtotal: number): { tax: number; total: number } {
  const tax = Math.round(subtotal * config.commerce.taxRate * 100) / 100;
  return { tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

/** Tax rate as a display percentage, e.g. "18". */
export const taxRatePercentLabel = (): string => {
  const pct = config.commerce.taxRate * 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2);
};

const PRICE_TIER_NAMES = ['budget', 'midrange', 'premium', 'flagship'] as const;

/**
 * Buckets a price into a named tier using the configured bounds. Used as a
 * ranking feature so "cheap" and "flagship" queries land in the right band.
 */
export function priceTierLabel(price: number): string {
  const bounds = config.catalog.priceTierBounds;
  for (let i = 0; i < bounds.length; i++) {
    if (price < bounds[i]) {
      return PRICE_TIER_NAMES[Math.min(i, PRICE_TIER_NAMES.length - 1)];
    }
  }
  return PRICE_TIER_NAMES[PRICE_TIER_NAMES.length - 1];
}

/**
 * Razorpay credentials are considered test-mode when the key id carries the
 * `rzp_test_` prefix. An absent key is treated as test mode because no live
 * call can be made without one.
 */
export function isRazorpayTestMode(): boolean {
  const keyId = config.razorpay.keyId;
  if (!keyId) return true;
  return !keyId.startsWith('rzp_live_');
}

/** True only when a live network call to Razorpay is both possible and permitted. */
export function canCallRazorpayLiveApi(): boolean {
  return Boolean(
    config.razorpay.liveApiEnabled && config.razorpay.keyId && config.razorpay.keySecret
  );
}

/**
 * Validates cross-field invariants at boot and returns human-readable warnings
 * for risky-but-legal setups. Throws only on genuinely contradictory config.
 */
export function validateConfig(): string[] {
  const warnings: string[] = [];

  if (config.commerce.taxRate < 0 || config.commerce.taxRate >= 1) {
    throw new ConfigError(`TAX_RATE must be a fraction between 0 and 1, received ${config.commerce.taxRate}.`);
  }

  if (config.governance.autonomousStepUpThreshold > config.governance.hardPerTransactionCeiling) {
    throw new ConfigError(
      `GOV_AUTONOMOUS_STEP_UP_THRESHOLD (${config.governance.autonomousStepUpThreshold}) cannot exceed ` +
        `GOV_HARD_PER_TRANSACTION_CEILING (${config.governance.hardPerTransactionCeiling}) — ` +
        `no amount would ever be approvable via step-up.`
    );
  }

  if (config.governance.maxDiscountPercentage < 0 || config.governance.maxDiscountPercentage > 100) {
    throw new ConfigError(
      `GOV_MAX_DISCOUNT_PERCENTAGE must be between 0 and 100, received ${config.governance.maxDiscountPercentage}.`
    );
  }

  const bounds = config.catalog.priceTierBounds;
  if (bounds.length === 0) {
    throw new ConfigError('CATALOG_PRICE_TIER_BOUNDS must contain at least one bound.');
  }
  for (let i = 1; i < bounds.length; i++) {
    if (bounds[i] <= bounds[i - 1]) {
      throw new ConfigError(
        `CATALOG_PRICE_TIER_BOUNDS must be strictly ascending, received [${bounds.join(', ')}].`
      );
    }
  }

  if (config.razorpay.keyId && !config.razorpay.keySecret) {
    warnings.push('RAZORPAY_KEY_ID is set but RAZORPAY_KEY_SECRET is missing — signature verification is disabled.');
  }

  if (!isRazorpayTestMode() && config.razorpay.liveApiEnabled) {
    warnings.push(
      'LIVE Razorpay credentials are active with RAZORPAY_LIVE_API_ENABLED=true — real payment links will be created.'
    );
  }

  if (!config.llm.apiKey) {
    warnings.push('GROQ_API_KEY not set — the conversational agent will use the deterministic catalog engine.');
  }

  if (config.swiggy.liveCheckoutEnabled) {
    warnings.push('SWIGGY_LIVE_CHECKOUT_ENABLED=true — Swiggy orders will attempt real dispatch.');
  }

  if (config.isProduction && config.server.corsOrigins.includes('*')) {
    warnings.push('CORS_ORIGINS is "*" in production — set an explicit allowlist.');
  }

  return warnings;
}
