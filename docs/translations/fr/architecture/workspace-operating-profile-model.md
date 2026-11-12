# Modèle d'Espace de Travail et de Profil Opérationnel

## Objectif

Ce document explique la relation entre les **espaces de travail** et les **profils opérationnels** dans Genie AI.

Il existe car ce modèle est l'un des changements les plus importants dans l'architecture et l'identité produit de la plateforme.

Genie AI évolue depuis un pattern plus simple de "chat plus pages d'outils" vers un système plus structuré où :
- l'espace de travail est le conteneur organisationnel principal
- le profil opérationnel façonne le comportement du runtime
- les conversations héritent de plus en plus du contexte de cette structure

Ce document clarifie ce modèle à un niveau conceptuel et architectural.

---

## Principe Fondamental

La plateforme ne devrait pas traiter chaque conversation comme un fil de chat générique sans contexte.

Au lieu de cela :
- **l'espace de travail** fournit le conteneur
- **le profil opérationnel** fournit la forme comportementale
- **la conversation** devient un fil actif à l'intérieur de cette structure

C'est la colonne vertébrale d'un produit plus memory-native, cost-aware et context-aware.

---

## Pourquoi Ce Modèle Existe

Un modèle de chatbot générique a tendance à aplatir tout dans une surface :
- mêmes suppositions de contexte
- mêmes suppositions de runtime
- mêmes suppositions coût/qualité
- frontières organisationnelles faibles

Cette approche échoue quand la plateforme veut supporter :
- comportement de runtime différencié
- préparation de contexte plus forte
- organisation utilisateur significative
- futures frontières de mémoire
- stratégie de produit budget-conscious

Le modèle espace de travail + profil opérationnel est censé résoudre cela.

---

## Objets Primaires

## 1. Espace de Travail

### Ce que c'est
Un espace de travail est le conteneur principal pour une unité significative d'activité utilisateur.

### Ce qu'il représente
Un espace de travail peut représenter :
- un projet
- un domaine de travail
- un conteneur de contexte persistant
- une future frontière de mémoire
- une unité de scope de runtime

### Pourquoi c'est important
Un espace de travail donne à la plateforme un endroit pour attacher :
- conversations
- comportement mémoire/contexte
- futures structures de connaissance
- suppositions de runtime façonnées par le profil

Sans un vrai modèle d'espace de travail, le contexte et le comportement restent trop plats.

---

## 2. Profil Opérationnel

### Ce que c'est
Un profil opérationnel est une description structurée de comment le système devrait se comporter pour un contexte utilisateur/espace de travail donné.

### Ce qu'il influence
Un profil opérationnel peut façonner :
- sélection du mode runtime
- tradeoffs coût/latence/qualité
- futures politiques de sélection de contexte
- style et attentes de comportement système
- comment la plateforme balance capacité et efficacité

### Pourquoi c'est important
Un profil opérationnel est plus honnête et extensible qu'exposer un toggle de mode simpliste "rapide / qualité / agentique" sans assez de contexte backend pour le supporter proprement.

---

## 3. Conversation

### Ce que c'est
Une conversation est le fil d'interaction actif à l'intérieur du modèle espace de travail/profil.

### Pourquoi c'est important
Une conversation ne devrait plus être traitée par défaut comme un objet isolé flottant librement.

Au lieu de cela, une conversation tire de plus en plus de sens de :
- son appartenance à l'espace de travail
- son comportement runtime lié au profil
- futures couches mémoire/contexte attachées à cette structure

---

## Relation Entre Les Trois

À un niveau conceptuel :
- **espace de travail** = où le travail vit
- **profil opérationnel** = comment le système devrait se comporter dans cet environnement
- **conversation** = le fil actif se passant dans cette structure

Cette relation est l'une des abstractions produit les plus importantes dans Genie AI.

---

## Espace de Travail Comme Conteneur Principal

La direction de la plateforme traite de plus en plus l'espace de travail comme le conteneur de runtime principal.

### Pourquoi c'est important
Un espace de travail peut ancrer :
- identité organisationnelle
- scope de mémoire
- futur scope de retrieval
- policy de runtime
- groupement de conversations

### Implication architecturale
Cela signifie que l'espace de travail n'est pas juste une étiquette de sidebar ou un dossier cosmétique.
Il est censé devenir partie du vrai modèle de runtime.

---

## Profil Opérationnel Comme Couche de Policy Runtime

Un profil opérationnel devrait être compris comme une couche de policy plutôt que juste une étiquette de préférence.

### Il peut éventuellement exprimer des choses comme
- si le comportement devrait optimiser plus pour la vitesse ou la profondeur
- si certains patterns de workflow sont attendus
- quel type d'assemblage de contexte est approprié
- comment faire le tradeoff capacité, coût, et latence de façon plus structurée

### Pourquoi c'est important
Cela crée de la différenciation sans prétendre qu'il y a un mode coûteux universellement optimal pour chaque conversation.

Cela s'aligne aussi avec la direction plus large du produit d'être plus budget-aware et profile-shaped plutôt que "un mode premium pour tout."

---

## Pourquoi C'est Mieux Que Les Modes De Chat Génériques

Un simple switch de mode côté client est facile à exposer, mais faible architecturalement.

### Problèmes avec les modes de chat naïfs
- ils peuvent mal représenter ce que le backend fait réellement
- ils ignorent le contexte d'espace de travail
- ils ne scalent pas bien vers un comportement memory-aware
- ils créent souvent de la fausse précision dans l'UI

