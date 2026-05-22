import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Creates a PostgreSQL connection pool using environment variables.
 */
function createPool(): Pool {
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'cartelligence',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'balmondiyotmiya',
  });
}

/**
 * Ensures the schema_migration tracking table exists.
 */
async function ensureMigrationTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Gets the list of already-applied migration filenames.
 */
async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query('SELECT filename FROM schema_migration ORDER BY filename');
  return new Set(result.rows.map((row: { filename: string }) => row.filename));
}

/**
 * Gets all migration SQL files sorted by filename.
 */
function getMigrationFiles(): string[] {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Runs all pending migrations in order within transactions.
 */
async function runMigrations(): Promise<void> {
  const pool = createPool();

  try {
    await ensureMigrationTable(pool);
    const applied = await getAppliedMigrations(pool);
    const migrationFiles = getMigrationFiles();

    const pending = migrationFiles.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Found ${pending.length} pending migration(s):`);

    for (const filename of pending) {
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf-8');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migration (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log(`  ✓ Applied: ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`  ✗ Failed: ${filename}`);
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(`\nAll ${pending.length} migration(s) applied successfully.`);
  } finally {
    await pool.end();
  }
}

/**
 * Rolls back the last applied migration (removes tracking entry only).
 * The actual rollback SQL must be handled manually or via down migrations.
 */
async function rollbackLast(): Promise<void> {
  const pool = createPool();

  try {
    await ensureMigrationTable(pool);
    const result = await pool.query(
      'SELECT filename FROM schema_migration ORDER BY applied_at DESC LIMIT 1',
    );

    if (result.rows.length === 0) {
      console.log('No migrations to roll back.');
      return;
    }

    const filename = result.rows[0].filename;
    await pool.query('DELETE FROM schema_migration WHERE filename = $1', [filename]);
    console.log(`Rolled back tracking for: ${filename}`);
    console.log('Note: You must manually reverse the SQL changes or use a down migration.');
  } finally {
    await pool.end();
  }
}

/**
 * Shows the current migration status.
 */
async function showStatus(): Promise<void> {
  const pool = createPool();

  try {
    await ensureMigrationTable(pool);
    const applied = await getAppliedMigrations(pool);
    const migrationFiles = getMigrationFiles();

    console.log('Migration Status:');
    console.log('─'.repeat(60));

    for (const filename of migrationFiles) {
      const status = applied.has(filename) ? '✓' : '○';
      console.log(`  ${status} ${filename}`);
    }

    const pending = migrationFiles.filter((f) => !applied.has(f));
    console.log('─'.repeat(60));
    console.log(`Total: ${migrationFiles.length} | Applied: ${applied.size} | Pending: ${pending.length}`);
  } finally {
    await pool.end();
  }
}

// CLI entry point
const command = process.argv[2] || 'up';

switch (command) {
  case 'up':
    runMigrations().catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
    break;
  case 'rollback':
    rollbackLast().catch((err) => {
      console.error('Rollback failed:', err.message);
      process.exit(1);
    });
    break;
  case 'status':
    showStatus().catch((err) => {
      console.error('Status check failed:', err.message);
      process.exit(1);
    });
    break;
  default:
    console.log('Usage: ts-node migrate.ts [up|rollback|status]');
    console.log('  up       - Run all pending migrations (default)');
    console.log('  rollback - Roll back the last migration');
    console.log('  status   - Show migration status');
    process.exit(0);
}

export { createPool, runMigrations, rollbackLast, showStatus };
