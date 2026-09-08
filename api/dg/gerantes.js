const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { shopId } = req.query;
      if (!shopId) return res.status(400).json({ error: 'shopId requis' });

      const result = await pool.query(
        `SELECT u.id, u.name, u.phone, u.active,
                (SELECT MAX(t.created_at) FROM transactions t WHERE t.gerante_id = u.id) as last_activity
         FROM users u
         WHERE u.shop_id = $1 AND u.role = 'gerante'
         ORDER BY u.created_at DESC`,
        [shopId]
      );
      return res.status(200).json({ success: true, gerantes: result.rows });
    }

    if (req.method === 'PATCH') {
      const { geranteId, active, newPassword } = req.body;
      if (!geranteId) return res.status(400).json({ error: 'geranteId requis' });

      if (newPassword) {
        if (newPassword.length < 6) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
        const hash = await bcrypt.hash(newPassword, 10);
        const result = await pool.query(
          `UPDATE users SET password_hash = $1 WHERE id = $2 AND role = 'gerante' RETURNING id`,
          [hash, geranteId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Gérante introuvable' });
        return res.status(200).json({ success: true, message: 'Mot de passe réinitialisé' });
      }

      if (typeof active !== 'boolean') {
        return res.status(400).json({ error: 'active (booléen) ou newPassword requis' });
      }
      const result = await pool.query(
        `UPDATE users SET active = $1 WHERE id = $2 AND role = 'gerante' RETURNING id, active`,
        [active, geranteId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Gérante introuvable' });
      return res.status(200).json({ success: true, gerante: result.rows[0] });
    }

    if (req.method === 'DELETE') {
      const { geranteId } = req.query;
      if (!geranteId) return res.status(400).json({ error: 'geranteId requis' });
      const result = await pool.query(`DELETE FROM users WHERE id = $1 AND role = 'gerante' RETURNING id`, [geranteId]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Gérante introuvable' });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('GERANTES ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
