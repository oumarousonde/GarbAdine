const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { shopId } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId requis' });

    const shopRes = await pool.query('SELECT subscription_end FROM shops WHERE id = $1', [shopId]);
    if (shopRes.rows.length === 0) return res.status(404).json({ error: 'Boutique introuvable' });

    const subEnd = shopRes.rows[0].subscription_end ? new Date(shopRes.rows[0].subscription_end) : null;
    const now = new Date();
    let isSubscriptionActive = true, daysLeft = 0;

    if (!subEnd || now > subEnd) {
      isSubscriptionActive = false;
      daysLeft = 0;
    } else {
      daysLeft = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));
    }

    return res.status(200).json({ success: true, isSubscriptionActive, daysLeft });
  } catch (err) {
    console.error('SHOP STATUS ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
