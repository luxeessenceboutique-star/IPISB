-- L72 — Vivier d'interviewers pour le recrutement.
-- Jusqu'ici, la liste des interviewers proposés pour un créneau/entretien se
-- limitait automatiquement aux comptes de rôle rh/assistant_rh — trop
-- restrictif dès qu'un directeur ou un autre collaborateur (comptabilité,
-- etc.) doit aussi mener des entretiens. Ce vivier est un ajout manuel par
-- l'admin, indépendant du rôle du compte, géré depuis Recrutement → Créneaux.

create table if not exists public.recruitment_interviewers (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  added_by   uuid references auth.users(id) on delete set null,
  added_at   timestamptz not null default now()
);

alter table public.recruitment_interviewers enable row level security;
-- Pas de policy SELECT : comme le reste RH, accès exclusivement via le
-- backend service-role (deps.can_access_rh()).
