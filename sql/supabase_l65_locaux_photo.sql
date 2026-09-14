-- L65 : photo pour les locaux (salles / installations)
-- Permet d'illustrer un local depuis la page Locaux (comptabilité).

alter table public.locaux
  add column if not exists photo_path text,
  add column if not exists photo_url text;
