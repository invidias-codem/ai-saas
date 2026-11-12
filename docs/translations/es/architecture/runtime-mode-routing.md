# Enrutamiento del Modo de Runtime

## Propósito

Este documento explica cómo Genie AI determina el comportamiento de runtime para las solicitudes de conversación.

Existe porque la plataforma se está alejando de un modelo simplista de toggle de modo controlado por el cliente y moviéndose hacia un modelo de enrutamiento resuelto por el servidor más honesto, basado en el contexto de la aplicación.

El objetivo de este documento es clarificar:
- dónde se decide el modo de runtime
- qué contexto influye en esa decisión
- cómo difieren las conversaciones pre-workspace y workspace-backed
- cómo razonar sobre depuración y futura extensión

---

## Principio Fundamental

El modo de runtime debe ser resuelto por el servidor, no confiado directamente de la intención arbitraria del cliente.

En términos prácticos, esto significa que el sistema debería derivar cada vez más el comportamiento de runtime de:
- contexto de conversación
- contexto de workspace
- contexto de perfil operativo
- lógica de enrutamiento backend

en lugar de un control frontend que afirma establecer el modo final directamente.

---

## Por Qué Existe

El comportamiento anterior del producto podía crear un desajuste entre:
- lo que la UI afirmaba que era el modo
- lo que el backend realmente hacía
- lo que el usuario debería esperar razonablemente

Esto es especialmente problemático en un sistema que quiere soportar:
- comportamiento budget-aware (consciente del presupuesto)
- comportamiento workspace-aware
- comportamiento profile-aware
- futuros patrones de ejecución memory-native

Un modelo de enrutamiento resuelto por el servidor es más veraz y más extensible.

---

## Modelo de Enrutamiento de Runtime de Alto Nivel

A alto nivel, una solicitud de conversación fluye a través de estas etapas de enrutamiento:

1. la request entra en la capa API de chat
2. el servidor identifica el contexto de conversación
3. el servidor identifica si un workspace está involucrado
4. el servidor resuelve cualquier influencia de operating-profile
5. el modo de runtime se mapea del lado servidor
6. el comportamiento de modelo/proveedor se selecciona según corresponda
7. la response se retorna con visibilidad de debug opcional

Esto significa que el backend es la autoridad final sobre el modo de runtime efectivo.

---

## Fuentes de Contexto Clave

## 1. Contexto de Conversación

El servidor primero necesita entender a qué conversación pertenece la request.

### Por qué importa
El estado de conversación puede determinar:
- si una request es parte de un flujo de chat general
- si está adjunta a un flujo workspace-backed
- si reglas de enrutamiento históricas o contextuales deberían aplicar

---

## 2. Contexto de Workspace

El contexto de workspace es una entrada de enrutamiento arquitectónico mayor.

### Por qué importa
Una conversación workspace-backed puede llevar:
- contexto organizacional más fuerte
- diferentes expectativas de memoria
- comportamiento de runtime vinculado al perfil
- futuras diferencias de retrieval/contexto

Esta es una de las razones por las que la plataforma se aleja de un modelo universal de toggle de modo de chat.

---

## 3. Contexto de Perfil Operativo

Los perfiles operativos pretenden moldear el comportamiento de runtime más honestamente que un switch genérico de UI "rápido vs calidad".

### Por qué importa
Un perfil operativo puede expresar:
- profundidad/comportamiento esperado
- tradeoffs costo/latencia
- futuras estructuras de preferencia
- lógica de selección de modo alineada con el modelo usuario/workspace

Esto hace del enrutamiento de runtime un comportamiento de plataforma, no solo una preferencia de UI.

---

## Conversaciones Generales vs Workspace-Backed

## Comportamiento General / Pre-Workspace

Antes de que una conversación esté verdaderamente anclada en una estructura de workspace/perfil, la plataforma ha avanzado hacia un comportamiento por defecto simplificado y más honesto.

### Resultado práctico
El modo pre-workspace visible para el usuario es efectivamente:
- **General**

### Por qué
Esto evita pretender que el usuario está eligiendo un modo backend profundo cuando el contexto servidor para tal diferenciación puede no existir aún.

---

## Comportamiento Workspace-Backed

Una vez que una conversación está asociada con un workspace y potencialmente influenciada por un operating profile, el enrutamiento de runtime se vuelve más sensible al contexto.

