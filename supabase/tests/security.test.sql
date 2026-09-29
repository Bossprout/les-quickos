begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(14);

select extensions.has_table('public', 'groups', 'groupes persistants');
select extensions.has_table('public', 'group_members', 'adhésions aux groupes');
select extensions.has_table('public', 'events', 'événements partagés');
select extensions.has_table('public', 'santa_assignments', 'attributions Santa côté serveur');
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  'RLS est activé sur les événements'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.santa_assignments', 'select'),
  'le rôle authenticated ne peut pas lire directement les attributions'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.santa_assignments', 'select'),
  'le rôle anon ne peut pas lire les attributions'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.reveal_my_santa()', 'execute'),
  'un membre connecté peut appeler sa fonction personnelle de révélation'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.reveal_my_santa()', 'execute'),
  'un visiteur anonyme ne peut pas demander une révélation'
);
select extensions.ok(
  has_function_privilege('supabase_auth_admin', 'public.before_user_created_hook(jsonb)', 'execute'),
  'Supabase Auth peut appliquer le contrôle avant création de compte'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.before_user_created_hook(jsonb)', 'execute'),
  'un membre ne peut pas appeler le hook d’inscription comme RPC'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'private.initial_owner_allowlist', 'select'),
  'un membre ne peut pas lire la liste privée du premier compte'
);
select extensions.is(
  public.before_user_created_hook('{"user":{"email":"non-invite@example.invalid","user_metadata":{}}}'::jsonb) -> 'error' ->> 'http_code',
  '403',
  'une création de compte non invitée est refusée côté serveur'
);
select extensions.throws_ok(
  $$select public.create_initial_group('Groupe interdit')$$,
  'P0001',
  'Connexion requise.',
  'la création initiale exige une session authentifiée'
);

select * from extensions.finish();
rollback;
