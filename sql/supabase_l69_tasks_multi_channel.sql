-- L69 : plusieurs canaux par tâche (module Tâches / Comptabilité)
-- Une tâche peut désormais réunir V0, V1 et V2 à la fois (ex. un V0 saisit,
-- un V1 supervise, un V2 valide, tous sur la même tâche). Remplace
-- tasks.channel (texte unique) par tasks.channels (text[]).

alter table public.tasks add column if not exists channels text[] not null default '{}';

update public.tasks
  set channels = array[channel]
  where channel is not null and channels = '{}';

alter table public.tasks drop column if exists channel;

alter table public.tasks
  add constraint tasks_channels_check check (channels <@ array['v0', 'v1', 'v2']::text[]);

create index if not exists idx_tasks_channels on public.tasks using gin (channels);
