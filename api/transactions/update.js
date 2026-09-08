const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'PUT') {
      const { id, category, description, quantity, unit_price, total_amount, payment_mode, transaction_date } = req.body;
      if (!id) return res.status(400).json({ error: 'id requis' });

      const result = await pool.query(
        `UPDATE transactions SET
           category = COALESCE($2, category),
           description = COALESCE($3, description),
           quantity = COALESCE($4, quantity),
           unit_price = COALESCE($5, unit_price),
           total_amount = COALESCE($6, total_amount),
           payment_mode = COALESCE($7, payment_mode),
           transaction_date = COALESCE($8, transaction_date)
         WHERE id = $1
         RETURNING id`,
        [id, category || null, description || null, quantity || null, unit_price || null, total_amount || null, payment_mode || null, transaction_date || null]
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction introuvable' });
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id requis' });

      const result = await pool.query('DELETE FROM transactions WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction introuvable' });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('UPDATE TRANSACTION ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
