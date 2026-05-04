import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const { Pool } = pg;

async function testDbConnection() {
  console.log('Attempting to connect to the database...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Loaded' : 'Not Loaded');

  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL is not set.');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    const client = await pool.connect();
    console.log('Successfully connected to the database!');
    const res = await client.query('SELECT NOW()');
    console.log('Query successful:', res.rows[0]);
    client.release();
  } catch (error) {
    console.error('Failed to connect to the database:', error);
  } finally {
    await pool.end();
    console.log('Connection pool closed.');
  }
}

testDbConnection();
