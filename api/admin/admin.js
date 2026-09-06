// api/admin/create-admin.js - TEMPORAIRE (à supprimer après usage)
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Hacher le mot de passe AUTOMATIQUEMENT
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insérer ou mettre à jour l'admin
    const result = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, subscription_end_date, created_at)
      VALUES ('Administrateur', $1, $2, 'admin', NOW() + INTERVAL '10 years', NOW())
      ON CONFLICT (email) 
      DO UPDATE SET password_hash = $2
      RETURNING id, email, role
    `, [email, hashedPassword]);

    return res.status(200).json({
      success: true,
      message: `Admin créé/mis à jour avec succès ! Email: ${email}, MDP: ${password}`,
      user: result.rows[0]
    });

  } catch (err) {
    console.error('CREATE ADMIN ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};