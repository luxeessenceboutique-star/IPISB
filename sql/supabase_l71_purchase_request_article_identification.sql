-- L71 : identification article sur une demande d'achat, distincte du code
-- article (référence libre pour décrire/identifier précisément l'article
-- demandé — modèle, marque, référence fournisseur, etc.).

alter table public.purchase_requests
  add column if not exists article_identification text;
