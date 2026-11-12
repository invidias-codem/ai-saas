# Límites de Confianza (Trust Boundaries)

## Propósito

Este documento explica los límites de confianza (trust boundaries) mayores en Genie AI / `ai-saas`.

Existe porque la plataforma no es una aplicación de una sola superficie. Incluye:
- rutas públicas de landing e informativas
- rutas de producto autenticadas
- rutas API
- jobs de cron/automatización
- integraciones y webhooks
- superficies de desarrollo local y operacionales

Cuando esas superficies no están claramente separadas, el sistema se vuelve más difícil de asegurar, más difícil de razonar, y más fácil de romper accidentalmente.

Este documento describe el modelo de confianza actual a un nivel arquitectónico práctico.

---

## Principio Fundamental

No todas las superficies de la aplicación deberían ser confiadas igualmente.

Una arquitectura saludable distingue entre:
- quién está permitido acceder a una superficie
- qué se le permite hacer a esa superficie
- qué suposiciones el backend está permitido hacer sobre el caller

Los límites de confianza no son solo sobre autenticación. También son sobre:
- derechos de ejecución
- exposición de datos
- autoridad operacional
- privilegios de integración
- suposiciones sistema-a-sistema

---

## Zonas de Confianza Primarias

Genie AI debería entenderse como operando a través de varias zonas de confianza mayores.

## 1. Zona de Visitante Público

### Quién incluye esto
- visitantes web no autenticados
- lectores públicos de superficies estilo landing/support/blog/docs/privacy

### Qué debería acceder esta zona
- páginas públicas de marketing
- documentación pública
- contenido público de soporte y política
- flujos de entrada explícitamente públicos como sign-in/sign-up

### Qué esta zona NO debería acceder
- datos de usuario autenticado
- rutas de producto protegidas
- comportamiento privado de API
- superficies de mutación que asumen identidad de usuario

### Riesgo clave
Una página que parece pública aún puede ser bloqueada o mal ruteada si el route gating no está configurado correctamente.

---

## 2. Zona de Usuario Autenticado

### Quién incluye esto
- usuarios finales signed-in usando el producto intencionalmente a través de rutas de producto soportadas

### Qué debería acceder esta zona
- superficies de workspace y conversación
- settings de usuario
- APIs autenticadas
- features de producto scoped a su identidad y permisos

### Qué esta zona NO debería acceder automáticamente
- comportamiento admin interno sin restricciones
- privilegios de automatización solo backend
- estado de otros usuarios por defecto
- secretos de integración o herramientas de sistema privilegiadas

### Nota clave
La autenticación es necesaria pero no suficiente. El sistema debería seguir respetando límites a nivel de feature y datos dentro del uso autenticado.

---

## 3. Zona de Aplicación Backend

### Quién incluye esto
- route handlers del lado servidor
- lógica de producto interna
- paths de ejecución backend de confianza

### Qué puede hacer esta zona
- resolver comportamiento de runtime
- acceder a configuración de confianza
- llamar proveedores usando credenciales server-side
- escribir estado protegido cuando sea apropiado
- mediar entre requests de UI y sistemas de persistencia/integración

### Por qué importa
La capa de aplicación backend es un límite de confianza porque tiene más autoridad que un cliente público. No debería simplemente reflejar requests del cliente ciegamente.

---

## 4. Zona de Automatización / Cron

### Quién incluye esto
- scheduled jobs
- flujos de automatización en background
- task runners golpeando rutas API internas

### Qué puede hacer esta zona
- ejecutar workflows de mantenimiento/actualización
- realizar comportamiento de integración programado
- acceder a rutas de automatización privilegiadas donde explícitamente intencionado

### Por qué importa
Rutas de automatización son a menudo públicas en términos de transporte (deben ser alcanzables), pero no son "públicas" en el sentido normal de confianza de usuario.

Requieren:
- scope estrecho
- verificación fuerte
- intent operacional claro

### Riesgo clave
Una ruta siendo externamente alcanzable por razones de cron/webhook no significa que deba comportarse como un endpoint público ordinario.

---

## 5. Zona de Integración / Webhook

### Quién incluye esto
- callbacks de Slack
- webhooks de Telegram
- proveedores externos o callbacks de plataforma
- otras fuentes de eventos third-party

### Por qué esta zona debería ser confiada
- solo el comportamiento específico validado para esa integración

