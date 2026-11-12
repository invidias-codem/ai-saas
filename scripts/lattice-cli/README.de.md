# Lattice OS CLI

**0.3.1-rc.1 — Release Candidate; die stabile Veröffentlichung ist noch nicht freigegeben.**

Die CLI verwaltet Docker-Installationen von Lattice OS auf deinem vorhandenen Betriebssystem. Die Downloadseite der App befindet sich unter `/downloads`. Dateien werden erst angezeigt, nachdem Herkunft und Release-Nachweise geprüft wurden.

## Installation

Wähle die ausführbare Datei für Betriebssystem und Prozessor. Lade `SHA256SUMS` herunter und vergleiche die Prüfsumme. Verifiziere vor dem Ausführen die GitHub-Build-Herkunft anhand des vollständigen Quell-Commits auf der Downloadseite:

```sh
gh attestation verify lattice-linux-amd64 --repo invidias-codem/ai-saas --signer-workflow invidias-codem/ai-saas/.github/workflows/build-lattice-cli.yml --source-ref refs/heads/main --source-digest <40-character-source-commit>
```

Du kannst auch die versionierte Datei `install.sh` oder `install.ps1` herunterladen und prüfen, Prüfsumme und Herkunft verifizieren und sie mit expliziter Version und Quell-Commit ausführen:

```sh
bash install.sh cli-v0.3.1-rc.1 <40-character-source-commit>
```

```powershell
.\install.ps1 -Version cli-v0.3.1-rc.1 -SourceCommit <40-character-source-commit>
```

Die Installationsprogramme benötigen GitHub CLI und installieren ohne Administratorrechte in ein benutzereigenes Verzeichnis. Ergänze bei Bedarf den PATH. Es gibt keinen Fallback auf eine Quellinstallation. Die Dateien sind erst nach Veröffentlichung eines Release Candidate verfügbar.

## Installation prüfen

```sh
lattice --version
lattice doctor --offline --json
lattice doctor
```

Die Binärdateien enthalten Python und Kryptografiebibliotheken. Bereitstellungsbefehle benötigen Docker Engine mit Compose v2 (oder Docker Desktop mit Linux-Containern). Die Offline-Prüfung validiert die CLI, nicht die vollständige Docker-Bereitstellung.

## Befehle

Mit `lattice <group> --help` und `lattice <group> <command> --help` werden die Argumente angezeigt.

| Gruppe | Befehle |
| --- | --- |
| auth | login, logout, status; die bisherige Token-Erstellung ist keine sichere Berechtigungsinstanz |
| deploy | init, start, stop, restart, status, shell |
| license | activate, deactivate, show |
| health | check, logs |
| upgrade | upgrade, rollback |
| backup | create, restore, list |
| org | status, members; die Anbindung der Remote-Authentifizierung blockiert weiterhin die stabile Veröffentlichung |
| task | run; benötigt lokale API- oder Partner-Zugangsdaten |
| doctor | --offline, --json |

Dieser Release Candidate dient nur Entwicklungsversuchen in wegwerfbaren Umgebungen. Bekannte Probleme bei Lizenzen, Organisationsauthentifizierung, Zugangsdaten und Backups stehen in der [Release-Bereitschaft](../../docs/releases/cli-release-readiness.md). Verwende ihn weder zur Produktionswiederherstellung noch zur Durchsetzung kommerzieller Ansprüche.

## Aus dem Quellcode bauen und testen

Verwende Python 3.12 in einer virtuellen Umgebung:

```sh
python -m pip install --require-hashes -r scripts/lattice-cli/requirements-build.lock
python -m unittest discover -s scripts/lattice-cli/tests -v
python scripts/lattice-cli/build.py --pyinstaller
python scripts/lattice-cli/smoke_binary.py dist/cli/lattice-linux-amd64
```

Baue nativ für jedes Betriebssystem und jede Architektur. Die GitHub-Actions-Matrix deckt fünf Ziele ab und erstellt nur einen Entwurf einer Vorabversion. PyInstaller bündelt Python-Bytecode, schützt aber kein geistiges Eigentum. Quellinstallationen benötigen Python 3.11+ und die Abhängigkeit aus requirements.txt.
