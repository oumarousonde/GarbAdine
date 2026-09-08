const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { shopId, type } = req.query;
      if (!shopId || !type) return res.status(400).json({ error: 'shopId et type requis' });

      const result = await pool.query(
        `SELECT id, name FROM shop_categories WHERE shop_id = $1 AND type = $2 ORDER BY name ASC`,
        [shopId, type]
      );
      return res.status(200).json({ success: true, categories: result.rows });
    }

    if (req.method === 'POST') {
      const { shopId, type, name } = req.body;
      if (!shopId || !type || !name) return res.status(400).json({ error: 'shopId, type et name requis' });
      if (!['vente', 'depense'].includes(type)) return res.status(400).json({ error: 'Type invalide' });

      const existing = await pool.query(
        `SELECT id FROM shop_categories WHERE shop_id = $1 AND type = $2 AND LOWER(name) = LOWER($3)`,
        [shopId, type, name.trim()]
      );
      if (existing.rows.length > 0) {
        return res.status(200).json({ success: true, category: existing.rows[0], alreadyExists: true });
      }

      const result = await pool.query(
        `INSERT INTO shop_categories (shop_id, type, name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, name`,
        [shopId, type, name.trim()]
      );
      return res.status(201).json({ success: true, category: result.rows[0] });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id requis' });
      const result = await pool.query('DELETE FROM shop_categories WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Catégorie introuvable' });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CATEGORIES ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
