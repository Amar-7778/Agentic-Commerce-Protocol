import { config } from '../config/index.js';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface IDatabaseClient {
  query<T = any>(queryText: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  /** Human-readable name of the active engine, for the /api/health payload. */
  describe(): string;
}

/**
 * Embedded PostgreSQL 16 compiled to WASM. Runs in-process with no external
 * service, which is what makes a one-command demo possible. Kept in memory so
 * Windows filesystem locks can't wedge a restart.
 */
class PGliteDatabaseClient implements IDatabaseClient {
  private db: any = null;
  private initPromise: Promise<void> | null = null;

  public async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const { PGlite } = await import('@electric-sql/pglite');
      this.db = new PGlite();
      await this.db.waitReady;
    })();

    return this.initPromise;
  }

  public async query<T = any>(queryText: string, params: any[] = []): Promise<QueryResult<T>> {
    await this.init();
    const result = await this.db.query(queryText, params);
    return {
      rows: (result.rows || []) as T[],
      rowCount: result.rows ? result.rows.length : result.affectedRows || 0,
    };
  }

  public async exec(sql: string): Promise<void> {
    await this.init();
    await this.db.exec(sql);
  }

  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }

  public describe(): string {
    return 'PGlite (embedded PostgreSQL 16, WASM)';
  }
}

/** Real PostgreSQL cluster, used when DATABASE_URL is set. */
class PostgresPoolDatabaseClient implements IDatabaseClient {
  private poolPromise: Promise<any> | null = null;

  constructor(private readonly connectionString: string) {}

  /** Single shared pool; the import is awaited so no query can race it. */
  private pool(): Promise<any> {
    if (!this.poolPromise) {
      this.poolPromise = import('pg').then(
        ({ default: pg }) => new pg.Pool({ connectionString: this.connectionString })
      );
    }
    return this.poolPromise;
  }

  public async query<T = any>(queryText: string, params: any[] = []): Promise<QueryResult<T>> {
    const pool = await this.pool();
    const res = await pool.query(queryText, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount || 0,
    };
  }

  public async exec(sql: string): Promise<void> {
    const pool = await this.pool();
    await pool.query(sql);
  }

  public async close(): Promise<void> {
    if (this.poolPromise) {
      const pool = await this.poolPromise;
      await pool.end();
      this.poolPromise = null;
    }
  }

  public describe(): string {
    // Never echo the connection string — it carries credentials.
    let host = 'external host';
    try {
      host = new URL(this.connectionString).host || host;
    } catch {
      /* Unparseable URL: keep the generic label rather than leaking the raw string. */
    }
    return `PostgreSQL (${host})`;
  }
}

let databaseClientInstance: IDatabaseClient | null = null;

export function getDatabaseClient(): IDatabaseClient {
  if (!databaseClientInstance) {
    const databaseUrl = config.database.url;
    if (databaseUrl) {
      console.log('🔌 [Database] Connecting to the external PostgreSQL cluster from DATABASE_URL…');
      databaseClientInstance = new PostgresPoolDatabaseClient(databaseUrl);
    } else {
      console.log('⚡ [Database] Starting the embedded PostgreSQL 16 engine (PGlite/WASM).');
      databaseClientInstance = new PGliteDatabaseClient();
    }
  }
  return databaseClientInstance;
}
