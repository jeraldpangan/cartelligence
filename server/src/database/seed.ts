import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const SEEDS_DIR = path.join(__dirname, 'seeds');

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
 * Gets all seed SQL files sorted by filename.
 */
function getSeedFiles(): string[] {
  if (!fs.existsSync(SEEDS_DIR)) {
    return [];
  }
  const files = fs.readdirSync(SEEDS_DIR);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Runs all seed files in order.
 */
async function runSeeds(): Promise<void> {
  const pool = createPool();

  try {
    const seedFiles = getSeedFiles();

    if (seedFiles.length === 0) {
      console.log('No seed files found.');
      return;
    }

    console.log(`Found ${seedFiles.length} seed file(s):`);

    for (const filename of seedFiles) {
      const filePath = path.join(SEEDS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf-8');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`  ✓ Seeded: ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`  ✗ Failed: ${filename}`);
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(`\nAll ${seedFiles.length} seed(s) applied successfully.`);
  } finally {
    await pool.end();
  }
}

// CLI entry point
runSeeds().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});

export { runSeeds };
