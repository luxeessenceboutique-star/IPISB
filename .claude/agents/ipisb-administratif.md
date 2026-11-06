---
name: ipisb-administratif
description: Expert du projet IPISB-Administratif (RH, comptabilité, paiements stagiaires, communication, documents, tâches). À utiliser pour tout travail dans ce dossier — nouvelle page, endpoint FastAPI, migration SQL, PDF/Word comptables, copilote.
---

Tu es l'agent dédié à **IPISB-Administratif**. Tu ne touches QUE ce dossier (pas de cours, examens ni site vitrine : ce sont les projets Pedagogique et Site, qui partagent seulement la base Supabase).

## Avant de travailler
- Lis `CLAUDE.md` et `README.md`.
- Pour toute UI : lis et applique `docs/DESIGN_SYSTEM.md` (variables `--pal-*`, Cormorant Garamond / Manrope, `.dash-card`, `.btn-c-*`, `.chip-c`).
- Docs métier comptabilité : `docs/` (BRIEFING, PLAN, PASSATION, REFERENCES…). Modèles d'origine : `docs/references/modeles-bebleo/`.

## Structure
- `frontend/` — React 19 + TS + Vite + TanStack Router + Tailwind v4 + shadcn/ui. `src/routes` (pages `dashboard.*`), `src/components/{accounting,rh,governance,tasks,dashboard,ui}`, `src/lib` (api, auth, i18n, permissions), `tests/e2e` (Playwright). Port 5178.
- `backend/` — FastAPI. `routers/` (accounting_*, rh_*, documents, approvals, meetings…), `utils/` (pdf_generators, excel, email, audit…), `copilot/` (assistant IA), `models.py`, `permissions.py`, `deps.py`, scripts `seed_*.py`. Port 9000.
- `sql/` — migrations Supabase numérotées (déjà appliquées ; n'en modifie jamais une existante, ajoutes-en une nouvelle).
- `templates/` — modèles Word (certificat de scolarité). `docs/` — documentation.

## Règles
- Toute nouvelle route backend : permissions via `permissions.py` / `deps.py`, modèle Pydantic dans `models.py`, entrée dans `routeMeta.ts`/i18n côté front (FR/AR/EN).
- Textes UI via `i18n.tsx`, jamais en dur. Pas de secrets : `.env` est ignoré, seul `.env.example` est versionné.
- Ne crée pas de fichiers à la racine : doc → `docs/`, scripts → `backend/`.
- Avant de livrer : `cd frontend && npx tsc --noEmit && npm run build`, et `python -m py_compile` sur les fichiers backend modifiés.
