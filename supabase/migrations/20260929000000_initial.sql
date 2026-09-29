create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table private.initial_owner_allowlist (
  email_hash text primary key,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on private.initial_owner_allowlist from public, anon, authenticated, supabase_auth_admin;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 60),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id),
  unique (user_id)
);
create unique index group_members_group_display_name_idx
  on public.group_members (group_id, lower(display_name));

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  max_uses integer not null default 30 check (max_uses between 1 and 100),
  uses integer not null default 0 check (uses >= 0),
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 70),
  event_date date not null,
  event_time time,
  place text check (place is null or char_length(place) <= 80),
  category text not null check (category in ('apero', 'diner', 'sortie', 'anniversaire', 'autre')),
  created_at timestamptz not null default now()
);
create index events_group_date_idx on public.events(group_id, event_date, event_time);

create table public.santa_draws (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references public.groups(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.santa_assignments (
  draw_id uuid not null references public.santa_draws(id) on delete cascade,
  giver_user_id uuid not null references public.group_members(user_id) on delete cascade,
  recipient_user_id uuid not null references public.group_members(user_id) on delete cascade,
  primary key (draw_id, giver_user_id),
  unique (draw_id, recipient_user_id),
  check (giver_user_id <> recipient_user_id)
);

create table public.santa_reveals (
  draw_id uuid not null references public.santa_draws(id) on delete cascade,
  user_id uuid not null references public.group_members(user_id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (draw_id, user_id)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.events enable row level security;
alter table public.santa_draws enable row level security;
alter table public.santa_assignments enable row level security;
alter table public.santa_reveals enable row level security;

create or replace function private.is_group_member(target_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group and gm.user_id = (select auth.uid())
  );
$$;

create policy groups_read_for_members on public.groups
  for select to authenticated
  using (private.is_group_member(id));

create policy members_read_for_group on public.group_members
  for select to authenticated
  using (private.is_group_member(group_id));

create policy events_read_for_group on public.events
  for select to authenticated
  using (exists (select 1 from public.group_members gm where gm.group_id = events.group_id and gm.user_id = (select auth.uid())));
create policy events_add_for_group_members on public.events
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.group_members gm where gm.group_id = events.group_id and gm.user_id = (select auth.uid()))
  );

revoke all on public.groups, public.group_members, public.group_invites, public.events,
  public.santa_draws, public.santa_assignments, public.santa_reveals from public, anon, authenticated;
grant select on public.groups, public.group_members, public.events to authenticated;
grant insert on public.events to authenticated;

create or replace function public.get_my_group()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'owner_id', g.owner_user_id,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', gm.user_id,
        'name', gm.display_name,
        'role', gm.role
      ) order by gm.joined_at)
      from public.group_members gm
      where gm.group_id = g.id
    ), '[]'::jsonb)
  )
  from public.group_members mine
  join public.groups g on g.id = mine.group_id
  where mine.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.create_initial_group(group_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_name text := trim(group_name);
  new_group_id uuid;
  member_name text;
begin
  if current_user_id is null then raise exception 'Connexion requise.'; end if;
  if char_length(clean_name) not between 2 and 60 then raise exception 'Le nom du groupe doit contenir entre 2 et 60 caractères.'; end if;
  perform pg_advisory_xact_lock(hashtext('les-quickos-initial-group'));
  if exists (select 1 from public.group_members where user_id = current_user_id) then
    raise exception 'Ce compte appartient déjà à un groupe.';
  end if;
  if exists (select 1 from public.groups) then
    raise exception 'Le groupe existe déjà. Rejoins-le avec un lien d’invitation.';
  end if;
  if not exists (
    select 1 from private.initial_owner_allowlist allowlist
    where allowlist.email_hash = encode(extensions.digest(convert_to(lower(auth.jwt() ->> 'email'), 'UTF8'), 'sha256'), 'hex')
      and allowlist.claimed_at is null
  ) then raise exception 'Ce compte n’est pas autorisé à créer le groupe initial.'; end if;
  member_name := coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'display_name'), ''), split_part(auth.jwt() ->> 'email', '@', 1));
  insert into public.groups(name, owner_user_id) values (clean_name, current_user_id) returning id into new_group_id;
  insert into public.group_members(group_id, user_id, display_name, role)
    values (new_group_id, current_user_id, left(member_name, 40), 'owner');
  update private.initial_owner_allowlist
    set claimed_at = now()
    where email_hash = encode(extensions.digest(convert_to(lower(auth.jwt() ->> 'email'), 'UTF8'), 'sha256'), 'hex')
      and claimed_at is null;
  return new_group_id;
