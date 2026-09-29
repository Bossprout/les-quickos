begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(9);

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

select * from extensions.finish();
rollback;
