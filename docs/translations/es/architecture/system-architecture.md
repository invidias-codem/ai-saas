# Arquitectura del Sistema

Lattice OS es una plataforma de IA centrada en el espacio de trabajo, consciente del perfil operativo y nativa en memoria. La implementación se organiza como un monorepo gestionado con pnpm que separa la lógica agnóstica de la plataforma de los adaptadores específicos de entrega.

## Distribución del Monorepo

| Paquete | Rol |
|---------|------|
| `apps/web` | Frontend Next.js 14+ (app router, auth Clerk, UI) |
| `packages/lattice-core` | Contratos validados con Zod, constantes, esquemas de licencia/preflight |
| `packages/lattice-mcp-local` | Adaptador MCP stdio local |
| `packages/lattice-mcp-remote` | Adaptador MCP HTTP remoto (autenticado con Clerk) |
| `packages/lattice-ai-skills` | Adaptador AI Skills: esquema SKILL.md, comandos slash, wrappers, manifiesto Custom GPT |

La app raíz de Next.js depende de los paquetes del workspace en versiones `workspace:*` y los construye durante el paso `prebuild`.

## Mapeo de Capas

| Capa Arquitectónica | Implementación |
|---------------------|----------------|
| Superficie web pública | `app/(landing)/*` y `app/(public)/beta/*` |
| Superficie autenticada | `app/(dashboard)/*` con middleware Clerk |
| Comportamiento API/servidor | Handlers de ruta `app/api/**/*` |
| Persistencia | Supabase + PostgreSQL (solo servidor) |
| Automatización/integración | Cron jobs, rutas webhook, adaptadores MCP |
| Terminal / SSE Raw | `/api/cli/stream`, `/api/memory/cli`, path shim CLI local |

## Build & Deploy

- Orden de build: `prebuild` ejecuta `pnpm --dir packages/lattice-{core,mcp-local,mcp-remote,ai-skills} run build` primero para que `dist/` exista antes del bundling de Next.js.
- Vercel: `.vercelignore` permite `packages/lattice-*` (solo `packages/ucol-node/` se excluye). La corrección del prebuild y el require dinámico con alcance NFT están en `package.json` y `next.config.mjs`.

---
...
Este documento proporciona una explicación de alto nivel de la arquitectura actual del sistema Lattice OS.

Está diseñado para responder:
- cuáles son las capas principales del sistema
- cómo se mueven las solicitudes a través del sistema
- dónde reside el estado
- cómo difieren las superficies públicas, autenticadas y de automatización backend
- qué temas arquitectónicos son centrales para la dirección del producto

Este documento es una visión general de la arquitectura principal, no una especificación completa de subsistemas.

---

## Vista de Alto Nivel

En líneas generales, Lattice OS consta de seis capas arquitectónicas principales:

1. **Superficie web pública**
2. **Superficie de aplicación autenticada**
3. **Capa de comportamiento API y servidor**
4. **Capa de datos / persistencia**
5. **Capa de automatización / integración**
6. **Capa Terminal / SSE Raw**

Estas capas están conectadas, pero sirven a diferentes audiencias y tienen diferentes límites de confianza.

---

## 1. Superficie Web Pública

### Qué incluye
- páginas de aterrizaje (landing)
- páginas informativas públicas
- páginas de blog/docs/soporte/privacidad
- otras superficies de marketing o informativas no autenticadas

### Responsabilidades
- explicar el producto
- apoyar el descubrimiento
- proporcionar puntos de entrada a documentación y soporte públicos
- enrutar usuarios hacia registro o superficies de producto cuando sea apropiado

### Notas arquitectónicas
- estas rutas deben permanecer accesibles públicamente
- no deben heredar accidentalmente suposiciones del dashboard autenticado
- los bugs de gating de rutas en esta capa crean problemas de confianza visibles para el usuario rápidamente

---

## 2. Superficie de Aplicación Autenticada

### Qué incluye
- dashboard
- conversaciones
- espacios de trabajo
- onboarding
- configuración
- otros flujos de aplicación específicos del usuario

