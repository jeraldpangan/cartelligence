import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BCRYPT_COST_FACTOR = 12;

function createPool(): Pool {
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'cartelligence',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'balmondiyotmiya',
  });
}

const sellers = [
  {
    email: 'tusgabriel.8288@gmail.com',
    password: 'Markuz12191!',
    fullName: 'Gabriel Tus',
    storeName: 'Gabriel\'s Fresh Goods',
    description: 'High quality fresh goods delivered to your door.',
    products: [
      { name: 'Organic Bananas', category: 'produce', price: 120.50, unit: 'bunch', stock: 50 },
      { name: 'Fresh Strawberries', category: 'produce', price: 250.00, unit: 'pack', stock: 30 },
      { name: 'Whole Wheat Bread', category: 'snacks', price: 85.00, unit: 'loaf', stock: 20 },
    ]
  },
  {
    email: 'farmer.joe@example.com',
    password: 'password123',
    fullName: 'Joe Farmer',
    storeName: 'Farmer Joe\'s Market',
    description: 'Locally grown organic produce.',
    products: [
      { name: 'Local Tomatoes', category: 'produce', price: 90.00, unit: 'kg', stock: 100 },
      { name: 'Free Range Eggs', category: 'dairy', price: 210.00, unit: 'dozen', stock: 40 },
    ]
  },
  {
    email: 'dairy.best@example.com',
    password: 'password123',
    fullName: 'Dairy Best',
    storeName: 'Dairy Best Co.',
    description: 'The best dairy products in town.',
    products: [
      { name: 'Fresh Milk', category: 'dairy', price: 110.00, unit: 'liter', stock: 60 },
      { name: 'Cheddar Cheese', category: 'dairy', price: 180.00, unit: 'block', stock: 25 },
      { name: 'Premium Beef Steak', category: 'meat', price: 850.00, unit: 'kg', stock: 15 },
    ]
  }
];

async function seed() {
  const pool = createPool();
  
  try {
    const client = await pool.connect();
    
    for (const seller of sellers) {
      console.log(`Seeding seller: ${seller.email}`);
      const hash = await bcrypt.hash(seller.password, BCRYPT_COST_FACTOR);
      
      // Check if user exists
      const existing = await client.query('SELECT id FROM user_profile WHERE email = $1', [seller.email]);
      let userId;
      
      if (existing.rows.length > 0) {
        userId = existing.rows[0].id;
        console.log(`  User exists, updating role and password...`);
        await client.query(`UPDATE user_profile SET role = 'seller', password_hash = $1 WHERE id = $2`, [hash, userId]);
      } else {
        const insertUser = await client.query(
          `INSERT INTO user_profile (email, password_hash, full_name, delivery_address, role) 
           VALUES ($1, $2, $3, '123 Main St, City', 'seller') RETURNING id`,
          [seller.email, hash, seller.fullName]
        );
        userId = insertUser.rows[0].id;
      }
      
      // Check if seller_profile exists
      const existingProfile = await client.query('SELECT user_id FROM seller_profile WHERE user_id = $1', [userId]);
      if (existingProfile.rows.length === 0) {
        // Ensure unique store name
        await client.query(
          `INSERT INTO seller_profile (user_id, store_name, store_description) VALUES ($1, $2, $3) ON CONFLICT (store_name) DO NOTHING`,
          [userId, seller.storeName, seller.description]
        );
      }
      
      // Insert products
      for (const prod of seller.products) {
        const prodExist = await client.query('SELECT id FROM product WHERE name = $1 AND seller_id = $2', [prod.name, userId]);
        if (prodExist.rows.length === 0) {
          await client.query(
            `INSERT INTO product (name, description, category, unit_price, unit, stock_quantity, seller_id, is_available) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
            [prod.name, `Premium quality ${prod.name}`, prod.category, prod.price, prod.unit, prod.stock, userId]
          );
        }
      }
    }
    
    console.log('Done seeding sellers and products!');
    client.release();
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

seed();
