# Carte des Fichiers Sources

## Objectif

Ce document aide les développeurs et réviseurs à localiser les surfaces d'implémentation importantes dans le repository Genie AI / `ai-saas`.

Il est conçu comme une aide à la navigation, pas un index complet de fichiers.

L'objectif est de répondre à :
- où vit ce genre de comportement ?
- quels fichiers dois-je inspecter en premier pour un sous-système donné ?
- où sont les points d'entrée les plus importants pour les routes, l'architecture, et le runtime ?

---

## Zones de Haut Niveau

## Routes de l'App
La structure primaire de routes et API vit sous :
- `app/`

### Sous-zones importantes
- `app/[locale]/...` — routes de pages localisées
- `app/api/...` — surfaces API et route-handlers
- `app/layout.tsx` — layout racine de l'app
- `app/globals.css` — couche de styling global

---

## Composants
Les blocs de construction UI primaires vivent sous :
- `components/`

### Sous-zones importantes
- `components/landing/` — UI publique/landing
- `components/chat/` — contrôles UI spécifiques au chat
- `components/sidebar.tsx` — comportement majeur navigation/sidebar
- `components/mobile-sidebar.tsx` — comportement navigation mobile
- `components/theme-provider.tsx` — couche thème/provider

---

## Architecture / Logique Runtime
La logique importante non-UI vit sous :
- `lib/`

### Sous-zones importantes
- `lib/context/` — direction prepared-context
- `lib/llm/` — logique modèle/fournisseur et conversation
- `lib/workspaces/` — logique mapping workspace/profile/runtime
- `lib/site-url.ts` — helpers URL canonique du site
- `lib/runtime/` — helpers liés au runtime
- `lib/security/` — helpers liés à la sécurité

---

## Auth / Frontière Route Publique
La logique primaire de gating de routes vit dans :
- `proxy.ts`

### Pourquoi c'est important
Ce fichier est l'un des endroits les plus importants pour comprendre :
- allowlisting de routes publiques
- comportement de routes protégées
- interaction locale/auth

---

## Surfaces API
Les route handlers importants vivent sous :
- `app/api/`

### Exemples clés
- `app/api/chat/route.ts`
- `app/api/conversations/...`
- `app/api/workspaces/...`
- `app/api/operating-profiles/...`
- `app/api/onboarding/complete/route.ts`
- `app/api/cron/...`
- `app/api/integrations/...`
- `app/api/webhooks/...`

---

## Documentation
Les docs du repo vivent sous :
- `docs/`

### Zones actuelles clés
- `docs/overview/`
- `docs/architecture/`
- `docs/security/`
- `docs/operations/`
- `docs/reference/`
- `docs/decisions/`

---

## Carte Actuelle "Regarde Ici En Premier"

## Si tu debug des problèmes d'auth de route publique
Inspecte :
- `proxy.ts`
- `app/[locale]/(landing)/...` page pertinente
- `docs/security/public-routes.md`

## Si tu debug le comportement runtime du chat
Inspecte :
- `app/api/chat/route.ts`
- `lib/workspaces/runtimeMode.ts`
- `lib/context/preparedContext.ts`
- `docs/architecture/runtime-mode-routing.md`

## Si tu debug le comportement workspace/profile
Inspecte :
- `app/api/workspaces/...`
- `app/api/operating-profiles/...`
- `lib/workspaces/...`
- `docs/architecture/workspace-operating-profile-model.md`

## Si tu debug le comportement mémoire/contexte
Inspecte :
- `lib/context/preparedContext.ts`
- `lib/llm/conversationEngine.ts`
- routes API liées à la mémoire si impliquées
- `docs/architecture/memory-and-context-architecture.md`
- `docs/architecture/retrieval-and-graph-strategy.md`

## Si tu debug le mismatch deployment/runtime
Inspecte :
- GitHub Actions runs
- surfaces hosting/deploy
- comportement route/API en direct affecté
- `docs/operations/truth-surfaces.md`
- `docs/operations/deployment.md`

---

## Mise en Garde

Cette carte de fichiers est intentionnellement sélective.
Elle devrait évoluer avec le codebase, surtout quand la logique runtime importante bouge ou que de nouveaux sous-systèmes majeurs deviennent centraux.