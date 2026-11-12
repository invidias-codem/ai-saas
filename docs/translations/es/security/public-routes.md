# Rutas Públicas

## Propósito

Este documento explica qué rutas de Genie AI están destinadas a ser accesibles públicamente, cuáles son protegidas, y cómo funciona actualmente el enforcement (aplicación) de rutas públicas.

Existe para prevenir una clase recurrente de bugs de producción:
- páginas públicas enlazando a superficies auth-gated inadvertidamente
- rutas públicas de otro modo siendo bloqueadas porque allowlists de middleware/proxy no fueron actualizadas
- confusión entre visibilidad a nivel UI y accesibilidad real de ruta

Este documento debe tratarse como la referencia actual de visibilidad de rutas para la aplicación.

---

## Principio Fundamental

Una ruta es verdaderamente pública solo si el gate (puerta) de auth del lado servidor la trata como pública.

En Genie AI, eso significa que el acceso público no se determina solo por:
- si un link aparece en una landing page
- si una página es visualmente "parecida a marketing"
- si la ruta se siente pública por convención

También debe ser explícitamente permitida por la lógica de route-matching en la capa de middleware/proxy de auth.

---

## Capa de Enforcement Actual

### Mecanismo de Gating de Rutas
Comportamiento de rutas públicas vs protegidas es controlado principalmente en:
- `proxy.ts`

Este archivo contiene el matcher `isPublicRoute` usado junto con enforcement de auth de Clerk.

### Implicación importante
Siempre que se añade una nueva ruta pública, o un subtree de ruta pública cambia, la ruta debe ser revisada en **ambos** lugares:
1. routing/UI de aplicación
2. allowlist de auth de proxy

Si solo se actualiza la UI, los usuarios públicos aún pueden ser redirigidos a sign-in.

---

## Categorías de Rutas Públicas

La aplicación actualmente tiene varios tipos de rutas que deberían considerarse públicas.

## 1. Rutas Públicas de Landing / Marketing

Estas son superficies de entrada públicas destinadas a visitantes no autenticados.

### Ejemplos
- `/`
- `/:locale`

### Propósito
- descubrimiento de producto
- posicionamiento
- conversión a sign-up o entrada de producto

---

## 2. Rutas Públicas de Entrada de Auth

Estas son accesibles públicamente porque son parte del flujo de entrada de autenticación.

### Ejemplos
- `/sign-in(.*)`
- `/sign-up(.*)`
- `/:locale/sign-in(.*)`
- `/:locale/sign-up(.*)`

### Propósito
- autenticación de usuario
- entrada de onboarding de usuario

---

## 3. Rutas Públicas Informativas

Estas pretenden permanecer accesibles sin autenticación porque proveen contenido de soporte, política, o educativo.

### Ejemplos actuales
- `/privacy`
- `/:locale/privacy`
- `/support`
- `/:locale/support`
- `/slack`
- `/:locale/slack`
- `/blog(.*)`
- `/:locale/blog(.*)`
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

### Propósito
- ayudar a usuarios a entender la plataforma
- proveer información de soporte y política pública
- exponer documentación sin forzar sign-in

---

## 4. Superficies API / Callback Públicas

Algunas rutas API deben permanecer públicas porque son puntos de entrada de integración o webhook.

### Ejemplos actuales
- `/api/guest-chat`
- `/api/feedback`
- `/api/integrations/slack/callback`
- `/api/integrations/slack/events`
- `/api/integrations/slack/command`
- `/api/integrations/slack/interactivity`
- `/api/integrations/slack/auth`
- `/api/webhooks/kofi`
- `/api/support/verify-donation`
- `/api/integrations/telegram/webhook`
- `/api/internal/jklaw`
- `/api/internal/route-to-jklaw`
- `/api/referral/capture`
- `/api/cron(.*)`
- `/api/test-mcts`
- `/api/webhooks/vercel-logs`

### Exclusiones explícitas
Las siguientes **no** son públicas a pesar de tener puntos de entrada client-side o consumidores non-browser:
- `/api/cli/stream`
- `/api/memory/cli`

