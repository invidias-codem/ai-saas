# Routes Publiques

## Objectif

Ce document explique quelles routes Genie AI sont destinées à être accessibles publiquement, lesquelles sont protégées, et comment l'application des routes publiques fonctionne actuellement.

Il existe pour prévenir une classe récurrente de bugs de production :
- pages publiques liant vers des surfaces auth-gated involontairement
- routes autrement publiques bloquées car les allowlists middleware/proxy n'étaient pas mises à jour
- confusion entre visibilité niveau UI et accessibilité réelle de route

Ce document doit être traité comme la référence actuelle de visibilité de routes pour l'application.

---

## Principe Fondamental

Une route n'est véritablement publique que si le gate d'auth côté serveur la traite comme publique.

Dans Genie AI, cela signifie que l'accès public n'est pas déterminé seulement par :
- si un lien apparaît sur une landing page
- si une page est visuellement "marketing-like"
- si la route semble publique par convention

Elle doit aussi être explicitement autorisée par la logique de route-matching dans la couche middleware/proxy d'auth.

---

## Couche d'Application Actuelle

### Mécanisme de Gating de Routes
Le comportement public vs protégé est principalement contrôlé dans :
- `proxy.ts`

Ce fichier contient le matcher `isPublicRoute` utilisé avec l'enforcement d'auth Clerk.

### Implication Importante
Chaque fois qu'une nouvelle route publique est ajoutée, ou qu'un sous-arbre de route publique change, la route doit être revue dans **les deux** endroits :
1. routing/UI d'application
2. allowlist d'auth de proxy

Si seule l'UI est mise à jour, les utilisateurs publics peuvent encore être redirigés vers sign-in.

---

## Catégories de Routes Publiques

L'application a actuellement plusieurs types de routes qui devraient être considérées publiques.

## 1. Routes Publiques Landing / Marketing

Ce sont des surfaces d'entrée publiques destinées aux visiteurs non authentifiés.

### Exemples
- `/`
- `/:locale`

### Objectif
- découverte produit
- positionnement
- conversion vers sign-up ou entrée produit

---

## 2. Routes Publiques d'Entrée Auth

Celles-ci sont accessibles publiquement car elles font partie du flux d'entrée d'authentification.

### Exemples
- `/sign-in(.*)`
- `/sign-up(.*)`
- `/:locale/sign-in(.*)`
- `/:locale/sign-up(.*)`

### Objectif
- authentification utilisateur
- entrée onboarding utilisateur

---

## 3. Routes Publiques Informatives

Celles-ci sont destinées à rester accessibles sans authentification car elles fournissent du contenu support, politique, ou éducatif.

### Exemples actuels
- `/privacy`
- `/:locale/privacy`
- `/support`
- `/:locale/support`
- `/slack`
- `/:locale/slack`
- `/blog(.*)`
- `/:locale/blog(.*)`
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

### Objectif
- aider les utilisateurs à comprendre la plateforme
- fournir information support et politique publique
- exposer la documentation sans forcer sign-in

---

## 4. Surfaces API / Callback Publiques

Certaines routes API doivent rester publiques car ce sont des points d'entrée d'intégration ou webhook.

### Exemples actuels
- `/api/guest-chat`
- `/api/feedback`
- `/api/integrations/slack/callback`
- `/api/integrations/slack/events`
- `/api/integrations/slack/command`
- `/api/integrations/slack/interactivity`
- `/api/integrations/slack/auth`
- `/api/webhooks/kofi`
- `/api/support/verify-donation`
- `/api/integrations/telegram/webhook`
- `/api/internal/jklaw`
- `/api/internal/route-to-jklaw`
- `/api/referral/capture`
- `/api/cron(.*)`
- `/api/test-mcts`
- `/api/webhooks/vercel-logs`

### Exclusions explicites
Ce qui suit n'est **pas** public malgré avoir des points d'entrée client-side ou consommateurs non-navigateur :
- `/api/cli/stream`
- `/api/memory/cli`

