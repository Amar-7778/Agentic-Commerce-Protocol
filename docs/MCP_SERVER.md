# Model Context Protocol (MCP) Server Specification

**Protocol Version:** `2024-11-05` (JSON-RPC 2.0)  
**Supported Transports:** `stdio` (CLI/Claude Desktop), `http_jsonrpc` (REST/SSE)  
**Total Exposed Tools:** 15

---

## 1. Tool Groups Overview

### Group 1: Catalog Tools (Universal Discovery)
| Tool Name | Parameters | Return Type | Description |
|---|---|---|---|
| `search_catalog` | `query, category, platform_id, min_price, max_price, availability_status, sort_by, limit` | `CatalogSearchResult` | Semantic and attribute search across all connected platforms & merchants. |
| `get_item` | `item_id` | `UniversalItem` | Retrieve complete item schema, specs, real-time inventory, and media. |
| `check_availability` | `item_id, quantity` | `AvailabilityCheck` | Verify warehouse inventory, kitchen portions, or service slots. |

### Group 2: Cart & Order Tools (Platform-Agnostic)
| Tool Name | Parameters | Return Type | Description |
|---|---|---|---|
| `create_order` | `items[], user_id, shipping_address` | `Order` | Initializes multi-item order, calculates 18% GST and totals in INR. |
| `update_cart` | `order_id, changes` | `Order` | Modifies line items and recalculates totals. |
| `apply_offer` | `order_id, offer_code, authorization_ref` | `Order` | Applies merchant coupon markdown (**Structurally Gated**). |

### Group 3: Payment Tools (Razorpay Test Mode)
| Tool Name | Parameters | Return Type | Description |
|---|---|---|---|
| `create_payment_link` | `order_id, authorization_ref, simulate_failure` | `PaymentLink` | Issues Razorpay test payment link (**Structurally Gated**). |
| `create_upi_mandate` | `order_id, frequency, max_amount, authorization_ref` | `UpiMandate` | Sets up automated recurring UPI AutoPay (**Structurally Gated**). |
| `verify_payment` | `order_id, payment_id, signature, authorization_ref` | `PaymentStatus` | Verifies HMAC signature & transitions order to `paid` (**Structurally Gated**). |
| `check_status` | `order_id` | `StatusDiagnosis` | Natural-language diagnosis of payment and fulfillment state. |
| `refund` | `order_id, payment_id, amount, reason, authorization_ref` | `RefundStatus` | Processes partial or full test-mode refund (**Structurally Gated**). |

### Group 4: Governance & Audit Tools
| Tool Name | Parameters | Return Type | Description |
|---|---|---|---|
| `check_spending_limit` | `subject_id, amount, window` | `LimitCheck` | Queries user/agent budgets and velocity caps. |
| `request_preauthorization` | `action, amount, reason, user_id, order_id` | `PreauthResult` | Issues single-use signed `authorization_ref` or requires human confirmation. |
| `log_action` | `actor, action_type, target, reasoning, status` | `LogConfirmation` | Writes immutable audit log record with NL explanation. |
| `get_audit_trail` | `order_id` | `AuditTrail` | Returns complete chronological explainable audit trail. |

---

## 2. Connecting via Claude Desktop (Stdio)

Add this configuration to your Claude Desktop configuration file (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agentic-commerce": {
      "command": "npx",
      "args": ["tsx", "src/mcp/cli.ts"],
      "cwd": "d:/Academic Projects/Razor Pay/server"
    }
  }
}
```
