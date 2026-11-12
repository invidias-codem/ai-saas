# Architecture du Système

Lattice OS est une plateforme d'IA centrée sur l'espace de travail, consciente du profil opérationnel et native en mémoire. L'implémentation est organisée comme un monorepo géré par pnpm qui sépare la logique agnostique à la plateforme des adaptateurs spécifiques à la livraison.

## Structure du Monorepo

| Paquet | Rôle |
|--------|------|
| `apps/web` | Frontend Next.js 14+ (app router, auth Clerk, UI) |
| `packages/lattice-core` | Contrats validés Zod, constantes, schémas licence/preflight |
| `packages/lattice-mcp-local` | Adaptateur MCP stdio local |
| `packages/lattice-mcp-remote` | Adaptateur MCP HTTP distant (authentifié Clerk) |
| `packages/lattice-ai-skills` | Adaptateur AI Skills : schéma SKILL.md, commandes slash, wrappers, manifeste Custom GPT |

L'application Next.js racine dépend des packages du workspace en versions `workspace:*` et les construit pendant l'étape `prebuild`.

## Correspondance des Couches

| Couche Architecturale | Implémentation |
|---------------------|----------------|
| Surface web publique | `app/(landing)/*` et `app/(public)/beta/*` |
| Surface authentifiée | `app/(dashboard)/*` avec middleware Clerk |
| Comportement API/serveur | Handlers de route `app/api/**/*` |
| Persistance | Supabase + PostgreSQL (côté serveur uniquement) |
| Automatisation/intégration | Cron jobs, routes webhook, adaptateurs MCP |
| Terminal / SSE Brut | `/api/cli/stream`, `/api/memory/cli`, chemin shim CLI local |

## Build & Déploiement

- Ordre de build : `prebuild` exécute `pnpm --dir packages/lattice-{core,mcp-local,mcp-remote,ai-skills} run build` d'abord pour que `dist/` existe avant le bundling Next.js.
- Vercel : `.vercelignore` autorise `packages/lattice-*` (seul `packages/ucol-node/` est exclu). La correction du prebuild et le require dynamique avec portée NFT sont dans `package.json` et `next.config.mjs`.

---
...
Ce document fournit une explication de haut niveau de l'architecture système actuelle de Lattice OS.

Il est conçu pour répondre :
- quelles sont les couches principales du système
- comment les requêtes traversent le système
- où réside l'état
- comment les surfaces publiques, authentifiées et d'automatisation backend diffèrent
- quels thèmes architecturaux sont centraux pour la direction du produit

Ce document est une vue d'ensemble de l'architecture principale, pas une spécification complète de sous-systèmes.

---

## Vue d'Ensemble de Haut Niveau

Dans les grandes lignes, Lattice OS se compose de six couches architecturales principales :

1. **Surface web publique**
2. **Surface d'application authentifiée**
3. **Couche de comportement API et serveur**
4. **Couche de données / persistance**
5. **Couche d'automatisation / intégration**
6. **Couche Terminal / SSE Brut**

Ces couches sont connectées, mais servent des audiences différentes et ont différentes frontières de confiance.

---

## 1. Surface Web Publique

### Ce qu'elle inclut
- pages d'atterrissage (landing)
- pages informatives publiques
- pages blog/docs/support/confidentialité
- autres surfaces marketing ou informatives non authentifiées

### Responsabilités
- expliquer le produit
- soutenir la découverte
- fournir des points d'entrée vers la documentation et le support publics
- router les utilisateurs vers l'inscription ou les surfaces produit quand approprié

### Notes architecturales
- ces routes doivent rester accessibles publiquement
- elles ne doivent pas hériter accidentellement des suppositions du dashboard authentifié
- les bugs de gating de routes à cette couche créent rapidement des problèmes de confiance visibles pour l'utilisateur

---

## 2. Surface d'Application Authentifiée

### Ce qu'elle inclut
- dashboard
- conversations
- espaces de travail
- onboarding
- configuration
- autres flux d'application spécifiques à l'utilisateur

### Responsabilités
- maintenir l'état de produit spécifique à l'utilisateur
- piloter les vrais flux de travail d'interaction IA
- exposer le comportement conscient de l'espace de travail et du profil
- fournir la fonctionnalité produit plutôt que juste du contenu marketing/informatif

