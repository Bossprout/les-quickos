# Les Quickos

Calendrier privé partagé et Secret Santa pour un seul groupe d’amis. L’application reste statique côté navigateur; Supabase fournit l’authentification e-mail/mot de passe, la base Postgres, les règles d’accès et les fonctions serveur protégées. GitHub Actions publie le site sur GitHub Pages.

## Démarrage local

1. Crée un projet Supabase et applique le schéma `supabase/migrations/20260929000000_initial.sql` depuis le SQL Editor.
2. Copie `config.example.js` vers `config.js`, puis renseigne l’URL du projet et sa clé publique anon/publishable. Cette clé est destinée au navigateur; ne mets jamais la clé `service_role` dans le site.
3. Sers le dossier avec un serveur web local (par exemple `python3 -m http.server 8000`) et ouvre `http://localhost:8000`. N’ouvre pas le fichier en `file://` : l’authentification et les redirections exigent une origine HTTP(S).

`config.js` est ignoré par Git. Le projet ne nécessite pas de compilation ni de dépendance Node installée; le SDK Supabase JS v2 est chargé depuis jsDelivr.

Pour lancer Supabase entièrement en local, installe Docker et la [Supabase CLI](https://supabase.com/docs/guides/cli), lance `supabase start`, puis `supabase status` pour récupérer l’URL et la clé publique locales à mettre dans `config.js`. Exécute aussi la requête d’autorisation de l’adresse ci-dessous dans le SQL Editor local. Le courrier de confirmation local est consultable dans Inbucket, généralement sur `http://localhost:54324`.

## Créer/configurer Supabase

1. Crée un projet sur [supabase.com](https://supabase.com/) et garde les informations du projet dans ton gestionnaire de secrets. Le palier gratuit peut suffire pour un petit groupe; limites, disponibilité et conditions évoluent, et les projets gratuits peuvent être mis en pause après une période d’inactivité.
2. Dans **SQL Editor**, exécute le contenu de `supabase/migrations/20260929000000_initial.sql` une seule fois. Cela crée les tables, les règles RLS, le contrôle d’inscription par invitation, les fonctions serveur et active Realtime pour les événements et les membres.
3. Autorise ton adresse comme premier administrateur du groupe en ajoutant seulement son empreinte à la liste privée. Remplace le texte factice par ta propre adresse dans SQL Editor :

	```sql
	insert into private.initial_owner_allowlist (email_hash)
	values (encode(extensions.digest(convert_to(lower(trim('TON-ADRESSE-E-MAIL')), 'UTF8'), 'sha256'), 'hex'));
	```

	Cette empreinte n’est utilisable qu’avant la création du groupe initial; elle est marquée comme utilisée à la création du groupe.
4. Dans **Authentication → Hooks**, sélectionne **Before User Created** et la fonction Postgres `public.before_user_created_hook`. Cette étape est impérative : elle autorise uniquement le premier e-mail inscrit dans la liste ci-dessus, puis les inscriptions portant un lien d’invitation valide. Sans ce hook, ne publie pas le site.
5. Dans **Authentication → Providers → Email**, active l’authentification e-mail/mot de passe et garde la confirmation d’adresse activée.
6. Dans **Authentication → URL Configuration**, choisis l’URL de ton site comme **Site URL** et ajoute les URL de redirection locales et de production (dont `http://localhost:8000/**` et `https://bossprout.github.io/les-quickos/**`). Mets à jour ces URL si le domaine change.
7. Configure un fournisseur SMTP si les e-mails de confirmation/récupération par défaut sont limités. Les mots de passe et identifiants SMTP se configurent dans le tableau de bord du fournisseur, jamais dans le code ni dans cette conversation.
8. Dans le projet Supabase, récupère **Project URL** et la clé publique **anon** ou **publishable**. N’utilise jamais `service_role`/`secret` côté client.

Après avoir ajouté ton adresse dans la liste privée et activé le hook, crée ton compte avec cette adresse, confirme l’e-mail, puis crée le groupe. Tes amis suivent ensuite le lien généré dans **Inviter un ami**, choisissent leur e-mail et leur mot de passe, confirment leur adresse et rejoignent le groupe. Les inscriptions sans lien valide sont bloquées côté Supabase; un compte sans appartenance ne peut pas lire le calendrier.

## Publier sur Internet avec GitHub Pages

1. Dans GitHub, ouvre le dépôt **Settings → Secrets and variables → Actions → Variables** et crée `SUPABASE_URL` et `SUPABASE_ANON_KEY` avec les deux valeurs publiques Supabase. Ce sont des variables publiques de configuration, pas des clés serveur.
2. Dans **Settings → Pages**, choisis **GitHub Actions** comme source de déploiement.
3. Pousse sur `main` ou lance le workflow **Deploy Les Quickos to GitHub Pages** manuellement dans l’onglet **Actions**. Le workflow génère `config.js` pendant le build et publie le site.
4. L’adresse du site sera normalement `https://bossprout.github.io/les-quickos/`. Ajoute-la aux URL de redirection Supabase et vérifie la confirmation d’e-mail, la connexion, puis l’accès sur un second appareil.

Selon le plan GitHub et la visibilité du dépôt, GitHub Pages peut imposer des conditions pour publier un site depuis un dépôt privé. Si GitHub bloque l’activation, utilise un hébergeur statique qui accepte les dépôts privés ou modifie la visibilité du dépôt seulement si tu acceptes que son code source soit public. Les données de groupe restent protégées par Supabase RLS, mais le code du site serait visible.

## Données et sécurité

- Les événements sont lus/écrits par les membres authentifiés du groupe; RLS vérifie l’appartenance côté base, pas à partir d’un rôle fourni par la page.
- Le premier utilisateur crée le groupe; les liens d’invitation sont des jetons aléatoires, stockés uniquement sous forme hachée, réutilisables au plus 30 fois et expirant après 14 jours. Traite le lien comme un secret et ne le publie pas.
- Le tirage est créé côté base comme un cycle aléatoire sans auto-attribution. La table des correspondances n’accorde aucun accès direct au navigateur; une fonction vérifie l’utilisateur connecté et ne retourne que son destinataire. Seul le propriétaire peut relancer le tirage. L’arrivée d’un nouveau membre invalide le tirage en cours.
- La clé publique Supabase n’est pas un secret; la sécurité repose sur RLS et les fonctions serveur. La clé `service_role`, les mots de passe et les jetons SMTP ne doivent jamais être inclus dans les fichiers web, l’historique Git ou les variables publiques.
- Les anciennes données de démonstration `localStorage` ne sont pas importées dans la base.

## Vérifications

Des contrôles de privilèges pgTAP sont fournis dans `supabase/tests/security.test.sql`. Avec Docker et Supabase CLI installés, lance `supabase start` puis `supabase test db` pour appliquer la migration et exécuter ces tests localement. Complète aussi le parcours de vérification du tableau ci-dessous après configuration :

| Test | Résultat attendu |
|---|---|
| Compte A crée le groupe; compte B rejoint avec une invitation valide | A et B voient le même calendrier et les mêmes membres |
| Compte C, sans invitation, essaie de lire/écrire des événements | Aucune donnée du groupe n’est lisible ni modifiable |
| Un membre ajoute un événement puis recharge sur un second appareil | L’événement est partagé; les changements d’événements/membres se synchronisent en direct |
| Le propriétaire lance le Secret Santa; chaque membre révèle son résultat | Aucun auto-tirage; seul le résultat propre à la session est renvoyé |
| Un membre appelle directement la table ou la fonction de résultat d’un autre | Lecture des attributions refusée; aucune fonction ne prend l’identifiant d’un autre participant |
| Réinitialisation du mot de passe et confirmation e-mail | E-mails reçus et redirections limitées aux URL configurées |

Le backend, les migrations, le workflow de déploiement et l’interface sont préparés dans le dépôt. La création effective du projet Supabase, la configuration SMTP/URL, les variables GitHub et la première publication nécessitent encore une action dans tes comptes. Tant que ces étapes et les tests en production ne sont pas faits, le site n’est pas encore en ligne et l’envoi des e-mails n’est pas vérifié.
