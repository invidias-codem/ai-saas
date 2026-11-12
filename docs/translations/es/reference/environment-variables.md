# Variables de Entorno

## Propósito

Este documento describe las variables de entorno principales usadas por Lattice OS / `ai-saas`.

Está destinado a hacer la plataforma más transparente para:
- desarrolladores
- operadores
- revisores
- futuros mantenedores

Este no es un volcado de secretos. Es una referencia para qué es cada variable, qué superficie la usa, y si está destinada a exposición pública/navegador o solo uso server-side.

---

## Principio Importante

Las variables de entorno caen en dos clases amplias:

### Variables públicas
Variables prefijadas con `NEXT_PUBLIC_` se espera que sean expuestas a código del lado del navegador.
No deben contener secretos.

### Variables solo servidor
Variables sin `NEXT_PUBLIC_` deben tratarse como solo server-side a menos que se documente explícitamente lo contrario.
Pueden llevar credenciales, tokens, o configuración privilegiada.

---

## Nota de Fuente de Verdad

El esquema tipado de entorno más explícito en el codebase actual es:
- `lib/env.ts`

Este documento debería rastrear ese esquema, pero el entorno de despliegue en vivo debe verificarse por separado al depurar problemas de runtime reales.

---

## Guía de Modo de Despliegue

Lattice debería configurarse de manera mode-aware en lugar de requerir cada subsistema opcional en cada instalación.

Operacionalmente, la configuración cae en estas clases amplias:
- **core required**: valores necesarios para cualquier despliegue serio
- **mode-specific required**: valores requeridos solo para ciertos modos de despliegue
- **optional feature config**: valores que habilitan capacidades avanzadas u opcionales

Para la historia inicial self-hosted, el baseline debería centrarse en:
- **Mode A — Standard Internal Deployment**

Eso significa que una instalación estándar de negocio debería priorizar configuración para:
- app/runtime
- autenticación
- base de datos
- almacenamiento
- al menos un reasoning provider soportado
- al menos un embedding provider soportado

No debería requerir cada subsistema opcional (agentes sociales, archival GPU, retrieval local avanzado, etc.) a menos que esas capacidades sean habilitadas intencionalmente.

---

## Autenticación / Clerk

## `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
### Tipo
- Pública

### Propósito
Clave publicable de Clerk browser-safe usada para inicializar flujos de auth del lado cliente.

### Usada para
- integración de auth frontend
- UX de sign-in/sign-up

---

## `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
### Tipo
- Pública

### Propósito
Configuración opcional de ruta de sign-in explícita para Clerk.

---

## `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
### Tipo
- Pública

### Propósito
Configuración opcional de ruta de sign-up explícita para Clerk.

---

## `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`
### Tipo
- Pública

### Propósito
Target opcional de redirect post-sign-in.

---

## `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL`
### Tipo
- Pública

### Propósito
Target opcional de redirect post-sign-out.

---

## `CLERK_SECRET_KEY`
### Tipo
- Solo servidor

### Propósito
Secreto de Clerk del lado servidor usado para operaciones de auth privilegiadas.

### Nota de seguridad
Nunca debe tratarse como browser-safe.

---

## `CLERK_WEBHOOK_SECRET`
### Tipo
- Solo servidor

### Propósito
Valida llamadas de webhook de Clerk.

### Nota de seguridad
Relevante para trust boundaries de rutas webhook.

---

## Variables de Proveedor AI / Modelo

## `GOOGLE_API_KEY`
### Tipo
- Solo servidor

### Propósito
API key para acceso a proveedor AI basado en Google.

### Usada para
- interacciones modelo/proveedor donde la superficie Google API está activa

---

## `GOOGLE_PROJECT_ID`
### Tipo
- Solo servidor

### Propósito
Identificador de proyecto Google Cloud.

### Usada para
- servicios Google Cloud / Vertex-style donde aplique

---

## `GOOGLE_LOCATION`
### Tipo
- Configuración solo servidor

