// api/admin/admin.js - Bootstrap : crée OU réinitialise le compte admin
// À utiliser une seule fois (ou pour récupérer l'accès si mot de passe perdu).
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      INSERT INTO users (name, email, phone, password_hash, role, subscription_end_date, created_at)
      VALUES ('Administrateur', $1, $2, $3, 'admin', NOW() + INTERVAL '10 years', NOW())
      ON CONFLICT (email)
      DO UPDATE SET password_hash = $3, phone = COALESCE($2, users.phone)
      RETURNING id, email, phone, role
    `, [email, phone || null, hashedPassword]);

    return res.status(200).json({
      success: true,
      message: `Admin créé/mis à jour avec succès ! Email: ${email}`,
      user: result.rows[0]
    });

  } catch (err) {
    console.error('CREATE ADMIN ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
