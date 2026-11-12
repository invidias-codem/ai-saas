# Modes de Déploiement

## Objectif

Ce document définit les modes de déploiement officiels que Lattice OS doit supporter pour l'adoption par les entreprises.

Il existe pour rendre la planification, l'empaquetage, les opérations et le support self-hosted plus concrets qu'une vague histoire de "déployez n'importe où".

---

## Résumé Exécutif

Lattice devrait présenter un **petit ensemble de modes de déploiement officiels** alignés sur les vrais besoins des acheteurs.

Modes officiels recommandés :

1. **Mode A — Déploiement Interne Standard**
2. **Mode B — Déploiement d'Assistant pour Clients**
3. **Mode C — Déploiement Avancé Privé / Riche en Mémoire**
4. **Mode D — Déploiement d'Infrastructure / Plateforme**

La première vraie histoire self-hosted pour les entreprises devrait être :

## **Mode A — Déploiement Interne Standard**

C'est le profil de déploiement initial le plus propre et le plus crédible pour Lattice OS.

---

## Pourquoi les Modes de Déploiement Comptent

Sans modes de déploiement explicites, les entreprises font face à de l'ambiguïté autour de :
- services requis
- services optionnels
- attentes des workers
- frontières de stockage/récupération
- comportement local/privé vs assisté par fournisseur
- ce qui est réellement supporté vs théoriquement possible

Les modes de déploiement transforment le self-hosting d'une théorie en un contrat opérationnel.

---

## Mode A — Déploiement Interne Standard

### Pour qui
- équipes internes document-intensive
- conseil/agences
- équipes produit/opérations/recherche
- premiers adopteurs self-hosted d'entreprise

### Cas d'usage principal
Raisonnement workspace-scoped interne sur documents uploadés, contexte de projet en cours, et mémoire persistante.

### Objectif
Rendre Lattice facile à installer et utile pour les équipes internes sans requérir d'infrastructure avancée.

### Composants requis
- service web/app
- base de données
- stockage d'objets
- fournisseur/configuration d'authentification
- tout worker de fond essentiel seulement si le feature set actuel le requiert vraiment

### Composants optionnels
- worker d'archival/compression avancée
- sidecar de récupération locale/privée
- fournisseur d'observabilité
- intégrations sociales/agents
- worker GPU

### Attentes de fonctionnalités
Devrait supporter :
- auth utilisateur
- workspaces
- upload de documents
- preview
- récupération/requête warm
- chat/raisonnement soutenu par documents

Ne devrait pas requérir :
- worker d'archival à froid
- ingesta multimodale avancée
- complexité de tenancy/admin customer-facing

---

## Mode B — Déploiement d'Assistant pour Clients

### Pour qui
- entreprises SaaS
- constructeurs d'assistants onboarding/support
- entreprises intégrant Lattice dans une couche de produit user-facing

### Cas d'usage principal
Alimenter un assistant ou copilote customer-facing utilisant connaissance scopée, mémoire, et récupération.

### Objectif
Permettre aux équipes produit de faire tourner Lattice dans leur propre stack pour des workflows customer-facing avec des frontières de tenant et de confiance claires.

### Attentes opérationnelles supplémentaires
- observabilité/tracing plus fort
- isolation tenant/client plus claire
- UX de confiance public-facing plus fort
- visibilité admin/operateur

### Pourquoi il vient en second
Ce segment a une barre de fiabilité et de confiance plus haute que le Mode A.

---

## Mode C — Déploiement Avancé Privé / Riche en Mémoire

### Pour qui
- entreprises sensibles à la vie privée
- équipes avec besoins de récupération/mémoire plus lourds
- acheteurs intéressés par l'indexing local/privé et contrôle de lifecycle plus profond

### Cas d'usage principal
Faire tourner Lattice avec une vie privée plus forte, un comportement document/mémoire plus riche, et des couches optionnelles d'archival avancé ou de récupération locale.

### Objectif
Offrir un profil de déploiement plus puissant sans forcer chaque entreprise dans la complexité complète par défaut.

### Composants additionnels probables
- queue/broker si flux archival/async activés
- topologie de worker avancée
- backend/sidecar de récupération locale optionnel
- services d'ingestion plus riches optionnels

### Pourquoi c'est un mode avancé
Cela devrait être une expansion opt-in explicite, pas la baseline par défaut.

---

## Mode D — Déploiement d'Infrastructure / Plateforme

### Pour qui
- startups AI-native
- équipes internes de plateforme AI
- acheteurs d'infrastructure
- équipes produit qui veulent Lattice comme substrat plutôt que juste comme une app

### Cas d'usage principal
Utiliser Lattice comme un substrat installable de mémoire/récupération/exécution à l'intérieur d'une architecture de produit/plateforme plus large.

### Objectif
Rendre Lattice viable comme composant de plateforme modulaire pour les acheteurs techniques.

### Attentes opérationnelles
C'est la barre de mode la plus haute.
Il requiert :
- topologie claire
- preflight checks
- guidance d'upgrade
- docs modulaires
- confiance d'installation

### Pourquoi c'est plus tard
C'est un mode de maturité, pas le point de départ baseline.

---

## Ordre de Support Officiel Recommandé

### Support Phase 1
- **Mode A — Déploiement Interne Standard**

### Support Phase 2
- **Mode B — Déploiement d'Assistant pour Clients**

### Support Phase 3
- **Mode C — Déploiement Avancé Privé / Riche en Mémoire**
- **Mode D — Déploiement d'Infrastructure / Plateforme**

Cela garde la matrice de support alignée avec la maturité du produit et les attentes des acheteurs.

---

## Recommandation Finale

Supporter un petit ensemble de modes de déploiement officiels, en séquence.

La première vraie histoire self-hosted pour les entreprises devrait rester :

## **Mode A — Déploiement Interne Standard**