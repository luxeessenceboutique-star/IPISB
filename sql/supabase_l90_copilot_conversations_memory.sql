-- L90 : Copilote — historique des conversations (chaque conversation isolée)
-- et mémoire à long terme par utilisateur.
--
-- - copilot_conversations : un fil de discussion, propriété d'un seul
--   utilisateur. `summary` garde un résumé glissant des anciens échanges
--   quand le fil devient long (le modèle ne reçoit que les derniers messages
--   + ce résumé).
-- - copilot_messages : messages d'une conversation. `meta` porte l'agent qui
--   a répondu, les étapes du mode « Analyse approfondie », une proposition
--   d'action, ou le fait qu'un message a été dicté à la voix.
-- - copilot_memories : faits durables appris sur l'utilisateur (préférences,
--   rôle, habitudes), injectés dans toutes ses conversations ; visibles et
--   supprimables par l'utilisateur depuis le Copilote.
--
-- Accès exclusivement via le backend (service role), comme L70 : RLS
-- activée sans policy.

create table if not exists public.copilot_conversations (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null default 'Nouvelle conversation',
  language    text        not null default 'fr',
  summary     text,
  pinned      boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_copilot_conversations_user
  on public.copilot_conversations(user_id, updated_at desc);

create table if not exists public.copilot_messages (
  id              uuid        default gen_random_uuid() primary key,
  conversation_id uuid        not null references public.copilot_conversations(id) on delete cascade,
  role            text        not null check (role in ('user', 'assistant')),
  content         text        not null default '',
  meta            jsonb       not null default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists idx_copilot_messages_conv
  on public.copilot_messages(conversation_id, created_at);

create table if not exists public.copilot_memories (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  content     text        not null check (char_length(content) <= 300),
  source_conversation_id uuid references public.copilot_conversations(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_copilot_memories_user
  on public.copilot_memories(user_id, created_at desc);

alter table public.copilot_conversations enable row level security;
alter table public.copilot_messages      enable row level security;
alter table public.copilot_memories      enable row level security;
-- Pas de policy : accès exclusivement via le backend service-role.
