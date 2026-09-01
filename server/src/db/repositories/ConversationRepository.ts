import { getDatabaseClient } from '../connection.js';

export interface ConversationSession {
  conversation_id: string;
  user_id: string;
  active_item_id: string | null;
  active_item_data: any | null;
  quantity: number;
  selected_variant: { attribute: string; value: string } | null;
  last_platform_id: string | null;
  recent_history: Array<{ role: 'user' | 'assistant'; text: string }>;
  updated_at?: string;
}

/**
 * Persists conversation session state to PostgreSQL so multi-turn context
 * survives server restarts and scales across instances.
 */
export class ConversationRepository {
  private static instance: ConversationRepository;

  public static getInstance(): ConversationRepository {
    if (!ConversationRepository.instance) {
      ConversationRepository.instance = new ConversationRepository();
    }
    return ConversationRepository.instance;
  }

  /**
   * Ensure the conversations table exists. Called during migration.
   */
  public async ensureTable(): Promise<void> {
    const db = getDatabaseClient();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        conversation_id VARCHAR(128) PRIMARY KEY,
        user_id VARCHAR(128) NOT NULL DEFAULT 'user_alex_buyer',
        active_item_id VARCHAR(128),
        active_item_data JSONB,
        quantity INTEGER NOT NULL DEFAULT 1,
        selected_variant JSONB,
        last_platform_id VARCHAR(128),
        recent_history JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  /**
   * Load a session. Returns null if the conversation has no saved state.
   */
  public async getSession(conversationId: string): Promise<ConversationSession | null> {
    const db = getDatabaseClient();
    const res = await db.query(
      'SELECT * FROM conversations WHERE conversation_id = $1',
      [conversationId]
    );

    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    return {
      conversation_id: row.conversation_id,
      user_id: row.user_id,
      active_item_id: row.active_item_id,
      active_item_data: typeof row.active_item_data === 'string'
        ? JSON.parse(row.active_item_data)
        : row.active_item_data,
      quantity: row.quantity || 1,
      selected_variant: typeof row.selected_variant === 'string'
        ? JSON.parse(row.selected_variant)
        : row.selected_variant,
      last_platform_id: row.last_platform_id,
      recent_history: typeof row.recent_history === 'string'
        ? JSON.parse(row.recent_history)
        : (row.recent_history || []),
      updated_at: row.updated_at,
    };
  }

  /**
   * Create or update a conversation session.
   */
  public async upsertSession(session: ConversationSession): Promise<void> {
    const db = getDatabaseClient();
    await db.query(
      `INSERT INTO conversations (
        conversation_id, user_id, active_item_id, active_item_data,
        quantity, selected_variant, last_platform_id, recent_history,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (conversation_id) DO UPDATE SET
        active_item_id = EXCLUDED.active_item_id,
        active_item_data = EXCLUDED.active_item_data,
        quantity = EXCLUDED.quantity,
        selected_variant = EXCLUDED.selected_variant,
        last_platform_id = EXCLUDED.last_platform_id,
        recent_history = EXCLUDED.recent_history,
        updated_at = CURRENT_TIMESTAMP`,
      [
        session.conversation_id,
        session.user_id,
        session.active_item_id,
        JSON.stringify(session.active_item_data),
        session.quantity,
        JSON.stringify(session.selected_variant),
        session.last_platform_id,
        JSON.stringify(session.recent_history),
      ]
    );
  }
}
