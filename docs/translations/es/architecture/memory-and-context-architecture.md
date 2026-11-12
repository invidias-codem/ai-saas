# Arquitectura de Memoria y Contexto

## Propósito

Este documento explica cómo Genie AI está evolucionando su arquitectura de memoria y contexto.

Existe para hacer explícita una dirección de producto central:
Genie AI no pretende seguir siendo un wrapper de chat delgado alrededor de historial crudo rodante. Se está moviendo hacia una arquitectura de contexto preparado, consciente del workspace, más estructurada, con límites más fuertes entre estado de conversación, estado de workspace, contexto recuperado y futuros sistemas de memoria.

Este documento se enfoca en la intención arquitectónica, patrones actuales y dirección de diseño en lugar de afirmar que cada futuro subsistema ya está completamente realizado.

---

## Principio Fundamental

El contexto debe ser **preparado**, no meramente acumulado.

Eso significa que el sistema debería evitar cada vez más tratar "todo en el historial" como la única o mejor fuente de contexto del modelo.

En su lugar, el contexto debería ensamblarse desde múltiples capas tales como:
- estado de conversación inmediato
- contexto de workspace
- contexto de perfil operativo
- información de apoyo recuperada
- futuras capas de memoria

Esta arquitectura es más controlable, más extensible y más honesta sobre lo que el sistema está realmente usando.

---

## Por Qué Importa

Una arquitectura de chat ingenua tiende a degradarse en uno de dos patrones:

1. **relleno de transcripción cruda (raw transcript stuffing)**
   - demasiado historial irrelevante
   - relevancia poco clara
   - desperdicio de ventana de contexto
   - disciplina de prompt más débil

2. **comportamiento de recuperación opaco oculto (opaque hidden retrieval behavior)**
   - usuarios y desarrolladores no pueden decir qué información influyó en la respuesta
   - el debugging se vuelve difícil
   - la arquitectura se vuelve frágil y mágica

El contexto preparado pretende proporcionar un mejor camino intermedio.

---

## Capas Arquitectónicas del Contexto

A alto nivel, la arquitectura de contexto de Genie AI debería entenderse como múltiples capas cooperantes.

## 1. Contexto de Conversación Inmediato

Este es el estado de interacción a corto plazo directamente asociado con la conversación activa.

### Contenidos típicos
- turnos recientes usuario/asistente
- estado de prompt/interacción activo
- enmarcado de request inmediato

### Rol
Proporciona coherencia conversacional local.

### Limitación
El contexto de conversación inmediato por sí solo no es suficiente para un producto workspace-centric, memory-aware.

---

## 2. Contexto de Workspace

El contexto de workspace es una capa arquitectónica mayor porque el producto se mueve hacia comportamiento workspace-first.

### Contenidos típicos
- identidad del workspace
- alcance de conversación vinculado al workspace
- contexto organizacional persistente relevante
- futuros límites de memoria de workspace

### Rol
El contexto de workspace permite al sistema comportarse como si una conversación perteneciera a un contenedor significativo en lugar de un hilo aislado flotando libremente.

### Por qué importa
Esta es una de las diferencias centrales entre un chatbot genérico y un workspace de inteligencia más estructurado.

---

## 3. Contexto de Perfil Operativo

Los perfiles operativos pretenden moldear el comportamiento de runtime y, cada vez más, el comportamiento de contexto también.

### Influencia potencial
Un perfil operativo puede afectar:
- estilo de comportamiento del sistema
- profundidad esperada
- tradeoffs de runtime
- futuras políticas de selección de contexto

### Rol arquitectónico
Los perfiles operativos ayudan a vincular la arquitectura de contexto al modelo de plataforma más amplio en lugar de dejar memoria/contexto como un subsistema desconectado.

---

## 4. Contexto de Apoyo Recuperado

La dirección del sistema incluye recuperar información de apoyo en lugar de depender solo de transcripciones de conversación.

### Fuentes potenciales
- capas de memoria curadas
- futuro retrieval graph-aware
- materiales de workspace estructurados
- conocimiento ingerido externamente en contextos acotados

### Rol
El contexto recuperado debería proveer relevancia, no volumen indiscriminado.

### Nota importante
El contexto recuperado debe ser preparado y acotado cuidadosamente. La recuperación es útil solo cuando mejora la relevancia y trazabilidad en lugar de añadir ruido al prompt.

---

## 5. Futuras Capas de Memoria Duradera

La dirección de la arquitectura apunta claramente hacia conceptos de memoria más duraderos, pero deben describirse cuidadosamente.

### La memoria no debe tratarse como un solo blob
Un sistema de memoria futuro útil probablemente involucrará múltiples clases de memoria, tales como:
- contexto activo de horizonte corto
- contexto duradero vinculado al workspace
- superficies de recall estructurado
- futura memoria graph o retrieval-enhanced

### Por qué importa
Llamar a todo "memoria" sin distinciones hace el sistema más difícil de razonar y más fácil de representar mal.

---

## Contexto Preparado como Patrón Central

La idea de contexto preparado es uno de los patrones arquitectónicos más importantes en Genie AI.

### Qué significa
En lugar de pasar estado crudo tal cual, el sistema prepara un paquete de contexto para ejecución del modelo.

### Un contexto preparado puede incluir
- historial de conversación seleccionado
- secciones de prompt explícitas
- enmarcado derivado del workspace
- material de apoyo recuperado
- instrucciones de sistema organizadas por propósito