### Notes architecturales
- cette couche dépend de l'identité authentifiée
- elle dépend de plus en plus du contexte d'espace de travail et de profil opérationnel
- elle ne doit pas être traitée comme le même système que la surface de landing avec de l'auth ajouté par-dessus

---

## 3. Couche de Comportement API et Serveur

### Ce qu'elle inclut
- handlers de route sous `app/api/...`
- logique de sélection de runtime côté serveur
- logique d'orchestration de conversations
- callbacks d'intégration et endpoints cron

### Responsabilités
- traiter chat et actions d'application
- résoudre le comportement côté serveur
- fournir des interfaces structurées entre UI et logique backend
- faire respecter les frontières API protégées/publiques
- soutenir les flux de travail programmés et externes

### Direction architecturale importante
Une direction clé dans le système est de déplacer plus de vérité comportementale vers la couche serveur, surtout autour de :
- sélection du mode runtime
- comportement conscient de l'espace de travail
- prise de décision consciente du profil opérationnel

Cela réduit l'état côté client trompeur et rend le comportement plus inspectable.

---

## 4. Couche de Données / Persistance

### Ce qu'elle inclut
- Données structurées soutenues par Supabase / PostgreSQL
- état d'application relationnel
- état émergent lié à la mémoire/récupération et persistance de support

### Responsabilités
- persister les données utilisateur/application
- soutenir les modèles d'espace de travail et de profil
- soutenir les conversations et autres structures de produit
- soutenir les flux de travail d'intégration/programmés qui ont besoin d'état durable

### Note architecturale
La couche de persistance n'est pas seulement un bucket de stockage passif. Elle soutient de plus en plus les transitions architecturales dans le produit, surtout autour de :
- comportement workspace-first
- décisions de runtime dérivées du profil
- évolution du système mémoire/contexte

---

## 5. Couche d'Automatisation / Intégration

### Ce qu'elle inclut
- routes déclenchées par cron
- endpoints webhook
- callbacks d'intégration
- automatisation sociale/de distribution
- flux de messagerie/intégration externes

### Responsabilités
- coordonner les tâches programmées
- gérer les événements de plateformes externes
- maintenir les flux de travail non-UI
- connecter la logique produit avec les systèmes externes

### Note architecturale
Cette couche doit être comprise comme partie du système de production, pas comme "scripts en plus". Elle peut affecter matériellement :
- comportement du produit
- sorties publiques
- risque opérationnel
- complexité de débogage

---

## 6. Couche Terminal / SSE Brut

### Ce qu'elle inclut
- `/api/cli/stream`
- `/api/memory/cli`
- shims CLI locaux et consommateurs natifs terminaux

### Responsabilités
- diffuser les réponses de l'assistant en SSE brut
- émettre des deltas de cycle de vie typés pour texte, utilisation d'outils, complétion et exécution locale
- préserver la sémantique de chunks encadrés par ligne à travers les sauts proxy/CDN
- soutenir l'orchestration CLI, matrices d'approbation locale et appels mémoire sans middleware navigateur

### Pourquoi c'est important
Cette couche est terminal-native par conception. Elle ne peut pas dépendre du comportement de retry du navigateur, du buffering ServiceWorker, ou des wrappers fetch de framework. Elle dépend de :
- sémantique stable de transfert par chunks
- taxonomie d'événements explicite
- règles de timeout et récupération côté client
- politiques de proxy qui ne bufferisent ni ne réécrivent les frames SSE

---

## Thèmes Architecturaux Transversaux

## A. Modèle Workspace-First

Un changement majeur dans le codebase est de faire de l'**espace de travail** le conteneur de runtime principal au lieu de traiter le chat comme une surface générique indépendante.

### Pourquoi ça importe
Les espaces de travail sont censés façonner :
- portée du contexte
- comportement de la mémoire
- sélection du runtime
- organisation de l'utilisateur
- future personnalisation et composition système

---

## B. Comportement de Runtime Piloté par Profil Opérationnel

La direction du système inclut le déplacement de la sélection de comportement vers un modèle où les **profils opérationnels** influencent les caractéristiques de runtime.

