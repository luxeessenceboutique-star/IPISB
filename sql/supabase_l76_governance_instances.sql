-- L76 — Suivi des instances de gouvernance (page Réunions / instances).
-- --------------------------------------------------------------
-- Un seul modèle de suivi partagé par les deux onglets de la page
-- (Niveau ① — instances de direction, Niveau ② — instances pédagogiques),
-- distingués par la colonne `niveau`. Structure reprise du classeur de
-- suivi existant (colonnes A-P = la recommandation/instance suivie ;
-- colonnes Q-W = l'historique de ses réunions, en 1-N).

CREATE TABLE IF NOT EXISTS governance_instances (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  niveau                smallint    NOT NULL CHECK (niveau IN (1, 2)),  -- 1 = direction, 2 = pédagogique
  date                  date        NOT NULL DEFAULT current_date,
  projet                text        NOT NULL,
  demandeur             text,
  site                  text,
  axe                   text,
  code                  text,
  recommandation        text        NOT NULL,   -- "Recommandation / Instance"
  commentaire           text,
  budget_kdh            numeric,
  delai                 date,
  derniere_maj          date        DEFAULT current_date,
  historique_avancement text,       -- journal libre (horodaté par le rédacteur), voir exemple du classeur
  sponsor               text,
  pilotage              text,
  operationnel          text,
  prochain_controle     date,       -- "Prochain Contrôle / Date de réunion"
  created_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_instances_niveau ON governance_instances(niveau);

DROP TRIGGER IF EXISTS trg_governance_instances_updated_at ON governance_instances;
CREATE TRIGGER trg_governance_instances_updated_at
  BEFORE UPDATE ON governance_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Réunions tenues pour une instance/recommandation suivie (colonnes Q-W du
-- classeur) — une instance peut avoir 0 à N réunions au fil du suivi.
CREATE TABLE IF NOT EXISTS governance_instance_meetings (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id       uuid        NOT NULL REFERENCES governance_instances(id) ON DELETE CASCADE,
  instance_nom      text,       -- "Instance" (nom/type de l'organe réuni, ex. "Réunion avec l'équipe du Projet Digital")
  code_reunion      text,
  date              date        NOT NULL DEFAULT current_date,
  lieu              text,
  presence           text,      -- liste libre des présents (une ligne par personne dans le classeur d'origine)
  decisions         text,       -- "Décisions / Avancement"
  taux_realisation  numeric     CHECK (taux_realisation >= 0 AND taux_realisation <= 1),  -- fraction (0.85 = 85%)
  sort_order        integer     NOT NULL DEFAULT 0,
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_meetings_instance ON governance_instance_meetings(instance_id);

ALTER TABLE governance_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_instance_meetings ENABLE ROW LEVEL SECURITY;
-- Pas de policy SELECT : accès exclusivement via le backend service-role
-- (deps.CurrentUser.is_admin(), page déjà réservée aux admins côté route).
