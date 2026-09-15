-- L70 : actions Comptabilité proposées par le copilote, en attente de
-- confirmation explicite par l'utilisateur avant exécution réelle (voir
-- backend/copilot/actions.py). Aucune écriture financière ne part jamais
-- directement d'un appel LLM — seule la confirmation déclenche l'exécution,
-- via le même endpoint et les mêmes règles de permission que l'UI.

create table if not exists public.copilot_pending_actions (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  action_key  text        not null,
  path_params jsonb       not null default '{}',
  payload     jsonb,
  summary     text        not null,
  status      text        not null default 'pending'
                check (status in ('pending', 'confirmed', 'cancelled', 'failed', 'expired')),
  result      jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists idx_copilot_pending_actions_user on public.copilot_pending_actions(user_id, status);

alter table public.copilot_pending_actions enable row level security;
-- Pas de policy : accès exclusivement via le backend service-role.
