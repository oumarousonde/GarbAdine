// api/auth/login.js - VERSION FINALE VALIDÉE
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Connexion DB directe (pas d'import externe)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Requis pour Neon
});

module.exports = async function handler(req, res) {
  console.log('=== LOGIN START ===');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { identifier, password, role } = req.body;
    console.log('REÇU:', { identifier, role });

    // 1. Validation stricte
    if (!identifier || !password || !role) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // 2. Requête SQL selon rôle
    let sql, params;
    if (role === 'admin') {
      sql = 'SELECT * FROM users WHERE email = $1 AND role = $2';
      params = [identifier, 'admin'];
    } else {
      sql = 'SELECT * FROM users WHERE phone = $1 AND role = $2';
      params = [identifier, role];
    }

    console.log('SQL:', sql.substring(0, 60));
    
    // 3. Exécution
    const result = await pool.query(sql, params);
    console.log('ROWS:', result.rows.length);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    console.log('USER FOUND:', user.name, user.role);

    // 4. Vérification mot de passe
    const match = await bcrypt.compare(password, user.password_hash);
    console.log('BCRYPT MATCH:', match);

    if (!match) {
      return res.status(401).json({ error: 'Wrong password' });
    }

    // 5. Vérification abonnement (sauf admin)
    let isSubscriptionActive = true;
    let daysLeft = null;

    if (role !== 'admin') {
      const now = new Date();
      const subEnd = new Date(user.subscription_end_date);
      
      if (now > subEnd) {
        isSubscriptionActive = false;
        daysLeft = 0;
        console.log('⚠️ ABONNEMENT EXPIRÉ POUR:', user.name);
      } else {
        daysLeft = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));
      }
    }

    // 6. Récupérer boutique si DG (UTILISE dg_id)
    let shop = null;
    if (user.role === 'dg') {
      try {
        const shopRes = await pool.query('SELECT * FROM shops WHERE dg_id = $1', [user.id]);
        shop = shopRes.rows[0] || null;
        console.log('SHOP FOUND:', shop ? shop.name : 'Aucune boutique');
      } catch (shopErr) {
        console.error('⚠️ Erreur récupération boutique:', shopErr.message);
        shop = null;
      }
    }

    // 7. Succès (sans données sensibles + infos abonnement)
    delete user.password_hash;
    delete user.secret_answer;
    
    console.log('SUCCESS FOR:', user.name);
    return res.status(200).json({ 
      success: true, 
      user: { 
        ...user, 
        shop, 
        isSubscriptionActive,  // ← AJOUT CRITIQUE POUR FRONTEND
        daysLeft               // ← AJOUT CRITIQUE POUR BADGE
      } 
    });

  } catch (err) {
    console.error('FATAL ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};