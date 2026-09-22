-- L73 — Cahier des charges (CDC) joignable à un article du catalogue d'une
-- catégorie Comptabilité (fiche technique / spécifications de l'article).

alter table public.accounting_category_articles
  add column if not exists cdc_path text,
  add column if not exists cdc_name text;
