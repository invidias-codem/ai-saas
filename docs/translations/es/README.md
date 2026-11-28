# Documentación de Lattice OS

Esta documentación tiene como objetivo facilitar la comprensión del código y del comportamiento de la plataforma Lattice OS a desarrolladores, colaboradores, revisores y futuros responsables de mantenimiento.

La prioridad es la claridad, no el marketing.

## Principios de documentación

- explicar qué hace realmente el sistema
- distinguir el comportamiento estable de la arquitectura en evolución
- hacer visibles los límites de confianza
- documentar explícitamente las tecnologías utilizadas
- preferir descripciones concretas frente a expresiones vagas sobre IA

## Documentación principal

### Descripción general
- `overview/technology-transparency.md` — tecnologías utilizadas y componentes de la plataforma
- `overview/seo-strategy.md` — posicionamiento SEO coherente con la marca, orientación de metadatos y estructura de contenidos de Lattice OS

### Arquitectura
- `architecture/system-architecture.md` — estructura general del sistema, componentes principales y flujos de datos y control

## Documentación activa

### CLI e implementación (NUEVO)
- **lattice-cli v0.3.0** — CLI preparada para producción para administrar instalaciones Docker
  - Ubicación: `scripts/lattice-cli/`
  - Funciones: autenticación, implementación, activación de licencias V3, comprobaciones de estado, actualizaciones y copias de seguridad
  - Proceso de implementación: validación previa (Docker, Compose v2, RAM/CPU, puertos, disco y autenticación de Docker), más verificación de licencia durante la implementación
  - CI/CD: compilación automatizada de binarios mediante GitHub Actions
  - Distribución: script `install.sh` con detección de sistema operativo y arquitectura
  - Consulta: `scripts/lattice-cli/README.md` para la referencia completa de comandos

### Programa beta (NUEVO)
- **Materiales de invitación a la beta**: `docs/beta-outreach/`
  - Plantillas de mensajes directos de Threads (respetan el límite de 200 caracteres)
  - Secuencias de correo electrónico para participantes interesados
  - Estrategias de interacción según el perfil de usuario
  - Gestión de respuestas: "sí", "¿qué es?", "¿es gratis?", "ahora no"

- **Guías de incorporación a la beta**: `app/[locale]/(public)/beta/`
  - Inicio rápido (15 min) - `/beta/start`
  - Ruta de desarrollo (45 min) - `/beta/dev`
  - Ruta empresarial (1 hora) - `/beta/enterprise`
  - Ruta de privacidad (1 hora) - `/beta/privacy`
  - Generación de páginas estáticas para tiempos de carga rápidos

### Autenticación (ACTUALIZADO)
- **Experiencia de inicio de sesión inspirada en PS1/PS2**
  - Estilo personalizado de Clerk con tarjeta de efecto vidrio
  - Fondo animado con partículas sutiles
  - Estética retro-moderna (nostalgia de videojuegos de los 90)
  - Ubicación: `app/[locale]/(auth)/layout.tsx`

## Próximas capas previstas

### Arquitectura
- `architecture/runtime-mode-routing.md`
- `architecture/memory-and-context-architecture.md`
- `architecture/workspace-operating-profile-model.md`

### Seguridad
- `security/public-routes.md`
- `security/trust-boundaries.md`
- `security/licensing-cryptography.md` — diseño del sistema de licencias V3 ed25519

### Operaciones
- `operations/truth-surfaces.md`
- `operations/deployment.md` — procedimiento de implementación con Docker
- `operations/air-gap-deployment.md` — guía de funcionamiento totalmente sin conexión

### Referencia
- `reference/api-reference.md`
- `reference/environment-variables.md`
- `reference/cli-commands.md` — referencia completa de comandos de lattice-cli

### Decisiones
- `decisions/adr-001-*.md`

## Notas

Estos documentos deben evolucionar con el producto.
Cuando cambie el comportamiento, la documentación debe actualizarse como parte de la implementación y no considerarse una tarea posterior.

---

**Última actualización:** 2026-06-21
**Versión:** 0.3.0 (lattice-cli)
