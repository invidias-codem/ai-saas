# Topología de Servicios Self-Hosted

## Propósito

Este documento define la topología de servicios recomendada para despliegues self-hosted de Lattice para negocios, comenzando con una baseline práctica de Docker Compose.

Es la contraparte de topología de servicios a los modos de despliegue y contrato de entorno/config.

---

## Resumen Ejecutivo

La primera historia real de despliegue self-hosted para Lattice debería basarse en:

## **una baseline pequeña y opinada de Docker Compose alineada al Modo A — Despliegue Interno Estándar**

Esa baseline debería soportar:
- runtime web/app
- base de datos
- integración de almacenamiento de objetos
- path de subida/preview/consulta de documentos
- cualquier worker de fondo esencial solo si el feature set actual verdaderamente lo requiere

Componentes más avanzados deberían ser expansiones opt-in, no requisitos de baseline.

---

## Topología Baseline Modo A

### Servicios requeridos

#### `app`
Runtime principal web/API de Lattice.

Responsabilidades:
- UI web pública y autenticada
- rutas API
- rutas de chat/consulta
- rutas de ingesta de documentos
- rutas de preview
- manejo de auth/sesión

#### `db`
Servicio de datos relacional primario.

Responsabilidades:
- estado de usuario/workspace
- registros de documentos
- metadata de chunks/embeddings
- tablas de memoria/estado
- registros de auditoría y operacionales

#### `storage`
Almacenamiento de objetos para archivos subidos.

Responsabilidades:
- almacenamiento de documentos crudos subidos
- recuperación de archivos para paths de extracción/preview/hidratación

El almacenamiento puede ser:
- un bucket cloud externo
- un object store privado
- o después un servicio local S3-compatible

### Servicio opcional de baseline

#### `worker`
Runtime de worker de fondo.

Incluir solo si los flujos core actuales verdaderamente lo requieren.

Posibles responsabilidades:
- jobs de indexado en background
- post-procesamiento de documentos
- consumo de cola
- tareas de mantenimiento

---

## Shapes de Baseline Recomendados

### Opción A — Baseline Lean
- `app`
- `db`
- integración de storage

Usar cuando:
- path de upload/consulta puede correr sincrónicamente lo suficiente para installs baseline
- separación de worker no es esencial para valor real

### Opción B — Baseline Pragmático
- `app`
- `db`
- `worker`
- integración de storage

Usar cuando:
- tareas de ingesta/indexado/background se benefician materialmente de aislamiento de worker

### Recomendación
Preferir la baseline más lean y veraz.
Solo requerir `worker` si la funcionalidad real del Modo A ya depende de él.

---

## Extensiones Modo B — Despliegue de Asistente para Clientes

El Modo B probablemente mantiene la misma topología de servicios core, pero las expectativas operacionales suben.

Necesidades adicionales probables:
- integración de observabilidad más fuerte
- separación de worker más limpia si flujos async customer-facing aumentan
- superficies de soporte admin/operador más explícitas

---

## Extensiones Modo C — Despliegue Avanzado Privado / Rico en Memoria

Servicios adicionales potenciales:
- `queue`
- `retrieval`
- `archive-worker`

Estas son expansiones opt-in explícitas y no deberían ser asumptions de baseline.

---

## Extensiones Modo D — Despliegue de Infraestructura / Plataforma

Posible descomposición de servicios:
- `app`
- `api`
- `worker`
- `queue`
- `retrieval`
- `archive-worker`
- `observability adapters`
- futuro servicio runtime/harness si se expone separadamente

Esta es una topología de madurez posterior, no el primer camino self-hosted soportado.

---

## Historia Operacional Baseline

Para instales de negocio Modo A, la topología de servicios debería soportar una historia simple:

1. iniciar servicios
2. correr migraciones
3. confirmar salud
4. log in
5. subir un documento
6. preview it
7. consultarlo en un workspace

Si la topología no puede soportar eso limpiamente, la baseline es demasiado compleja.

---

## Recomendación Final

La primera topología oficial self-hosted para Lattice debería ser:

## **Modo A / baseline Docker Compose centrado en `app + db`, con storage como integración requerida y worker solo agregado si el flujo real de producto lo requiere.**