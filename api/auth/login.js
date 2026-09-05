// api/auth/login.js
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Configuration directe du Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Fonction query locale
const query = (text, params) => pool.query(text, params);

module.exports = async function handler(req, res) {
  console.log('🔍 Login Request Body:', req.body);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { identifier, password, role } = req.body;

    // Validation stricte
    if (!identifier || !password || !role) {
      console.warn('⚠️ Champs manquants:', { identifier: !!identifier, password: !!password, role: !!role });
      return res.status(400).json({ 
        error: 'Champs obligatoires manquants', 
        details: { identifier: !!identifier, password: !!password, role: !!role } 
      });
    }

    // Construire la requête selon le rôle
    let sql, params;
    if (role === 'admin') {
      sql = 'SELECT * FROM users WHERE email = $1 AND role = $2';
      params = [identifier, role];
    } else if (role === 'dg' || role === 'gerante') {
      sql = 'SELECT * FROM users WHERE phone = $1 AND role = $2';
      params = [identifier, role];
    } else {
      return res.status(400).json({ error: 'Rôle invalide.' });
    }

    // Chercher l'utilisateur
    console.log('📝 Exécution SQL...');
    const userResult = await query(sql, params);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Numéro/email ou mot de passe incorrect' });
    }

    const user = userResult.rows[0];

    // Vérifier le mot de passe haché
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // VÉRIFICATION CRITIQUE : Abonnement (Sauf pour Admin)
    if (role !== 'admin') {
      const now = new Date();
      const subEnd = new Date(user.subscription_end_date);
      
      if (now > subEnd) {
        return res.status(403).json({ 
          error: 'ABONNEMENT_EXPIRE',
          message: 'Votre période d\'essai est terminée. Contactez votre DG ou l\'Admin GarbAdine.'
        });
      }

      // Calculer les jours restants
      const daysLeft = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));
      user.daysLeft = daysLeft;
    }

    // Récupérer la boutique si c'est un DG
    let shop = null;
    if (user.role === 'dg') {
      const shopRes = await query('SELECT * FROM shops WHERE owner_id = $1', [user.id]);
      shop = shopRes.rows[0] || null;
    }

    // Réponse sécurité (sans données sensibles)
    delete user.password_hash;
    delete user.secret_answer;

    console.log('✅ Login réussi pour:', user.name);
    res.status(200).json({ 
      success: true, 
      user: { ...user, shop } 
    });

  } catch (error) {
    console.error('❌ Erreur login critique:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
};