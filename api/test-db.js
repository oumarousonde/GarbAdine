// api/test-db.js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(req, res) {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    
    res.status(200).json({ 
      success: true, 
      message: 'Connexion Neon réussie !', 
      time: result.rows[0].now 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}