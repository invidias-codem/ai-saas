# Modelo de Workspace y Perfil Operativo

## Propósito

Este documento explica la relación entre **workspaces** y **operating profiles** en Genie AI.

Existe porque este modelo es uno de los cambios más importantes en la arquitectura e identidad de producto de la plataforma.

Genie AI está evolucionando desde un patrón más simple de "chat más páginas de herramientas" hacia un sistema más estructurado donde:
- workspace es el contenedor organizacional primario
- operating profile da forma al comportamiento de runtime
- las conversaciones heredan cada vez más contexto de esa estructura

Este documento aclara ese modelo a nivel conceptual y arquitectónico.

---

## Principio Fundamental

La plataforma no debería tratar cada conversación como un hilo de chat genérico sin contexto.

En su lugar:
- **workspace** provee el contenedor
- **operating profile** provee la forma conductual
- **conversation** se convierte en un hilo activo dentro de esa estructura

Esta es la columna vertebral de un producto más memory-native, cost-aware y context-aware.

---

## Por Qué Existe Este Modelo

Un modelo de chatbot genérico tiende a aplanar todo en una superficie:
- mismas suposiciones de contexto
- mismas suposiciones de runtime
- mismas suposiciones de costo/calidad
- límites organizacionales débiles

Ese enfoque falla cuando la plataforma quiere soportar:
- comportamiento de runtime diferenciado
- preparación de contexto más fuerte
- organización de usuario significativa
- futuros límites de memoria
- estrategia de producto budget-conscious

El modelo workspace + operating-profile pretende resolver eso.

---

## Objetos Primarios

## 1. Workspace

### Qué es
Un workspace es el contenedor primario para una unidad significativa de actividad de usuario.

### Qué representa
Un workspace puede representar:
- un proyecto
- un dominio de trabajo
- un contenedor de contexto persistente
- un futuro límite de memoria
- una unidad de alcance de runtime

### Por qué importa
Un workspace da a la plataforma un lugar para adjuntar:
- conversaciones
- comportamiento de memoria/contexto
- futuras estructuras de conocimiento
- suposiciones de runtime moldeadas por perfil

Sin un modelo de workspace real, el contexto y el comportamiento se quedan demasiado planos.

---

## 2. Operating Profile

### Qué es
Un operating profile es una descripción estructurada de cómo el sistema debería comportarse para un contexto dado de usuario/workspace.

### Qué influye
Un operating profile puede moldear:
- selección de modo de runtime
- tradeoffs costo/latencia/calidad
- futuras políticas de selección de contexto
- estilo y expectativas de comportamiento del sistema
- cómo la plataforma balancea capacidad con eficiencia

### Por qué importa
Un operating profile es más honesto y extensible que exponer un toggle de modo simplista "rápido / calidad / agente" sin suficiente contexto backend para soportarlo apropiadamente.

---

## 3. Conversation

### Qué es
Una conversation es el hilo de interacción activo dentro del modelo workspace/profile.

### Por qué importa
Una conversation ya no debería tratarse por defecto como un objeto aislado flotando libremente.

En su lugar, una conversation deriva cada vez más significado de:
- su membresía en workspace
- su comportamiento de runtime vinculado al perfil
- futuras capas de memoria/contexto adjuntas a esa estructura

---

## Relación Entre Los Tres

A nivel conceptual:
- **workspace** = donde vive el trabajo
- **operating profile** = cómo el sistema debería comportarse en ese entorno
- **conversation** = el hilo activo ocurriendo dentro de esa estructura

Esta relación es una de las abstracciones de producto más importantes en Genie AI.

---

## Workspace Como Contenedor Primario

La dirección de la plataforma trata cada vez más al workspace como el contenedor de runtime principal.

### Por qué es importante
Un workspace puede anclar:
- identidad organizacional
- alcance de memoria
- futuro alcance de retrieval
- policy de runtime
- agrupación de conversaciones

### Implicación arquitectónica
Esto significa que workspace no es solo una etiqueta de sidebar o carpeta cosmética.
Pretende convertirse en parte del modelo de runtime real.

---

## Operating Profile Como Capa de Policy de Runtime

Un operating profile debería entenderse como una capa de policy en lugar de solo una etiqueta de preferencia.

### Puede eventualmente expresar cosas como
- si el comportamiento debería optimizar más para velocidad o profundidad
- si ciertos patrones de workflow son esperados
- qué tipo de ensamblaje de contexto es apropiado
- cómo hacer tradeoff de capacidad, costo y latencia de forma más estructurada

### Por qué importa
Esto crea diferenciación sin pretender que hay un modo costoso universalmente óptimo para cada conversación.

También se alinea con la dirección más amplia del producto de ser más budget-aware y profile-shaped en lugar de "un modo premium para todo."

---

## Por Qué Es Mejor Que Modos de Chat Genéricos

Un simple switch de modo del lado cliente es fácil de exponer, pero débil arquitectónicamente.

### Problemas con modos de chat naïves
- pueden representar mal lo que el backend realmente hace
- ignoran contexto de workspace
- no escalan bien hacia comportamiento memory-aware
- a menudo crean falsa precisión en la UI

