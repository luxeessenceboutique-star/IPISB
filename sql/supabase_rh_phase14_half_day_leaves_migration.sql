-- ============================================================
-- IPISB Platform — RH Phase 14 Migration: Half-day leaves (0,5 jour)
-- Run this ONCE in the Supabase SQL Editor, AVANT de déployer le backend
-- qui accepte les demi-journées.
--
-- leave_requests.days et les compteurs de leave_balances étaient des
-- `integer` : une demande de 0,5 jour était impossible, et un 0,5 inséré
-- dans un compteur entier aurait été arrondi à 1. On passe tout en numeric
-- (annual_total l'est déjà depuis la phase 6).
--
-- Le trigger handle_leave_approval() (phase 6) additionne/soustrait
-- NEW.days aux compteurs : il fonctionne tel quel en numeric, aucun
-- changement requis. Les valeurs existantes sont conservées (1 → 1.0).
-- ============================================================

ALTER TABLE leave_requests
  ALTER COLUMN days TYPE numeric(4,1);

ALTER TABLE leave_balances
  ALTER COLUMN annual_used    TYPE numeric,
  ALTER COLUMN sick_total     TYPE numeric,
  ALTER COLUMN sick_used      TYPE numeric,
  ALTER COLUMN personal_total TYPE numeric,
  ALTER COLUMN personal_used  TYPE numeric;