### Qué NO debería ser confiado por defecto
- acciones arbitrarias de producto
- mutación de estado interno sin restricciones
- equivalencia amplia de usuario autenticado

### Por qué importa
Callbacks externos pueden ser legítimos pero aún no confiados hasta validados a través de:
- signing secrets
- verification tokens
- checks route-specific
- validación de payload

---

## 6. Zona de Datos / Persistencia

### Quién incluye esto
- estado de producto respaldado por base de datos
- sistemas de persistencia estructurados
- comportamiento de aplicación respaldado por schema

### Función de límite de confianza
La capa de persistencia debería distinguir entre:
- datos legibles públicamente
- datos de usuario autenticado
- estado de sistema interno
- paths de mutación solo-automatización o solo-admin

### Por qué importa
Una fila de base de datos existiendo no implica que cada superficie de app debería ser permitida leerla o mutarla.

Esto es especialmente importante cuando la arquitectura de producto evoluciona más rápido que la claridad de política.

---

## 7. Modelo de Scoping: Usuarios, Workspaces, Documentos, y Retrieval

Muchas fallas que parecen "AI bugs" son en realidad bugs de scoping o límites de confianza.

Las capas de scoping más importantes son:

### Límite de Usuario
Un workspace faltante no significa scope faltante.
Documentos personales y conversaciones personales aún pertenecen a un límite de usuario y nunca deben tratarse como globalmente unscoped.

### Límite de Workspace
Cuando un workspace existe, es el scope colaborativo/de proyecto primario para:
- documentos
- conversaciones
- retrieval
- ensamblaje de memoria/contexto

Un documento adjunto a Workspace A no debería influir silenciosamente en Workspace B.

### Límite de Documento
Los documentos son objetos scoped de primera clase, no solo adjuntos de chat transitorios.
Un documento puede ser:
- personal
- workspace-scoped
- warm
- compressing
- cold

Chat debería referenciar identidad de documento o chunks recuperados, no transportar repetidamente cuerpos de documento crudos.

### Límite de Retrieval
Requests de retrieval deberían usar el scope relevante más estrecho disponible.
Anclas de scope preferidas son:
1. IDs de documento explícitos
2. workspace ID cuando presente
3. ownership de usuario cuando workspace está ausente

Dos modos de fallo importan aquí:
- **over-scoping**: contexto válido es saltado porque un campo de scope está ausente
- **under-scoping**: documentos no relacionados filtran en resultados porque el scope es demasiado amplio

### Límite de Preview
Preview es un path directo de read/hydration de documento, no lo mismo que retrieval.
Preview debería validar:
- auth
- identidad de documento
- derechos de acceso usuario/workspace

Una ruta de preview no debería requerir un workspace si el documento es legítimamente personal.

### Límite Runtime/Provider
Diferencias de infraestructura o proveedor no deben cambiar silenciosamente el significado de scope de usuario/workspace/documento.
Ya sea que Lattice corra con diferentes modelos, storage, o backends de retrieval, las semánticas de scoping deberían mantenerse estables.

---

## 8. Zona de Desarrollo Local / Operador

### Quién incluye esto
- desarrolladores con acceso a repo local
- scripts y tooling local
- superficies de operador/debug
- estado de ambiente machine-local

### Por qué importa
El acceso local es altamente privilegiado, pero también es uno de los lugares más fáciles para confusión de verdad y fuga accidental.

### Riesgos en esta zona
- drift local confundido con source truth
- mishandling de secrets/config
- fixes solo-locales asumidos representando comportamiento de producción
- suposiciones de build o schema inferidas desde un estado de máquina unhealthy

Esta es una zona de confianza porque acciones de operador a menudo exceden dramáticamente permisos normales de aplicación.

---

## 9. Zona Terminal / Raw SSE + Local Sandbox

### Quién incluye esto
- clientes CLI y shell loops locales
- automatización machine-local llamando `/api/cli/stream` y `/api/memory/cli`
- comportamiento de approval-matrix local en `~/.lattice/settings`

### Por qué importa
Esta zona es técnicamente remote-backed pero la autoridad está dividida entre:
- la server stream API
- decisiones de confianza del cliente local
- ejecución user-gated en el shell loop

No es pública, y no es equivalente a uso normal de producto autenticado.

### Reglas en esta zona
- `/api/cli/stream` y `/api/memory/cli` requieren bearer-token auth cuando `LATTICE_CLI_TOKEN` está configurado
- modos de aprobación local afectan autoridad de ejecución, no server trust
- bearer tokens no deben tratarse como credenciales anónimas o públicas
- capas de proxy o transporte no deben exponer estas rutas como públicas por omisión

