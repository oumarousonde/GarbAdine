// api/auth/login.js
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { identifier, password, role } = req.body;
    
    // Validation
    if (!identifier || !password || !role) {
      return res.status(400).json({ error: 'Champs manquants' });
    }

    let sql, params;
    if (role === 'admin') {
      sql = 'SELECT * FROM users WHERE email = $1 AND role = $2';
      params = [identifier, role];
    } else {
      sql = 'SELECT * FROM users WHERE phone = $1 AND role = $2';
      params = [identifier, role];
    }

    const userResult = await pool.query(sql, params);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = userResult.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Mot de passe incorrect' });

    // Vérification Abonnement
    if (role !== 'admin') {
      const now = new Date();
      const subEnd = new Date(user.subscription_end_date);
      if (now > subEnd) {
        return res.status(403).json({ error: 'ABONNEMENT_EXPIRE', message: 'Abonnement expiré.' });
      }
      user.daysLeft = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));
    }

    // Boutique DG
    let shop = null;
    if (user.role === 'dg') {
      const shopRes = await pool.query('SELECT * FROM shops WHERE owner_id = $1', [user.id]);
      shop = shopRes.rows[0] || null;
    }

    delete user.password_hash;
    delete user.secret_answer;

    res.status(200).json({ success: true, user: { ...user, shop } });

  } catch (error) {
    console.error('❌ Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}