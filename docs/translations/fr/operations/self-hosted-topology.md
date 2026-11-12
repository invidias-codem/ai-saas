# Topologie de Services Self-Hosted

## Objectif

Ce document définit la topologie de services recommandée pour les déploiements self-hosted de Lattice pour les entreprises, en commençant par une baseline pratique Docker Compose.

C'est le pendant topologie de services aux modes de déploiement et au contrat d'environnement/configuration.

---

## Résumé Exécutif

La première vraie histoire de déploiement self-hosted pour Lattice devrait être basée sur :

## **une baseline Docker Compose petite et opinionée alignée au Mode A — Déploiement Interne Standard**

Cette baseline devrait supporter :
- runtime web/app
- base de données
- intégration de stockage d'objets
- chemin d'upload/preview/requête de documents
- tout worker de fond essentiel seulement si le feature set actuel le requiert vraiment

Les composants plus avancés devraient être des expansions opt-in, pas des exigences de baseline.

---

## Topologie Baseline Mode A

### Services requis

#### `app`
Runtime principal web/API de Lattice.

Responsabilités :
- UI web publique et authentifiée
- routes API
- routes chat/requête
- routes d'ingestion de documents
- routes de preview
- gestion auth/session

#### `db`
Service de données relationnel principal.

Responsabilités :
- état utilisateur/workspace
- enregistrements de documents
- metadata chunks/embeddings
- tables mémoire/état
- enregistrements audit et opérationnels

#### `storage`
Stockage d'objets pour fichiers uploadés.

Responsabilités :
- stockage de documents bruts uploadés
- récupération de fichiers pour paths d'extraction/preview/hydratation

Le stockage peut être :
- un bucket cloud externe
- un object store privé
- ou plus tard un service local S3-compatible

### Service optionnel de baseline

#### `worker`
Runtime de worker de fond.

Inclure seulement si les flux core actuels le requièrent vraiment.

Responsabilités possibles :
- jobs d'indexation en background
- post-traitement de documents
- consommation de queue
- tâches de maintenance

---

## Shapes de Baseline Recommandés

### Option A — Baseline Lean
- `app`
- `db`
- intégration storage

Utiliser quand :
- le chemin upload/requête peut tourner synchrone assez pour installs baseline
- la séparation de worker n'est pas essentielle pour la valeur réelle

### Option B — Baseline Pragmatique
- `app`
- `db`
- `worker`
- intégration storage

Utiliser quand :
- les tâches d'ingestion/indexation/background bénéficient matériellement de l'isolation de worker

### Recommandation
Préférer la baseline la plus lean et véridique.
Ne requérir `worker` que si la fonctionnalité réelle du Mode A en dépend déjà.

---

## Extensions Mode B — Déploiement d'Assistant pour Clients

Le Mode B garde probablement la même topologie de services core, mais les attentes opérationnelles montent.

Besoins additionnels probables :
- intégration d'observabilité plus forte
- séparation de worker plus propre si les flux async customer-facing augmentent
- surfaces de support admin/operateur plus explicites

---

## Extensions Mode C — Déploiement Avancé Privé / Riche en Mémoire

Services additionnels potentiels :
- `queue`
- `retrieval`
- `archive-worker`

Ce sont des expansions opt-in explicites et ne devraient pas être des assumptions de baseline.

---

## Extensions Mode D — Déploiement d'Infrastructure / Plateforme

Décomposition de services possible :
- `app`
- `api`
- `worker`
- `queue`
- `retrieval`
- `archive-worker`
- `observability adapters`
- futur service runtime/harness si exposé séparément

C'est une topologie de maturité ultérieure, pas le premier chemin self-hosted supporté.

---

## Histoire Opérationnelle Baseline

Pour les installs Mode A business, la topologie de services devrait supporter une histoire simple :

1. démarrer les services
2. lancer les migrations
3. confirmer la santé
4. se connecter
5. uploader un document
6. le preview
7. le requêter dans un workspace

Si la topologie ne peut pas supporter cela proprement, la baseline est trop complexe.

---

## Recommandation Finale

La première topologie officielle self-hosted pour Lattice devrait être :

## **Mode A / baseline Docker Compose centré sur `app + db`, avec storage comme intégration requise et worker seulement ajouté si le flux produit réel le requiert.**