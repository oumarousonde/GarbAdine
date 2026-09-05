// api/auth/login.js
import { query } from '../../lib/db.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { phone, password } = req.body;

    // 1. Vérifications basiques
    if (!phone || !password) {
      return res.status(400).json({ error: 'Numéro et mot de passe obligatoires' });
    }

    // 2. Chercher l'utilisateur par téléphone
    const userResult = await query(
      'SELECT * FROM users WHERE phone = $1', 
      [phone]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Numéro ou mot de passe incorrect' });
    }

    const user = userResult.rows[0];

    // 3. Vérifier le mot de passe haché
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Numéro ou mot de passe incorrect' });
    }

    // 4. VÉRIFICATION CRITIQUE : Abonnement
    const now = new Date();
    const subEnd = new Date(user.subscription_end_date);
    
    // Si la date de fin est passée, on bloque
    if (now > subEnd) {
      return res.status(403).json({ 
        error: 'ABONNEMENT_EXPIRE',
        message: 'Votre période d\'essai ou abonnement est terminé. Contactez votre DG ou l\'Admin.'
      });
    }

    // 5. Calculer les jours restants pour l'affichage frontend
    const daysLeft = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));

    // 6. Réponse succès (sans mot de passe !)
    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        subscriptionEnd: user.subscription_end_date,
        daysLeft: daysLeft
      }
    });

  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
}