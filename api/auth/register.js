// api/auth/register.js
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Requis pour Neon
});

const TRIAL_DAYS = 7;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, phone, password, role, shopName, shopType, location, secretQuestion, secretAnswer, shopId } = req.body;

    // 1. Validation stricte
    if (!name || !phone || !password || !role) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    if (!['dg', 'gerante'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide pour une inscription' });
    }
    if (role === 'dg' && !shopName) {
      return res.status(400).json({ error: "Nom de l'établissement requis" });
    }
    if (role === 'gerante' && !shopId) {
      return res.status(400).json({ error: 'Boutique manquante pour cette gérante' });
    }

    // 2. Vérifier unicité téléphone
    const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Ce numéro est déjà utilisé' });
    }

    // 3. Hacher mot de passe et réponse secrète
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedSecretAnswer = secretAnswer ? await bcrypt.hash(String(secretAnswer).toLowerCase(), 10) : null;

    let shopIdToLink = null;
    let trialInfo = null;

    if (role === 'dg') {
      // Le DG crée sa propre boutique avec un essai gratuit de 7 jours
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

      const userRes = await pool.query(
        `INSERT INTO users (name, phone, password_hash, role, secret_question, secret_answer, created_at)
         VALUES ($1, $2, $3, 'dg', $4, $5, NOW())
         RETURNING id, name, phone, role`,
        [name, phone, hashedPassword, secretQuestion || null, hashedSecretAnswer]
      );
      const newUser = userRes.rows[0];

      const shopRes = await pool.query(
        `INSERT INTO shops (dg_id, name, type, location, subscription_end, plan_months, created_at)
         VALUES ($1, $2, $3, $4, $5, 0, NOW())
         RETURNING id, name, subscription_end`,
        [newUser.id, shopName, shopType || 'garbadrome', location || null, trialEnd]
      );
      shopIdToLink = shopRes.rows[0].id;
      trialInfo = { daysLeft: TRIAL_DAYS, subscriptionEnd: shopRes.rows[0].subscription_end };

      // Catégories de vente de départ, adaptées au type d'établissement
      // (le DG et les gérantes pourront en ajouter/supprimer ensuite)
      const defaultCategories = (shopType === 'restaurant')
        ? ['Riz sauce', 'Riz gras', 'Tô', 'Placali', 'Poulet']
        : ['Attiéké', 'Eau', 'Jus'];

      for (const cat of defaultCategories) {
        await pool.query(
          `INSERT INTO shop_categories (shop_id, type, name) VALUES ($1, 'vente', $2)`,
          [shopIdToLink, cat]
        );
      }

      delete newUser.password_hash;
      return res.status(201).json({
        success: true,
        message: `Inscription réussie ! ${TRIAL_DAYS} jours d'essai offerts.`,
        user: { ...newUser, isSubscriptionActive: true, daysLeft: TRIAL_DAYS },
        shopId: shopIdToLink
      });

    } else {
      // Gérante : rattachée à la boutique existante du DG qui l'a créée (pas de nouvel essai)
      const shopCheck = await pool.query('SELECT id, subscription_end FROM shops WHERE id = $1', [shopId]);
      if (shopCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Boutique introuvable' });
      }
      const subEnd = shopCheck.rows[0].subscription_end ? new Date(shopCheck.rows[0].subscription_end) : null;
      if (!subEnd || new Date() > subEnd) {
        return res.status(403).json({ error: 'ABONNEMENT_EXPIRE', message: 'Abonnement expiré : impossible d\'ajouter une gérante. Contactez l\'administrateur.' });
      }

      const userRes = await pool.query(
        `INSERT INTO users (name, phone, password_hash, role, shop_id, secret_question, secret_answer, active, created_at)
         VALUES ($1, $2, $3, 'gerante', $4, $5, $6, true, NOW())
         RETURNING id, name, phone, role, shop_id`,
        [name, phone, hashedPassword, shopId, secretQuestion || null, hashedSecretAnswer]
      );
      const newUser = userRes.rows[0];
      delete newUser.password_hash;

      return res.status(201).json({
        success: true,
        message: 'Compte gérante créé avec succès.',
        user: newUser,
        shopId
      });
    }

  } catch (err) {
    console.error('FATAL ERROR REGISTER:', err.message);
    return res.status(500).json({ error: 'Erreur serveur lors de l\'inscription' });
  }
};
