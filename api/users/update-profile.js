const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, currentPassword, newPhone, newPassword } = req.body;
    if (!userId || !currentPassword) {
      return res.status(400).json({ error: 'Mot de passe actuel requis' });
    }
    if (!newPhone && !newPassword) {
      return res.status(400).json({ error: 'Rien à modifier' });
    }

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const user = userRes.rows[0];

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

    if (newPhone && newPhone !== user.phone) {
      const dup = await pool.query('SELECT id FROM users WHERE phone = $1 AND id != $2', [newPhone, userId]);
      if (dup.rows.length > 0) return res.status(409).json({ error: 'Ce numéro est déjà utilisé par un autre compte' });
    }

    const newHash = newPassword ? await bcrypt.hash(newPassword, 10) : user.password_hash;
    const finalPhone = newPhone || user.phone;

    const result = await pool.query(
      `UPDATE users SET phone = $1, password_hash = $2 WHERE id = $3 RETURNING id, name, phone, role, shop_id`,
      [finalPhone, newHash, userId]
    );

    return res.status(200).json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('UPDATE PROFILE ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