### Responsabilidades
- mantener estado de producto específico del usuario
- impulsar flujos de trabajo de interacción con IA reales
- exponer comportamiento consciente del espacio de trabajo y del perfil
- proporcionar funcionalidad de producto en lugar de solo contenido de marketing/informativo

### Notas arquitectónicas
- esta capa depende de identidad autenticada
- depende cada vez más del contexto de espacio de trabajo y perfil operativo
- no debe tratarse como el mismo sistema que la superficie de landing con auth añadido encima

---

## 3. Capa de Comportamiento API y Servidor

### Qué incluye
- handlers de ruta bajo `app/api/...`
- lógica de selección de runtime del lado servidor
- lógica de orquestación de conversaciones
- callbacks de integración y endpoints cron

### Responsabilidades
- procesar chat y acciones de aplicación
- resolver comportamiento del lado servidor
- proporcionar interfaces estructuradas entre UI y lógica backend
- hacer cumplir límites de API protegidas/públicas
- apoyar flujos de trabajo programados y externos

### Dirección arquitectónica importante
Una dirección clave en el sistema es mover más verdad conductual a la capa de servidor, especialmente alrededor de:
- selección de modo de runtime
- comportamiento consciente del espacio de trabajo
- toma de decisiones consciente del perfil operativo

Esto reduce el estado del lado cliente engañoso y hace el comportamiento más inspectable.

---

## 4. Capa de Datos / Persistencia

### Qué incluye
- Datos estructurados respaldados por Supabase / PostgreSQL
- estado de aplicación relacional
- estado emergente relacionado con memoria/recuperación y persistencia de soporte

### Responsabilidades
- persistir datos de usuario/aplicación
- apoyar modelos de espacio de trabajo y perfil
- respaldar conversaciones y otras estructuras de producto
- apoyar flujos de trabajo de integración/programados que necesitan estado duradero

### Nota arquitectónica
La capa de persistencia no es solo un bucket de almacenamiento pasivo. Apoya cada vez más transiciones arquitectónicas en el producto, especialmente alrededor de:
- comportamiento workspace-first
- decisiones de runtime derivadas del perfil
- evolución del sistema memoria/contexto

---

## 5. Capa de Automatización / Integración

### Qué incluye
- rutas activadas por cron
- endpoints webhook
- callbacks de integración
- automatización social/de distribución
- flujos de mensajería/integración externos

### Responsabilidades
- coordinar tareas programadas
- manejar eventos de plataformas externas
- mantener flujos de trabajo no-UI
- conectar lógica de producto con sistemas externos

### Nota arquitectónica
Esta capa debe entenderse como parte del sistema de producción, no como "scripts extra". Puede afectar materialmente:
- comportamiento del producto
- salidas públicas
- riesgo operacional
- complejidad de depuración

---

## 6. Capa Terminal / SSE Raw

### Qué incluye
- `/api/cli/stream`
- `/api/memory/cli`
- shims CLI locales y consumidores nativos de terminal

### Responsabilidades
- emitir respuestas del asistente como SSE raw
- emitir deltas de ciclo de vida tipados para texto, uso de herramientas, completación y ejecución local
- preservar semántica de chunks enmarcados por línea a través de saltos proxy/CDN
- apoyar orquestación CLI, matrices de aprobación local y llamadas de memoria sin middleware de navegador

### Por qué importa
Esta capa es terminal-nativa por diseño. No puede depender de comportamiento de reintento del navegador, buffering de ServiceWorker, o wrappers fetch de framework. Depende de:
- semántica estable de transferencia por chunks
- taxonomía de eventos explícita
- reglas de timeout y recuperación del lado cliente
- políticas de proxy que no bufferizan ni reescriben frames SSE

---

## Temas Arquitectónicos Transversales

## A. Modelo Workspace-First

Un cambio importante en el codebase es hacer del **espacio de trabajo** el contenedor de runtime primario en lugar de tratar el chat como una superficie genérica independiente.

### Por qué importa
Los espacios de trabajo pretenden dar forma a:
- alcance de contexto
- comportamiento de memoria
- selección de runtime
- organización de usuario
- futura personalización y composición del sistema

---

## B. Comportamiento de Runtime Impulsado por Perfil Operativo

