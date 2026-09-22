-- L74 — Budget estimé sur un article du catalogue d'une catégorie, repris
-- automatiquement (comme code/identification/caractéristiques) quand cet
-- article est sélectionné sur une demande d'achat.

alter table public.accounting_category_articles
  add column if not exists budget_estimate numeric;
