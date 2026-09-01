async function runAudit() {
  console.log('================ PART C.1: ITEM COUNT CONSISTENCY ================');
  const statsBefore = await fetch('http://localhost:5000/api/stats').then(r => r.json());
  console.log(`Live /api/stats count BEFORE ingestion: ${statsBefore.data.totalItems}`);

  // Perform dynamic ingestion of a new retail item
  const payload = {
    platform_id: 'platform_retail_demo',
    raw_payload: {
      sku_code: 'RET-INGEST-AUDIT-99',
      product_name: 'Dynamic CyberDeck Terminal (Ingestion Probe)',
      product_summary: 'Modular portable cyberdeck with mechanical keyboard and 7.9-inch touchscreen display.',
      dept: 'Computers & Terminals',
      cost: { listing_price: 49999.00, mrp: 54999.00, curr: 'INR' },
      stock_info: { units_in_warehouse: 5, state: 'available', restock_eta_days: 0 },
      tech_specs: { brand: 'CyberForge', battery: '10000mAh', os: 'Linux 6.8' },
      gallery: [{ media_url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b', is_cover: true, label: 'Front' }],
      keywords: ['cyberdeck', 'terminal', 'mechanical-keyboard']
    }
  };

  const ingestRes = await fetch('http://localhost:5000/api/catalog/simulate-ingestion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json());
  console.log(`Simulate Ingestion Response: success=${ingestRes.success}, item="${ingestRes.data?.universalItem?.title}" (${ingestRes.data?.universalItem?.id})`);

  const statsAfter = await fetch('http://localhost:5000/api/stats').then(r => r.json());
  console.log(`Live /api/stats count AFTER ingestion: ${statsAfter.data.totalItems} (Difference: +${statsAfter.data.totalItems - statsBefore.data.totalItems})`);

  console.log('\n================ PART D.2: TWO-TIER SPENDING POLICY REAL ENFORCEMENT ================');

  // Helper to execute MCP tool via API
  const callMcp = async (name: string, args: Record<string, any>) => {
    const res = await fetch('http://localhost:5000/api/mcp/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args })
    }).then(r => r.json());
    return res;
  };

  // Create a clean user ID for isolated limit testing
  const testUserId = `user_audit_policy_${Date.now()}`;

  // 1. Below step-up threshold (< ₹35,000) e.g. ₹20,000
  console.log('1. Testing Amount BELOW step-up threshold (₹20,000):');
  const res1 = await callMcp('request_preauthorization', {
    action: 'payment_link',
    amount: 20000,
    reason: 'Legitimate autonomous purchase under step-up threshold',
    user_id: testUserId
  });
  console.log(`   Status: "${res1.data?.status}" | Approved: ${res1.data?.approved} | Auth Ref: "${res1.data?.authorization_ref}" | Message: "${res1.data?.message}"`);

  // 2. Between step-up threshold (~₹35,000) and hard limit (~₹50,000) e.g. ₹42,000
  console.log('\n2. Testing Amount BETWEEN step-up threshold & hard limit (₹42,000):');
  const res2 = await callMcp('request_preauthorization', {
    action: 'payment_link',
    amount: 42000,
    reason: 'High-value transaction requiring human buyer confirmation',
    user_id: testUserId
  });
  console.log(`   Status: "${res2.data?.status}" | Approved: ${res2.data?.approved} | Auth Ref: ${res2.data?.authorization_ref} | Message: "${res2.data?.message}"`);

  // 3. Above hard limit (> ₹50,000 tx limit) e.g. ₹85,000 on user_alex_buyer who has a ₹50,000 per_tx rule
  console.log('\n3. Testing Amount ABOVE hard limit (₹85,000):');
  const res3 = await callMcp('request_preauthorization', {
    action: 'payment_link',
    amount: 85000,
    reason: 'Autonomous transaction exceeding hard per-transaction limit',
    user_id: 'user_alex_buyer'
  });
  console.log(`   Status: "${res3.data?.status}" | Approved: ${res3.data?.approved} | Auth Ref: ${res3.data?.authorization_ref} | Message: "${res3.data?.message}"`);

  // 4. Create an order to attempt bypass on create_payment_link
  const orderRes = await callMcp('create_order', {
    items: [{ item_id: 'item_ret_ret_el_001', quantity: 1 }],
    user_id: 'user_alex_buyer'
  });
  const orderId = orderRes.data.id;
  console.log(`\nCreated test order for bypass attempts: ${orderId} (Amount: ₹${orderRes.data.total_amount})`);

  // Case 2 bypass attempt (using undefined token from case 2)
  console.log('   a) Attempting create_payment_link with Case 2 (token returned: undefined):');
  const bypass2 = await callMcp('create_payment_link', {
    order_id: orderId,
    authorization_ref: res2.data?.authorization_ref || ''
  });
  console.log(`      Success: ${bypass2.success} | Blocked: ${!bypass2.success} | Error: "${bypass2.error}"`);

  // Case 3 bypass attempt (using fabricated token)
  console.log('   b) Attempting create_payment_link with fabricated token string:');
  const bypass3 = await callMcp('create_payment_link', {
    order_id: orderId,
    authorization_ref: 'auth_ref_fabricated_token_12345'
  });
  console.log(`      Success: ${bypass3.success} | Blocked: ${!bypass3.success} | Error: "${bypass3.error}"`);
}

runAudit().catch(console.error);