---

## Tipos de Límites

Los límites de confianza en este sistema aparecen en múltiples formas.

## A. Límite de Ruta
Si una ruta es pública, autenticada, o restringida.

## B. Límite de Datos
Si una superficie puede leer o mutar ciertas clases de estado.

## C. Límite de Ejecución
Si un caller puede trigger lógica de alta autoridad.

## D. Límite de Integración
Si un sistema externo está permitido invocar un callback estrecho o una superficie de acción más amplia.

## E. Límite Operacional
Si un actor local o backend está siendo tratado como superficie de desarrollo/operador en lugar de superficie de usuario normal.

---

## Público vs Protegido No Es Toda La Historia

Un error común es colapsar todo el thinking de seguridad en un binario:
- público
- autenticado

Eso no es suficiente para esta plataforma.

Por ejemplo:
- una ruta cron puede ser transport-pública pero operacionalmente privilegiada
- un usuario signed-in es autenticado pero no debería ganar automáticamente poder tipo-admin
- un endpoint webhook puede ser alcanzable pero solo válido para un comportamiento de integración estrecho

Los límites de confianza deben reflejar estas distinciones.

---

## Ejemplos de Disciplina de Límites en Práctica

## Ejemplo 1 — Ruta Pública de Docs
Una ruta de docs puede ser pública en intención de UI, pero a menos que el auth gate la trate como pública, usuarios no autenticados son rebotados.

### Lección
La intención de ruta pública debe coincidir con el route gating real.

---

## Ejemplo 2 — APIs de Producto Autenticadas
Un usuario signed-in puede usar APIs de producto, pero eso no significa que el servidor debería aceptar cada claim del cliente como autoritativa.

### Lección
El backend debe seguir resolviendo comportamiento real usando contexto de confianza.

---

## Ejemplo 3 — Rutas Cron o Webhook
Una ruta puede ser externamente callable mientras aún pertenece a un límite de automatización privilegiado.

### Lección
Alcanzabilidad no es lo mismo que confianza amplia.

---

## Ejemplo 4 — Presencia de Schema de Base de Datos
Una tabla existiendo en el repositorio o base de datos local no significa que el sistema de producción debería asumir que existe en todas partes o que cada caller debería ser permitido usarla.

### Lección
Schema truth y access policy son concerns separados.

---

## Fallas Comunes de Límites a Evitar

## 1. UI Intent Without Backend Enforcement
Una página parece pública pero sigue protegida por middleware.

## 2. Client Assertions Treated as Trusted Truth
El frontend claim un modo, estado, o decisión que el backend debería realmente resolver por sí mismo.

## 3. Overbroad Callback Trust
Una ruta de integración/webhook acepta más autoridad de la que su propósito estrecho requiere.

## 4. Authenticated Equals Admin Drift
Usuarios signed-in son tratados como si automáticamente deberían acceder a lógica interna o privilegiada.

## 5. Local Operator Confusion
Comportamiento de ambiente local es confundido con realidad de producción o arquitectura canónica.

---

## Checklist de Revisión de Límites

Al añadir una nueva ruta, feature, o integración, preguntar:

1. ¿En qué zona de confianza está el caller?
2. ¿Cuál es la autoridad mínima que esta superficie necesita?
3. ¿Qué estado es legible desde este path?
4. ¿Qué estado es escribible desde este path?
5. ¿Qué suposiciones está haciendo el backend sobre el caller?
6. ¿Es esta una ruta pública, ruta autenticada, ruta backend privilegiada, o ruta de integración estrecha?
7. Si la ruta es externamente alcanzable, ¿está aún estrechamente bounded en comportamiento?

---

## Relación con Otros Documentos

Este documento debería leerse junto con:
- `docs/security/public-routes.md`
- `docs/architecture/system-architecture.md`
- `docs/operations/truth-surfaces.md`
- futura documentación de referencia API y trust

La documentación de rutas públicas explica **visibilidad**.
Este documento de trust-boundary explica **autoridad**.

---

## Resumen

La idea de seguridad más importante para este codebase es esta:

**No trates todas las superficies alcanzables, usuarios autenticados, o callbacks externos como igualmente confiables.**

Genie AI es una plataforma multi-superficie, y su seguridad depende de mantener esas superficies legibles, estrechas, y apropiadamente bounded.