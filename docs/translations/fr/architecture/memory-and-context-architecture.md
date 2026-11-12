# Architecture de la Mémoire et du Contexte

## Objectif

Ce document explique comment Genie AI fait évoluer son architecture de mémoire et de contexte.

Il existe pour rendre une direction de produit centrale explicite :
Genie AI n'est pas destiné à rester un wrapper de chat mince autour d'un historique brut roulant. Il évolue vers une architecture de contexte préparé, plus structurée, consciente de l'espace de travail, avec des frontières plus fortes entre l'état de conversation, l'état d'espace de travail, le contexte récupéré et les futurs systèmes de mémoire.

Ce document se concentre sur l'intention architecturale, les patterns actuels et la direction de conception plutôt que d'affirmer que chaque futur sous-système est déjà pleinement réalisé.

---

## Principe Fondamental

Le contexte doit être **préparé**, pas simplement accumulé.

Cela signifie que le système devrait de plus en plus éviter de traiter "tout dans l'historique" comme la seule ou la meilleure source de contexte du modèle.

Au lieu de cela, le contexte devrait être assemblé à partir de plusieurs couches telles que :
- état de conversation immédiat
- contexte d'espace de travail
- contexte de profil opérationnel
- information de support récupérée
- futures couches de mémoire

Cette architecture est plus contrôlable, plus extensible et plus honnête sur ce que le système utilise réellement.

---

## Pourquoi C'est Important

Une architecture de chat naïve a tendance à se dégrader en l'un de deux patterns :

1. **bourrage de transcription brute (raw transcript stuffing)**
   - trop d'historique non pertinent
   - pertinence peu claire
   - gaspillage de fenêtre de contexte
   - discipline de prompt plus faible

2. **comportement de récupération opaque caché (opaque hidden retrieval behavior)**
   - utilisateurs et développeurs ne peuvent pas dire quelle information a influencé la réponse
   - le débogage devient difficile
   - l'architecture devient fragile et magique

Le contexte préparé vise à fournir un meilleur chemin du milieu.

---

## Couches Architecturales du Contexte

À haut niveau, l'architecture de contexte de Genie AI doit être comprise comme plusieurs couches coopérantes.

## 1. Contexte de Conversation Immédiat

C'est l'état d'interaction à court terme directement associé à la conversation active.

### Contenus typiques
- tours récents utilisateur/assistant
- état de prompt/interaction actif
- cadrage de requête immédiat

### Rôle
Cela fournit la cohérence conversationnelle locale.

### Limitation
Le contexte de conversation immédiat seul n'est pas suffisant pour un produit workspace-centric, memory-aware.

---

## 2. Contexte d'Espace de Travail

Le contexte d'espace de travail est une couche architecturale majeure car le produit évolue vers un comportement workspace-first.

### Contenus typiques
- identité de l'espace de travail
- portée de conversation liée à l'espace de travail
- contexte organisationnel persistant pertinent
- futures frontières de mémoire d'espace de travail

### Rôle
Le contexte d'espace de travail permet au système de se comporter comme si une conversation appartenait à un conteneur significatif plutôt qu'à un fil isolé flottant librement.

### Pourquoi c'est important
C'est l'une des différences centrales entre un chatbot générique et un workspace d'intelligence plus structuré.

---

## 3. Contexte de Profil Opérationnel

Les profils opérationnels sont censés façonner le comportement du runtime et, de plus en plus, le comportement du contexte aussi.

### Influence potentielle
Un profil opérationnel peut affecter :
- style de comportement du système
- profondeur attendue
- tradeoffs de runtime
- futures politiques de sélection de contexte

### Rôle architectural
Les profils opérationnels aident à lier l'architecture de contexte au modèle de plateforme plus large au lieu de laisser mémoire/contexte comme un sous-système déconnecté.

---

## 4. Contexte de Support Récupéré

La direction du système inclut la récupération d'informations de support plutôt que de dépendre seulement des transcriptions de conversation.

### Sources potentielles
- couches de mémoire curatées
- futur retrieval graph-aware
- matériaux d'espace de travail structurés
- connaissance ingérée externement dans des contextes bornés

### Rôle
Le contexte récupéré devrait fournir de la pertinence, pas du volume indiscriminé.

### Note importante
Le contexte récupéré doit être préparé et borné soigneusement. La récupération n'est utile que quand elle améliore la pertinence et la traçabilité plutôt que d'ajouter du bruit au prompt.

---

## 5. Futures Couches de Mémoire Durable

La direction de l'architecture pointe clairement vers des concepts de mémoire plus durables, mais ils doivent être décrits soigneusement.

### La mémoire ne doit pas être traitée comme un seul blob
Un système de mémoire futur utile impliquera probablement plusieurs classes de mémoire, telles que :
- contexte actif d'horizon court
- contexte durable lié à l'espace de travail
- surfaces de recall structurées
- future mémoire graph ou retrieval-enhanced

### Pourquoi c'est important
Appeler tout "mémoire" sans distinctions rend le système plus difficile à raisonner et plus facile à mal représenter.

---

## Contexte Préparé comme Pattern Central

L'idée de contexte préparé est l'un des patterns architecturaux les plus importants dans Genie AI.

### Ce que cela signifie
Au lieu de faire passer l'état brut tel quel, le système prépare un paquet de contexte pour l'exécution du modèle.

### Un contexte préparé peut inclure
- historique de conversation sélectionné
- sections de prompt explicites
- cadrage dérivé de l'espace de travail
- matériel de support récupéré
- instructions système organisées par but

