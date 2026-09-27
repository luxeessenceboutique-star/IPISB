-- L75 — Tâches modèles par rubrique de fiche de poste.
-- --------------------------------------------------------------
-- L'import IA d'une fiche de poste (routers/rh_job_descriptions.py,
-- /analyze-import + /apply-import) n'extrayait jusqu'ici que la structure
-- des rubriques (grands titres/sous-titres pondérés) — jamais les tâches
-- concrètes listées sous chaque rubrique dans le document source, d'où un
-- « Aucune tâche. » systématique juste après import.
--
-- Ces tâches modèles sont volontairement DISTINCTES de daily_tasks : ce
-- sont des exemples de référence rattachés à la rubrique elle-même (pas
-- de date, pas de statut, pas de salarié), pas des instances réelles de
-- travail soumises un jour donné par un salarié précis. Un salarié reste
-- libre de s'en inspirer via « Ajouter une tâche », qui crée alors une
-- vraie ligne daily_tasks (soumise à validation, notée).

CREATE TABLE IF NOT EXISTS job_description_heading_tasks (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  heading_id  uuid        NOT NULL REFERENCES job_description_headings(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jd_heading_tasks_heading ON job_description_heading_tasks(heading_id);

ALTER TABLE job_description_heading_tasks ENABLE ROW LEVEL SECURITY;
-- Pas de policy SELECT : comme le reste RH, accès exclusivement via le
-- backend service-role (deps.can_access_rh()).
