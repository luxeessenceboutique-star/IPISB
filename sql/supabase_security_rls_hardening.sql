-- Durcissement sécurité : active la RLS sur deux tables qui n'en avaient pas.
--
-- Pourquoi : sans RLS, n'importe qui possédant la clé publique "anon" (livrée dans
-- le frontend) peut lire/écrire ces tables directement via l'API REST de Supabase.
-- Le backend utilise la clé service_role, qui CONTOURNE la RLS : activer la RLS
-- sans politique ne casse donc rien côté application. Le frontend n'interroge
-- directement que notifications, profiles et user_roles (pas ces tables).
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.

ALTER TABLE IF EXISTS purchase_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reference_counters    ENABLE ROW LEVEL SECURITY;

-- Aucun accès direct pour anon / authenticated : tout passe par le backend.
REVOKE ALL ON purchase_installments FROM anon, authenticated;
REVOKE ALL ON reference_counters    FROM anon, authenticated;

-- À vérifier ensuite dans le dashboard (Table Editor > RLS) pour TOUTES les tables :
--   SELECT schemaname, tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND NOT rowsecurity;
