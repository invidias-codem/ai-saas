# Déploiement

## Objectif

Ce document explique le modèle de déploiement pour Genie AI / `ai-saas` à un niveau opérationnel pratique.

Il est destiné à aider les développeurs et les opérateurs à comprendre :
- quelles surfaces de déploiement existent
- comment le code passe de l'état du repository au runtime en direct
- quels signaux sont fiables pendant le déploiement
- où le déploiement peut sembler réussi ou échoué de manière trompeuse

Ce document doit être lu avec :
- `docs/operations/truth-surfaces.md`
- `docs/security/public-routes.md`
- `docs/reference/environment-variables.md`

---

## Principe Fondamental

Le déploiement n'est pas un événement unique. C'est une chaîne d'états liés mais distincts :

1. état du code
2. état du build
3. état de l'automatisation du déploiement
4. état du runtime de la plateforme
5. comportement de l'application en direct

Un processus de déploiement fiable traite ces états explicitement plutôt que de les réduire en une question vague "est-ce qu'il a déployé ?".

---

## Surfaces de Déploiement Primaires

La base de code implique actuellement plus d'une surface liée au déploiement.

## 1. État du Repository GitHub

### Rôle
- vérité du code source
- source de déclenchement pour CI et workflows de déploiement

### Questions auxquelles il répond
- quel commit est sur `main` ?
- quel code a réellement été poussé ?
- quelle branche ou merge a introduit un changement ?

### Note importante
Un push réussi n'est pas la preuve d'un build réussi ou d'un comportement en direct réussi.

---

## 2. GitHub Actions / Workflows CI

### Rôle
- validation de build dans le cloud
- exécution des workflows de déploiement
- workflows opérationnels cron/programmés
- checks CodeQL / validation

### Usages typiques dans ce repo
- validation de déploiement production
- workflow de déploiement Firebase hosting
- flux de déploiement lié à Vercel
- jobs programmés comme workflows agent/cron

### Note importante
Le succès CI/workflow répond à certaines questions, mais pas à toutes.

Par exemple :
- le succès du build ne prouve pas automatiquement la correction du runtime
- l'échec de l'action de déploiement ne signifie pas toujours que le runtime en direct est cassé

---

## 3. Surface de Runtime Vercel

### Rôle
- surface principale d'hébergement/runtime de l'application
- probable runtime d'application de production user-facing pour les routes web majeures

### Questions auxquelles il répond
- l'application déployée sert-elle réellement les requêtes ?
- les routes publiques/authentifiées se comportent-elles correctement ?
- l'artifact runtime se comporte-t-il comme attendu ?

### Note importante
Les logs d'action Vercel et le comportement de runtime Vercel en direct sont des surfaces de vérité liées mais non identiques.

---

## 4. Surface d'Hébergement Firebase

### Rôle
- surface additionnelle d'hébergement/déploiement présente dans les workflows du repo

### Questions auxquelles il répond
- le chemin de déploiement Firebase-hosted s'est-il complété ?
- l'artifact face à Firebase est-il mis à jour le cas échéant ?

### Note importante
Cela devrait être traité comme une surface de déploiement/sortie distincte plutôt que d'être supposé interchangeable avec la vérité de runtime Vercel.

---

## Flux Pratique de Déploiement

À haut niveau, un chemin de déploiement typique ressemble à :

1. le code est commité localement
2. le code est poussé vers GitHub
3. les workflows GitHub Actions se déclenchent
4. les jobs de build/déploiement s'exécutent
5. les surfaces d'hébergement se mettent à jour selon le cas
6. le comportement de runtime en direct est vérifié directement

### Point important
L'étape 6 est obligatoire pour les corrections de bugs visibles par l'utilisateur.
Un résultat de workflow seul ne suffit pas.

---

## Flux de Vérification de Déploiement Recommandé

Lors de l'envoi d'un changement, utilisez cet ordre de vérification :

## 1. Confirmer l'état du code
Vérifier :
- le commit intentionné existe sur la branche intentionnée
- le changement a réellement été poussé

## 2. Confirmer l'état du workflow/build
Vérifier :
- les jobs de build ont couru
- les jobs de déploiement ont couru
- pas de blocage évident d'échec de workflow dans la génération d'artifact

## 3. Confirmer le comportement de route/runtime en direct
Vérifier :
- les routes pertinentes chargent correctement
- le comportement auth/public est correct
- le vrai bug visible par l'utilisateur est résolu

## 4. Confirmer le comportement d'intégration/schéma si pertinent
Si le changement dépend de :
- schéma DB
- comportement cron
- flux de callback d'intégration

alors vérifier ces surfaces de vérité également.

---

## Réalités de Déploiement Connues dans Ce Repo

Cette base de code a déjà montré plusieurs réalités de déploiement importantes.

## A. La vérité du build local peut être peu fiable
Les builds de production locaux ont été une surface de vérité peu fiable sous des conditions de machine contraintes.

### Implication
La validation de build dans le CI cloud porte souvent plus de poids pour la viabilité de production.

