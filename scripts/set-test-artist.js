import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function setTestArtist() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const hashedPassword = await bcrypt.hash('testpass123', 10);
    
    // Upsert test artist with approved status
    await pool.query(`
      INSERT INTO artists (
        email,
        password,
        name,
        artist_short,
        approved,
        referral_code
      ) VALUES (
        $1, $2, $3, $4, $5, $6
      )
      ON CONFLICT (email) DO UPDATE SET
        password = EXCLUDED.password,
        approved = EXCLUDED.approved
    `, [
      'testartist@example.com',
      hashedPassword,
      'Test Artist',
      'TA',
      true,
      'ARTIST-TEST01'
    ]);
    
    console.log('✓ Test artist account ready');
    console.log('  Email: testartist@example.com');
    console.log('  Password: testpass123');
    console.log('  Status: Approved');
  } catch (error) {
    console.error('Error setting test artist:', error);
  } finally {
    await pool.end();
  }
}

setTestArtist();
