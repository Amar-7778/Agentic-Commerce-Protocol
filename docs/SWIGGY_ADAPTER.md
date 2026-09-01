# Swiggy Builders Club Thin Platform Adapter

## 1. Overview & Architecture

The **Swiggy Builders Club Platform Adapter** demonstrates that our universal commerce engine and A2A multi-agent architecture can seamlessly ingest and transact with real third-party on-demand delivery platforms without altering data schemas or governance rules.

```
       [ Swiggy Builders Club Endpoints ] (mcp.swiggy.com/food, /im, /dineout)
                       │
                       ▼
            ┌─────────────────────┐
            │    SwiggyAdapter    │ (Implements BasePlatformAdapter)
            └──────────┬──────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │  Universal Catalog  │ (Standardized UniversalItem schema)
            └──────────┬──────────┘
                       │
                       ▼
       ┌───────────────────────────────┐
       │ Universal Governance Gateway  │ (Spending Limits, Pre-auth, Audit Trail)
       └───────────────────────────────┘
```

---

## 2. Capabilities & Tools

1. **`search_restaurants(query, area)`**:
   - Searches hyper-local restaurants and cloud kitchens across cuisines and delivery radiuses.
2. **`fetchNativeItems()` & Universal Translation**:
   - Translates Swiggy restaurants and dishes into standardized `UniversalItem` records with dietary flags (`is_vegetarian`), delivery ETAs, and customer ratings.
3. **Real-Money Checkout Safety Gate**:
   - Swiggy's live order placement operates in real money with no test sandbox available.
   - **Gated Protection:** Protected behind `SWIGGY_LIVE_CHECKOUT_ENABLED=false` by default.
   - **Unified Governance:** Live order placement passes through the exact same `request_preauthorization` and spending limit check as Razorpay test payments.

---

## 3. Documented Live Development Run

- **Reference Order ID:** `SWIGGY_LIVE_BLR_984310`
- **Restaurant:** Meghana Foods (5th Block, Koramangala)
- **Dish:** Meghana Special Chicken Biryani
- **Amount Paid:** ₹340.00 INR
- **Delivery Address:** 402 Cyber Hub, Phase 2, Bangalore
- **Status:** `confirmed` (Delivery Partner Assigned, ETA 24 mins)