end;
$$;

create or replace function public.create_group_invite(target_group uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  invite_token text := gen_random_uuid()::text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.group_members gm where gm.group_id = target_group and gm.user_id = auth.uid()
  ) then raise exception 'Tu dois être membre de ce groupe pour inviter quelqu’un.'; end if;
  insert into public.group_invites(group_id, token_hash, created_by, expires_at)
    values (target_group, encode(extensions.digest(convert_to(invite_token, 'UTF8'), 'sha256'), 'hex'), auth.uid(), now() + interval '14 days');
  return invite_token;
end;
$$;

create or replace function public.redeem_group_invite(invite_token text, member_name text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  invite_row public.group_invites%rowtype;
  clean_name text := trim(member_name);
begin
  if current_user_id is null then raise exception 'Connecte-toi avant de rejoindre le groupe.'; end if;
  if char_length(clean_name) not between 1 and 40 or clean_name ~ '[[:cntrl:]]' then raise exception 'Indique un prénom valide (1 à 40 caractères).'; end if;
  if exists (select 1 from public.group_members where user_id = current_user_id) then raise exception 'Ce compte a déjà rejoint un groupe.'; end if;
  select * into invite_row
    from public.group_invites
    where token_hash = encode(extensions.digest(convert_to(invite_token, 'UTF8'), 'sha256'), 'hex')
      and expires_at > now() and uses < max_uses
    for update;
  if not found then raise exception 'Ce lien d’invitation est invalide ou expiré.'; end if;
  update public.group_invites set uses = uses + 1 where id = invite_row.id;
  delete from public.santa_draws where group_id = invite_row.group_id;
  insert into public.group_members(group_id, user_id, display_name)
    values (invite_row.group_id, current_user_id, clean_name);
  return invite_row.group_id;
end;
$$;

create or replace function public.get_my_santa_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_group uuid;
  current_user_id uuid := auth.uid();
  active_draw uuid;
  people_count integer;
  revealed_count integer;
  has_revealed boolean;
  is_owner boolean;
begin
  select gm.group_id, gm.role = 'owner' into current_group, is_owner
    from public.group_members gm where gm.user_id = current_user_id;
  if current_group is null then raise exception 'Tu ne fais partie d’aucun groupe.'; end if;
  select sd.id into active_draw from public.santa_draws sd where sd.group_id = current_group;
  select count(*) into people_count from public.group_members gm where gm.group_id = current_group;
  if active_draw is null then
    return jsonb_build_object('active', false, 'total', people_count, 'revealed', 0, 'mine_revealed', false, 'can_manage', is_owner);
  end if;
  select count(*) into revealed_count from public.santa_reveals sr where sr.draw_id = active_draw;
  select exists(select 1 from public.santa_reveals sr where sr.draw_id = active_draw and sr.user_id = current_user_id) into has_revealed;
  return jsonb_build_object('active', true, 'total', people_count, 'revealed', revealed_count, 'mine_revealed', has_revealed, 'can_manage', is_owner);
end;
$$;

create or replace function public.start_santa_draw()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_group uuid;
  current_user_id uuid := auth.uid();
  draw_id uuid;
  participants uuid[];
  participant_count integer;
  i integer;
begin
  select gm.group_id into current_group from public.group_members gm
    where gm.user_id = current_user_id and gm.role = 'owner';
  if current_group is null then raise exception 'Seul le créateur du groupe peut lancer le tirage.'; end if;
  perform pg_advisory_xact_lock(hashtext(current_group::text));
  select array_agg(gm.user_id order by extensions.gen_random_bytes(16)) into participants
    from public.group_members gm where gm.group_id = current_group;
  participant_count := coalesce(array_length(participants, 1), 0);
  if participant_count < 2 then raise exception 'Il faut au moins deux membres pour tirer au sort.'; end if;
  delete from public.santa_draws where group_id = current_group;
  insert into public.santa_draws(group_id) values (current_group) returning id into draw_id;
  for i in 1..participant_count loop
    insert into public.santa_assignments(draw_id, giver_user_id, recipient_user_id)
      values (draw_id, participants[i], participants[(i % participant_count) + 1]);
  end loop;
end;
$$;

create or replace function public.reveal_my_santa()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_group uuid;
  current_user_id uuid := auth.uid();
  active_draw uuid;
  recipient_name text;
begin
  select gm.group_id into current_group from public.group_members gm where gm.user_id = current_user_id;
  if current_group is null then raise exception 'Tu ne fais partie d’aucun groupe.'; end if;
  select sd.id into active_draw from public.santa_draws sd where sd.group_id = current_group;
  if active_draw is null then raise exception 'Le tirage n’a pas encore été effectué.'; end if;
  select gm.display_name into recipient_name
    from public.santa_assignments sa
    join public.group_members gm on gm.user_id = sa.recipient_user_id
    where sa.draw_id = active_draw and sa.giver_user_id = current_user_id and gm.group_id = current_group;
  if recipient_name is null then raise exception 'Aucun résultat disponible pour ce compte.'; end if;
  insert into public.santa_reveals(draw_id, user_id) values (active_draw, current_user_id) on conflict do nothing;
  return recipient_name;
end;
$$;

create or replace function public.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  signup_email text := lower(trim(event -> 'user' ->> 'email'));
  invite_token text := event -> 'user' -> 'user_metadata' ->> 'invite_token';
  is_anonymous boolean := coalesce((event -> 'user' ->> 'is_anonymous')::boolean, false);
begin
  if is_anonymous then
    if exists (select 1 from public.groups) and invite_token is not null and exists (
      select 1 from public.group_invites invitation
      where invitation.token_hash = encode(extensions.digest(convert_to(invite_token, 'UTF8'), 'sha256'), 'hex')
        and invitation.expires_at > now() and invitation.uses < invitation.max_uses
    ) then return '{}'::jsonb; end if;
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Une invitation valide est nécessaire pour rejoindre le groupe.'));
  end if;

  if signup_email is null or signup_email = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Une adresse e-mail est requise.'));
  end if;

  if not exists (select 1 from public.groups) then
    if exists (
      select 1 from private.initial_owner_allowlist allowlist
      where allowlist.email_hash = encode(extensions.digest(convert_to(signup_email, 'UTF8'), 'sha256'), 'hex')
        and allowlist.claimed_at is null
    ) then return '{}'::jsonb; end if;
  elsif invite_token is not null and exists (
    select 1 from public.group_invites invitation
    where invitation.token_hash = encode(extensions.digest(convert_to(invite_token, 'UTF8'), 'sha256'), 'hex')
      and invitation.expires_at > now() and invitation.uses < invitation.max_uses
  ) then return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'La création du compte nécessite une invitation du groupe.'));
