import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

function createPool(): Pool {
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'cartelligence',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'balmondiyotmiya',
  });
}

async function run() {
  const pool = createPool();
  try {
    const client = await pool.connect();
    
    // 1. Delete all reviews to start fresh
    console.log('Deleting all existing reviews...');
    const delRes = await client.query(`DELETE FROM product_review RETURNING id`);
    console.log(`Deleted ${delRes.rowCount} reviews.`);
    
    // 1.5 Create 5 dummy buyers if they don't exist
    for (let i = 1; i <= 5; i++) {
      const email = `dummybuyer${i}@example.com`;
      await client.query(`
        INSERT INTO user_profile (email, password_hash, full_name, delivery_address, role)
        VALUES ($1, 'hash', 'Dummy Buyer ${i}', '123 Dummy St', 'buyer')
        ON CONFLICT DO NOTHING
      `, [email]);
    }
    
    // 2. Fetch buyers
    const buyersRes = await client.query(`SELECT id FROM user_profile WHERE role = 'buyer' LIMIT 20`);
    const buyers = buyersRes.rows.map(r => r.id);
    
    if (buyers.length === 0) {
      console.log('No buyers found!');
      return;
    }
    
    // 3. Fetch products
    const productsRes = await client.query(`SELECT id FROM product LIMIT 15`);
    const products = productsRes.rows.map(r => r.id);
    
    if (products.length === 0) {
      console.log('No products found!');
      return;
    }
    
    // 4. Insert dummy reviews (Positive and Negative)
    console.log('Inserting seed reviews...');
    const positiveComments = [
      "Great product! Highly recommend it to everyone.",
      "Good quality for the price, quite satisfied.",
      "Arrived quickly and exactly as described online.",
      "Will definitely buy again, amazing experience.",
      "My family absolutely loves this product so much.",
      "Fresh and delicious, very good quality overall.",
      "Very satisfied with this purchase, works well.",
      "A staple in my kitchen now, use it all the time.",
      "Incredible value for the money, completely amazing.",
      "Excellent customer service and top notch product."
    ];
    
    const negativeComments = [
      "Terrible quality, completely broke after one use.",
      "Very disappointed. Does not look like the pictures.",
      "Arrived late and the packaging was completely damaged.",
      "Overpriced for what it is. I would not buy again.",
      "Taste is awful, had to throw the entire thing away.",
      "Customer service was rude and the product is bad.",
      "Defective item out of the box, utterly useless.",
      "Smells weird and feels very cheap, do not recommend."
    ];
    
    let count = 0;
    for (const pId of products) {
      // For each product, insert 3 to 6 reviews
      const numReviews = Math.floor(Math.random() * 4) + 3;
      // Shuffle buyers
      const shuffledBuyers = [...buyers].sort(() => 0.5 - Math.random());
      const selectedBuyers = shuffledBuyers.slice(0, numReviews);
      
      for (const bId of selectedBuyers) {
        // 60% chance positive, 40% chance negative
        const isPositive = Math.random() < 0.6;
        
        let rating, comment;
        if (isPositive) {
          rating = Math.floor(Math.random() * 2) + 4; // 4 or 5
          comment = positiveComments[Math.floor(Math.random() * positiveComments.length)];
        } else {
          rating = Math.floor(Math.random() * 2) + 1; // 1 or 2
          comment = negativeComments[Math.floor(Math.random() * negativeComments.length)];
        }
        
        try {
          await client.query(
            `INSERT INTO product_review (product_id, user_id, rating, comment) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [pId, bId, rating, comment]
          );
          count++;
        } catch (e) {
          console.error('Error inserting review:', (e as Error).message);
        }
      }
    }
    
    console.log(`Inserted ${count} reviews (mix of positive and negative).`);
    client.release();
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
