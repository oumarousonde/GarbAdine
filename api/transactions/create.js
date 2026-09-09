const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { shopId, geranteId, type, category, quantity, unit_price, total_amount } = req.body;
    if (!shopId || !geranteId || !type || !category || !quantity || !unit_price || !total_amount) 
      return res.status(400).json({ error: 'Champs manquants' });
    
    const shop = await pool.query('SELECT subscription_end FROM shops WHERE id=$1', [shopId]);
    if (!shop.rows.length) return res.status(404).json({ error: 'Boutique inconnue' });
    
    if (new Date() > new Date(shop.rows[0].subscription_end)) 
      return res.status(403).json({ error: 'ABONNEMENT_EXPIRE' });

    const result = await pool.query(
      `INSERT INTO transactions (shop_id, gerante_id, type, category, quantity, unit_price, total_amount, created_at) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING id`,
      [shopId, geranteId, type, category, quantity, unit_price, total_amount]
    );
    
    return res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};