# Modos de Despliegue

## Propósito

Este documento define los modos de despliegue oficiales que Lattice OS debe soportar para adopción empresarial.

Existe para hacer la planificación, empaquetado, operaciones y soporte self-hosted más concretos que una historia vaga de "despliegue en cualquier lugar".

---

## Resumen Ejecutivo

Lattice debería presentar un **conjunto pequeño de modos de despliegue oficiales** alineados a necesidades reales de compradores.

Modos oficiales recomendados:

1. **Modo A — Despliegue Interno Estándar**
2. **Modo B — Despliegue de Asistente para Clientes**
3. **Modo C — Despliegue Avanzado Privado / Rico en Memoria**
4. **Modo D — Despliegue de Infraestructura / Plataforma**

La primera historia real de self-hosted para negocios debería ser:

## **Modo A — Despliegue Interno Estándar**

Ese es el perfil de despliegue inicial más limpio y creíble para Lattice OS.

---

## Por Qué Importan los Modos de Despliegue

Sin modos de despliegue explícitos, los negocios enfrentan ambigüedad alrededor de:
- servicios requeridos
- servicios opcionales
- expectativas de workers
- límites de almacenamiento/recuperación
- comportamiento local/privado vs asistido por proveedor
- qué está realmente soportado vs teóricamente posible

Los modos de despliegue convierten el self-hosting de una teoría en un contrato operacional.

---

## Modo A — Despliegue Interno Estándar

### Para quién es
- equipos internos con muchos documentos
- consultoría/agencias
- equipos de producto/operaciones/investigación
- adoptantes tempranos de self-hosted empresarial

### Caso de uso principal
Razonamiento `workspace-scoped` interno sobre documentos subidos, contexto de proyecto en curso, y memoria persistente.

### Objetivo
Hacer Lattice fácil de instalar y útil para equipos internos sin requerir infraestructura avanzada.

### Componentes requeridos
- `web/app service`
- `database`
- `object storage`
- proveedor/configuración de autenticación
- cualquier worker de fondo esencial solo si el feature set actual verdaderamente lo requiere

### Componentes opcionales
- worker de archival/compresión avanzada
- sidecar de recuperación local/privada
- proveedor de observabilidad
- integraciones sociales/de agentes
- worker GPU

### Expectativas de features
Debería soportar:
- auth de usuario
- workspaces
- subida de documentos
- preview
- recuperación/consulta warm
- chat/razonamiento respaldado por documentos

No debería requerir:
- worker de archival en frío
- ingesta multimodal avanzada
- complejidad de tenencia/admin customer-facing

---

## Modo B — Despliegue de Asistente para Clientes

### Para quién es
- empresas SaaS
- constructores de asistentes de onboarding/soporte
- empresas incrustando Lattice en una capa de producto user-facing

### Caso de uso principal
Impulsar un asistente o copiloto `customer-facing` usando conocimiento, memoria y recuperación scoped.

### Objetivo
Permitir a equipos de producto correr Lattice dentro de su propio stack para flujos de trabajo customer-facing con límites de tenant y confianza claros.

### Expectativas operacionales adicionales
- observabilidad/tracing más fuerte
- aislamiento de tenant/cliente más claro
- UX de confianza public-facing más fuerte
- visibilidad admin/operador

### Por qué viene segundo
Este segmento tiene una barra de confiabilidad y confianza más alta que el Modo A.

---

## Modo C — Despliegue Avanzado Privado / Rico en Memoria

### Para quién es
- negocios sensibles a privacidad
- equipos con necesidades más pesadas de recuperación/memoria
- compradores interesados en indexing local/privado y control de lifecycle más profundo

### Caso de uso principal
Correr Lattice con privacidad más fuerte, comportamiento de documento/memoria más rico, y capas opcionales de archival avanzado o recuperación local.

### Objetivo
Ofrecer un perfil de despliegue más potente sin forzar a cada negocio a la complejidad completa por defecto.

### Componentes adicionales probables
- queue/broker si flujos archival/async habilitados
- topología de worker avanzada
- backend/sidecar de recuperación local opcional
- servicios de ingesta más ricos opcionales

### Por qué es un modo avanzado
Esto debería ser una expansión opt-in explícita, no la baseline por defecto.

---

## Modo D — Despliegue de Infraestructura / Plataforma

### Para quién es
- startups AI-native
- equipos internos de plataforma AI
- compradores de infraestructura
- equipos de producto que quieren Lattice como sustrato más que solo como app

### Caso de uso principal
Usar Lattice como sustrato instalable de memoria/recuperación/ejecución dentro de una arquitectura de producto/plataforma más grande.

### Objetivo
Hacer Lattice viable como componente de plataforma modular para compradores técnicos.

### Expectativas operacionales
Esta es la barra de modo más alta.
Requiere:
- topología clara
- preflight checks
- guía de upgrades
- docs modulares
- confianza de instalación

### Por qué es después
Este es un modo de madurez, no el punto de partida baseline.

---

## Orden de Soporte Oficial Recomendado

### Soporte Fase 1
- **Modo A — Despliegue Interno Estándar**

### Soporte Fase 2
- **Modo B — Despliegue de Asistente para Clientes**

### Soporte Fase 3
- **Modo C — Despliegue Avanzado Privado / Rico en Memoria**
- **Modo D — Despliegue de Infraestructura / Plataforma**

Esto mantiene la matriz de soporte alineada con madurez del producto y expectativas de compradores.

---

## Recomendación Final

Soportar un conjunto pequeño de modos de despliegue oficiales, en secuencia.

La primera historia real de self-hosted para negocios debería permanecer:

## **Modo A — Despliegue Interno Estándar**