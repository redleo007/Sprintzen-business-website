-- ===== roles =====
create type public.app_role as enum ('Admin','TeamLeader','TeamMember');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  avatar_color text not null default '#7c5cff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ===== projects =====
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  owner_id uuid not null references auth.users(id) on delete cascade,
  sprint_length_days int not null default 14,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
grant select, insert, update, delete on public.project_members to authenticated;
grant all on public.project_members to service_role;
alter table public.project_members enable row level security;

create or replace function public.is_project_member(_project_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = _project_id
      and (p.owner_id = _user_id
           or exists (select 1 from public.project_members m
                      where m.project_id = p.id and m.user_id = _user_id))
  )
$$;

create or replace function public.is_project_owner(_project_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = _project_id and p.owner_id = _user_id)
$$;

create or replace function public.shares_project(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where (p.owner_id = _a or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = _a))
      and (p.owner_id = _b or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = _b))
  )
$$;

-- ===== kanban =====
create table public.kanban_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  assignee_id uuid references auth.users(id) on delete set null,
  points int not null default 0,
  status text not null default 'todo' check (status in ('todo','inprogress','review','done')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.kanban_cards to authenticated;
grant all on public.kanban_cards to service_role;
alter table public.kanban_cards enable row level security;

-- ===== poker sessions =====
create table public.poker_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  notes text not null default '',
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.poker_sessions to authenticated;
grant all on public.poker_sessions to service_role;
alter table public.poker_sessions enable row level security;

create or replace function public.session_project(_session_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.poker_sessions where id = _session_id
$$;

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.poker_sessions(id) on delete cascade,
  title text not null,
  description text not null default '',
  risk text not null default 'low' check (risk in ('low','medium','high')),
  complexity int not null default 3 check (complexity between 1 and 10),
  revealed boolean not null default false,
  final_points int,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.stories to authenticated;
grant all on public.stories to service_role;
alter table public.stories enable row level security;

create or replace function public.story_project(_story_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select ps.project_id from public.stories s join public.poker_sessions ps on ps.id = s.session_id where s.id = _story_id
$$;

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value int not null check (value in (1,2,3,5,8,13,21)),
  created_at timestamptz not null default now(),
  unique (story_id, user_id)
);
grant select, insert, update, delete on public.votes to authenticated;
grant all on public.votes to service_role;
alter table public.votes enable row level security;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  type text not null default 'info',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

-- ===== policies =====
create policy "own profile read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_project(id, auth.uid()));
create policy "own profile write" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.shares_project(user_id, auth.uid()));

create policy "projects read" on public.projects for select to authenticated
  using (public.is_project_member(id, auth.uid()));
create policy "projects insert" on public.projects for insert to authenticated
  with check (owner_id = auth.uid());
create policy "projects update" on public.projects for update to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(),'Admin'))
  with check (owner_id = auth.uid() or public.has_role(auth.uid(),'Admin'));
create policy "projects delete" on public.projects for delete to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(),'Admin'));

create policy "members read" on public.project_members for select to authenticated
  using (user_id = auth.uid() or public.is_project_member(project_id, auth.uid()));
create policy "members manage" on public.project_members for insert to authenticated
  with check (public.is_project_owner(project_id, auth.uid()) or public.has_role(auth.uid(),'Admin'));
create policy "members delete" on public.project_members for delete to authenticated
  using (public.is_project_owner(project_id, auth.uid()) or public.has_role(auth.uid(),'Admin'));

create policy "cards read" on public.kanban_cards for select to authenticated
  using (public.is_project_member(project_id, auth.uid()));
create policy "cards insert" on public.kanban_cards for insert to authenticated
  with check (public.is_project_member(project_id, auth.uid()));
create policy "cards update" on public.kanban_cards for update to authenticated
  using (public.is_project_member(project_id, auth.uid()))
  with check (public.is_project_member(project_id, auth.uid()));
create policy "cards delete" on public.kanban_cards for delete to authenticated
  using (public.is_project_member(project_id, auth.uid()));

create policy "sessions read" on public.poker_sessions for select to authenticated
  using (public.is_project_member(project_id, auth.uid()));
create policy "sessions insert" on public.poker_sessions for insert to authenticated
  with check (public.is_project_member(project_id, auth.uid()) and created_by = auth.uid());
create policy "sessions update" on public.poker_sessions for update to authenticated
  using (public.is_project_member(project_id, auth.uid()))
  with check (public.is_project_member(project_id, auth.uid()));
create policy "sessions delete" on public.poker_sessions for delete to authenticated
  using (created_by = auth.uid() or public.is_project_owner(project_id, auth.uid()));

create policy "stories read" on public.stories for select to authenticated
  using (public.is_project_member(public.session_project(session_id), auth.uid()));
create policy "stories insert" on public.stories for insert to authenticated
  with check (public.is_project_member(public.session_project(session_id), auth.uid()));
create policy "stories update" on public.stories for update to authenticated
  using (public.is_project_member(public.session_project(session_id), auth.uid()))
  with check (public.is_project_member(public.session_project(session_id), auth.uid()));
create policy "stories delete" on public.stories for delete to authenticated
  using (public.is_project_member(public.session_project(session_id), auth.uid()));

create policy "votes read" on public.votes for select to authenticated
  using (public.is_project_member(public.story_project(story_id), auth.uid()));
create policy "votes insert" on public.votes for insert to authenticated
  with check (user_id = auth.uid() and public.is_project_member(public.story_project(story_id), auth.uid()));
create policy "votes update" on public.votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "votes delete" on public.votes for delete to authenticated
  using (user_id = auth.uid());

create policy "notifications read" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "notifications insert" on public.notifications for insert to authenticated
  with check (true);
create policy "notifications update" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications delete" on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- ===== triggers =====
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create trigger t_projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger t_cards_touch before update on public.kanban_cards for each row execute function public.touch_updated_at();
create trigger t_sessions_touch before update on public.poker_sessions for each row execute function public.touch_updated_at();
create trigger t_stories_touch before update on public.stories for each row execute function public.touch_updated_at();
create trigger t_profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted public.app_role;
begin
  insert into public.profiles (id, name, email, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data->>'avatar_color', '#7c5cff')
  ) on conflict (id) do nothing;

  begin
    wanted := coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'TeamMember');
  exception when others then
    wanted := 'TeamMember';
  end;

  insert into public.user_roles (user_id, role) values (new.id, wanted)
  on conflict (user_id, role) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== realtime =====
alter table public.kanban_cards replica identity full;
alter table public.poker_sessions replica identity full;
alter table public.stories replica identity full;
alter table public.votes replica identity full;
alter table public.notifications replica identity full;
alter publication supabase_realtime add table public.kanban_cards;
alter publication supabase_realtime add table public.poker_sessions;
alter publication supabase_realtime add table public.stories;
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.notifications;