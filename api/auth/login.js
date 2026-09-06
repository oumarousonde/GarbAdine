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
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Wrong password' });

    let isSubscriptionActive = true;
    let daysLeft = null;
    if (role !== 'admin') {
      const now = new Date();
      const subEnd = new Date(user.subscription_end_date);
      if (now > subEnd) {
        isSubscriptionActive = false;
        daysLeft = 0;
      } else {
        daysLeft = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));
      }
    }

    let shop = null;
    if (user.role === 'dg') {
      const shopRes = await pool.query('SELECT * FROM shops WHERE dg_id = $1', [user.id]);
      shop = shopRes.rows[0] || null;
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