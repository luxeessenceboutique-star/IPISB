-- ============================================================
-- Demandes d'achat : champ « Imputation » distinct du « Code analytique »
-- Run this ONCE in the Supabase SQL Editor
--
-- purchase_requests.project reste le « Code analytique » (ex. BUD-2026-FORM-01) ;
-- purchase_requests.imputation est la nouvelle imputation (ex. Budget Formation 2026).
-- ============================================================
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS imputation text;
