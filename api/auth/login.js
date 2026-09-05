// api/auth/login.js - VERSION DEBUG ULTIME
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  console.log('=== DÉBUT LOGIN ===');
  console.log('1. Method:', req.method);
  console.log('2. Body reçu:', JSON.stringify(req.body));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { identifier, password, role } = req.body;
    console.log('3. Champs extraits:', { identifier, password: '***', role });

    if (!identifier || !password || !role) {
      console.log('4. ERREUR: Champs manquants');
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    // Construire la requête
    let sql, params;
    if (role === 'admin') {
      sql = 'SELECT * FROM users WHERE email = $1 AND role = $2';
      params = [identifier, role];
      console.log('5. Mode ADMIN');
    } else {
      sql = 'SELECT * FROM users WHERE phone = $1 AND role = $2';
      params = [identifier, role];
      console.log('5. Mode DG/GERANTE');
    }
    
    console.log('6. SQL:', sql);
    console.log('7. Params:', params);

    // Exécuter la query
    const userResult = await pool.query(sql, params);
    console.log('8. Rows trouvées:', userResult.rows.length);

    if (userResult.rows.length === 0) {
      console.log('9. ERREUR: Utilisateur non trouvé');
      return res.status(401).json({ error: 'Utilisateur non trouvé avec ces identifiants' });
    }

    const user = userResult.rows[0];
    console.log('10. User trouvé:', { id: user.id, name: user.name, role: user.role });
    console.log('11. Password hash en DB (début):', user.password_hash ? user.password_hash.substring(0, 20) + '...' : 'NULL');

    // Comparer le mot de passe
    console.log('12. Début bcrypt.compare...');
    const isValid = await bcrypt.compare(password, user.password_hash);
    console.log('13. Résultat bcrypt.compare:', isValid);

    if (!isValid) {
      console.log('14. ERREUR: Mot de passe incorrect');
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    console.log('15. SUCCÈS: Connexion validée pour', user.name);
    
    // Nettoyer les données sensibles
    delete user.password_hash;
    delete user.secret_answer;

    res.status(200).json({ 
      success: true, 
      user: user 
    });

  } catch (error) {
    console.error('16. ERREUR CRITIQUE:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
};