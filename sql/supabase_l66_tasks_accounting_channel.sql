-- L66 : canal de permission Comptabilité (V0/V1/V2) sur le module Tâches
-- (table `tasks`, voir sql/supabase_tasks_migration.sql). Pertinent
-- uniquement pour domain = 'comptabilite' ; nul pour les autres domaines.

alter table public.tasks
  add column if not exists channel text
    constraint tasks_channel_check check (channel in ('v0', 'v1', 'v2'));

create index if not exists idx_tasks_channel on public.tasks(channel);