### Avantages de espace de travail + profil opérationnel
- le comportement peut être dérivé d'un contexte plus riche
- le routage runtime devient plus honnête
- le comportement produit devient plus composable
- futures couches mémoire/retrieval ont un modèle de conteneur stable

---

## Relation avec le Routage de Mode Runtime

Le modèle espace de travail/profil opérationnel est l'une des raisons principales pour lesquelles le routage de mode runtime a évolué vers une résolution côté serveur.

### Pourquoi
Le backend a besoin d'inspecter :
- quelle conversation c'est
- à quel espace de travail elle appartient
- si un profil devrait façonner le comportement

C'est plus fort que de demander au client de deviner le mode final manuellement.

---

## Relation avec l'Architecture Mémoire et Contexte

Le modèle espace de travail/profil opérationnel importe aussi car la préparation de mémoire et contexte ont besoin de frontières.

### L'espace de travail peut fournir
- scope de contexte
- identité de conteneur de mémoire
- future frontière de retrieval

### Le profil opérationnel peut fournir
- indices de policy de sélection de contexte
- forme de comportement attendue
- futures règles de balance mémoire/runtime

C'est pourquoi ces systèmes devraient être compris ensemble, pas indépendamment.

---

## Flux General / Pre-Workspace

La plateforme a encore besoin de supporter les utilisateurs avant que l'ancrage complet d'espace de travail ne soit établi.

### Implication de design actuelle
Le chat pre-workspace ou légèrement scoped est intentionnellement simplifié et plus honnête.

### Exemple
Le mouvement vers un mode **General** pre-workspace unique reflète cela.

### Pourquoi
Cela évite de faire semblant que la plateforme a déjà le riche contexte espace de travail/profil nécessaire pour justifier une différenciation comportementale backend plus profonde.

---

## Implications d'Onboarding

Un flux d'onboarding significatif ne devrait pas seulement créer un compte utilisateur.
Il devrait aider à instancier la vraie structure runtime de la plateforme.

### En termes pratiques, l'onboarding devrait évoluer vers la création de
- un profil opérationnel personnalisé
- un espace de travail de démarrage
- une conversation/chemin de démarrage vers cet espace de travail

### Pourquoi c'est important
Cela fait de l'onboarding une partie de l'architecture, pas juste du setup de compte.

---

## Implications de Coût et Stratégie Produit

Ce modèle supporte aussi une idée importante de stratégie produit :

### Au lieu de
un mode "meilleur" coûteux par défaut pour tous,

### la plateforme peut viser
l'économie et le comportement de runtime profile-shaped.

Cela permet au produit de poursuivre :
- alignement plus fort entre besoins utilisateur et comportement système
- meilleure discipline de coût
- différenciation plus significative à un prix plus bas

C'est un avantage produit sérieux si implémenté honnêtement.

---

## Modes d'Échec Courants

## 1. Espace de Travail Comme Coquille Cosmétique
Un espace de travail existe dans l'UI mais n'influence pas réellement le comportement runtime/contexte.

## 2. Profil Opérationnel Comme Étiquette Vide
Un profil existe dans la DB/UI mais ne façonne pas le vrai comportement backend.

## 3. Re-Centralisation de la Conversation
Le système continue de retomber sur le traitement des conversations comme l'objet primaire réel, sapant le modèle espace de travail.

## 4. Promesses UI Devant La Réalité Backend
Le frontend expose des contrôles profil/mode que le backend ne peut pas encore honorer fidèlement.

## 5. Onboarding Sans Structure Runtime
Les utilisateurs apparaissent "configurés" mais n'ont pas réellement l'état espace de travail/profil nécessaire pour l'architecture intentionnelle.

---

## Cadrage Honnête du Produit

Le modèle espace de travail/profil opérationnel devrait être décrit plainement.

### Bon cadrage
- les espaces de travail organisent le contexte actif et le futur scope de mémoire
- les profils opérationnels aident à façonner le comportement backend
- les conversations vivent dans cette structure
- le comportement runtime est de plus en plus résolu depuis ce modèle côté serveur

### Mauvais cadrage
- "l'IA devient automatiquement ce que vous voulez partout instantanément"
- "les profils garantissent une sélection parfaite de mode d'intelligence"
- "espace de travail signifie dossier, mais aussi tout le reste d'une façon ou d'une autre"

La précision construit la confiance.

---

## Direction Future

Ce modèle devient plus précieux à mesure que le reste de la plateforme mûrit :
- routage runtime côté serveur
- pipelines de prepared context
- comportement memory-native
- augmentation graph/retrieval
- persistance et comportement de connaissance workspace-scoped

Plus ces systèmes deviennent réels, plus l'abstraction espace de travail/profil opérationnel devient importante.

---

## Résumé

L'idée clé est celle-ci :

**L'espace de travail définit où le travail vit. Le profil opérationnel aide à définir comment le système devrait s'y comporter. La conversation est le fil actif à l'intérieur de cette structure.**

C'est l'une des idées architecturales centrales dans l'évolution de Genie AI au-delà d'un produit chatbot générique.

---

## Documents Connexes

Ce document devrait être lu avec :
- `docs/architecture/system-architecture.md`
- `docs/architecture/runtime-mode-routing.md`
- `docs/architecture/memory-and-context-architecture.md`
- futurs docs d'onboarding, API, et ADR