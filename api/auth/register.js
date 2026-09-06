// api/auth/register.js - VERSION FINALE VALIDÉE
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Connexion DB directe (pas d'import externe)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Requis pour Neon
});

module.exports = async function handler(req, res) {
  console.log('=== REGISTER START ===');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, phone, password, role, shopName, shopType, location, secretQuestion } = req.body;
    console.log('REÇU:', { name, phone, role, shopName });

    // 1. Validation stricte
    if (!name || !phone || !password || !role) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    // 2. Vérifier unicité téléphone
    const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Ce numéro est déjà utilisé' });
    }

    // 3. Hacher mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('MOT DE PASSE HASHÉ');

    // 4. Calculer date fin essai (3 jours)
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 3);

    // 5. Créer utilisateur
    const userRes = await pool.query(
      `INSERT INTO users (name, phone, password_hash, role, subscription_end_date, secret_question, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) 
       RETURNING id, name, phone, role, subscription_end_date`,
      [name, phone, hashedPassword, role, trialEnd, secretQuestion || null]
    );
    
    const newUser = userRes.rows[0];
    console.log('UTILISATEUR CRÉÉ:', newUser.id);

    let shopId = null;

    // 6. Si DG, créer boutique automatiquement
    if (role === 'dg' && shopName) {
      const shopRes = await pool.query(
        `INSERT INTO shops (dg_id, name, type, location, created_at) 
         VALUES ($1, $2, $3, $4, NOW()) 
         RETURNING id, name`,
        [newUser.id, shopName, shopType || 'garbadrome', location || null]
      );
      shopId = shopRes.rows[0].id;
      console.log('BOUTIQUE CRÉÉE:', shopId);
    }

    // 7. Succès (sans données sensibles + infos abonnement)
    delete newUser.password_hash;
    
    console.log('INSCRIPTION RÉUSSIE POUR:', newUser.name);
    return res.status(201).json({
      success: true,
      message: 'Inscription réussie ! 3 jours d\'essai offerts.',
      user: { 
        ...newUser, 
        isSubscriptionActive: true,  // ← AJOUT CRITIQUE POUR FRONTEND
        daysLeft: 3                  // ← AJOUT CRITIQUE POUR BADGE IMMÉDIAT
      },
      shopId: shopId
    });

  } catch (err) {
    console.error('FATAL ERROR REGISTER:', err.message);
    return res.status(500).json({ error: 'Erreur serveur lors de l\'inscription' });
  }
};