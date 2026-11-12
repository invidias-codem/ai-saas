# Estrategia de Recuperación y Grafo

## Propósito

Este documento explica la dirección arquitectónica orientada a recuperación y grafo en Genie AI.

Existe porque la dirección de contexto y memoria de la plataforma no se describe bien con una etiqueta simple de "usamos RAG".

La meta arquitectónica más amplia es más específica:
- contexto preparado en lugar de relleno de transcripción cruda
- recuperación como capa de soporte estructurada
- futura composición graph-aware en lugar de solo pensamiento flat nearest-neighbor

Este documento describe esa dirección a alto nivel.

---

## Principio Fundamental

La recuperación debería soportar el ensamblaje de contexto, no reemplazar la arquitectura.

En otras palabras:
- la recuperación no es todo el sistema de memoria
- los embeddings no son toda la capa de inteligencia
- la estructura de grafo no es valiosa a menos que mejore relevancia, límites, o explicabilidad

El punto es mejorar cómo se selecciona y compone el contexto.

---

## Por Qué "Solo Usa RAG" No Es Suficiente

La frase "RAG" a menudo es demasiado vaga para ser útil arquitectónicamente.

Puede significar cosas muy diferentes en la práctica:
- rellenar prompts con chunks recuperados
- búsqueda semántica sobre documentos
- flujos de recuperación aumentados con herramientas
- pipelines de recuperación híbridos
- sistemas de memoria con estructura débil

Para Genie AI, la pregunta más importante es:

**¿qué papel debería jugar la recuperación dentro de una arquitectura workspace-centric, context-prepared?**

---

## Recuperación Como Capa de Soporte

La dirección intencionada es que la recuperación debería ayudar a responder preguntas como:
- ¿qué material de apoyo es relevante ahora?
- ¿qué información vinculada al workspace debería influir en esta ejecución?
- ¿qué contexto debería elevarse sin inflar el prompt?

Esto hace de la recuperación un mecanismo de selección de contexto, no un fin en sí mismo.

---

## Relación con Contexto Preparado

El contexto preparado es el patrón arquitectónico central.

La recuperación y sistemas graph-aware deberían conectarse a ese patrón contribuyendo con:
- material de apoyo relevante
- contexto de relación estructurado
- cues de memoria acotados

No deberían simplemente volcar grandes cantidades de texto semánticamente relacionado en el modelo y llamar a eso arquitectura.

---

## Recuperación Scoped Por Workspace

Un producto workspace-first necesita recuperación que respete el alcance.

### Por qué importa
Sin límites de workspace, la recuperación puede volverse:
- demasiado amplia
- demasiado ruidosa
- demasiado leaky
- demasiado difícil de confiar

### Dirección intencionada
La recuperación debería poder operar cada vez más dentro de un alcance significativo, tales como:
- límites de workspace
- límites de proyecto
- límites de contexto específicos de usuario

Eso está mucho más alineado con el producto que un lookup semántico global genérico.

---

## Dirección de Grafo

El codebase y la planificación circundante han apuntado hacia pensamiento graph-first o graph-augmented.

### Qué sugiere
En lugar de tratar toda la información de apoyo como chunks aislados, la plataforma eventualmente puede representar y usar:
- relaciones entre conceptos
- entidades o artefactos relacionados
- enlaces de soporte estructurados
- composición de relevancia graph-aware

### Por qué es atractivo
Una dirección graph-aware puede mejorar:
- precisión de relevancia
- contexto composicional
- trazabilidad de material relacionado
- futura organización de memoria

---

## Grafo Como Estructura, No Hype

La dirección de grafo debería documentarse cuidadosamente.

### Buen enmarcado
- una forma de representar relaciones entre objetos e ideas relevantes
- una estructura de soporte para composición de retrieval/contexto
- un posible camino a mejor organización de memoria

### Mal enmarcado
- "el grafo soluciona la inteligencia"
- "grafo significa que ya no necesitamos disciplina de selección de contexto"
- "retrieval de grafo es automáticamente superior en todos los casos"

El grafo solo importa si hace el sistema más útil y más entendible.

---

## Dirección de Recuperación Híbrida

Una versión madura de esta arquitectura eventualmente puede combinar múltiples superficies de retrieval/lógicas tales como:
- retrieval semántico
- selección scoped por workspace
- relatedness graph-aware
- inclusión de contexto basada en policy
- futuro weighting de retrieval profile-aware

Esta es una dirección más realista que pretender que un solo pase de búsqueda vectorial es la arquitectura final.

---

## Importancia de Límites

La estrategia de recuperación debe respetar la misma disciplina de límites que el resto de la plataforma.

### Límites importantes
- workspace vs alcance global
- material público vs privado
- contexto de conversación activa vs contexto recuperado duradero
- relevancia inmediata vs presencia archivada

Sin estos límites, la recuperación se vuelve más difícil de confiar y más fácil de malusar.

---

## Riesgos y Modos de Fallo

## 1. Spam de Chunks Planos (Flat Chunk Spam)
Demasiado texto recuperado entra al modelo sin suficiente disciplina de selección.

## 2. Control de Alcance Débil (Weak Scope Control)
Material relevante recuperado del workspace equivocado o límite de contexto equivocado.

## 3. Cercanía Semántica Sin Relevancia Práctica
El retriever retorna contenido técnicamente similar pero operativamente inútil.

## 4. Sobre-claim de Madurez de Grafo (Overclaiming Graph Maturity)
El sistema se describe como graph-native antes de que el path real de runtime graph-backed sea estable.

## 5. Arquitectura Por Buzzword
Lenguaje de retrieval, memory, y graph usado sin límites claros o roles reales de sistema.

---

## Dirección Futura

La dirección probable fuerte para Genie AI es:
- retrieval scoped por workspace
- ensamblaje de contexto preparado
- selección de contexto server-side más fuerte
- futura composición de soporte graph-aware
- memoria tratada como primitiva de producto estructurada

Esta es una dirección más precisa y creíble que el enmarcado genérico de "AI powered by RAG".

---

## Resumen

La idea clave es esta:

**La estrategia de recuperación y grafo debería existir para mejorar el ensamblaje de contexto estructurado dentro de un sistema workspace-centric, no para reemplazar arquitectura con buzzwords.**

---

## Documentos Relacionados

Este documento debería leerse junto con:
- `docs/architecture/memory-and-context-architecture.md`
- `docs/architecture/workspace-operating-profile-model.md`
- `docs/architecture/runtime-mode-routing.md`
- futuros docs de implementación de retrieval y referencia API