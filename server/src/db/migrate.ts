import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabaseClient } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const db = getDatabaseClient();
  let schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql');
  }
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  console.log('📦 [Migration] Applying PostgreSQL Schema...');
  await db.exec(schemaSql);

  // Column alter statements to gracefully upgrade existing Phase 1 tables
  const upgradeSql = `
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS applied_offer_id VARCHAR(64);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_link VARCHAR(512);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS failure_details JSONB;

    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reasoning TEXT;
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS authorization_ref VARCHAR(128);
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS gate_checks_passed JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'success';

    CREATE INDEX IF NOT EXISTS idx_audit_auth_ref ON audit_logs(authorization_ref);
  `;

  await db.exec(upgradeSql);

  // Persistent conversation sessions table (Phase 5: agentic pipeline)
  const { ConversationRepository } = await import('./repositories/ConversationRepository.js');
  await ConversationRepository.getInstance().ensureTable();

  console.log('✅ [Migration] PostgreSQL tables, columns, indexes, and constraints applied successfully.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('Migration complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
