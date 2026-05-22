import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'cartelligence',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function run() {
  console.log('Connecting to PostgreSQL database...');
  const client = await pool.connect();
  
  try {
    // 1. Check if babies_toys already exists in pg_enum
    console.log("Checking if 'babies_toys' value exists in product_category enum...");
    const enumCheck = await client.query(`
      SELECT e.enumlabel 
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid 
      WHERE t.typname = 'product_category' AND e.enumlabel = 'babies_toys'
    `);
    
    if (enumCheck.rows.length === 0) {
      console.log("Adding 'babies_toys' value to product_category enum...");
      // ALTER TYPE ADD VALUE cannot run inside a transaction, so we execute it directly
      await client.query(`ALTER TYPE product_category ADD VALUE 'babies_toys'`);
      console.log("✓ Successfully added 'babies_toys' to product_category enum.");
    } else {
      console.log("'babies_toys' enum value already exists. Skipping ALTER TYPE.");
    }
    
    // 2. Create the SQL migration file so the migration tracking is robust
    const migrationsDir = path.join(__dirname, '..', 'src', 'database', 'migrations');
    const migrationFilename = '017_add_babies_category.sql';
    const migrationFilePath = path.join(migrationsDir, migrationFilename);
    
    const migrationSql = `-- Migration: 017_add_babies_category
-- Description: Add babies_toys category to product_category enum
-- Applied manually or as part of migrations.

SELECT 1;
`;
    
    if (!fs.existsSync(migrationFilePath)) {
      fs.writeFileSync(migrationFilePath, migrationSql, 'utf-8');
      console.log(`✓ Created migration file: ${migrationFilename}`);
    }
    
    // 3. Mark the migration as applied in schema_migration
    await client.query(`
      INSERT INTO schema_migration (filename) 
      VALUES ($1)
      ON CONFLICT (filename) DO NOTHING
    `, [migrationFilename]);
    console.log("✓ Marked migration 017_add_babies_category as applied in the database.");
    
    // 4. Seed Baby and Toy products into the database
    console.log("Seeding sample baby and toy products...");
    const productsSeed = [
      { name: 'Baby Wipes (Sensitive, 80 Sheets)', category: 'babies_toys', unitPrice: 95.00, unit: 'per pack', stockQuantity: 120, description: 'Alcohol-free, ultra-soft baby wipes for sensitive skin', isAvailable: true },
      { name: 'Baby Diapers (Medium, 30pcs)', category: 'babies_toys', unitPrice: 285.00, unit: 'per pack', stockQuantity: 90, description: 'Super absorbent leak-guard baby diapers', isAvailable: true },
      { name: 'Organic Baby Food (Pureed Apple, 120g)', category: 'babies_toys', unitPrice: 75.00, unit: 'per jar', stockQuantity: 150, description: '100% organic apple puree baby food', isAvailable: true },
      { name: 'Plush Teddy Bear (Soft Toy)', category: 'babies_toys', unitPrice: 380.00, unit: 'per piece', stockQuantity: 40, description: 'Hypoallergenic ultra-plush cuddle teddy bear', isAvailable: true },
      { name: 'Wooden Sorting Block Toy', category: 'babies_toys', unitPrice: 450.00, unit: 'per set', stockQuantity: 30, description: 'Eco-friendly wooden shape sorting activity block set', isAvailable: true },
      { name: 'Baby Body Wash & Shampoo (200ml)', category: 'babies_toys', unitPrice: 195.00, unit: 'per bottle', stockQuantity: 75, description: 'Tear-free, hypoallergenic body wash and shampoo', isAvailable: true }
    ];
    
    for (const p of productsSeed) {
      const checkProduct = await client.query('SELECT id FROM product WHERE name = $1', [p.name]);
      if (checkProduct.rows.length === 0) {
        await client.query(
          `INSERT INTO product (name, category, unit_price, unit, stock_quantity, description, is_available) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [p.name, p.category, p.unitPrice, p.unit, p.stockQuantity, p.description, p.isAvailable]
        );
        console.log(`  + Seeded product: ${p.name}`);
      } else {
        console.log(`  Product already exists: ${p.name}`);
      }
    }
    
    console.log('\n✓ Seeding and DB migration completed successfully!');
  } catch (error) {
    console.error('Error during migration run:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
