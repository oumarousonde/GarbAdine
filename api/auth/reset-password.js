const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { phone, secretAnswer, newPassword } = req.body;
    if (!phone || !secretAnswer || !newPassword) {
      return res.status(400).json({ error: 'Champs manquants' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
    }

    const result = await pool.query(
      `SELECT id, secret_answer FROM users WHERE phone = $1 AND role = 'dg'`,
      [phone]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Compte introuvable' });

    const user = result.rows[0];
    if (!user.secret_answer) {
      return res.status(400).json({ error: "Aucune question de sécurité définie pour ce compte." });
    }

    const match = await bcrypt.compare(String(secretAnswer).trim().toLowerCase(), user.secret_answer);
    if (!match) return res.status(401).json({ error: 'Réponse incorrecte' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);

    return res.status(200).json({ success: true, message: 'Mot de passe réinitialisé avec succès' });
  } catch (err) {
    console.error('RESET PASSWORD ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
