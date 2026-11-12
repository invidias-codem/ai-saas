# Lattice OS CLI

**0.3.1-rc.1 — versión candidata; aún no está aprobada la distribución estable.**

La CLI administra instalaciones de Lattice OS mediante Docker en tu sistema operativo. La página de descargas de la aplicación se encuentra en `/downloads`. Los archivos aparecen solo después de revisar las pruebas de compilación y publicación.

## Instalación

Elige el ejecutable para tu sistema y procesador. Descarga `SHA256SUMS` y compara la suma de comprobación. Antes de ejecutar nada, verifica el origen del build de GitHub con el commit completo indicado en la página de descargas:

```sh
gh attestation verify lattice-linux-amd64 --repo invidias-codem/ai-saas --signer-workflow invidias-codem/ai-saas/.github/workflows/build-lattice-cli.yml --source-ref refs/heads/main --source-digest <40-character-source-commit>
```

Como alternativa, descarga y examina el archivo versionado `install.sh` o `install.ps1`, comprueba su suma y procedencia y ejecútalo con una versión y un commit de origen explícitos:

```sh
bash install.sh cli-v0.3.1-rc.1 <40-character-source-commit>
```

```powershell
.\install.ps1 -Version cli-v0.3.1-rc.1 -SourceCommit <40-character-source-commit>
```

Los instaladores requieren GitHub CLI y usan una carpeta propiedad del usuario sin pedir privilegios de administrador. Añádela al PATH si hace falta. No hay instalación alternativa desde el código fuente. Los archivos no estarán disponibles hasta que se publique una versión candidata.

## Comprobar la instalación

```sh
lattice --version
lattice doctor --offline --json
lattice doctor
```

Los binarios incluyen Python y bibliotecas criptográficas. Los comandos de despliegue necesitan Docker Engine con Compose v2 (o Docker Desktop con contenedores Linux). La comprobación sin conexión valida la CLI, no la instalación Docker completa.

## Comandos

Ejecuta `lattice <group> --help` y `lattice <group> <command> --help` para ver los argumentos.

| Grupo | Comandos |
| --- | --- |
| auth | login, logout, status; la generación antigua de tokens no es una autoridad segura de permisos |
| deploy | init, start, stop, restart, status, shell |
| license | activate, deactivate, show |
| health | check, logs |
| upgrade | upgrade, rollback |
| backup | create, restore, list |
| org | status, members; la integración de autenticación remota aún impide la publicación estable |
| task | run; necesita credenciales de API locales o de un socio |
| doctor | --offline, --json |

Esta versión candidata es solo para pruebas de desarrollo en entornos desechables. Los problemas conocidos de licencias, autenticación organizativa, credenciales y copias de seguridad figuran en [preparación de publicación](../../docs/releases/cli-release-readiness.md). No la utilices para recuperar sistemas de producción ni para aplicar derechos comerciales.

## Compilar y probar desde el código fuente

Utiliza Python 3.12 en un entorno virtual:

```sh
python -m pip install --require-hashes -r scripts/lattice-cli/requirements-build.lock
python -m unittest discover -s scripts/lattice-cli/tests -v
python scripts/lattice-cli/build.py --pyinstaller
python scripts/lattice-cli/smoke_binary.py dist/cli/lattice-linux-amd64
```

Compila de forma nativa para cada sistema y arquitectura. La matriz de GitHub Actions cubre cinco destinos y solo prepara un borrador de versión preliminar. PyInstaller empaqueta bytecode de Python, pero no protege la propiedad intelectual. Las instalaciones desde código fuente requieren Python 3.11+ y la dependencia de requirements.txt.
