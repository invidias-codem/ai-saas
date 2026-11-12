# Routage du Mode Runtime

## Objectif

Ce document explique comment Genie AI détermine le comportement du runtime pour les requêtes de conversation.

Il existe car la plateforme s'éloigne d'un modèle simpliste de toggle de mode contrôlé par le client pour aller vers un modèle de routage résolu par le serveur plus honnête, basé sur le contexte de l'application.

L'objectif de ce document est de clarifier :
- où le mode runtime est décidé
- quel contexte influence cette décision
- comment les conversations pre-workspace et workspace-backed diffèrent
- comment raisonner sur le débogage et l'extension future

---

## Principe Fondamental

Le mode runtime doit être résolu par le serveur, pas directement fait confiance depuis l'intention arbitraire du client.

En termes pratiques, cela signifie que le système devrait de plus en plus dériver le comportement du runtime de :
- contexte de conversation
- contexte d'espace de travail
- contexte de profil opérationnel
- logique de routage backend

plutôt que d'un contrôle frontend affirmant définir le mode final directement.

---

## Pourquoi Cela Existe

Le comportement produit antérieur pouvait créer un désaccord entre :
- ce que l'UI affirmait être le mode
- ce que le backend faisait réellement
- ce que l'utilisateur devrait raisonnablement attendre

C'est particulièrement problématique dans un système qui veut supporter :
- comportement budget-aware (conscient du budget)
- comportement workspace-aware
- comportement profile-aware
- futurs patterns d'exécution memory-native

Un modèle de routage résolu par le serveur est plus véridique et plus extensible.

---

## Modèle de Routage Runtime de Haut Niveau

À haut niveau, une requête de conversation traverse ces étapes de routage :

1. la requête entre dans la couche API de chat
2. le serveur identifie le contexte de conversation
3. le serveur identifie si un espace de travail est impliqué
4. le serveur résout toute influence de operating-profile
5. le mode runtime est mappé côté serveur
6. le comportement modèle/fournisseur est sélectionné en conséquence
7. la réponse est retournée avec visibilité de debug optionnelle

Cela signifie que le backend est l'autorité finale sur le mode runtime effectif.

---

## Sources de Contexte Clés

## 1. Contexte de Conversation

Le serveur doit d'abord comprendre à quelle conversation appartient la requête.

### Pourquoi c'est important
L'état de conversation peut déterminer :
- si une requête fait partie d'un flux de chat général
- si elle est attachée à un flux workspace-backed
- si des règles de routage historiques ou contextuelles devraient s'appliquer

---

## 2. Contexte d'Espace de Travail

Le contexte d'espace de travail est une entrée majeure de routage architectural.

### Pourquoi c'est important
Une conversation workspace-backed peut porter :
- un contexte organisationnel plus fort
- des attentes de mémoire différentes
- un comportement de runtime lié au profil
- de futures différences de retrieval/contexte

C'est une des raisons pour lesquelles la plateforme s'éloigne d'un modèle universel de toggle de mode chat.

---

## 3. Contexte de Profil Opérationnel

Les profils opérationnels sont censés façonner le comportement du runtime plus honnêtement qu'un switch UI générique "rapide vs qualité".

### Pourquoi c'est important
Un profil opérationnel peut exprimer :
- profondeur/comportement attendu
- tradeoffs coût/latence
- futures structures de préférence
- logique de sélection de mode alignée avec le modèle utilisateur/espace de travail

Cela fait du routage runtime un comportement de plateforme, pas juste une préférence UI.

---

## Conversations Générales vs Workspace-Backed

## Comportement Général / Pre-Workspace

Avant qu'une conversation ne soit vraiment ancrée dans une structure workspace/profil, la plateforme a évolué vers un comportement par défaut simplifié et plus honnête.

### Résultat pratique
Le mode pre-workspace visible pour l'utilisateur est effectivement :
- **Général**

### Pourquoi
Cela évite de faire semblant que l'utilisateur choisit un mode backend profond quand le contexte serveur pour une telle différenciation n'existe peut-être pas encore.

---

## Comportement Workspace-Backed

Une fois qu'une conversation est associée à un espace de travail et potentiellement influencée par un operating profile, le routage runtime devient plus sensible au contexte.

