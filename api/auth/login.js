const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { identifier, password, role } = req.body;
    if (!identifier || !password || !role) return res.status(400).json({ error: 'Missing fields' });

    let sql, params;
    if (role === 'admin') {
      sql = 'SELECT * FROM users WHERE email = $1 AND role = $2';
      params = [identifier, 'admin'];
    } else {
      sql = 'SELECT * FROM users WHERE phone = $1 AND role = $2';
      params = [identifier, role];
    }

    const result = await pool.query(sql, params);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Identifiants incorrects' });

    if (role !== 'admin' && user.active === false) {
      return res.status(403).json({ error: 'COMPTE_DESACTIVE', message: 'Ce compte a été désactivé. Contactez votre DG.' });
    }

    // ===== Récupération de la boutique =====
    // Le DG possède la boutique. La gérante est rattachée via shop_id.
    let shop = null;
    if (user.role === 'dg') {
      const shopRes = await pool.query('SELECT * FROM shops WHERE dg_id = $1', [user.id]);
      shop = shopRes.rows[0] || null;
    } else if (user.role === 'gerante' && user.shop_id) {
      const shopRes = await pool.query('SELECT * FROM shops WHERE id = $1', [user.shop_id]);
      shop = shopRes.rows[0] || null;
    }

    // ===== Abonnement : source unique de vérité = la boutique (shops.subscription_end) =====
    // (l'admin n'a pas d'abonnement)
    let isSubscriptionActive = true;
    let daysLeft = null;
    if (role !== 'admin') {
      if (!shop || !shop.subscription_end) {
        isSubscriptionActive = false;
        daysLeft = 0;
      } else {
        const now = new Date();
        const subEnd = new Date(shop.subscription_end);
        if (now > subEnd) {
          isSubscriptionActive = false;
          daysLeft = 0;
        } else {
          daysLeft = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));
        }
      }
    }

    delete user.password_hash;
    delete user.secret_answer;

    return res.status(200).json({
      success: true,
      user: { ...user, shop, isSubscriptionActive, daysLeft }
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