end;
$$;

revoke all on function public.get_my_group() from public, anon;
revoke all on function private.is_group_member(uuid) from public, anon;
revoke all on function public.create_initial_group(text) from public, anon;
revoke all on function public.create_group_invite(uuid) from public, anon;
revoke all on function public.redeem_group_invite(text, text) from public, anon;
revoke all on function public.get_my_santa_status() from public, anon;
revoke all on function public.start_santa_draw() from public, anon;
revoke all on function public.reveal_my_santa() from public, anon;
revoke all on function public.before_user_created_hook(jsonb) from public, anon, authenticated;
grant execute on function public.get_my_group() to authenticated;
grant execute on function private.is_group_member(uuid) to authenticated;
grant execute on function public.create_initial_group(text) to authenticated;
grant execute on function public.create_group_invite(uuid) to authenticated;
grant execute on function public.redeem_group_invite(text, text) to authenticated;
grant execute on function public.get_my_santa_status() to authenticated;
grant execute on function public.start_santa_draw() to authenticated;
grant execute on function public.reveal_my_santa() to authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created_hook(jsonb) to supabase_auth_admin;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
      alter publication supabase_realtime add table public.events;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_members') then
      alter publication supabase_realtime add table public.group_members;
    end if;
  end if;
end;
$$;