### Résultat pratique
Le mode effectif peut être dérivé de :
- l'état de l'espace de travail
- les signaux d'operating profile
- la logique de mappage backend

C'est là qu'appartient l'architecture runtime plus avancée.

---

## Résolution Côté Serveur

La direction architecturale actuelle est que la route de chat devrait résoudre le mode runtime côté serveur.

### Pourquoi c'est important
Cela assure que :
- le mode effectif correspond à la logique backend réelle
- la simplification UI ne réduit pas la flexibilité du backend
- les futures règles de routage peuvent évoluer sans mentir à l'utilisateur
- le débogage peut se concentrer sur une couche de routage autoritative

---

## Relation avec les Contrôles UI

## Ancien modèle mental
Un utilisateur appuie sur un switch de mode côté client et le mode est simplement ce que le client dit qu'il est.

## Direction actuelle
Le client peut exposer un état UX limité, mais le backend détermine le comportement runtime effectif.

### Pourquoi ça importe
Cela previent une classe d'UX trompeuse où :
- l'UI suggère un comportement
- le serveur fait silencieusement autre chose

Une surface client plus petite et plus honnête est meilleure qu'une surface de faux-contrôle plus grande.

---

## Aides au Débogage

Le système a utilisé des headers de debug pour rendre le comportement runtime plus inspectable.

### Exemples connus
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

### Pourquoi ça aide
Ils permettent à l'équipe de vérifier :
- quel mode le serveur a réellement résolu
- quel chemin de modèle a été choisi
- si le routage runtime s'aligne avec les attentes sous différents états conversation/workspace

Ces headers sont particulièrement utiles pour déboguer les différences entre :
- flux de conversation générale
- flux de conversation workspace-backed
- routage influencé par le profil

---

## Intention Architecturale Actuelle

Le routage runtime devrait de plus en plus refléter ce principe :

> le système devrait choisir le comportement basé sur le contexte d'application plutôt que de demander à l'utilisateur de simuler le routage backend manuellement.

C'est plus aligné avec la direction plus large de la plateforme vers :
- comportement workspace-centric
- logique runtime dérivée d'operating-profile
- exécution memory/context-aware

---

## Modes d'Échec Courants

## 1. Désaccord UI/Backend
Le frontend présente un label de mode qui ne correspond pas au comportement réel de routage backend.

## 2. Perte de Contexte
Le backend échoue à récupérer le bon contexte conversation/workspace/profil, causant un fallback vers un mode moins spécifique que prévu.

## 3. Opacité du Débogage
Le système résout un mode en interne mais donne trop peu de visibilité pour la vérification.

## 4. Surcroissance des Contrôles Client
Le frontend accumule trop de toggles de mode avant que le modèle de contexte backend ne soit assez mûr pour les justifier.

---

## Pourquoi "Général" Importe

L'introduction d'un mode **Général** plus simple sur les flux pre-workspace n'est pas une régression.
C'est une amélioration de véracité.

### Ce qu'il évite
- fausse précision dans l'UI
- exposition prématurée de la complexité de routage backend
- promesses trompeuses sur le contrôle que le backend n'honore pas vraiment encore

### Ce qu'il permet
- architecture runtime plus propre
- routage workspace/profile futur plus fort
- débogage plus simple
- UX plus fiable

---

## Direction Future

Ce modèle de routage devient plus puissant à mesure que d'autres systèmes mûrissent, surtout :
- design d'operating profile
- préparation memory/context
- flux d'application workspace-first
- composition de retrieval et couche de contexte

Avec le temps, le routage de mode runtime peut devenir une couche de policy plus riche plutôt qu'un simple switch de mode.

---

## Documents Connexes Recommandés

Ce document devrait être lu avec :
- `docs/architecture/system-architecture.md`
- `docs/security/public-routes.md`
- futur `docs/architecture/memory-and-context-architecture.md`
- futurs docs de référence API/runtime

---

## Résumé

L'idée la plus importante est simple :

**Genie AI devrait résoudre le comportement runtime depuis le contexte sur le serveur, pas prétendre que le client seul contrôle le mode final.**

C'est la colonne vertébrale d'une architecture de plateforme IA plus honnête et plus extensible.