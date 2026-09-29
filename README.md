# Quickos

Le petit coin des amis : un calendrier de groupe et un tirage Secret Santa, en français.

## Utiliser le site

Ouvrez `index.html` dans un navigateur récent. Aucune dépendance ni installation n'est nécessaire.

## Fonctionnalités

- Ajout d'événements avec date, heure, lieu et catégorie.
- Vue calendrier mensuelle et liste des prochains rendez-vous.
- Gestion des membres du groupe.
- Tirage Secret Santa sans auto-attribution, avec révélation individuelle.
- Conservation des données dans le stockage local du navigateur.

## À savoir

Cette première version est un prototype local : les données sont enregistrées uniquement dans le navigateur et sur l'appareil utilisés. Elles ne sont pas synchronisées avec les autres membres. Pour un vrai calendrier partagé entre amis, il faudra ajouter une base de données et une authentification (par exemple Supabase), puis héberger le site. Le tirage Secret Santa actuel est pratique pour tester le parcours, mais les associations sont stockées localement ; il ne convient pas à un tirage réellement confidentiel sur un appareil partagé.
