import bcrypt from 'bcrypt';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function setAdminPassword() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await pool.query(
      'UPDATE admins SET password = $1 WHERE email = $2',
      [hashedPassword, 'admin@example.com']
    );
    
    console.log('✓ Admin password set to: admin123');
    console.log('  Email: admin@example.com');
  } catch (error) {
    console.error('Error setting admin password:', error);
  } finally {
    await pool.end();
  }
}

setAdminPassword();
