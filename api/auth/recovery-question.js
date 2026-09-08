const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Numéro requis' });

    const result = await pool.query(
      `SELECT secret_question FROM users WHERE phone = $1 AND role = 'dg'`,
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aucun compte DG trouvé avec ce numéro' });
    }
    if (!result.rows[0].secret_question) {
      return res.status(404).json({ error: "Aucune question de sécurité définie pour ce compte. Contactez l'administrateur." });
    }

    return res.status(200).json({ success: true, question: result.rows[0].secret_question });
  } catch (err) {
    console.error('RECOVERY QUESTION ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
