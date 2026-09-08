const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { adminId, currentPassword, newEmail, newPhone, newPassword } = req.body;
    if (!adminId || !currentPassword) {
      return res.status(400).json({ error: 'Mot de passe actuel requis' });
    }

    const userRes = await pool.query(`SELECT * FROM users WHERE id = $1 AND role = 'admin'`, [adminId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Administrateur introuvable' });
    const admin = userRes.rows[0];

    const match = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!match) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

    if (newEmail && newEmail !== admin.email) {
      const dup = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [newEmail, adminId]);
      if (dup.rows.length > 0) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }
    if (newPhone && newPhone !== admin.phone) {
      const dup = await pool.query('SELECT id FROM users WHERE phone = $1 AND id != $2', [newPhone, adminId]);
      if (dup.rows.length > 0) return res.status(409).json({ error: 'Ce numéro est déjà utilisé' });
    }

    const newHash = newPassword ? await bcrypt.hash(newPassword, 10) : admin.password_hash;
    const finalEmail = newEmail || admin.email;
    const finalPhone = newPhone || admin.phone;

    const result = await pool.query(
      `UPDATE users SET email = $1, phone = $2, password_hash = $3 WHERE id = $4 RETURNING id, name, email, phone, role`,
      [finalEmail, finalPhone, newHash, adminId]
    );

    return res.status(200).json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('ADMIN UPDATE PROFILE ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
