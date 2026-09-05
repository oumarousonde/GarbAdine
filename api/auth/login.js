// api/auth/login.js
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

// Connexion DB directe (évite les problèmes d'import lib/db.js)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Fonction query locale sécurisée
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    console.log('Query executed:', text.substring(0, 50), 'in', Date.now() - start, 'ms');
    return res;
  } catch (error) {
    console.error('DB Query Error:', error.message);
    throw error;
  }
};

export default async function handler(req, res) {
  console.log('🔍 Login Request Body:', req.body);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { identifier, password, role } = req.body;

    // Validation stricte
    if (!identifier || !password || !role) {
      console.warn('️ Champs manquants:', { 
        identifier: !!identifier, 
        password: !!password, 
        role: !!role 
      });
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
    const userResult = await query(sql, params);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = userResult.rows[0];

    // Vérifier le mot de passe
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // VÉRIFICATION ABONNEMENT (Sauf Admin)
    if (role !== 'admin') {
      const now = new Date();
      const subEnd = new Date(user.subscription_end_date);
      
      if (now > subEnd) {
        return res.status(403).json({ 
          error: 'ABONNEMENT_EXPIRE',
          message: 'Abonnement expiré. Contactez votre DG.'
        });
      }

      const daysLeft = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));
      user.daysLeft = daysLeft;
    }

    // Récupérer boutique si DG
    let shop = null;
    if (user.role === 'dg') {
      const shopRes = await query('SELECT * FROM shops WHERE owner_id = $1', [user.id]);
      shop = shopRes.rows[0] || null;
    }

    // Nettoyer données sensibles
    delete user.password_hash;
    delete user.secret_answer;

    console.log('✅ Login réussi:', user.name);
    res.status(200).json({ success: true, user: { ...user, shop } });

  } catch (error) {
    console.error('❌ Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}