### Pourquoi c'est mieux
Cela permet :
- construction de prompt plus propre
- pertinence plus intentionnelle
- débogage plus facile
- contrôle futur de policy sur ce qui entre dans le contexte du modèle
- dépendance réduite à l'enflure de transcription

---

## Relation avec la Direction Memory-Native

La direction du produit a de plus en plus mis l'accent sur l'architecture memory-native.

Cela doit être interprété soigneusement.

### Cela ne signifie pas simplement
- "nous sauvons beaucoup de texte"
- "nous avons des embeddings quelque part"
- "l'assistant se souvient de tout magiquement"

### Cela devrait signifier
- la mémoire est traitée comme une primitive de produit
- l'assemblage de contexte a une architecture explicite
- l'espace de travail et le comportement de runtime peuvent tirer de plus qu'un log de chat brut
- le système est conçu pour le recall structuré et l'évolution future

C'est une interprétation plus forte et plus crédible.

---

## Direction Graphe et Récupération

Le codebase et la planification environnante ont pointé vers des idées de retrieval graph-first ou graph-augmented.

### Pourquoi c'est important
Une direction graph-aware suggère que le système pourrait éventuellement traiter les relations entre concepts, matériaux et objets d'espace de travail comme structure de retrieval de première classe au lieu de dépendre seulement de lookup flat nearest-neighbor.

### Implication architecturale
Si cette direction mûrit, l'assemblage mémoire/contexte pourrait de plus en plus impliquer :
- sélection de pertinence
- composition de contexte relationship-aware
- support structuré au lieu de dumping de passages bruts

### Prudence
Cela devrait être documenté comme une direction à moins et jusqu'à ce que le chemin complet de production soit implémenté et stabilisé.

---

## Les Frontières Comptent

L'une des parties les plus importantes d'un système sérieux de mémoire/contexte est la discipline des frontières.

### Frontières qui comptent
- contexte conversation vs espace de travail
- historique visible par l'utilisateur vs contexte de support caché
- contexte temporaire vs mémoire durable
- données publiques vs état interne protégé
- assistance récupérée vs instructions appartenant au système

Sans ces frontières, le système devient plus difficile à faire confiance et plus difficile à déboguer.

---

## Débogabilité et Transparence

Une architecture de mémoire/contexte n'est utile que si elle peut être inspectée et raisonnée.

### Bonnes propriétés architecturales
- les développeurs peuvent expliquer quels types de contexte sont assemblés
- le comportement runtime peut être débogué quand la sélection retrieval/contexte semble fausse
- le comportement du système n'est pas présenté comme un recall total mystique

### Pourquoi c'est important
Utilisateurs et développeurs ne devraient pas avoir à deviner si une réponse venait de :
- tours récents
- cadrage d'espace de travail
- données de support récupérées
- mémoire durable cachée

Même si chaque détail interne n'est pas exposé dans l'UI, l'architecture doit rester compréhensible en interne.

---

## Modes d'Échec Courants

## 1. Enflure de Transcription (Transcript Bloat)
Trop d'historique brut entre dans le prompt sans sélection utile.

## 2. Sélection de Pertinence Faible
Le matériel récupéré est techniquement lié mais pas réellement utile.

## 3. Confusion de Contexte Caché
Le système utilise un contexte de fond qui est difficile à expliquer ou tracer.

## 4. Effondrement des Frontières (Boundary Collapse)
Contexte d'espace de travail, contexte de conversation et mémoire durable sont traités interchangeablement.

## 5. Sur-Revendication de Mémoire (Overclaiming Memory)
Le produit présente une impression de compréhension persistante plus forte que ce que le système réel supporte fiablement.

---

## Cadrage Honnête du Produit

Une architecture transparente de mémoire/contexte devrait éviter les claims vagues comme :
- "l'IA se souvient de tout"
- "l'IA comprend vraiment votre monde"

Un cadrage plus honnête est :
- la plateforme prépare le contexte depuis plusieurs couches pertinentes
- espaces de travail et profils aident à borner le comportement
- mémoire et retrieval sont en train d'être structurés comme partie de l'architecture produit
- le contexte est assemblé intentionnellement plutôt que de dépendre seulement de la croissance de transcription brute

Ce style d'explication construit plus de confiance que le langage gonflé.

---

## Relation avec le Routage de Mode Runtime

L'architecture mémoire/contexte et le routage de mode runtime sont étroitement liés.

### Pourquoi
Différents comportements runtime peuvent de plus en plus dépendre de :
- combien de contexte est assemblé
- quelles couches sont incluses
- comment la logique workspace/profil influence la sélection

C'est pourquoi mémoire/contexte ne peut pas être traité comme séparé du reste de l'architecture système.

---

## Direction Future

Le chemin d'évolution probable pour l'architecture de contexte de Genie AI inclut :
- pipelines de prepared-context plus forts
- comportement de mémoire scoped par espace de travail plus riche
- meilleur contrôle server-side sur la sélection de contexte
- future augmentation graph/retrieval
- transparence et débogabilité améliorées

L'objectif n'est pas la complexité cachée maximale.
L'objectif est **meilleure pertinence, structure plus forte, et comportement de système plus véridique**.

---

## Résumé

L'idée clé est celle-ci :

**Genie AI devrait assembler le contexte depuis des couches structurées plutôt que de prétendre que l'historique de chat brut seul est un système de mémoire suffisant.**

C'est la fondation d'une architecture de plateforme memory-native plus sérieuse.

---

## Documents Connexes Recommandés

Ce document devrait être lu avec :
- `docs/architecture/system-architecture.md`
- `docs/architecture/runtime-mode-routing.md`
- futurs docs sur retrieval, comportement API, et trust boundaries