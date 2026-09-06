// api/test-db.js - VERSION COMMONJS (Identique à login.js)
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Ajout CRITIQUE pour Neon
});

module.exports = async function handler(req, res) {
  try {
    const result = await pool.query('SELECT NOW() as now');
    
    res.status(200).json({ 
      success: true, 
      message: 'Connexion Neon réussie !', 
      time: result.rows[0].now 
    });
  } catch (error) {
    console.error('DB TEST ERROR:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};