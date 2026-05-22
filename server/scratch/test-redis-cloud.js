const Redis = require('ioredis');

async function test() {
  const url = 'redis://default:XJC0gyiVbXllgaiQepk5DsvA9dornHLM@canorous-citrus-spellbinding-73390.db.redis.io:15393';
  console.log(`Testing connection to Redis Cloud: ${url.split('@')[1]}`);
  
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000
  });

  try {
    await redis.set('test-key', 'hello from antigravity');
    const val = await redis.get('test-key');
    console.log(`SUCCESS! Value for 'test-key': ${val}`);
    await redis.quit();
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
    process.exit(1);
  }
}

test();
