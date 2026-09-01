import { getDatabaseClient } from '../connection.js';

export interface AuditLogEntry {
  id?: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_type: 'user' | 'ai_buyer_agent' | 'merchant_system' | 'webhook' | 'adapter_sync' | 'governance_gateway';
  actor_id?: string;
  reasoning?: string;
  authorization_ref?: string;
  gate_checks_passed?: string[];
  status?: 'success' | 'failed' | 'blocked';
  payload?: Record<string, any>;
  ip_address?: string;
}

export class AuditLogRepository {
  private static instance: AuditLogRepository;

  public static getInstance(): AuditLogRepository {
    if (!AuditLogRepository.instance) {
      AuditLogRepository.instance = new AuditLogRepository();
    }
    return AuditLogRepository.instance;
  }

  public async record(entry: AuditLogEntry): Promise<void> {
    const db = getDatabaseClient();
    const id = entry.id || `aud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const sql = `
      INSERT INTO audit_logs (
        id, entity_type, entity_id, action, actor_type, actor_id,
        reasoning, authorization_ref, gate_checks_passed, status,
        payload, ip_address, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
    `;

    await db.query(sql, [
      id,
      entry.entity_type,
      entry.entity_id,
      entry.action,
      entry.actor_type,
      entry.actor_id || 'system',
      entry.reasoning || null,
      entry.authorization_ref || null,
      JSON.stringify(entry.gate_checks_passed || []),
      entry.status || 'success',
      JSON.stringify(entry.payload || {}),
      entry.ip_address || '127.0.0.1',
    ]);
  }

  public async getRecentLogs(limit: number = 30): Promise<any[]> {
    const db = getDatabaseClient();
    const res = await db.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [limit]);
    return res.rows.map((row) => ({
      ...row,
      gate_checks_passed: typeof row.gate_checks_passed === 'string' ? JSON.parse(row.gate_checks_passed) : (row.gate_checks_passed || []),
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }));
  }
}