### Propósito
Configuración de región/ubicación de Google.

### Default en esquema
- `us-central1`

---

## `GCP_SERVICE_ACCOUNT_KEY_JSON`
### Tipo
- Secreto solo servidor

### Propósito
JSON crudo de service-account usado para acceso privilegiado a Google Cloud API.

### Nota de seguridad
Altamente sensible.
Debe tratarse como credencial de servidor que lleva secretos.

---

## `REPLICATE_API_TOKEN`
### Tipo
- Solo servidor

### Propósito
Token de proveedor Replicate para paths de generación model-backed.

---

## `REPLICATE_API_TOKEN_MUSIC`
### Tipo
- Solo servidor

### Propósito
Token/path de configuración de Replicate para flujos de generación relacionados con música.

---

## `REPLICATE_API_TOKEN_VIDEO`
### Tipo
- Solo servidor

### Propósito
Token/path de configuración de Replicate para flujos de generación relacionados con video.

---

## Variables RAG / Retrieval / Memory

## `NEXT_PUBLIC_RAG_ENABLED`
### Tipo
- Flag de configuración pública

### Propósito
Controla si el comportamiento relacionado con RAG/memoria se considera habilitado en la capa de configuración client-facing.

### Default en esquema
- `true`

### Nota
Los flags de configuración pública no son fronteras de seguridad. No deben tratarse como prueba de que una característica backend es segura o insegura.

---

## `RAG_CLOUD_FUNCTION_URL`
### Tipo
- Configuración lado servidor

### Propósito
Endpoint/superficie de configuración para comportamiento RAG respaldado por cloud-function.

---

## `RAG_MEMORY_RETENTION_DAYS`
### Tipo
- Configuración lado servidor

### Propósito
Configuración de ventana de retención para comportamiento relacionado con memoria.

### Default en esquema
- `90`

---

## `RAG_RETRIEVAL_LIMIT`
### Tipo
- Configuración lado servidor

### Propósito
Controla count/limit de retrieval para retrieval de contexto relacionado con RAG.

### Default en esquema
- `5`

---

## `RAG_SIMILARITY_THRESHOLD`
### Tipo
- Configuración lado servidor

### Propósito
Controla umbral de similitud para lógica de retrieval.

### Default en esquema
- `0.6`

---

## Variables Supabase / Persistencia

## `NEXT_PUBLIC_SUPABASE_URL`
### Tipo
- Pública

### Propósito
URL de proyecto Supabase browser-safe usada por integración client-side o shared runtime.

---

## `NEXT_PUBLIC_SUPABASE_ANON_KEY`
### Tipo
- Pública

### Propósito
Clave anon de Supabase browser-safe para patrones de acceso client-side permitidos.

### Nota de seguridad
Público no significa sin restricciones. Políticas de backend/base de datos deben seguir enforcing límites de acceso reales.

---

## `SUPABASE_SERVICE_ROLE_KEY`
### Tipo
- Secreto solo servidor

### Propósito
Credencial privilegiada de service-role de Supabase.

### Nota de seguridad
Nunca debe exponerse a código del lado del navegador.
Esta es una de las credenciales de aplicación de mayor sensibilidad.

---

## Variables de Integración Slack

## `SLACK_BOT_TOKEN`
### Tipo
- Secreto solo servidor

### Propósito
Token de bot de Slack para comportamiento de integración Slack del lado servidor.

---

## `SLACK_SIGNING_SECRET`
### Tipo
- Secreto solo servidor

### Propósito
Valida autenticidad de callback/evento de Slack.

---

## `SLACK_APP_ID`
### Tipo
- Configuración lado servidor

### Propósito
Identificador de aplicación Slack.

---

## `SLACK_CLIENT_ID`
### Tipo
- Configuración lado servidor

### Propósito
Slack OAuth client id para flujo de integración backend.

---

