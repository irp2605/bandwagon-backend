import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const connectionString = isTest
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;

const pool = new pg.Pool({
  connectionString: connectionString,
});

async function getPgVersion() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT version()');
    console.log(result.rows[0]);
  } finally {
    client.release();
  }
}

export default pool;
