-- L77 — Plusieurs articles par demande d'achat.
-- --------------------------------------------------------------
-- Jusqu'ici, une DA ne portait qu'un seul article (article_code /
-- article_identification / characteristics / quantity, colonnes de
-- purchase_requests) — l'utilisateur devait créer une DA par article,
-- même pour piocher plusieurs articles d'une même catégorie.
--
-- Le reste du pipeline (devis, création de commande, réceptions,
-- échéancier) fonctionne déjà au niveau de la DA entière (un devis/une
-- commande couvre la DA, pas un article précis — purchases.quantity est
-- même fixé à 1 par create_order, jamais recopié depuis la DA), donc rien
-- en aval n'a besoin de changer : seule la DA elle-même devient un panier
-- de plusieurs lignes.
--
-- Les colonnes historiques de purchase_requests sont conservées telles
-- quelles (aucune perte de données sur les DA déjà créées) ; une DA créée
-- après cette migration les laisse simplement vides et porte ses articles
-- dans purchase_request_items à la place. L'API/le frontend basculent sur
-- la table présente (items non vides) pour l'affichage.

CREATE TABLE IF NOT EXISTS purchase_request_items (
  id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_request_id     uuid        NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  catalog_article_id      uuid        REFERENCES accounting_category_articles(id) ON DELETE SET NULL,
  article_code            text,
  article_identification  text        NOT NULL,
  characteristics         text,
  quantity                numeric     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  budget_estimate         numeric     NOT NULL DEFAULT 0,
  sort_order              integer     NOT NULL DEFAULT 0,
  created_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_items_request ON purchase_request_items(purchase_request_id);

ALTER TABLE purchase_request_items ENABLE ROW LEVEL SECURITY;
-- Pas de policy SELECT : accès exclusivement via le backend service-role,
-- comme le reste du module Comptabilité.
