const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let { shopId, geranteId, type, category, description, quantity, unit_price, total_amount, payment_mode, transaction_date } = req.body;

    if (!shopId || !geranteId || !type || !category) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    if (!['vente', 'depense'].includes(type)) {
      return res.status(400).json({ error: 'Type invalide' });
    }

    // Valeurs par défaut tolérantes (au cas où quantité/prix unitaire ne sont pas fournis)
    quantity = quantity || 1;
    unit_price = unit_price != null ? unit_price : total_amount;
    total_amount = total_amount != null ? total_amount : quantity * unit_price;

    if (total_amount == null || isNaN(total_amount)) {
      return res.status(400).json({ error: 'Montant total invalide' });
    }

    // Vérifier abonnement de la boutique
    const shopCheck = await pool.query('SELECT dg_id, subscription_end FROM shops WHERE id = $1', [shopId]);
    if (shopCheck.rows.length === 0) return res.status(404).json({ error: 'Boutique non trouvée' });

    const now = new Date();
    const subEnd = shopCheck.rows[0].subscription_end ? new Date(shopCheck.rows[0].subscription_end) : null;
    if (!subEnd || now > subEnd) {
      return res.status(403).json({ error: 'ABONNEMENT_EXPIRE', message: 'Abonnement expiré' });
    }

    // Vérifier que le compte gérante est toujours actif (peut avoir été désactivé
    // par le DG pendant que la gérante était déjà connectée)
    const geranteCheck = await pool.query('SELECT active FROM users WHERE id = $1 AND role = $2', [geranteId, 'gerante']);
    if (geranteCheck.rows.length === 0) return res.status(404).json({ error: 'Compte gérante introuvable' });
    if (geranteCheck.rows[0].active === false) {
      return res.status(403).json({ error: 'COMPTE_DESACTIVE', message: 'Ce compte a été désactivé' });
    }

    // Insérer transaction
    const result = await pool.query(
      `INSERT INTO transactions 
       (shop_id, gerante_id, type, category, description, quantity, unit_price, total_amount, payment_mode, transaction_date, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()) 
       RETURNING id`,
      [shopId, geranteId, type, category, description || null, quantity, unit_price, total_amount, payment_mode || 'cash', transaction_date || now]
    );

    return res.status(201).json({
      success: true,
      transactionId: result.rows[0].id,
      message: 'Transaction enregistrée'
    });

  } catch (err) {
    console.error('CREATE TRANSACTION ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
