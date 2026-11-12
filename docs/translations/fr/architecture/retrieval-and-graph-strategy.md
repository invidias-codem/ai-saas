# Stratégie de Récupération et de Graphe

## Objectif

Ce document explique la direction architecturale orientée récupération et graphe dans Genie AI.

Il existe car la direction contexte et mémoire de la plateforme n'est pas bien décrite par une simple étiquette "nous utilisons RAG".

L'objectif architectural plus large est plus spécifique :
- contexte préparé au lieu de bourrage de transcription brute
- récupération comme couche de support structurée
- future composition graph-aware plutôt que pensée flat nearest-neighbor seule

Ce document décrit cette direction à haut niveau.

---

## Principe Fondamental

La récupération devrait soutenir l'assemblage de contexte, pas remplacer l'architecture.

En d'autres termes :
- la récupération n'est pas tout le système de mémoire
- les embeddings ne sont pas toute la couche d'intelligence
- la structure de graphe n'est pas précieuse à moins qu'elle n'améliore la pertinence, les frontières ou l'explicabilité

Le but est d'améliorer comment le contexte est sélectionné et composé.

---

## Pourquoi "Juste Utiliser RAG" Ne Suffit Pas

La phrase "RAG" est souvent trop vague pour être utile architecturalement.

Elle peut signifier des choses très différentes en pratique :
- bourrer des chunks récupérés dans les prompts
- recherche sémantique sur documents
- flux de récupération augmentés par outils
- pipelines de récupération hybrides
- systèmes de mémoire avec structure faible

Pour Genie AI, la question plus importante est :

**quel rôle la récupération devrait-elle jouer dans une architecture workspace-centric, context-prepared ?**

---

## Récupération Comme Couche de Support

La direction intentionnelle est que la récupération devrait aider à répondre à des questions comme :
- quel matériel de support est pertinent maintenant ?
- quelle information liée à l'espace de travail devrait influencer cette exécution ?
- quel contexte devrait être élevé sans gonfler le prompt ?

Cela fait de la récupération un mécanisme de sélection de contexte, pas une fin en soi.

---

## Relation avec le Contexte Préparé

Le contexte préparé est le pattern architectural central.

Les systèmes de récupération et graph-aware devraient se brancher sur ce pattern en contribuant :
- matériel de support pertinent
- contexte de relation structuré
- indices de mémoire bornés

Ils ne devraient pas simplement déverser de grandes quantités de texte sémantiquement lié dans le modèle et appeler cela de l'architecture.

---

## Récupération Scopée par Espace de Travail

Un produit workspace-first a besoin d'une récupération qui respecte le scope.

### Pourquoi c'est important
Sans frontières d'espace de travail, la récupération peut devenir :
- trop large
- trop bruyante
- trop leaky (fuyante)
- trop difficile à faire confiance

### Direction intentionnelle
La récupération devrait de plus en plus pouvoir opérer dans un scope significatif, tel que :
- frontières d'espace de travail
- frontières de projet
- frontières de contexte spécifiques à l'utilisateur

C'est beaucoup plus aligné avec le produit que le lookup sémantique global générique.

---

## Direction Graphe

Le codebase et la planification environnante ont pointé vers une pensée graph-first ou graph-augmented.

### Ce que cela suggère
Au lieu de traiter toute l'information de support comme des chunks isolés, la plateforme pourrait éventuellement représenter et utiliser :
- relations entre concepts
- entités ou artefacts liés
- liens de support structurés
- composition de pertinence graph-aware

### Pourquoi c'est attractif
Une direction graph-aware peut améliorer :
- précision de pertinence
- contexte compositionnel
- traçabilité du matériel lié
- future organisation de mémoire

---

## Graphe Comme Structure, Pas Hype

La direction graphe devrait être documentée soigneusement.

### Bon cadrage
- une façon de représenter les relations entre objets et idées pertinents
- une structure de support pour la composition retrieval/contexte
- un chemin possible vers une meilleure organisation de mémoire

### Mauvais cadrage
- "le graphe résout l'intelligence"
- "graphe signifie que nous n'avons plus besoin de discipline de sélection de contexte"
- "récupération graphe est automatiquement supérieure en tout cas"

Le graphe n'importe que s'il rend le système plus utile et plus compréhensible.

---

## Direction de Récupération Hybride

Une version mature de cette architecture pourrait éventuellement combiner plusieurs surfaces de retrieval/logiques telles que :
- récupération sémantique
- sélection scopée par espace de travail
- relatedness graph-aware
- inclusion de contexte basée sur policy
- futur weighting de retrieval profile-aware

C'est une direction plus réaliste que de prétendre qu'un seul passage de recherche vectorielle est l'architecture finale.

---

## Importance des Frontières

La stratégie de récupération doit respecter la même discipline des frontières que le reste de la plateforme.

### Frontières importantes
- espace de travail vs scope global
- matériel public vs privé
- contexte de conversation active vs contexte récupéré durable
- pertinence immédiate vs présence archivée

Sans ces frontières, la récupération devient plus difficile à faire confiance et plus facile à mal utiliser.

---

## Risques et Modes d'Échec

## 1. Spam de Chunks Plats (Flat Chunk Spam)
Trop de texte récupéré entre dans le modèle sans assez de discipline de sélection.

## 2. Contrôle de Scope Faible (Weak Scope Control)
Matériel pertinent récupéré du mauvais espace de travail ou de la mauvaise frontière de contexte.

## 3. Proximité Sémantique Sans Pertinence Pratique
Le retriever retourne du contenu techniquement similaire mais opérationnellement inutile.

## 4. Sur-Revendication de Maturité du Graphe (Overclaiming Graph Maturity)
Le système est décrit comme graph-native avant que le vrai chemin runtime graph-backed ne soit stable.

## 5. Architecture Par Buzzword
Langage de retrieval, memory, et graph utilisé sans frontières claires ou rôles de système réels.

---

## Direction Future

La direction probable forte pour Genie AI est :
- récupération scopée par espace de travail
- assemblage de contexte préparé
- sélection de contexte server-side plus forte
- future composition de support graph-aware
- mémoire traitée comme une primitive de produit structurée

C'est une direction plus précise et crédible que le cadrage générique "IA powered by RAG".

---

## Résumé

L'idée clé est celle-ci :

**La stratégie de récupération et de graphe devrait exister pour améliorer l'assemblage de contexte structuré dans un système workspace-centric, pas pour remplacer l'architecture par des buzzwords.**

---

## Documents Connexes

Ce document devrait être lu avec :
- `docs/architecture/memory-and-context-architecture.md`
- `docs/architecture/workspace-operating-profile-model.md`
- `docs/architecture/runtime-mode-routing.md`
- futurs docs d'implémentation retrieval et référence API