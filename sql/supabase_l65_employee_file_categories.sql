-- l65: user-manageable categories for employee dossier files (RH → Paramètres).
-- Replaces the hardcoded CIN/Diplôme/Photo/CV/Contrat/Autre list in
-- backend/routers/employee_files.py with a real table RH can add to.

-- employee_files.type was created with a CHECK constraint limited to the
-- original 6 values (supabase_rh_phase8_employee_files_migration.sql) — drop
-- it, otherwise uploading a file under any newly-added category would be
-- silently rejected by Postgres even though the backend now allows it.
ALTER TABLE employee_files DROP CONSTRAINT IF EXISTS employee_files_type_check;

CREATE TABLE IF NOT EXISTS employee_file_categories (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  value       text        NOT NULL UNIQUE,  -- stable slug stored in employee_files.type
  label       text        NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE employee_file_categories ENABLE ROW LEVEL SECURITY;

-- Seed with the categories that already exist today, so no existing
-- employee_files.type value is left without a matching label.
INSERT INTO employee_file_categories (value, label) VALUES
  ('cin', 'CIN'),
  ('diplome', 'Diplôme'),
  ('photo', 'Photo d''identité'),
  ('cv', 'CV'),
  ('contrat', 'Contrat signé'),
  ('autre', 'Autre')
ON CONFLICT (value) DO NOTHING;
