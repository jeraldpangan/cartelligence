const { Pool } = require('pg');

async function test() {
  const user = 'postgres';
  const password = 'markuz12191';
  const database = 'postgres';
  const port = 5433;
  
  console.log(`Testing: user=${user}, password=****, db=${database}, port=${port}`);
  const pool = new Pool({
    host: 'localhost',
    port: port,
    user: user,
    password: password,
    database: database
  });

  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    console.log(`SUCCESS! Connected as ${user} on port ${port}. Time: ${res.rows[0].now}`);
    
    // Check if cartelligence database exists
    const dbCheck = await client.query("SELECT 1 FROM pg_database WHERE datname = 'cartelligence'");
    if (dbCheck.rows.length > 0) {
      console.log("Database 'cartelligence' exists.");
    } else {
      console.log("Database 'cartelligence' DOES NOT exist.");
    }
    
    client.release();
    await pool.end();
    return true;
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
    await pool.end();
    return false;
  }
}

test();