## `SLACK_CLIENT_SECRET`
### Tipo
- Secreto solo servidor

### Propósito
Slack OAuth client secret.

---

## `NEXT_PUBLIC_SLACK_CLIENT_ID`
### Tipo
- Pública

### Propósito
Soporte de integración Slack client-facing, como flujos Add to Slack.

---

## Variables de Integración Zapier

## `ZAPIER_CLIENT_ID`
### Tipo
- Configuración lado servidor

### Propósito
Identificador de cliente de integración Zapier.

---

## `ZAPIER_CLIENT_SECRET`
### Tipo
- Secreto solo servidor

### Propósito
Secreto de integración Zapier.

---

## `ZAPIER_API_KEY`
### Tipo
- Secreto/configuración solo servidor

### Propósito
Acceso API de integración Zapier.

---

## Variables GitHub / Agent / Automatización Interna

## `GITHUB_AGENT_TOKEN`
### Tipo
- Secreto solo servidor

### Propósito
Token de GitHub para flujos internos de agent autónomos o asistidos, como automatización de repo.

---

## `GITHUB_REPO_OWNER`
### Tipo
- Configuración lado servidor

### Propósito
Contexto de owner de repo GitHub por defecto para automatización interna.

---

## `GITHUB_REPO_NAME`
### Tipo
- Configuración lado servidor

### Propósito
Contexto de nombre de repo GitHub por defecto para automatización interna.

---

## `GITHUB_DEFAULT_BRANCH`
### Tipo
- Configuración lado servidor

### Propósito
Nombre de rama por defecto usado por flujos de automatización GitHub internos.

### Default en esquema
- `main`

---

## Variables Webhooks / Cron / Jobs Internos

## `VERCEL_LOG_WEBHOOK_SECRET`
### Tipo
- Secreto solo servidor

### Propósito
Protege manejo de webhook de logs de Vercel.

---

## `CRON_SECRET`
### Tipo
- Secreto solo servidor

### Propósito
Autentica ejecución de rutas activadas por cron donde se requiere scheduling secret-gated.

### Nota de seguridad
Esto es especialmente importante porque algunas rutas cron pueden ser externamente alcanzables pero no deben comportarse como endpoints públicos ordinarios.

---

## Guía de Uso General

## Usar `NEXT_PUBLIC_` solo cuando sea necesario
Cualquier cosa prefijada `NEXT_PUBLIC_` debería asumirse visible para código client-side.

## Preferir acceso tipado a través de `lib/env.ts`
El esquema tipado ayuda a documentar intención y detecta valores faltantes más claramente que acceso `process.env` crudo disperso.

## No confundir presencia con corrección
Una variable existiendo en un archivo `.env` local no prueba:
- producción la tiene
- el valor es correcto
- el sistema en vivo la está usando como se espera

La configuración de entorno aún tiene que verificarse contra la superficie de verdad de despliegue real.

---

## Guía de Seguridad

Las variables más sensibles en este set incluyen:
- `CLERK_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SLACK_SIGNING_SECRET`
- `SLACK_CLIENT_SECRET`
- `SLACK_BOT_TOKEN`
- `GCP_SERVICE_ACCOUNT_KEY_JSON`
- `REPLICATE_API_TOKEN*`
- `GITHUB_AGENT_TOKEN`
- `CRON_SECRET`
- `VERCEL_LOG_WEBHOOK_SECRET`

Estas nunca deberían exponerse en código client-side, screenshots, logs públicos, o config plaintext commiteado.

---

## Documentos Relacionados

Este documento debería leerse junto con:
- `docs/reference/api-reference.md`
- `docs/security/trust-boundaries.md`
- `docs/operations/truth-surfaces.md`
- futuros docs de configuración deployment/ops

---

## Mejora de Seguimiento

Una futura mejora a esta referencia sería añadir:
- mapeo variable → archivo/feature
- required/optional por environment (local, preview, production)
- ejemplos de setup para desarrollo local no-secreto