---

## B. Les logs de workflow peuvent être bruyants ou avec pertes
Un workflow de déploiement peut rapporter un échec alors que le runtime en direct n'est pas réellement cassé, ou vice versa.

### Implication
Traiter les logs de workflow comme un signal important, pas l'autorité finale sur la santé du runtime.

---

## C. Le succès du merge n'est pas le succès du runtime
Un merge vers `main` peut encore laisser :
- des échecs de déploiement
- des régressions de runtime
- l'application de schéma manquante
- des mismatches de routes publiques/protegées

### Implication
La vérification en direct post-merge fait partie du déploiement, pas un nettoyage optionnel.

---

## D. Les migrations de repo ne sont pas une preuve de schéma en direct
Un déploiement de code peut réussir tandis que la base de données en direct manque encore les changements de schéma requis.

### Implication
La vérité du schéma doit être vérifiée séparément pour les features qui dépendent des changements DB.

---

## Vérification de Déploiement Spécifique par Route

Différents changements ont besoin de différents checks de vérification finale.

## Changements de Routes Publiques
Vérifier :
- la page rend pour les utilisateurs logged-out
- les versions locale-prefixed se comportent correctement
- la route ne rebondit pas vers sign-in involontairement

## Changements de Produit Authentifié
Vérifier :
- l'état logged-in fonctionne correctement
- les données au niveau de la route chargent
- la navigation utilisateur se comporte encore comme attendu

## Changements de Comportement API
Vérifier :
- le comportement réel de réponse de route
- l'alignement du contrat request/response
- tout header de debug ou indicateur backend pertinent

## Changements Cron/Automatisation
Vérifier :
- les jobs se complètent réellement
- les logs opérationnels dans le temps restent sains

## Changements Terminal / Raw SSE
Vérifier :
- le stream reste line-framed après les sauts proxy/CDN
- le transfert chunked est préservé
- le client récupère proprement de timeout ou connexion coupée
- `/api/cli/stream` ne bufferise pas ou ne termine pas prématurément les connexions idle

---

## Sensibilité à l'Environnement

Le comportement de déploiement peut fortement dépendre de la configuration d'environnement.

### Zones à surveiller
- configuration d'auth
- secrets/tokens des fournisseurs
- credentials Supabase
- secrets de webhook
- secrets de cron
- config de runtime spécifique au fournisseur

### Note importante
Un build peut réussir même quand les secrets/config de runtime sont incorrects ou incomplets.

C'est pourquoi la vérification de déploiement doit inclure le comportement de runtime, pas juste l'état de build.

---

## Modes d'Échec de Déploiement Communs

## 1. Build réussit, runtime encore faux
Causes exemples :
- mismatch de route gating
- configuration de runtime manquante
- dérive de schéma
- bug de logique non attrapé par build

## 2. Workflow échoue, runtime encore semble sain
Causes exemples :
- action de déploiement bruyante
- échec de chemin de déploiement secondaire tandis que runtime primaire sert encore
- mismatch logging/reporting

## 3. Code mergé, schéma non appliqué
Causes exemples :
- migrations existent dans git mais n'ont pas été appliquées à la DB active
- cache de schéma pas mis à jour

## 4. Bug de route publique survit au deploy
Causes exemples :
- UI changée sans mise à jour de allowlist proxy/middleware
- variantes de route locale non testées

## 5. Validation locale bloque la confiance incorrectement
Causes exemples :
- contraintes de ressources machine
- instabilité de build local
- environnement local unhealthy traité comme vérité de production

---

## Habitudes Opérationnelles Recommandées

## Pour petits changements UI/contenu
- pousser le commit intentionné
- vérifier que le workflow se déclenche
- vérifier la route exacte en direct visuellement/comportementalement

## Pour changements runtime/API
- vérifier l'état du build
- vérifier le comportement API en direct
- inspecter les indicateurs de debug où disponibles

## Pour changements soutenus par schéma
- vérifier le code
- vérifier l'application de migration
- vérifier le comportement route/API en direct qui dépend du schéma

## Pour changements de routes publiques
- tester en logged out
- tester les formes locale-prefixed
- tester l'entrée via la vraie page publique qui link vers la route

---

## Déploiement et Documentation

Les changements sensibles au déploiement devraient idéalement mettre à jour la documentation quand ils modifient :
- visibilité de route
- attentes d'auth
- surfaces d'intégration
- exigences de variables d'environnement
- attentes de vérification opérationnelle

Cela aide à garder les docs du repo alignées avec la réalité de production.

---

## Résumé

La leçon clé de déploiement pour ce repo est :

**Un déploiement réussi n'est pas juste un workflow vert. C'est une chaîne vérifiée depuis le code poussé vers le comportement en direct correct.**

Cette chaîne devrait être vérifiée explicitement, surtout dans une plateforme avec :
- multiples classes de routes
- multiples surfaces de déploiement
- frontières d'auth runtime
- architecture schema-backed en évolution