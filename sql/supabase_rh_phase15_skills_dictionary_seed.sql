-- ============================================================
-- IPISB Platform — RH Phase 15 : Dictionnaire de compétences (liste standard)
-- Run this ONCE in the Supabase SQL Editor.
--
-- Pré-remplit le référentiel `skills` (Formation > Compétences) avec une
-- liste type adaptée à un établissement de formation : c'est ce référentiel
-- qui alimente le menu « Compétence… » de la matrice de compétences.
--
-- Idempotent : une compétence dont le nom existe déjà (insensible à la
-- casse, même désactivée) n'est jamais dupliquée ni modifiée, donc la
-- relancer ou garder vos propres compétences ne pose aucun problème.
-- Les catégories sont celles de l'écran : technique, soft_skills,
-- compliance, management, langue, securite. Tout est modifiable ensuite
-- depuis l'écran (ajout / suppression).
-- ============================================================

INSERT INTO skills (name, category, description)
SELECT v.name, v.category, v.description
FROM (VALUES
  -- ── Savoir-être (soft_skills) ──────────────────────────────────────────
  ('Communication orale',            'soft_skills', 'S''exprimer clairement et adapter son discours à son interlocuteur (apprenants, collègues, partenaires).'),
  ('Communication écrite',           'soft_skills', 'Rédiger des messages, courriers et documents clairs, structurés et sans erreur.'),
  ('Travail en équipe',              'soft_skills', 'Coopérer, partager l''information et contribuer à un résultat collectif.'),
  ('Sens de l''organisation',        'soft_skills', 'Planifier, prioriser et tenir ses échéances de façon fiable.'),
  ('Gestion du temps',               'soft_skills', 'Répartir son temps entre les tâches selon leur urgence et leur importance.'),
  ('Autonomie et initiative',        'soft_skills', 'Mener ses missions sans supervision constante et proposer des améliorations.'),
  ('Sens des responsabilités',       'soft_skills', 'Assumer ses engagements et leurs conséquences.'),
  ('Résolution de problèmes',        'soft_skills', 'Analyser une difficulté, identifier la cause et proposer une solution adaptée.'),
  ('Adaptabilité',                   'soft_skills', 'S''ajuster aux changements de contexte, d''outils ou de priorités.'),
  ('Rigueur et sens du détail',      'soft_skills', 'Produire un travail exact, complet et vérifié.'),
  ('Sens du service et accueil',     'soft_skills', 'Accueillir et accompagner les apprenants, familles et visiteurs avec courtoisie et réactivité.'),
  ('Gestion du stress',              'soft_skills', 'Rester efficace et posé(e) en situation de pression.'),

  -- ── Savoir-faire techniques (technique) ────────────────────────────────
  ('Bureautique (Word, Excel)',      'technique',   'Utiliser les outils bureautiques courants pour produire documents et tableaux.'),
  ('Outils numériques et plateformes','technique',  'Utiliser les logiciels et plateformes de l''établissement (gestion, communication, suivi).'),
  ('Saisie et traitement de données','technique',   'Saisir, contrôler et exploiter des données avec exactitude.'),
  ('Classement et archivage',        'technique',   'Organiser, classer et conserver les documents administratifs.'),
  ('Gestion administrative',         'technique',   'Tenir les dossiers, courriers, registres et procédures administratives courantes.'),
  ('Comptabilité générale',          'technique',   'Enregistrer et contrôler les opérations comptables courantes.'),
  ('Suivi des paiements et recouvrement','technique','Suivre les échéances, relancer et rapprocher les règlements.'),
  ('Gestion de la paie et des congés','technique',  'Préparer les éléments de paie et suivre les congés et absences.'),
  ('Animation de formation',         'technique',   'Animer une séance, transmettre des contenus et dynamiser un groupe.'),
  ('Ingénierie pédagogique',         'technique',   'Concevoir des programmes, supports et parcours de formation.'),
  ('Évaluation des apprenants',      'technique',   'Concevoir et corriger des évaluations, suivre la progression.'),
  ('Rédaction de rapports',          'technique',   'Rédiger comptes rendus, bilans et rapports d''activité.'),

  -- ── Management (management) ────────────────────────────────────────────
  ('Leadership',                     'management',  'Fédérer une équipe autour d''objectifs et donner l''exemple.'),
  ('Gestion d''équipe',              'management',  'Répartir le travail, suivre les résultats et accompagner les collaborateurs.'),
  ('Prise de décision',              'management',  'Décider de façon éclairée et assumer le choix retenu.'),
  ('Planification et pilotage',      'management',  'Fixer des objectifs, planifier les actions et suivre les indicateurs.'),
  ('Délégation',                     'management',  'Confier des missions adaptées et en contrôler le résultat.'),
  ('Gestion de projet',              'management',  'Conduire un projet de la définition à la clôture (délais, coûts, qualité).'),
  ('Gestion budgétaire',             'management',  'Préparer, suivre et ajuster un budget.'),
  ('Gestion des conflits',           'management',  'Prévenir et résoudre les tensions au sein d''une équipe ou avec un tiers.'),

  -- ── Conformité (compliance) ────────────────────────────────────────────
  ('Réglementation du travail',      'compliance',  'Connaître et appliquer le droit du travail et les obligations sociales.'),
  ('Conformité administrative et réglementaire','compliance','Respecter les exigences réglementaires applicables à un établissement de formation.'),
  ('Confidentialité et protection des données','compliance','Protéger les données personnelles des apprenants et du personnel.'),
  ('Éthique et déontologie',         'compliance',  'Agir avec intégrité, impartialité et respect des règles de la profession.'),

  -- ── Langues (langue) ───────────────────────────────────────────────────
  ('Français professionnel',         'langue',      'Maîtrise du français à l''oral et à l''écrit dans un contexte professionnel.'),
  ('Arabe professionnel',            'langue',      'Maîtrise de l''arabe à l''oral et à l''écrit dans un contexte professionnel.'),
  ('Anglais professionnel',          'langue',      'Maîtrise de l''anglais à l''oral et à l''écrit dans un contexte professionnel.'),

  -- ── Santé et sécurité (securite) ───────────────────────────────────────
  ('Hygiène et sécurité au travail', 'securite',    'Appliquer les règles d''hygiène et de sécurité de l''établissement.'),
  ('Premiers secours',               'securite',    'Porter les premiers secours en attendant les services d''urgence.'),
  ('Prévention incendie et évacuation','securite',  'Connaître les consignes d''incendie et conduire une évacuation.')
) AS v(name, category, description)
WHERE NOT EXISTS (
  SELECT 1 FROM skills s WHERE lower(s.name) = lower(v.name)
);
