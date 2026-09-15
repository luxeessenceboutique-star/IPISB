-- L67 : plusieurs assignés par tâche (module Tâches / Comptabilité)
-- Certains canaux (V0/V1/V2) demandent qu'une tâche soit portée par 2 ou 3
-- personnes à la fois, pas une seule. Remplace tasks.assignee_id (uuid
-- unique) par tasks.assignee_ids (uuid[]), sans perte de données.

alter table public.tasks add column if not exists assignee_ids uuid[] not null default '{}';

update public.tasks
  set assignee_ids = array[assignee_id]
  where assignee_id is not null and assignee_ids = '{}';

alter table public.tasks drop column if exists assignee_id;

create index if not exists idx_tasks_assignee_ids on public.tasks using gin (assignee_ids);