Ces routes requièrent bearer-token auth quand `LATTICE_CLI_TOKEN` est configuré. Elles ne doivent pas être traitées comme publiques dans allowlists proxy ou route ops.

### Note importante
Surface API publique **ne** signifie **pas** surface bas-risque.
Beaucoup de ces routes sont publiques car elles doivent accepter trafic externe, mais elles requièrent encore :
- validation
- vérification auth où applicable
- checks signature/token où approprié
- comportement narrow purpose-specific

---

## Catégories de Routes Protégées

Les classes de routes larges suivantes devraient être traitées comme protégées sauf documentation explicite contraire.

## 1. Routes Produit Authentifiées

### Exemples
- routes dashboard
- routes conversation
- routes workspace
- settings
- outils génération authentifiés
- surfaces état produit/onboarding spécifiques utilisateur

### Objectif
- exposer fonctionnalité produit réelle
- opérer sur état utilisateur
- accéder données application protégées

---

## 2. Routes API Protégées

Toute route API pas explicitement allowlisted comme publique devrait être assumée protégée.

### Exemples typiques
- routes exécution chat
- routes données spécifiques utilisateur
- routes gestion workspace
- routes profil/configuration
- actions produit internes requérant identité utilisateur

---

## Visibilité Route et Préfixes Locale

L'application utilise du routing localisé.

### Implication Importante
Le traitement route publique doit considérer les deux :
- formes route non-préfixées
- formes route préfixées locale

### Exemple
Si `/docs` est censé être public, alors toutes formes publiques pertinentes devraient être considérées :
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

Ceci est particulièrement important pour arbres docs/blog/support imbriqués.

---

## Mode d'Échec Connu : UI Publique Liant Vers Route Protégée

Un pattern de régression commun est :
1. une page publique landing/support link vers une route comme `/docs`
2. la route existe et apparaît publique dans l'UI
3. la route n'est pas ajoutée à `isPublicRoute`
4. utilisateurs non authentifiés redirigés vers sign-in

Ceci s'est déjà produit en pratique avec le path public docs.

### Leçon
Chaque fois qu'une surface contenu public est ajoutée ou changée, la visibilité route doit être revue comme partie de l'implémentation.

---

## Exemple Fix Route Docs Publique

Le bug auth route docs a été résolu en allowlistant explicitement :
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

dans `proxy.ts`.

### Pourquoi ça importait
Le lien "View Docs" de la page support était publiquement visible, mais le sous-arbre route docs réel n'était pas traité comme public par le gate auth.

C'est exactement le genre de mismatch que ce document existe pour prévenir.

---

## Checklist Revue Pour Toute Nouvelle Route Publique

En ajoutant une nouvelle route publique, vérifier tous les suivants :

1. **UI intent**
- Est-ce réellement censé être public ?

2. **Route tree coverage**
- L'allowlist inclut-elle formes root et imbriquées si nécessaire ?

3. **Locale coverage**
- L'allowlist inclut-elle variantes préfixées locale ?

4. **Middleware/proxy alignment**
- `proxy.ts` est-il mis à jour accordingly ?

5. **Auth behavior test**
- La route a-t-elle été testée en session logged-out ?

6. **Public-link flow test**
- La route a-t-elle été testée via la vraie page entrée publique qui y link ?

---

## Pratique Sûre Documentation

Chaque fois que la visibilité route change, la documentation devrait idéalement être mise à jour avec le code si le changement affecte :
- attentes accès public
- flux support
- visibilité docs/blog/privacy
- comportement intégration/webhook

Ceci prévient le codebase de dériver silencieusement loin de la politique accès intentionnelle.

---

## Follow-Ups Futurs Recommandés

L'histoire route-visibility serait renforcée en ajoutant :
- `docs/security/trust-boundaries.md`
- `docs/reference/api-reference.md`
- `docs/operations/route-verification-checklist.md`

Ceci aiderait connecter la documentation routes publiques à la pratique plus large de vérification auth, API, et deployment.