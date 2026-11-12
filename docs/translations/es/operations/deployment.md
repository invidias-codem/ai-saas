# Despliegue

## Propósito

Este documento explica el modelo de despliegue para Genie AI / `ai-saas` a un nivel operacional práctico.

Está destinado a ayudar a desarrolladores y operadores a entender:
- qué superficies de despliegue existen
- cómo el código se mueve del estado del repositorio al runtime en vivo
- qué señales son confiables durante el despliegue
- dónde el despliegue puede parecer exitoso o fallido de manera engañosa

Este documento debería leerse junto con:
- `docs/operations/truth-surfaces.md`
- `docs/security/public-routes.md`
- `docs/reference/environment-variables.md`

---

## Principio Fundamental

El despliegue no es un solo evento. Es una cadena de estados relacionados pero distintos:

1. estado de código
2. estado de build
3. estado de automatización de despliegue
4. estado de runtime de plataforma
5. comportamiento de aplicación en vivo

Un proceso de despliegue confiable trata esos estados explícitamente en lugar de colapsarlos en una pregunta vaga de "¿se desplegó?".

---

## Superficies de Despliegue Primarias

La base de código actualmente involucra más de una superficie relacionada con el despliegue.

## 1. Estado del Repositorio GitHub

### Rol
- verdad de código-fuente
- fuente de disparo para CI y workflows de despliegue

### Preguntas que responde
- qué commit está en `main`
- qué código se empujó realmente
- qué rama o merge introdujo un cambio

### Nota importante
Un push exitoso no es prueba de build exitoso ni comportamiento en vivo exitoso.

---

## 2. GitHub Actions / Workflows CI

### Rol
- validación de build en cloud
- ejecución de workflows de despliegue
- workflows operacionales cron/programados
- checks de CodeQL / validación

### Usos típicos en este repo
- validación de despliegue de producción
- workflow de despliegue Firebase hosting
- flujo de despliegue relacionado con Vercel
- trabajos programados como workflows agent/cron

### Nota importante
El éxito de CI/workflow responde algunas preguntas, pero no todas.

Por ejemplo:
- el éxito del build no prueba automáticamente la corrección del runtime
- el fallo de acción de despliegue no siempre prueba que el runtime en vivo está roto

---

## 3. Superficie de Runtime Vercel

### Rol
- hosting/superficie de runtime principal de la aplicación
- probable runtime de aplicación de producción user-facing para rutas web mayores

### Preguntas que responde
- ¿la app desplegada realmente está sirviendo requests?
- ¿las rutas públicas/autenticadas se comportan correctamente?
- ¿el artifact de runtime se comporta como se espera?

### Nota importante
Los logs de acción Vercel y el comportamiento de runtime Vercel en vivo son superficies de verdad relacionadas pero no idénticas.

---

## 4. Superficie de Hosting Firebase

### Rol
- superficie adicional de hosting/despliegue presente en workflows del repo

### Preguntas que responde
- ¿completó el camino de despliegue Firebase-hosted?
- ¿el artifact Firebase-facing está actualizado donde aplique?

### Nota importante
Esto debería tratarse como una superficie de despliegue/salida distinta en lugar de asumirse intercambiable con la verdad de runtime Vercel.

---

## Flujo Práctico de Despliegue

A alto nivel, un camino de despliegue típico se ve como:

1. el código se commitea localmente
2. el código se empuja a GitHub
3. workflows GitHub Actions se disparan
4. jobs de build/despliegue corren
5. superficies de hosting se actualizan según corresponda
6. comportamiento de runtime en vivo se verifica directamente

### Punto importante
El paso 6 es obligatorio para fixes de bugs user-visible.
Un resultado de workflow solo no es suficiente.

---

## Flujo de Verificación de Despliegue Recomendado

Al enviar un cambio, usar este orden de verificación:

## 1. Confirmar estado de código
Chequear:
- commit intencionado existe en la rama intencionada
- el cambio fue realmente empujado

## 2. Confirmar estado de workflow/build
Chequear:
- jobs de build corrieron
- jobs de despliegue corrieron
- no hay bloques obvios de fallo de workflow en generación de artifact

## 3. Confirmar comportamiento de ruta/runtime en vivo
Chequear:
- rutas relevantes cargan correctamente
- comportamiento auth/público es correcto
- el bug user-visible real está resuelto

## 4. Confirmar comportamiento de integración/esquema si es relevante
Si el cambio depende de:
- esquema DB
- comportamiento cron
- flujo de callback de integración

entonces verificar esas superficies de verdad también.

---

## Realidades de Despliegue Conocidas en Este Repo

Esta base de código ya ha mostrado varias realidades de despliegue importantes.

## A. La verdad de build local puede ser poco confiable
Los builds de producción locales han sido una superficie de verdad poco fiable bajo condiciones de máquina limitadas.

### Implicación
La validación de build en CI cloud a menudo lleva más peso para viabilidad de producción.

