# Sécurité — IPISB-Administratif

Ce document résume le durcissement appliqué et ce qu'il reste à faire **hors du code**.

## Variables d'environnement liées à la sécurité (backend)

| Variable | Rôle |
|---|---|
| `ENV=production` | Désactive `/docs`, `/redoc`, `/openapi.json` ; active HSTS ; retire les origines `localhost` du CORS ; ferme (503) le login gate si la lecture de `profiles` échoue. **À définir en production.** |
| `FRONTEND_URL` | Origine exacte autorisée par CORS (aucun joker `*.vercel.app`). |
| `EXTRA_ALLOWED_ORIGINS` | URLs exactes supplémentaires (préproduction…), séparées par des virgules. |
| `SEED_*_PASSWORD` | Mots de passe des scripts de seed (12+ caractères). Jamais dans le code. Les seeds refusent de tourner avec `ENV=production` (sauf `SEED_ALLOW_PRODUCTION=1` pour `seed_admins.py` / `seed_staff.py`). |

Le serveur doit être lancé avec `--proxy-headers --forwarded-allow-ips='*'` (déjà dans `Procfile` et `nixpacks.toml`) pour que la limitation de débit voie l'IP réelle du visiteur.

## Ce qui a été mis en place (`backend/security.py`)

- **CORS strict** : URL exacte du frontend ; méthodes et en-têtes explicites ; plus de joker `*.vercel.app`.
- **En-têtes de sécurité** sur toutes les réponses API : `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store`, HSTS en production. Mêmes en-têtes (sans CSP) dans `frontend/vercel.json`.
- **Limitation de débit** (en mémoire, par IP) : candidature publique (5/heure), vérification de document (30/10 min), approbation de connexion (20/10 min).
- **Validation des historiques de chat** (copilote, générateur d'annonces) : rôles `user`/`assistant` uniquement, 40 messages max, 8000 caractères max.
- **Filtres PostgREST** : `sanitize_filter_term()` appliqué aux 5 recherches qui construisaient un `.or_()` en texte.
- **Excel** : `neutralize_formula()` dans `utils/excel.py` (cellules texte commençant par `= + - @`).
- **Journal d'audit** : un échec d'écriture est maintenant journalisé (plus de `except: pass`).
- **Rôles** : `POST /users/{id}/roles` n'accepte que les rôles connus.
- **Seeds** : plus aucun mot de passe en dur ; plus d'affichage du mot de passe.
- **SQL** : `sql/supabase_security_rls_hardening.sql` active la RLS sur `purchase_installments` et `reference_counters`.

## À faire par vous (non réalisable depuis le code)

1. **Exécuter** `sql/supabase_security_rls_hardening.sql` dans Supabase, puis vérifier la RLS de **toutes** les tables :
   `SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;`
2. **Changer les mots de passe** des comptes déjà créés par les anciens seeds (admin1/admin2, caisse, comptable, comptes de démo) : les anciennes valeurs sont restées dans l'historique git. Ne jamais les réutiliser.
3. **Définir `ENV=production`** (et `FRONTEND_URL` exact) dans Railway.
4. **Supabase Auth** : activer CAPTCHA et limites de débit, politique de mot de passe, « Confirm email », désactiver les inscriptions ouvertes, MFA pour les admins.
5. **Vérifier** que le frontend n'écrit pas dans `user_roles` sans politique RLS adaptée : `dashboard.users.tsx` fait un `insert` direct depuis le navigateur (la RLS doit réserver cela aux admins).
6. **Sauvegardes** : activer la restauration à un instant donné (PITR) et tester une restauration.
7. **GitHub** : vérifier que l'ancien jeton `prv1ammar` est révoqué ; garder le dépôt privé ; activer le secret scanning.

## Restant (non traité ici)

- Mise à jour de FastAPI/Starlette (Starlette 0.41.3 a des avis connus) : saut de version important, à tester.
- Dépendances Python non épinglées : générer un lock avec hashes (`pip-compile --generate-hashes`).
- Contrôle du type réel des fichiers (magic bytes) dans `utils/uploads.py`, plafond de taille avant lecture complète.
- Audit des connexions et des exports ; CSP dans `vercel.json`.
- Limitation de débit répartie (Redis) si le backend tourne sur plusieurs instances : le limiteur actuel est par process.
