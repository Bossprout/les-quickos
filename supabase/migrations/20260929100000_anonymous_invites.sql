create unique index if not exists group_members_group_display_name_idx
  on public.group_members (group_id, lower(display_name));

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