### Pourquoi ça importe
Cela permet au système de supporter :
- différents tradeoffs comportement/coût
- contrôle de runtime plus honnête
- futur comportement IA conscient du profil

C'est l'un des différenciateurs architecturaux les plus importants dans le codebase.

---

## C. Contexte Préparé sur Historique Brut Naïf

Le système évolue vers un modèle de contexte préparé au lieu de dépendre seulement d'un historique de messages non structuré roulant.

### Pourquoi ça importe
Le contexte préparé permet :
- structure de prompt plus claire
- meilleures frontières de mémoire
- composition de récupération/contexte plus explicite
- augmentation future graphe/récupération plus sûre

---

## D. Discipline de Frontière Publique / Protégée

Puisque le produit mélange pages publiques, pages authentifiées, APIs et callbacks, la discipline des frontières compte beaucoup.

### Mode d'échec courant
Une route UI publique peut lier vers une surface protégée involontairement, produisant un mur de sign-in ou un rebond d'auth inattendu.

C'est pourquoi la visibilité des routes doit être documentée et revue soigneusement.

---

## Flux de Requête (Haut Niveau)

## Flux Page Publique
1. utilisateur demande page publique
2. middleware/proxy détermine que la route est publique
3. gestion du locale est appliquée
4. contenu public rendu sans exigence d'auth

## Flux Produit Authentifié
1. utilisateur demande route authentifiée
2. middleware/proxy vérifie l'auth
3. identité utilisateur résolue
4. shell d'app localisé charge
5. données spécifiques à la page et comportement de runtime chargent basés sur le contexte utilisateur/application

## Flux Chat / Runtime (Simplifié)
1. frontend soumet requête à la couche API
2. serveur résout le contexte conversation/workspace/profil
3. contexte préparé assemblé
4. comportement mode runtime/modèle sélectionné côté serveur
5. chemin modèle/fournisseur exécute
6. réponse retournée avec visibilité debug optionnelle selon implémentation

## Flux Automatisation / Cron
1. déclencheur programmé ou externe frappe route API
2. route exécute logique de tâche côté serveur
3. état lu/écrit à travers la couche persistance
4. effets secondaires intégration/publics peuvent être produits selon le job

---

## Frontières de Confiance

L'architecture a plusieurs frontières de confiance importantes :

### Visiteurs Publics
- peuvent accéder aux surfaces informatives publiques
- ne devraient pas pouvoir muter l'état de produit protégé

### Utilisateurs Authentifiés
- peuvent accéder aux surfaces de produit appropriées à leur identité et configuration

### Jobs Backend/Internes
- peuvent exécuter la logique privilégiée non disponible pour les clients publics

### Plateformes Externes
- peuvent appeler les endpoints de callback/webhook désignés seulement à travers des surfaces explicitement autorisées

La confusion des frontières de confiance est l'un des moyens les plus faciles pour ce type de système de devenir fragile.

---

## Réalités Opérationnelles

Le codebase a déjà fait émerger quelques réalités opérationnelles importantes :
- la vérité du build en cloud peut être plus fiable que la vérité du build local
- les logs d'actions de déploiement peuvent être bruités ou avec pertes
- les problèmes de gating de routes peuvent produire des bugs de production rapidement
- les changements d'architecture ont besoin de documentation à côté de l'implémentation pour rester lisibles

Ces réalités doivent être traitées comme partie de l'architecture, pas séparées d'elle.

---

## Vers Quoi Cette Architecture Évolue

Genie AI devient de plus en plus :

> une plateforme d'IA centrée sur l'espace de travail, consciente du profil opérationnel et native en mémoire avec des surfaces de découverte publique, des surfaces d'exécution authentifiée et des couches d'automatisation/intégration backend.

Cette description est plus précise qu'une étiquette plus simple de "app de chatbot".

---

## Prochains Documents d'Architecture Recommandés

Ce document backbone devrait être suivi par des documents d'architecture plus spécifiques pour :
- routing de mode runtime
- architecture mémoire et contexte
- frontières de routes publiques
- surfaces de vérité et vérification de déploiement
- comportement de référence API