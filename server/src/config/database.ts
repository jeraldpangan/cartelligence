import { Pool, PoolConfig } from 'pg';

const DB_MAX_RETRIES = 3;
const DB_RETRY_INTERVAL_MS = 2000;
const DB_QUERY_TIMEOUT_MS = 5000;

/**
 * Creates and configures a PostgreSQL connection pool.
 */
export function createDatabasePool(): Pool {
  let config: PoolConfig;

  // If DATABASE_URL is provided, use it directly (connection string takes priority)
  if (process.env.DATABASE_URL) {
    config = {
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: DB_QUERY_TIMEOUT_MS,
      statement_timeout: DB_QUERY_TIMEOUT_MS,
    };
  } else {
    config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'cartelligence',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: DB_QUERY_TIMEOUT_MS,
      statement_timeout: DB_QUERY_TIMEOUT_MS,
    };
  }

  const pool = new Pool(config);

  pool.on('error', (err) => {
    console.error('Database: unexpected pool error', err.message);
  });

  return pool;
}

/**
 * Attempts to connect to the database with retry logic.
 * Retries up to 3 times with 2-second intervals.
 * Returns the pool if successful, throws after all retries exhausted.
 */
export async function connectWithRetry(pool: Pool): Promise<Pool> {
  for (let attempt = 1; attempt <= DB_MAX_RETRIES; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log('Database: connected successfully');
      return pool;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `Database: connection attempt ${attempt}/${DB_MAX_RETRIES} failed - ${message}`,
      );

      if (attempt < DB_MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, DB_RETRY_INTERVAL_MS),
        );
      }
    }
  }

  throw new Error(
    'Database: all connection retries exhausted. Service unavailable.',
  );
}

let dbPool: Pool | null = null;

/**
 * Returns the singleton database pool instance.
 */
export function getDatabasePool(): Pool {
  if (!dbPool) {
    dbPool = createDatabasePool();
  }
  return dbPool;
}

/**
 * Closes the database pool gracefully.
 */
export async function closeDatabasePool(): Promise<void> {
  if (dbPool) {
    await dbPool.end();
    dbPool = null;
  }
}

export { DB_MAX_RETRIES, DB_RETRY_INTERVAL_MS, DB_QUERY_TIMEOUT_MS };
