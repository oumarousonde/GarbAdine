// lib/db.js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Important pour Neon
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database Query Error:', error);
    throw error;
  }
}

export async function testConnection() {
  try {
    const res = await query('SELECT NOW()');
    return { success: true, time: res.rows[0].now };
  } catch (error) {
    return { success: false, error: error.message };
  }
}