### Resultado práctico
El modo efectivo puede derivarse de:
- estado del workspace
- señales de operating profile
- lógica de mapeo backend

Aquí es donde pertenece la arquitectura de runtime más avanzada.

---

## Resolución Del Lado Servidor

La dirección arquitectónica actual es que la ruta de chat debería resolver el modo de runtime en el servidor.

### Por qué es importante
Asegura que:
- el modo efectivo coincida con la lógica backend real
- la simplificación de UI no reduzca la flexibilidad del backend
- futuras reglas de enrutamiento puedan evolucionar sin mentir al usuario
- el debugging pueda enfocarse en una capa de enrutamiento autoritativa

---

## Relación con Controles de UI

## Modelo mental antiguo
Un usuario toca un switch de modo del lado cliente y el modo es simplemente lo que el cliente dice que es.

## Dirección actual
El cliente puede exponer estado UX limitado, pero el backend determina el comportamiento de runtime efectivo.

### Por qué importa
Esto previene una clase de UX engañosa donde:
- la UI sugiere un comportamiento
- el servidor silenciosamente hace otra cosa

Una superficie de cliente más pequeña y honesta es mejor que una superficie de control falso más grande.

---

## Ayudas de Depuración

El sistema ha usado debug headers para hacer el comportamiento de runtime más inspectable.

### Ejemplos conocidos
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

### Por qué ayudan
Permiten al equipo verificar:
- qué modo el servidor realmente resolvió
- qué path de modelo fue elegido
- si el enrutamiento de runtime se alinea con expectativas bajo diferentes estados de conversación/workspace

Estos headers son especialmente útiles cuando se depuran diferencias entre:
- flujos de conversación general
- flujos de conversación workspace-backed
- enrutamiento influenciado por perfil

---

## Intención Arquitectónica Actual

El enrutamiento de runtime debería reflejar cada vez más este principio:

> el sistema debería elegir comportamiento basado en contexto de aplicación en lugar de pedir al usuario que simule el enrutamiento backend manualmente.

Esto está más alineado con la dirección más amplia de la plataforma hacia:
- comportamiento workspace-centric
- lógica de runtime derivada de operating-profile
- ejecución memory/context-aware

---

## Modos de Fallo Comunes

## 1. Desajuste UI/Backend
El frontend presenta una etiqueta de modo que no coincide con el comportamiento real de enrutamiento backend.

## 2. Pérdida de Contexto
El backend falla al recuperar el contexto correcto de conversación/workspace/perfil, causando fallback a un modo menos específico del intencionado.

## 3. Opacidad de Depuración
El sistema resuelve un modo internamente pero da muy poca visibilidad para verificación.

## 4. Sobrecrecimiento de Controles de Cliente
El frontend acumula demasiados toggles de modo antes de que el modelo de contexto backend sea lo suficientemente maduro para justificarlos.

---

## Por Qué "General" Importa

La introducción de un modo **General** más simple en flujos pre-workspace no es una regresión.
Es una mejora de veracidad.

### Qué evita
- falsa precisión en la UI
- exposición prematura de complejidad de enrutamiento backend
- promesas engañosas sobre control que el backend no honra verdaderamente aún

### Qué habilita
- arquitectura de runtime más limpia
- enrutamiento workspace/profile futuro más fuerte
- debugging más simple
- UX más confiable

---

## Dirección Futura

Este modelo de enrutamiento se vuelve más poderoso a medida que otros sistemas maduran, especialmente:
- diseño de operating profile
- preparación memory/context
- flujos de aplicación workspace-first
- composición de retrieval y capa de contexto

Con el tiempo, el enrutamiento de modo de runtime puede convertirse en una capa de policy más rica en lugar de un simple switch de modo.

---

## Documentos Relacionados Recomendados

Este documento debería leerse junto con:
- `docs/architecture/system-architecture.md`
- `docs/security/public-routes.md`
- futuro `docs/architecture/memory-and-context-architecture.md`
- futuros docs de referencia API/runtime

---

## Resumen

La idea más importante es simple:

**Genie AI debería resolver el comportamiento de runtime desde el contexto en el servidor, no pretender que solo el cliente controla el modo final.**

Esa es la columna vertebral de una arquitectura de plataforma AI más honesta y más extensible.