-- ============================================================
-- GarbAdine - Migration de correction du schéma
-- À exécuter UNE FOIS dans la console SQL de Neon
-- Sans danger : toutes les instructions sont idempotentes
-- (IF NOT EXISTS), tu peux la relancer sans problème.
-- ============================================================

-- ---------- TABLE users ----------
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_question TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_answer TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- email unique uniquement pour les admins (plusieurs DG/gérants peuvent avoir email NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
END $$;

-- ---------- TABLE shops ----------
CREATE TABLE IF NOT EXISTS shops (
  id SERIAL PRIMARY KEY,
  dg_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT,
  location TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMP;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_months INTEGER DEFAULT 0;

-- Lien users.shop_id -> shops.id (ajouté seulement si absent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_shop_id_fkey'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
  END IF;
END $$;

-- Pour les boutiques déjà créées sans date d'abonnement (bug de l'ancien register.js),
-- on leur donne 7 jours d'essai à partir de maintenant pour ne pas les bloquer.
UPDATE shops SET subscription_end = NOW() + INTERVAL '7 days' WHERE subscription_end IS NULL;

-- ---------- TABLE transactions ----------
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER REFERENCES shops(id),
  gerante_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL,
  category TEXT,
  description TEXT,
  quantity NUMERIC,
  unit_price NUMERIC,
  total_amount NUMERIC NOT NULL,
  payment_mode TEXT DEFAULT 'cash',
  transaction_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ---------- TABLE subscription_payments (chiffre d'affaires réel encaissé par l'admin) ----------
CREATE TABLE IF NOT EXISTS subscription_payments (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER REFERENCES shops(id),
  months INTEGER,
  is_free BOOLEAN DEFAULT false,
  amount_paid NUMERIC DEFAULT 0,
  new_subscription_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ---------- TABLE shop_categories (catégories de produits/dépenses, partagées pour toute la boutique) ----------
CREATE TABLE IF NOT EXISTS shop_categories (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER REFERENCES shops(id),
  type TEXT NOT NULL, -- 'vente' ou 'depense'
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Pour les boutiques déjà créées avant cette mise à jour : quelques catégories de ventes
-- de départ, adaptées au type (restaurant vs garbadrome), seulement si elles n'ont encore
-- aucune catégorie.
INSERT INTO shop_categories (shop_id, type, name)
SELECT s.id, 'vente', cat
FROM shops s
CROSS JOIN LATERAL (
  SELECT unnest(
    CASE WHEN s.type = 'restaurant'
      THEN ARRAY['Riz sauce','Riz gras','Tô','Placali','Poulet']
      ELSE ARRAY['Attiéké','Eau','Jus']
    END
  ) AS cat
) AS defaults
WHERE NOT EXISTS (
  SELECT 1 FROM shop_categories sc WHERE sc.shop_id = s.id AND sc.type = 'vente'
);

-- ---------- Correction : supprimer une gérante ne doit jamais casser son historique de ventes ----------
-- Sans ça, "Supprimer" échouait dès qu'une gérante avait déjà enregistré au moins une saisie.
DO $$
DECLARE
  conname text;
BEGIN
  SELECT tc.constraint_name INTO conname
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'transactions' AND kcu.column_name = 'gerante_id' AND tc.constraint_type = 'FOREIGN KEY'
  LIMIT 1;

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE transactions DROP CONSTRAINT %I', conname);
  END IF;

  ALTER TABLE transactions
    ADD CONSTRAINT transactions_gerante_id_fkey
    FOREIGN KEY (gerante_id) REFERENCES users(id) ON DELETE SET NULL;
END $$;

-- ============================================================
-- Fin de la migration.
-- ============================================================