### Por qué es mejor
Habilita:
- construcción de prompt más limpia
- relevancia más intencional
- debugging más fácil
- control futuro de policy sobre qué entra en contexto del modelo
- dependencia reducida de hinchazón de transcripción

---

## Relación con la Dirección Memory-Native

La dirección del producto ha enfatizado cada vez más arquitectura memory-native.

Esto debería interpretarse cuidadosamente.

### No significa simplemente
- "guardamos mucho texto"
- "tenemos embeddings en algún lado"
- "el asistente recuerda todo mágicamente"

### Debería significar
- la memoria se trata como primitiva de producto
- el ensamblaje de contexto tiene arquitectura explícita
- workspace y comportamiento de runtime pueden extraer de más que un log de chat crudo
- el sistema está diseñado para recall estructurado y evolución futura

Esta es una interpretación más fuerte y más creíble.

---

## Dirección de Grafo y Recuperación

El codebase y la planificación circundante han apuntado hacia ideas de retrieval graph-first o graph-augmented.

### Por qué importa
Una dirección graph-aware sugiere que el sistema eventualmente pueda tratar relaciones entre conceptos, materiales y objetos de workspace como estructura de retrieval de primera clase en lugar de depender solo de lookup flat nearest-neighbor.

### Implicación arquitectónica
Si esta dirección madura, el ensamblaje de memoria/contexto podría involucrar cada vez más:
- selección de relevancia
- composición de contexto relationship-aware
- soporte estructurado en lugar de dumping de pasajes crudos

### Precaución
Esto debería documentarse como una dirección a menos y hasta que el path completo de producción sea implementado y estabilizado.

---

## Los Límites Importan

Una de las partes más importantes de un sistema serio de memoria/contexto es la disciplina de límites.

### Límites que importan
- contexto de conversación vs workspace
- historial visible al usuario vs contexto de apoyo oculto
- contexto temporal vs memoria duradera
- datos públicos vs estado interno protegido
- asistencia recuperada vs instrucciones del sistema

Sin estos límites, el sistema se vuelve más difícil de confiar y más difícil de depurar.

---

## Depurabilidad y Transparencia

Una arquitectura de memoria/contexto solo es útil si puede ser inspeccionada y razonada.

### Buenas propiedades arquitectónicas
- desarrolladores pueden explicar qué tipos de contexto se están ensamblando
- comportamiento de runtime puede depurarse cuando selección de retrieval/contexto se siente mal
- comportamiento del sistema no se enmarca como recall total místico

### Por qué importa
Usuarios y desarrolladores no deberían tener que adivinar si una respuesta vino de:
- turnos recientes
- enmarcado de workspace
- datos de apoyo recuperados
- memoria duradera oculta

Incluso si no cada detalle interno se expone en la UI, la arquitectura debe permanecer entendible internamente.

---

## Modos de Fallo Comunes

## 1. Hinchazón de Transcripción (Transcript Bloat)
Demasiado historial crudo entra al prompt sin selección útil.

## 2. Selección de Relevancia Débil
Material recuperado es técnicamente relacionado pero no realmente útil.

## 3. Confusión de Contexto Oculto
El sistema usa contexto de fondo que es difícil de explicar o trazar.

## 4. Colapso de Límites
Contexto de workspace, contexto de conversación, y memoria duradera son tratados intercambiablemente.

## 5. Sobre-claim de Memoria (Overclaiming Memory)
El producto presenta una impresión de comprensión persistente más fuerte que la que el sistema real soporta confiablemente.

---

## Enmarcado Honesto de Producto

Una arquitectura transparente de memoria/contexto debería evitar claims vagos como:
- "la IA recuerda todo"
- "la IA realmente entiende tu mundo"

Un enmarcado más honesto es:
- la plataforma prepara contexto desde múltiples capas relevantes
- workspaces y perfiles ayudan a delimitar comportamiento
- memoria y retrieval se están estructurando como parte de la arquitectura de producto
- contexto se ensambla intencionalmente en lugar de depender solo del crecimiento de transcripción cruda

Este estilo de explicación construye más confianza que lenguaje inflado.

---

## Relación con Enrutamiento de Modo Runtime

Arquitectura de memoria/contexto y enrutamiento de modo runtime están estrechamente relacionados.

### Por qué
Diferentes comportamientos de runtime pueden depender cada vez más de:
- cuánto contexto se ensambla
- qué capas se incluyen
- cómo lógica de workspace/perfil influye en selección

Por eso memoria/contexto no puede tratarse como separado del resto de la arquitectura del sistema.

---

## Dirección Futura

El camino de evolución probable para la arquitectura de contexto de Genie AI incluye:
- pipelines de prepared-context más fuertes
- comportamiento de memoria scoped por workspace más rico
- mejor control server-side sobre selección de contexto
- futura augmentación graph/retrieval
- transparencia y depurabilidad mejoradas

El objetivo no es complejidad oculta máxima.
El objetivo es **mejor relevancia, estructura más fuerte, y comportamiento de sistema más veraz**.

---

## Resumen

La idea clave es esta:

**Genie AI debería ensamblar contexto desde capas estructuradas en lugar de pretender que el historial de chat crudo solo es un sistema de memoria suficiente.**

Esa es la fundación de una arquitectura de plataforma memory-native más seria.

---

## Documentos Relacionados Recomendados

Este documento debería leerse junto con:
- `docs/architecture/system-architecture.md`
- `docs/architecture/runtime-mode-routing.md`
- futuros docs sobre retrieval, comportamiento API, y trust boundaries