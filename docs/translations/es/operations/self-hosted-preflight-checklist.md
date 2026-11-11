# Lista de comprobación previa y pruebas básicas para instalaciones autohospedadas

## Propósito

Definir las comprobaciones previas y las pruebas básicas de funcionamiento para instalaciones empresariales autohospedadas de Lattice.

Este documento responde a una pregunta práctica:

## «¿Cómo sabemos si una instalación nueva es realmente utilizable?»

Debe utilizarse para:
- instalaciones empresariales iniciales
- validación de despliegues
- validación de actualizaciones
- clasificación y diagnóstico de incidencias de soporte

---

## Dos niveles de validación

### Nivel 1 — Comprobaciones previas
Se verifican la configuración y la conectividad de los servicios antes del uso normal.

Ejemplos:
- existen las variables de entorno
- se puede acceder a la base de datos
- se puede acceder al almacenamiento
- la autenticación está configurada
- existen los secretos necesarios

### Nivel 2 — Prueba básica
Se comprueba que los flujos de trabajo reales funcionan.

Ejemplos:
- se puede iniciar sesión
- se puede crear o abrir un espacio de trabajo
- se puede subir un documento
- se puede previsualizar un documento
- se puede hacer una consulta basada en documentos

Ambos niveles son necesarios para confiar en una instalación empresarial.

---

## Lista de comprobaciones previas — Modo A básico

### Configuración principal de la aplicación
- [ ] `NEXT_PUBLIC_APP_URL` está configurada correctamente
- [ ] `NODE_ENV` tiene el valor adecuado
- [ ] están presentes los secretos necesarios de la aplicación
- [ ] están configurados los secretos internos de cron/rutas

### Autenticación
- [ ] existe la configuración del proveedor de autenticación
- [ ] las URL de retorno/redirección corresponden a la URL del despliegue
- [ ] funciona un inicio de sesión de prueba o está configurado correctamente

### Base de datos
- [ ] existe la URL/configuración de la base de datos principal
- [ ] existe la credencial de base de datos de servicio/administrador cuando se necesita
- [ ] la aplicación puede conectarse a la base de datos
- [ ] las migraciones se han aplicado correctamente

### Almacenamiento
- [ ] existe la configuración del bucket de almacenamiento
- [ ] la aplicación puede escribir en el almacenamiento
- [ ] la aplicación puede leer del almacenamiento
- [ ] funciona la subida firmada, si se utiliza

### Configuración de modelos/proveedores
- [ ] se ha configurado al menos un proveedor compatible de chat/razonamiento
- [ ] se ha configurado al menos un proveedor compatible de embeddings
- [ ] se entiende el comportamiento de selección y respaldo de proveedores

### Comprobación de funciones opcionales
- [ ] los subsistemas opcionales desactivados no son necesarios para la instalación básica
- [ ] la falta de configuración de integraciones opcionales no interrumpe los flujos principales del producto

---

## Lista de pruebas básicas — Modo A básico

### 1. Inicio de la aplicación
- [ ] la aplicación carga en la URL pública
- [ ] las rutas públicas se muestran correctamente
- [ ] la interfaz autenticada carga después de iniciar sesión

### 2. Autenticación
- [ ] un usuario puede iniciar sesión
- [ ] se establece una sesión
- [ ] se permite acceder a las áreas autenticadas

### 3. Espacio de trabajo
- [ ] se puede crear o abrir un espacio de trabajo
- [ ] las rutas del espacio de trabajo cargan correctamente
- [ ] ningún bucle de incorporación ni error de configuración duplicada bloquea el primer uso

### 4. Subida de documentos
- [ ] se puede subir un documento TXT/MD/PDF
- [ ] la subida termina sin fallos de transporte
- [ ] se crea y guarda la URI de almacenamiento
- [ ] el documento aparece en la interfaz del espacio de trabajo

### 5. Vista previa de documentos
- [ ] se puede previsualizar un documento cargado y procesado
- [ ] la vista previa devuelve contenido extraído legible
- [ ] se comprenden y funcionan los documentos personales y de espacios de trabajo, según corresponda

### 6. Consulta basada en documentos
- [ ] se puede formular una pregunta basada en un documento
- [ ] el modelo utiliza el contenido del documento cargado, no solo los metadatos del nombre de archivo
- [ ] ningún desacuerdo de RPC de recuperación impide incluir el contexto

### 7. Memoria y contexto básicos
- [ ] la composición de contexto se ejecuta sin errores fatales
- [ ] se incluye el contexto del documento cuando corresponde
- [ ] no se observa filtración de ámbito entre espacios de trabajo o documentos

### 8. Protección de API principales
- [ ] las rutas internas/de cron protegidas rechazan una autenticación no válida
- [ ] las rutas internas/de cron protegidas aceptan una autenticación válida

---

## Escenario recomendado de prueba básica

Una instalación empresarial básica debe superar el siguiente escenario:

1. desplegar la aplicación y la base de datos
2. configurar la autenticación y el almacenamiento
3. iniciar sesión
4. crear o abrir un espacio de trabajo
5. subir un PDF
6. comprobar que aparece en la lista de documentos
7. previsualizar el documento
8. preguntar «Resume el documento que acabo de subir»
9. recibir una respuesta basada en el contenido real del documento

Si este escenario falla, la instalación todavía no puede considerarse lista con garantías.

---

## Clasificación de fallos

Cuando falla una comprobación previa o una prueba básica, hay que clasificar el problema claramente.

### Fallo de configuración
Ejemplos:
- faltan variables de entorno
- un secreto tiene formato incorrecto
- se ha elegido una combinación de proveedores no compatible

### Fallo de dependencia
Ejemplos:
- la base de datos no es accesible
- el almacenamiento no es accesible
- las URL de retorno de autenticación no coinciden

### Fallo del flujo de producto
Ejemplos:
- la subida funciona, pero la vista previa falla
- el documento existe, pero el modelo no puede analizarlo
- la creación del espacio de trabajo entra en un bucle o genera duplicados

### Fallo de ámbito o límites
Ejemplos:
- se utiliza el contexto de un espacio de trabajo incorrecto
- se omite indebidamente la recuperación de documentos personales
- la vista previa exige workspaceId aunque no debería

---

## Recomendación final

Una instalación empresarial solo debe considerarse saludable cuando supera:
- las comprobaciones previas de configuración
- la conexión con los servicios dependientes
- las pruebas básicas de espacio de trabajo, subida, vista previa y consulta de documentos

Ese es el mínimo necesario para ofrecer instalaciones empresariales autohospedadas con garantías.
