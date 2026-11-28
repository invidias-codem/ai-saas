# Documentation de Lattice OS

Cette documentation vise à rendre le code et le fonctionnement de la plateforme Lattice OS compréhensibles pour les développeurs, les contributeurs, les personnes chargées des revues et les futurs responsables de maintenance.

L'objectif est la clarté plutôt que le marketing.

## Principes de documentation

- expliquer ce que fait réellement le système
- distinguer les comportements stables de l'architecture en évolution
- rendre visibles les frontières de confiance
- documenter explicitement les choix technologiques réels
- privilégier les descriptions concrètes aux formulations vagues sur l'IA

## Documents de référence principaux

### Vue d'ensemble
- `overview/technology-transparency.md` — pile technologique explicite et composants de la plateforme
- `overview/seo-strategy.md` — positionnement SEO cohérent avec la marque, orientation des métadonnées et architecture de contenu de Lattice OS

### Architecture
- `architecture/system-architecture.md` — structure générale du système, principaux composants et flux de données et de contrôle

## Documentation active

### CLI et déploiement (NOUVEAU)
- **lattice-cli v0.3.0** — interface en ligne de commande prête pour la production permettant de gérer l'installation Docker
  - Emplacement : `scripts/lattice-cli/`
  - Fonctionnalités : authentification, déploiement, activation des licences V3, contrôles de santé, mises à niveau et sauvegardes
  - Processus de déploiement : vérifications préalables (Docker, Compose v2, RAM/CPU, ports, disque et authentification Docker), puis vérification de la licence durant le déploiement
  - CI/CD : compilation automatique des binaires via GitHub Actions
  - Distribution : script `install.sh` avec détection du système d'exploitation et de l'architecture
  - Voir : `scripts/lattice-cli/README.md` pour la référence complète des commandes

### Programme bêta (NOUVEAU)
- **Ressources de recrutement pour la bêta** : `docs/beta-outreach/`
  - Modèles de messages privés Threads (respectant la limite de 200 caractères)
  - Séquences d'e-mails pour les testeurs intéressés
  - Stratégies de dialogue adaptées aux profils des participants
  - Gestion des réponses : « oui », « qu'est-ce que c'est ? », « est-ce gratuit ? », « pas maintenant »

- **Guides d'intégration à la bêta** : `app/[locale]/(public)/beta/`
  - Démarrage rapide (15 min) - `/beta/start`
  - Parcours développeur (45 min) - `/beta/dev`
  - Parcours entreprise (1 heure) - `/beta/enterprise`
  - Parcours confidentialité (1 heure) - `/beta/privacy`
  - Génération de sites statiques pour des temps de chargement rapides

### Authentification (MIS À JOUR)
- **Expérience de connexion inspirée des PS1/PS2**
  - Apparence Clerk personnalisée avec une carte à effet de verre
  - Arrière-plan animé avec de subtils effets de particules
  - Esthétique rétro-moderne (nostalgie des jeux des années 90)
  - Emplacement : `app/[locale]/(auth)/layout.tsx`

## Prochaines évolutions prévues

### Architecture
- `architecture/runtime-mode-routing.md`
- `architecture/memory-and-context-architecture.md`
- `architecture/workspace-operating-profile-model.md`

### Sécurité
- `security/public-routes.md`
- `security/trust-boundaries.md`
- `security/licensing-cryptography.md` — conception du système de licences V3 ed25519

### Exploitation
- `operations/truth-surfaces.md`
- `operations/deployment.md` — procédure de déploiement de l'installation Docker
- `operations/air-gap-deployment.md` — guide de fonctionnement entièrement hors ligne

### Référence
- `reference/api-reference.md`
- `reference/environment-variables.md`
- `reference/cli-commands.md` — référence complète des commandes lattice-cli

### Décisions
- `decisions/adr-001-*.md`

## Remarques

Cette documentation doit évoluer avec le produit.
Lorsque le comportement change, la documentation doit être actualisée dans le cadre de la mise en œuvre, plutôt que traitée ultérieurement.

---

**Dernière mise à jour :** 2026-06-21
**Version :** 0.3.0 (lattice-cli)
