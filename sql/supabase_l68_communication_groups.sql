-- L68 : groupes de discussion (page Communication) liés à une tâche
-- multi-assignés. Un groupe par tâche (task_id unique) ; créé
-- automatiquement dès qu'une tâche compte 2 assignés ou plus (voir
-- routers/tasks.py::_sync_communication_group) — l'appartenance reste
-- ensuite synchronisée avec la liste d'assignés de la tâche.

create table if not exists public.communication_groups (
  id          uuid        default gen_random_uuid() primary key,
  task_id     uuid        not null unique references public.tasks(id) on delete cascade,
  name        text        not null,
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.communication_group_members (
  group_id  uuid        not null references public.communication_groups(id) on delete cascade,
  user_id   uuid        not null references auth.users(id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.communication_group_messages (
  id          uuid        default gen_random_uuid() primary key,
  group_id    uuid        not null references public.communication_groups(id) on delete cascade,
  author_id   uuid        references auth.users(id) on delete set null,
  text        text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_comm_group_members_user on public.communication_group_members(user_id);
create index if not exists idx_comm_group_messages_group on public.communication_group_messages(group_id, created_at);

alter table public.communication_groups enable row level security;
alter table public.communication_group_members enable row level security;
alter table public.communication_group_messages enable row level security;
-- Pas de policy : accès exclusivement via le backend service-role.
