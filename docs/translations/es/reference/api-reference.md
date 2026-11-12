# Referencia de API

## Propósito

Este documento proporciona una referencia práctica para las superficies importantes de la API de Genie AI.

No pretende ser un reemplazo de OpenAPI generado. En su lugar, es una referencia operacional legible por humanos para:
- desarrolladores
- mantenedores
- colaboradores
- revisores

El énfasis está en la claridad:
- qué hace la ruta
- si es pública o protegida
- qué entradas y salidas importan
- qué efectos secundarios esperar
- qué superficie de verdad usar al depurarla

---

## Modelo de Clasificación de Rutas

Esta referencia usa las siguientes categorías de rutas:

### Pública
Accesible sin autenticación normal de usuario, usualmente porque la ruta soporta UX pública o integración externa.

### Protegida
Requiere contexto de usuario autenticado.

### Integración / Callback
Alcanzable externamente para un propósito de integración estrecho. La alcanzabilidad no implica confianza amplia.

### Automatización / Cron
Usada por flujos de trabajo programados o en segundo plano.

### Terminal / SSE Raw
Streams crudos de Server-Sent Events destinados a herramientas CLI, integraciones, y clientes no-navegador. Estas rutas omiten envelopes JSON típicos y requieren parsers de cliente explícitos.

---

## APIs de Producto Central

## `POST /api/chat`

- Categoría: Protegida
- Propósito: Ruta principal de ejecución de chat.
- Responsabilidades: recibir solicitudes de chat, resolver contexto de conversación y workspace, ejecutar flujo de proveedor/modelo, retornar metadata de respuesta del asistente.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de runtime en vivo, verdad de código fuente.

---

## `GET /api/conversations`
## `POST /api/conversations`

- Categoría: Protegida
- Propósito: Gestionar estado de colección de conversaciones para usuarios autenticados.
- Responsabilidades: listar o crear conversaciones, soportar routing workspace-aware.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de base de datos/esquema.

---

## `POST /api/conversations/new`

- Categoría: Protegida
- Propósito: Crear un punto de entrada de flujo de nueva conversación.
- Responsabilidades: inicializar una nueva conversación y estado de UI esperado.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de base de datos/esquema, verdad de frontend/runtime.

---

## `GET /api/conversations/[id]`
## `PATCH /api/conversations/[id]`
## `DELETE /api/conversations/[id]`

- Categoría: Protegida
- Propósito: Obtener, actualizar, o eliminar una conversación específica.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de base de datos/esquema, verdad de runtime en vivo.

---

## `GET /api/workspaces`
## `POST /api/workspaces`

- Categoría: Protegida
- Propósito: Gestionar registros de workspace.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de base de datos/esquema.

---

## `GET /api/workspaces/default`

- Categoría: Protegida
- Propósito: Resolver el workspace por defecto para el usuario actual.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de base de datos/esquema, verdad de runtime en vivo.

---

## `GET /api/operating-profiles`
## `POST /api/operating-profiles`

- Categoría: Protegida
- Propósito: Gestionar registros de operating-profile.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de base de datos/esquema.

---

## `GET /api/operating-profiles/default`

- Categoría: Protegida
- Propósito: Resolver el operating profile por defecto para el contexto/usuario actual.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de base de datos/esquema.

---

## `POST /api/onboarding/complete`

- Categoría: Protegida
- Propósito: Finalizar onboarding y crear/adjuntar estado de producto requerido.
- Clase de riesgo conocida: altamente sensible a verdad de esquema.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de base de datos/esquema, verdad de runtime en vivo.

---

## APIs Terminal / SSE Raw

## `POST /api/cli/stream`

- Categoría: Terminal / Raw SSE
- Propósito: Emitir respuestas del asistente y envelopes de control de ejecución local para consumidores terminal-nativos. Esta ruta es el puente entre el runtime de la app web y clientes CLI shell-driven.
- Auth: bearer token cuando `LATTICE_CLI_TOKEN` está configurado; de lo contrario no autenticado en setups locales.
- Request `Content-Type`: `application/json`
- Response `Content-Type`: `text/event-stream`
- Superficie de verdad para depuración: verdad de runtime de API, verdad de motor de conversación, logs de shim CLI local.

### Forma de Request

```json
{
  "messages": [
    {
      "role": "user",
      "text": "list files in the current project"
    }
  ],
  "options": {
    "localMode": true,
    "memoryPlan": null,
    "sudoPromptNames": ["BashSafety", "CLIStreamer", "ToolRouter"]
  }
}
```

### Ejemplo cURL

```bash
curl -N -X POST http://localhost:3000/api/cli/stream \
  -H "Content-Type: application/json" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTI...OKEN" \
  -d '{"messages":[{"role":"user","text":"list files"}],"options":{"localMode":true}}'
```

### Notas

- Los eventos son frames SSE con framing line-buffered.
- Envelopes de control de ejecución local llegan como JSON dentro de líneas `data:`.
- La completación final se señala por un frame de control event-name en lugar de solo HTTP close.
- Ver `docs/reference/cli-stream-sse.md` para taxonomía exacta de eventos y reglas de parsing.

---

## `GET /api/memory/cli`

- Categoría: Terminal / Raw SSE API
- Propósito: Leer y escribir entradas de memoria CLI a través de una interfaz protegida por token.
- Auth: Mismo modelo bearer que `/api/cli/stream`.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de servicio de memoria, verdad de vector store.

### Ejemplo cURL

```bash
curl -sS "http://localhost:3000/api/memory/cli?limit=20" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTI...OKEN"
```

### Notas

- Usar esto para inspeccionar lecturas/escrituras de memoria CLI sin el path completo del dashboard.
- Escrituras de memoria de shim local rutean a través de esta API en flujos CLI-enabled.

---

## APIs de Feedback y Soporte

## `POST /api/feedback`

- Categoría: Protegida
- Propósito: Enviar feedback.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de transporte downstream.

## `POST /api/support`

- Categoría: Protegida
- Propósito: Enviar mensajes de soporte.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de transporte downstream.

## `POST /api/guest-chat`

- Categoría: Pública
- Propósito: Superficie de chat de invitado pública.
- Clase de riesgo conocida: monitorear por exposición a abuso y claridad de alcance.
- Superficie de verdad para depuración: verdad de runtime de API, verdad de routing de modo runtime.

---

## Guía de Envelope de Error

Muchas rutas retornan envelopes de error JSON. La forma exacta puede no estar totalmente estandarizada aún.

```json
{
  "error": "Unauthorized"
}
```

```json
{
  "status": "error",
  "error_code": "unauthorized",
  "message": "You must be signed in to access this resource."
}
```

Donde quedan diferencias, documentar comportamiento explícito de ruta en esta referencia según sea necesario.