---

## B. Los logs de workflow pueden ser ruidosos o con pérdidas
Un workflow de despliegue puede reportar fallo mientras el runtime en vivo no está realmente roto, o viceversa.

### Implicación
Tratar logs de workflow como una señal importante, no la autoridad final en salud de runtime.

---

## C. Éxito de merge no es éxito de runtime
Un merge a `main` aún puede dejar:
- fallos de despliegue
- regresiones de runtime
- aplicación de esquema faltante
- mismatches de rutas públicas/protegidas

### Implicación
La verificación en vivo post-merge es parte del despliegue, no limpieza opcional.

---

## D. Migraciones de repo no son prueba de esquema en vivo
Un despliegue de código puede tener éxito mientras la base de datos en vivo aún falta cambios de esquema requeridos.

### Implicación
La verdad de esquema debe verificarse por separado para features que dependen de cambios DB.

---

## Verificación de Despliegue Específica por Ruta

Diferentes cambios necesitan diferentes checks finales de verificación.

## Cambios de Rutas Públicas
Verificar:
- página renderiza para usuarios logged-out
- versiones locale-prefixed se comportan correctamente
- ruta no rebota a sign-in inadvertidamente

## Cambios de Producto Autenticado
Verificar:
- estado logged-in funciona correctamente
- datos a nivel de ruta cargan
- navegación de usuario aún se comporta como se espera

## Cambios de Comportamiento API
Verificar:
- comportamiento real de respuesta de ruta
- alineación de contrato request/response
- cualquier header de debug o indicador backend relevante

## Cambios Cron/Automatización
Verificar:
- jobs realmente completan
- logs operacionales en el tiempo permanecen saludables

## Cambios Terminal / Raw SSE
Verificar:
- stream permanece line-framed después de saltos proxy/CDN
- transferencia chunked se preserva
- cliente recupera limpiamente de timeout o conexión caída
- `/api/cli/stream` no bufferiza o termina prematuramente conexiones idle

---

## Sensibilidad al Entorno

El comportamiento de despliegue puede depender fuertemente de configuración de entorno.

### Áreas a vigilar
- configuración de auth
- secrets/tokens de proveedores
- credenciales Supabase
- secrets de webhook
- secrets de cron
- config de runtime específico de proveedor

### Nota importante
Un build puede tener éxito incluso cuando secrets/config de runtime están mal o incompletos.

Por eso la verificación de despliegue debe incluir comportamiento de runtime, no solo estado de build.

---

## Modos Comunes de Fallo de Despliegue

## 1. Build tiene éxito, runtime sigue mal
Causas ejemplo:
- mismatch de route gating
- configuración de runtime faltante
- drift de esquema
- bug de lógica no atrapado por build

## 2. Workflow falla, runtime aún parece saludable
Causas ejemplo:
- acción de despliegue ruidosa
- fallo de camino de despliegue secundario mientras runtime primario aún sirve
- mismatch de logging/reporting

## 3. Código mergeado, esquema no aplicado
Causas ejemplo:
- migraciones existen en git pero no aplicadas a DB activa
- cache de esquema no actualizado

## 4. Bug de ruta pública sobrevive al deploy
Causas ejemplo:
- UI cambiada sin actualización de allowlist proxy/middleware
- variantes de ruta locale no testeadas

## 5. Validación local bloquea confianza incorrectamente
Causas ejemplo:
- constraints de recursos de máquina
- inestabilidad de build local
- ambiente local unhealthy tratado como verdad de producción

---

## Hábitos Operacionales Recomendados

## Para cambios pequeños de UI/contenido
- empujar commit intencionado
- verificar workflow se dispara
- verificar la ruta exacta en vivo visual/comportamentalmente

## Para cambios de runtime/API
- verificar estado de build
- verificar comportamiento de API en vivo
- inspeccionar indicadores de debug donde estén disponibles

## Para cambios respaldados por esquema
- verificar código
- verificar aplicación de migración
- verificar comportamiento de ruta/API en vivo que depende de esquema

## Para cambios de rutas públicas
- testear mientras logged out
- testear formas locale-prefixed
- testear entrada a través de la página pública real que linka a la ruta

---

## Despliegue y Documentación

Cambios sensitivos a despliegue deberían idealmente actualizar documentación cuando alteran:
- visibilidad de ruta
- expectativas de auth
- superficies de integración
- requisitos de variables de entorno
- expectativas de verificación operacional

Esto ayuda a mantener docs del repo alineados con realidad de producción.

---

## Resumen

La lección clave de despliegue para este repo es:

**Un despliegue exitoso no es solo un workflow verde. Es una cadena verificada desde código empujado a comportamiento en vivo correcto.**

Esa cadena debería verificarse explícitamente, especialmente en una plataforma con:
- múltiples clases de ruta
- múltiples superficies de despliegue
- límites de auth de runtime
- arquitectura respaldada por esquema en evolución