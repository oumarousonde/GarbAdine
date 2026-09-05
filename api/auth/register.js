// api/auth/register.js
import { query } from '../../lib/db.js'; // On utilise notre pool centralisé
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { 
      name, phone, password, shopName, role = 'dg', 
      secretQuestion, secretAnswer 
    } = req.body;

    // 1. Vérifications basiques
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Nom, téléphone et mot de passe obligatoires' });
    }

    // 2. Vérifier si le numéro existe déjà
    const existingUser = await query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Ce numéro est déjà utilisé' });
    }

    // 3. Hacher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Calculer la date de fin d'essai (3 jours offerts)
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 3);

    // 5. Créer l'utilisateur
    const userResult = await query(
      `INSERT INTO users (name, phone, password_hash, role, subscription_end_date, secret_question, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) 
       RETURNING id, name, phone, role, subscription_end_date`,
      [name, phone, hashedPassword, role, trialEndDate, secretQuestion || null]
    );

    const newUser = userResult.rows[0];
    let shopId = null;

    // 6. Si c'est un DG, on crée sa boutique automatiquement
    if (role === 'dg' && shopName) {
      const shopResult = await query(
        `INSERT INTO shops (owner_id, name, type, location, created_at) 
         VALUES ($1, $2, 'garbadrome', NULL, NOW()) 
         RETURNING id, name`,
        [newUser.id, shopName]
      );
      shopId = shopResult.rows[0].id;
    }

    // 7. Réponse succès (sans mot de passe !)
    res.status(201).json({
      success: true,
      message: 'Inscription réussie ! 3 jours d\'essai offerts.',
      user: {
        id: newUser.id,
        name: newUser.name,
        phone: newUser.phone,
        role: newUser.role,
        subscriptionEnd: newUser.subscription_end_date
      },
      shopId: shopId
    });

  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur serveur lors de l\'inscription' });
  }
}