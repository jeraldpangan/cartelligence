const { Pool } = require('pg');

async function test() {
  const user = 'postgres';
  const password = 'markuz12191';
  const database = 'cartelligence';
  const port = 5433;
  
  console.log(`Testing connection to ${database}: user=${user}, password=****, port=${port}`);
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
    console.log(`SUCCESS! Connected to ${database} as ${user}.`);
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
