# Mapa de Archivos Fuente

## Propósito

Este documento ayuda a desarrolladores y revisores a localizar superficies de implementación importantes en el repositorio Genie AI / `ai-saas`.

Está destinado como ayuda de navegación, no un índice completo de archivos.

El objetivo es responder:
- ¿dónde vive este tipo de comportamiento?
- ¿qué archivos debería inspeccionar primero para un subsistema dado?
- ¿dónde están los puntos de entrada más importantes de rutas, arquitectura, y runtime?

---

## Áreas de Alto Nivel

## Rutas de App

La estructura primaria de rutas y API vive bajo:
- `app/`

### Subáreas importantes
- `app/[locale]/...` — rutas de página localizadas
- `app/api/...` — superficies de API y route-handler
- `app/layout.tsx` — layout raíz de la app
- `app/globals.css` — capa de estilado global

---

## Componentes

Los bloques de construcción de UI primarios viven bajo:
- `components/`

### Subáreas importantes
- `components/landing/` — UI pública/landing
- `components/chat/` — controles de UI específicos de chat
- `components/sidebar.tsx` — comportamiento mayor de navegación/sidebar
- `components/mobile-sidebar.tsx` — comportamiento de navegación móvil
- `components/theme-provider.tsx` — capa de tema/provider

---

## Arquitectura / Lógica de Runtime

Lógica importante no-UI vive bajo:
- `lib/`

### Subáreas importantes
- `lib/context/` — dirección prepared-context
- `lib/llm/` — lógica de modelo/proveedor y conversación
- `lib/workspaces/` — lógica de mapeo workspace/profile/runtime
- `lib/site-url.ts` — helpers de URL canónica del sitio
- `lib/runtime/` — helpers relacionados con runtime
- `lib/security/` — helpers relacionados con seguridad

---

## Auth / Límite de Ruta Pública

Lógica primaria de gating de rutas vive en:
- `proxy.ts`

### Por qué importa
Este archivo es uno de los lugares más importantes para entender:
- allowlisting de rutas públicas
- comportamiento de rutas protegidas
- interacción locale/auth

---

## Superficies API

Route handlers importantes viven bajo:
- `app/api/`

### Ejemplos clave
- `app/api/chat/route.ts`
- `app/api/conversations/...`
- `app/api/workspaces/...`
- `app/api/operating-profiles/...`
- `app/api/onboarding/complete/route.ts`
- `app/api/cron/...`
- `app/api/integrations/...`
- `app/api/webhooks/...`

---

## Documentación

Docs del repo viven bajo:
- `docs/`

### Áreas actuales clave
- `docs/overview/`
- `docs/architecture/`
- `docs/security/`
- `docs/operations/`
- `docs/reference/`
- `docs/decisions/`

---

## Mapa Actual "Mira Aquí Primero"

## Si depuras issues de auth de ruta pública
Inspecciona:
- `proxy.ts`
- `app/[locale]/(landing)/...` page relevante
- `docs/security/public-routes.md`

## Si depuras comportamiento de runtime de chat
Inspecciona:
- `app/api/chat/route.ts`
- `lib/workspaces/runtimeMode.ts`
- `lib/context/preparedContext.ts`
- `docs/architecture/runtime-mode-routing.md`

## Si depuras comportamiento de workspace/profile
Inspecciona:
- `app/api/workspaces/...`
- `app/api/operating-profiles/...`
- `lib/workspaces/...`
- `docs/architecture/workspace-operating-profile-model.md`

## Si depuras comportamiento de memoria/contexto
Inspecciona:
- `lib/context/preparedContext.ts`
- `lib/llm/conversationEngine.ts`
- rutas API relacionadas con memoria si están involucradas
- `docs/architecture/memory-and-context-architecture.md`
- `docs/architecture/retrieval-and-graph-strategy.md`

## Si depuras mismatch de deployment/runtime
Inspecciona:
- GitHub Actions runs
- superficies de hosting/deploy
- comportamiento de ruta/API en vivo afectado
- `docs/operations/truth-surfaces.md`
- `docs/operations/deployment.md`

---

## Advertencia

Este mapa de archivos es intencionalmente selectivo.
Debería evolucionar conforme el codebase cambia, especialmente cuando lógica de runtime importante se mueve o nuevos subsistemas mayores se vuelven centrales.