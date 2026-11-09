-- ============================================================
-- Évaluations : type « Personnalisée » (période choisie par dates)
-- Run this ONCE in the Supabase SQL Editor
--
-- review_type accepte désormais 'custom'. Sa période est stockée
-- "AAAA-MM-JJ/AAAA-MM-JJ" (début/fin incluses).
-- ============================================================
ALTER TABLE performance_reviews DROP CONSTRAINT IF EXISTS performance_reviews_review_type_check;
ALTER TABLE performance_reviews
  ADD CONSTRAINT performance_reviews_review_type_check
  CHECK (review_type IN ('monthly', 'semestrial', 'annual', 'custom'));
