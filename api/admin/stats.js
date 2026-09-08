// api/admin/stats.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Boutiques avec infos DG et statut abonnement
    const shopsRes = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.type,
        s.subscription_end,
        u.name as dg_name,
        u.phone as dg_phone
      FROM shops s
      JOIN users u ON s.dg_id = u.id
      ORDER BY s.created_at DESC
    `);

    const shops = shopsRes.rows;
    const now = new Date();

    let activeCount = 0;
    let expiredCount = 0;

    const processedShops = shops.map(shop => {
      const subEnd = shop.subscription_end ? new Date(shop.subscription_end) : null;
      const isExpired = !subEnd || now > subEnd;

      if (isExpired) expiredCount++; else activeCount++;

      return {
        ...shop,
        is_expired: isExpired,
        subscription_end_formatted: subEnd ? subEnd.toLocaleDateString('fr-FR') : 'Jamais activé'
      };
    });

    // 2. Chiffre d'affaires RÉEL : somme de ce qui a réellement été encaissé
    // (renseigné par l'admin à chaque renouvellement — gratuit ou montant précis payé),
    // jamais une estimation basée sur le tarif catalogue.
    const revenueRes = await pool.query(
      `SELECT COALESCE(SUM(amount_paid), 0) as total FROM subscription_payments WHERE is_free = false`
    );
    const realRevenue = Number(revenueRes.rows[0].total) || 0;

    return res.status(200).json({
      success: true,
      stats: {
        total_shops: shops.length,
        active_shops: activeCount,
        expired_shops: expiredCount,
        real_revenue: realRevenue
      },
      shops: processedShops
    });

  } catch (err) {
    console.error('FATAL ERROR ADMIN STATS:', err.message);
    return res.status(500).json({ error: 'Erreur serveur lors du chargement des stats' });
  }
};
