// api/auth/login.js
import { query } from '../../lib/db.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    // 1. CORRESPONDANCE EXACTE AVEC LE FRONTEND
    const { identifier, password, role } = req.body;

    // 2. Validation stricte des 3 champs obligatoires
    if (!identifier || !password || !role) {
      return res.status(400).json({ 
        error: 'Champs manquants', 
        details: { identifier: !!identifier, password: !!password, role: !!role } 
      });
    }

    // 3. Requête SQL dynamique selon le rôle choisi
    let sql, params;
    if (role === 'admin') {
      sql = 'SELECT * FROM users WHERE email = $1 AND role = $2';
      params = [identifier, role];
    } else {
      sql = 'SELECT * FROM users WHERE phone = $1 AND role = $2';
      params = [identifier, role];
    }

    const userResult = await query(sql, params);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = userResult.rows[0];

    // 4. Vérification mot de passe haché
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // 5. Vérification Abonnement (Sauf pour Admin)
    if (role !== 'admin') {
      const now = new Date();
      const subEnd = new Date(user.subscription_end_date);
      
      if (now > subEnd) {
        return res.status(403).json({ 
          error: 'ABONNEMENT_EXPIRE',
          message: 'Votre période d\'essai est terminée. Contactez votre DG ou l\'Admin.'
        });
      }
      
      // Calcul jours restants pour le badge dashboard
      user.daysLeft = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));
    }

    // 6. Récupération Boutique (via owner_id, pas shop_id !)
    let shop = null;
    if (user.role === 'dg') {
      const shopRes = await query('SELECT * FROM shops WHERE owner_id = $1', [user.id]);
      shop = shopRes.rows[0] || null;
    }

    // 7. Nettoyage données sensibles avant envoi
    delete user.password_hash;
    delete user.secret_answer;

    res.status(200).json({ success: true, user: { ...user, shop } });

  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
}