La dirección del sistema incluye mover la selección de comportamiento a un modelo donde los **perfiles operativos** influyen en las características de runtime.

### Por qué importa
Esto permite al sistema soportar:
- diferentes tradeoffs comportamiento/costo
- control de runtime más honesto
- futuro comportamiento de IA consciente del perfil

Este es uno de los diferenciadores arquitectónicos más importantes en el codebase.

---

## C. Contexto Preparado sobre Historial Crudo Ingenuo

El sistema se mueve hacia un modelo de contexto preparado en lugar de depender solo de historial de mensajes no estructurado rodante.

### Por qué importa
El contexto preparado habilita:
- estructura de prompt más clara
- mejores límites de memoria
- composición de recuperación/contexto más explícita
- aumento futuro de grafo/recuperación más seguro

---

## D. Disciplina de Límite Público / Protegido

Como el producto mezcla páginas públicas, páginas autenticadas, APIs y callbacks, la disciplina de límites importa mucho.

### Modo de fallo común
Una ruta UI pública puede enlazar a una superficie protegida inadvertidamente, produciendo una pared de sign-in o rebote de auth inesperado.

Por eso la visibilidad de rutas debe documentarse y revisarse cuidadosamente.

---

## Flujo de Solicitud (Alto Nivel)

## Flujo de Página Pública
1. usuario solicita página pública
2. middleware/proxy determina que la ruta es pública
3. se aplica manejo de locale
4. contenido público se renderiza sin requisito de auth

## Flujo de Producto Autenticado
1. usuario solicita ruta autenticada
2. middleware/proxy verifica auth
3. identidad de usuario se resuelve
4. shell de app localizado carga
5. datos específicos de página y comportamiento de runtime cargan basados en contexto usuario/aplicación

## Flujo Chat / Runtime (Simplificado)
1. frontend envía solicitud a capa API
2. servidor resuelve contexto conversación/workspace/perfil
3. contexto preparado se ensambla
4. comportamiento de modo runtime/modelo se selecciona del lado servidor
5. path modelo/proveedor ejecuta
6. respuesta se retorna con visibilidad de debug opcional según implementación

## Flujo Automatización / Cron
1. trigger programado o externo golpea ruta API
2. ruta ejecuta lógica de tarea del lado servidor
3. estado se lee/escribe a través de capa persistencia
4. efectos secundarios integración/públicos pueden producirse según el job

---

## Límites de Confianza

La arquitectura tiene varios límites de confianza importantes:

### Visitantes Públicos
- pueden acceder a superficies informativas públicas
- no deben poder mutar estado de producto protegido

### Usuarios Autenticados
- pueden acceder a superficies de producto apropiadas para su identidad y configuración

### Jobs Backend/Internos
- pueden ejecutar lógica privilegiada no disponible para clientes públicos

### Plataformas Externas
- pueden llamar endpoints designados de callback/webhook solo a través de superficies explícitamente permitidas

La confusión de límites de confianza es una de las formas más fáciles de que este tipo de sistema se vuelva frágil.

---

## Realidades Operacionales

El codebase ya ha surfaced algunas realidades operacionales importantes:
- la verdad del build en cloud puede ser más confiable que la verdad del build local
- los logs de acciones de deployment pueden ser ruidosos o con pérdidas
- los problemas de gating de rutas pueden producir bugs de producción rápidamente
- los cambios de arquitectura necesitan documentación junto a la implementación para mantenerse legibles

Estas realidades deben tratarse como parte de la arquitectura, no separadas de ella.

---

## Hacia Qué se Convierte Esta Arquitectura

Genie AI se está convirtiendo cada vez más en:

> una plataforma de IA centrada en el espacio de trabajo, consciente del perfil operativo y nativa en memoria con superficies de descubrimiento público, superficies de ejecución autenticada y capas de automatización/integración backend.

Esa descripción es más precisa que una etiqueta más simple de "app de chatbot".

---

## Próximos Documentos de Arquitectura Recomendados

Este documento backbone debe ser seguido por documentos de arquitectura más específicos para:
- routing de modo runtime
- arquitectura de memoria y contexto
- límites de rutas públicas
- superficies de verdad y verificación de deployment
- comportamiento de referencia API