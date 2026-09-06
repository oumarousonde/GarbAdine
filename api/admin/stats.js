// api/admin/stats.js - VERSION SELF-CONTAINED ULTIME
const { Pool } = require('pg');

// Connexion DB directe (Self-contained)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Requis pour Neon
});

module.exports = async function handler(req, res) {
  console.log('=== ADMIN STATS START ===');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Récupérer toutes les boutiques avec infos DG et statut abonnement
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
    console.log('BOUTIQUES TROUVÉES:', shops.length);

    // 2. Calculer les stats
    let activeCount = 0;
    let expiredCount = 0;
    let totalRevenue = 0;
    const now = new Date();

    const processedShops = shops.map(shop => {
      const subEnd = new Date(shop.subscription_end);
      const isExpired = now > subEnd;
      
      if (isExpired) {
        expiredCount++;
      } else {
        activeCount++;
        // Estimation revenu : 5000 F/mois * mois restants (arrondi)
        const monthsLeft = Math.max(0, Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24 * 30)));
        totalRevenue += 5000 * monthsLeft;
      }

      return {
        ...shop,
        is_expired: isExpired,
        subscription_end_formatted: subEnd.toLocaleDateString('fr-FR')
      };
    });

    console.log('STATS CALCULÉES:', { 
      total: shops.length, 
      active: activeCount, 
      expired: expiredCount, 
      revenue: totalRevenue 
    });

    // 3. Retourner les données structurées
    return res.status(200).json({
      success: true,
      stats: {
        total_shops: shops.length,
        active_shops: activeCount,
        expired_shops: expiredCount,
        estimated_revenue: totalRevenue
      },
      shops: processedShops
    });

  } catch (err) {
    console.error('FATAL ERROR ADMIN STATS:', err.message);
    return res.status(500).json({ error: 'Erreur serveur lors du chargement des stats' });
  }
};