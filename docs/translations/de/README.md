# Lattice OS – Dokumentation

Diese Dokumentation soll den Quellcode und das Verhalten der Lattice-OS-Plattform für Entwickler, Mitwirkende, Prüfende und künftige Wartungsverantwortliche verständlich machen.

Klarheit ist wichtiger als Marketing.

## Grundsätze der Dokumentation

- erklären, was das System tatsächlich tut
- stabiles Verhalten von einer sich weiterentwickelnden Architektur unterscheiden
- Vertrauensgrenzen sichtbar machen
- tatsächliche Technologieentscheidungen ausdrücklich dokumentieren
- konkrete Beschreibungen statt vager KI-Begriffe bevorzugen

## Zentrale Dokumente

### Überblick
- `overview/technology-transparency.md` — Technologie-Stack und Plattformbereiche im Detail
- `overview/seo-strategy.md` — markengerechte SEO-Positionierung, Metadatenstrategie und Inhaltsarchitektur für Lattice OS

### Architektur
- `architecture/system-architecture.md` — allgemeiner Systemaufbau, zentrale Komponenten sowie Daten- und Steuerungsflüsse

## Aktive Dokumentation

### CLI und Bereitstellung (NEU)
- **lattice-cli v0.3.0** — produktionsreifes CLI zur Verwaltung einer Docker-Installation
  - Speicherort: `scripts/lattice-cli/`
  - Funktionen: Authentifizierung, Bereitstellung, Aktivierung von V3-Lizenzen, Gesundheitsprüfungen, Upgrades und Backups
  - Bereitstellungsablauf: Vorabprüfung (Docker, Compose v2, RAM/CPU, Ports, Speicherplatz und Docker-Authentifizierung) sowie Lizenzprüfung während der Bereitstellung
  - CI/CD: automatische Erstellung von Binärdateien über GitHub Actions
  - Verteilung: `install.sh`-Skript mit Erkennung von Betriebssystem und Architektur
  - Siehe: `scripts/lattice-cli/README.md` für die vollständige Befehlsreferenz

### Betaprogramm (NEU)
- **Materialien zur Beta-Einladung**: `docs/beta-outreach/`
  - Threads-Direktnachrichten-Vorlagen (entsprechend dem Limit von 200 Zeichen)
  - E-Mail-Folgen für interessierte Testpersonen
  - Profilbasierte Ansprache
  - Umgang mit Antworten wie „ja“, „was ist das?“, „ist es kostenlos?“ und „jetzt nicht“

- **Leitfäden für das Beta-Onboarding**: `app/[locale]/(public)/beta/`
  - Schnellstart (15 Min.) - `/beta/start`
  - Entwicklerpfad (45 Min.) - `/beta/dev`
  - Unternehmenspfad (1 Stunde) - `/beta/enterprise`
  - Datenschutzpfad (1 Stunde) - `/beta/privacy`
  - Statische Seitengenerierung für kurze Ladezeiten

### Authentifizierung (AKTUALISIERT)
- **Anmeldung im Stil von PS1/PS2**
  - Individuelle Clerk-Gestaltung mit Glaseffekt-Karte
  - Animierter Hintergrund mit dezenten Partikeleffekten
  - Retro-moderne Ästhetik (Videospiel-Nostalgie der 90er-Jahre)
  - Speicherort: `app/[locale]/(auth)/layout.tsx`

## Geplante nächste Bereiche

### Architektur
- `architecture/runtime-mode-routing.md`
- `architecture/memory-and-context-architecture.md`
- `architecture/workspace-operating-profile-model.md`

### Sicherheit
- `security/public-routes.md`
- `security/trust-boundaries.md`
- `security/licensing-cryptography.md` — Entwurf des ed25519-V3-Lizenzsystems

### Betrieb
- `operations/truth-surfaces.md`
- `operations/deployment.md` — Ablauf der Docker-Bereitstellung
- `operations/air-gap-deployment.md` — Anleitung für vollständig netzunabhängigen Betrieb

### Referenz
- `reference/api-reference.md`
- `reference/environment-variables.md`
- `reference/cli-commands.md` — vollständige lattice-cli-Befehlsreferenz

### Entscheidungen
- `decisions/adr-001-*.md`

## Hinweise

Diese Dokumente sollen sich mit dem Produkt weiterentwickeln.
Wenn sich das Verhalten ändert, sollte die Dokumentation im Rahmen der Implementierung aktualisiert werden, nicht erst nachträglich.

---

**Zuletzt aktualisiert:** 2026-06-21
**Version:** 0.3.0 (lattice-cli)
