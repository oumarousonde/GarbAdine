const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function getRange(period, from, to) {
  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];

  if (period === 'custom' && from && to) {
    return { from, to };
  }
  if (period === 'week') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: fmt(start), to: fmt(today) };
  }
  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmt(start), to: fmt(today) };
  }
  // default: today
  return { from: fmt(today), to: fmt(today) };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { shopId, geranteId, period, from, to } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId requis' });

    const { from: dateFrom, to: dateTo } = getRange(period, from, to);

    let sql = `SELECT t.*, u.name as gerante_name FROM transactions t
               LEFT JOIN users u ON u.id = t.gerante_id
               WHERE t.shop_id = $1 AND t.transaction_date BETWEEN $2 AND $3`;
    const params = [shopId, dateFrom, dateTo];

    if (geranteId) {
      sql += ` AND t.gerante_id = $4`;
      params.push(geranteId);
    }
    sql += ` ORDER BY t.created_at DESC`;

    const result = await pool.query(sql, params);
    const rows = result.rows;

    let sales = 0, expenses = 0, salesCash = 0, salesOM = 0, pending = 0;
    rows.forEach(r => {
      const amt = parseFloat(r.total_amount) || 0;
      if (r.type === 'vente') {
        sales += amt;
        if (r.payment_mode === 'om') salesOM += amt;
        else if (r.payment_mode === 'pending') pending += amt;
        else salesCash += amt;
      } else {
        expenses += amt;
      }
    });

    return res.status(200).json({
      success: true,
      range: { from: dateFrom, to: dateTo },
      stats: {
        sales, expenses, profit: sales - expenses,
        salesCash, salesOM, pending
      },
      transactions: rows
    });
  } catch (err) {
    console.error('LIST TRANSACTIONS ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
