const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const VALID_MONTHS = [1, 3, 12];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { shopId, months, isFree, amountPaid } = req.body;
    if (!shopId || !VALID_MONTHS.includes(Number(months))) {
      return res.status(400).json({ error: 'shopId et months (1, 3 ou 12) requis' });
    }

    const free = !!isFree;
    // Si "gratuit" est coché, le montant encaissé est forcément 0, peu importe ce qui est envoyé
    const paidAmount = free ? 0 : (Number(amountPaid) || 0);

    if (!free && (amountPaid === undefined || amountPaid === null || isNaN(Number(amountPaid)))) {
      return res.status(400).json({ error: 'Indique le montant encaissé (ou coche "Gratuit")' });
    }

    const shopRes = await pool.query('SELECT subscription_end FROM shops WHERE id = $1', [shopId]);
    if (shopRes.rows.length === 0) return res.status(404).json({ error: 'Boutique introuvable' });

    const now = new Date();
    const currentEnd = shopRes.rows[0].subscription_end ? new Date(shopRes.rows[0].subscription_end) : null;
    // On cumule les jours restants s'il en reste, sinon on repart de maintenant
    const base = (currentEnd && currentEnd > now) ? currentEnd : now;
    const newEnd = new Date(base);
    newEnd.setMonth(newEnd.getMonth() + Number(months));

    const result = await pool.query(
      `UPDATE shops SET subscription_end = $1, plan_months = $2 WHERE id = $3 RETURNING id, name, subscription_end, plan_months`,
      [newEnd, months, shopId]
    );

    // Enregistrement du paiement réel (ou du don marketing) pour un chiffre d'affaires fiable
    await pool.query(
      `INSERT INTO subscription_payments (shop_id, months, is_free, amount_paid, new_subscription_end, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [shopId, months, free, paidAmount, newEnd]
    );

    return res.status(200).json({ success: true, shop: result.rows[0] });
  } catch (err) {
    console.error('RENEW ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