### Ventajas de workspace + operating profile
- comportamiento puede derivarse de contexto más rico
- routing de runtime se vuelve más honesto
- comportamiento de producto se vuelve más composable
- futuras capas memoria/retrieval tienen un modelo de contenedor estable

---

## Relación con Enrutamiento de Modo Runtime

El modelo workspace/operating-profile es una de las razones principales por las que el enrutamiento de modo runtime se movió hacia resolución server-side.

### Por qué
El backend necesita inspeccionar:
- qué conversation es esta
- a qué workspace pertenece
- si un profile debería moldear comportamiento

Esto es más fuerte que pedir al cliente que adivine el modo final manualmente.

---

## Relación con Arquitectura de Memoria y Contexto

El modelo workspace/operating-profile también importa porque la preparación de memoria y contexto necesitan límites.

### Workspace puede proveer
- alcance de contexto
- identidad de contenedor de memoria
- futuro límite de retrieval

### Operating profile puede proveer
- hints de policy de selección de contexto
- forma de comportamiento esperada
- futuras reglas de balanceo memoria/runtime

Por eso estos sistemas deberían entenderse juntos, no independientemente.

---

## Flujos General / Pre-Workspace

La plataforma aún necesita soportar usuarios antes de que el anclaje completo de workspace esté establecido.

### Implicación de diseño actual
Chat pre-workspace o ligeramente scoped es intencionalmente simplificado y más honesto.

### Ejemplo
El movimiento hacia un modo **General** pre-workspace único refleja esto.

### Por qué
Evita pretender que la plataforma ya tiene el rico contexto workspace/profile necesario para justificar diferenciación conductual backend más profunda.

---

## Implicaciones de Onboarding

Un flujo de onboarding significativo no solo debería crear una cuenta de usuario.
Debería ayudar a instanciar la estructura de runtime real de la plataforma.

### En términos prácticos, onboarding debería moverse hacia crear
- un operating profile personalizado
- un workspace inicial
- una conversation/path inicial hacia ese workspace

### Por qué importa
Esto hace del onboarding parte de la arquitectura, no solo setup de cuenta.

---

## Implicaciones de Costo y Estrategia de Producto

Este modelo también soporta una idea importante de estrategia de producto:

### En lugar de
un modo "mejor" costoso por defecto para todos,

### la plataforma puede apuntar a
economía y comportamiento de runtime profile-shaped.

Eso permite al producto perseguir:
- alineación más fuerte entre necesidades de usuario y comportamiento de sistema
- mejor disciplina de costo
- diferenciación más significativa en un precio más bajo

Esta es una ventaja de producto seria si se implementa honestamente.

---

## Modos de Fallo Comunes

## 1. Workspace Como Caparazón Cosmético
Un workspace existe en la UI pero no influye realmente en comportamiento runtime/contexto.

## 2. Operating Profile Como Etiqueta Vacía
Un profile existe en DB/UI pero no moldea comportamiento backend real.

## 3. Re-Centralización de Conversación
El sistema sigue cayendo en tratar conversaciones como el objeto primario real, socavando el modelo workspace.

## 4. Promesas UI Por Delante De Realidad Backend
El frontend expone controles de profile/modo que el backend no puede aún honrar fielmente.

## 5. Onboarding Sin Estructura De Runtime
Usuarios aparecen "set up" pero no tienen realmente el estado workspace/profile necesario para la arquitectura intencionada.

---

## Enmarcado Honesto De Producto

El modelo workspace/operating-profile debería describirse llanamente.

### Buen enmarcado
- workspaces organizan contexto activo y futuro alcance de memoria
- operating profiles ayudan a moldear comportamiento backend
- conversaciones viven dentro de esa estructura
- comportamiento runtime se resuelve cada vez más desde este modelo server-side

### Mal enmarcado
- "la IA automáticamente se convierte en lo que quieres en todas partes instantáneamente"
- "profiles garantizan selección perfecta de modo de inteligencia"
- "workspace significa carpeta, pero también todo lo demás de alguna manera"

La precisión construye confianza.

---

## Dirección Futura

Este modelo se vuelve más valioso a medida que el resto de la plataforma madura:
- routing de runtime server-side
- pipelines de prepared context
- comportamiento memory-native
- augmentación graph/retrieval
- persistencia y comportamiento de conocimiento workspace-scoped

Cuanto más esos sistemas se vuelven reales, más importante se vuelve la abstracción workspace/operating-profile.

---

## Resumen

La idea clave es esta:

**Workspace define donde vive el trabajo. Operating profile ayuda a definir cómo el sistema debería comportarse allí. Conversation es el hilo activo dentro de esa estructura.**

Esa es una de las ideas arquitectónicas centrales en la evolución de Genie AI más allá de un producto chatbot genérico.

---

## Documentos Relacionados

Este documento debería leerse junto con:
- `docs/architecture/system-architecture.md`
- `docs/architecture/runtime-mode-routing.md`
- `docs/architecture/memory-and-context-architecture.md`
- futuros docs de onboarding, API, y ADR