Estas rutas requieren bearer-token auth cuando `LATTICE_CLI_TOKEN` está configurado. No deben tratarse como públicas en allowlists de proxy u ops de ruta.

### Nota importante
Superficie API pública **no** significa superficie de bajo riesgo.
Muchas de estas rutas son públicas porque deben aceptar tráfico externo, pero aún requieren:
- validación
- verificación de auth donde aplique
- checks de signature/token donde sea apropiado
- comportamiento narrow purpose-specific

---

## Categorías de Rutas Protegidas

Las siguientes clases amplias de rutas deben tratarse como protegidas a menos que se documente explícitamente lo contrario.

## 1. Rutas de Producto Autenticadas

### Ejemplos
- rutas de dashboard
- rutas de conversación
- rutas de workspace
- settings
- herramientas de generación autenticadas
- superficies de estado de producto/onboarding específicas de usuario

### Propósito
- exponer funcionalidad real de producto
- operar en estado de usuario
- acceder a datos de aplicación protegidos

---

## 2. Rutas API Protegidas

Cualquier ruta API no explícitamente allowlisted como pública debe asumirse protegida.

### Ejemplos típicos
- rutas de ejecución de chat
- rutas de datos específicos de usuario
- rutas de gestión de workspace
- rutas de perfil/configuración
- acciones internas de producto requiriendo identidad de usuario

---

## Visibilidad de Rutas y Prefijos de Locale

La aplicación usa routing localizado.

### Implicación importante
El tratamiento de rutas públicas debe considerar ambos:
- formas de ruta sin prefijo
- formas de ruta con prefijo de locale

### Ejemplo
Si `/docs` se pretende pública, entonces todas las formas públicas relevantes deben considerarse:
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

Esto es especialmente importante para árboles anidados de docs/blog/soporte.

---

## Modo de Fallo Conocido: UI Pública Enlazando a Ruta Protegida

Un patrón de regresión común es:
1. una página pública de landing/soporte enlaza a una ruta como `/docs`
2. la ruta existe y aparece pública en la UI
3. la ruta no se añade a `isPublicRoute`
4. usuarios no autenticados son redirigidos a sign-in

Esto ya ocurrió en la práctica con el path público de docs.

### Lección
Siempre que se añade o cambia una superficie de contenido público, la visibilidad de ruta debe revisarse como parte de la implementación.

---

## Ejemplo de Fix de Ruta Pública de Docs

El bug de auth de ruta de docs se resolvió explícitamente allowlistando:
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

en `proxy.ts`.

### Por qué importó
El link "View Docs" de la página de soporte era públicamente visible, pero el subtree real de ruta de docs no era tratado como público por el gate de auth.

Este es exactamente el tipo de mismatch que este documento existe para prevenir.

---

## Checklist de Revisión para Cualquier Nueva Ruta Pública

Al añadir una nueva ruta pública, verificar todos los siguientes:

1. **UI intent**
- ¿Esto realmente se pretende público?

2. **Route tree coverage**
- ¿El allowlist incluye tanto formas root como anidadas si se necesita?

3. **Locale coverage**
- ¿El allowlist incluye variantes con prefijo de locale?

4. **Middleware/proxy alignment**
- ¿Está `proxy.ts` actualizado accordingly?

5. **Auth behavior test**
- ¿Se probó la ruta en una sesión logged-out?

6. **Public-link flow test**
- ¿Se probó la ruta a través de la página de entrada pública real que enlaza a ella?

---

## Práctica Segura de Documentación

Siempre que la visibilidad de ruta cambie, la documentación debería idealmente actualizarse junto con el código si el cambio afecta:
- expectativas de acceso público
- flujos de soporte
- visibilidad de docs/blog/privacy
- comportamiento de integración/webhook

Esto previene que el codebase derive silenciosamente lejos de la política de acceso intencionada.

---

## Follow-Ups Futuros Recomendados

La historia de route-visibility se fortalecería más añadiendo:
- `docs/security/trust-boundaries.md`
- `docs/reference/api-reference.md`
- `docs/operations/route-verification-checklist.md`

Estos ayudarían a conectar la documentación de rutas públicas con práctica más amplia de verificación de auth, API, y deployment.