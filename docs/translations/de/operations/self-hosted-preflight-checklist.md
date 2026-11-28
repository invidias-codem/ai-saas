# Checkliste für Vorabprüfungen und Funktionstests bei selbst gehosteten Installationen

## Zweck

Diese Checkliste definiert die Vorabprüfungen und Funktionstests für geschäftliche, selbst gehostete Lattice-Bereitstellungen.

Sie beantwortet die praktische Frage:

## „Woran erkennen wir, ob eine frische Installation wirklich nutzbar ist?“

Sie sollte verwendet werden für:
- erstmalige Unternehmensinstallationen
- Validierung von Bereitstellungen
- Validierung von Upgrades
- Eingrenzung und Diagnose von Supportfällen

---

## Zwei Ebenen der Validierung

### Ebene 1 — Vorabprüfung
Konfiguration und Erreichbarkeit der Dienste werden vor dem normalen Betrieb geprüft.

Beispiele:
- Umgebungsvariablen sind vorhanden
- die Datenbank ist erreichbar
- der Speicher ist erreichbar
- die Authentifizierung ist konfiguriert
- erforderliche Geheimnisse sind vorhanden

### Ebene 2 — Funktionstest
Es wird geprüft, ob echte Benutzerabläufe funktionieren.

Beispiele:
- Anmeldung ist möglich
- ein Arbeitsbereich lässt sich erstellen oder öffnen
- ein Dokument lässt sich hochladen
- ein Dokument lässt sich in der Vorschau anzeigen
- eine dokumentengestützte Abfrage ist möglich

Beide Ebenen sind notwendig, um eine Unternehmensinstallation verlässlich beurteilen zu können.

---

## Vorabprüfungs-Checkliste — Grundkonfiguration Modus A

### Grundkonfiguration der Anwendung
- [ ] `NEXT_PUBLIC_APP_URL` ist korrekt gesetzt
- [ ] `NODE_ENV` ist passend gesetzt
- [ ] erforderliche App-Geheimnisse sind vorhanden
- [ ] interne Cron-/Routengeheimnisse sind gesetzt

### Authentifizierung
- [ ] Authentifizierungsanbieter und -konfiguration sind vorhanden
- [ ] Callback-/Weiterleitungs-URLs stimmen mit der Bereitstellungs-URL überein
- [ ] ein Test-Anmeldeablauf funktioniert oder ist mindestens richtig konfiguriert

### Datenbank
- [ ] primäre Datenbank-URL bzw. -Konfiguration ist vorhanden
- [ ] Service-Rollen-/Administrator-Zugangsdaten sind bei Bedarf vorhanden
- [ ] die Anwendung kann eine Verbindung zur Datenbank herstellen
- [ ] Migrationen wurden erfolgreich angewendet

### Speicher
- [ ] Speicher-Bucket und -Konfiguration sind vorhanden
- [ ] die Anwendung kann in den Speicher schreiben
- [ ] die Anwendung kann aus dem Speicher lesen
- [ ] signiertes Hochladen funktioniert, sofern verwendet

### Modell-/Anbieterkonfiguration
- [ ] mindestens ein unterstützter Chat-/Reasoning-Anbieter ist konfiguriert
- [ ] mindestens ein unterstützter Embedding-Anbieter ist konfiguriert
- [ ] Auswahl- und Fallback-Verhalten der Anbieter ist bekannt

### Prüfung optionaler Funktionen
- [ ] deaktivierte optionale Subsysteme sind für die Basisinstallation nicht erforderlich
- [ ] fehlende Umgebungsvariablen optionaler Integrationen blockieren keine Kernabläufe

---

## Funktionstest-Checkliste — Grundkonfiguration Modus A

### 1. Anwendungsstart
- [ ] die Anwendung lädt unter der öffentlichen URL
- [ ] öffentliche Routen werden korrekt dargestellt
- [ ] die authentifizierte Benutzeroberfläche lädt nach der Anmeldung

### 2. Authentifizierung
- [ ] ein Benutzer kann sich anmelden
- [ ] eine Sitzung wird aufgebaut
- [ ] der Zugriff auf geschützte Bereiche wird gewährt

### 3. Arbeitsbereich
- [ ] ein Arbeitsbereich kann erstellt oder geöffnet werden
- [ ] arbeitsbereichsbezogene Routen werden geladen
- [ ] keine Onboarding-Schleife oder doppelte Einrichtung verhindert den ersten Einsatz

### 4. Dokument-Upload
- [ ] ein TXT/MD/PDF-Dokument kann hochgeladen werden
- [ ] der Upload endet ohne Übertragungsfehler
- [ ] eine Speicher-URI wird erstellt und gespeichert
- [ ] das Dokument erscheint in der Arbeitsbereichsoberfläche

### 5. Dokumentvorschau
- [ ] ein hochgeladenes und verarbeitetes Dokument kann in der Vorschau angezeigt werden
- [ ] die Vorschau liefert lesbare extrahierte Inhalte
- [ ] das Verhalten persönlicher Dokumente und Arbeitsbereichsdokumente ist bekannt und funktioniert gegebenenfalls

### 6. Dokumentengestützte Abfrage
- [ ] eine Frage anhand eines Dokuments kann gestellt werden
- [ ] das Modell nutzt den tatsächlichen Inhalt des hochgeladenen Dokuments und nicht nur Dateinamen-Metadaten
- [ ] keine Retrieval-RPC-Inkompatibilität verhindert die Einbindung des Kontexts

### 7. Grundlegendes Gedächtnis und Kontext
- [ ] die Kontextzusammenstellung läuft ohne schwerwiegende Fehler
- [ ] Dokumentkontext wird einbezogen, wenn er erwartet wird
- [ ] keine ungewollte Vermischung zwischen Arbeitsbereichen oder Dokumenten wird beobachtet

### 8. Schutz zentraler APIs
- [ ] geschützte interne/Cron-Routen weisen ungültige Authentifizierung ab
- [ ] geschützte interne/Cron-Routen akzeptieren gültige Authentifizierung

---

## Empfohlenes Funktionstestszenario

Eine grundlegende Unternehmensinstallation sollte das folgende Szenario bestehen:

1. Anwendung und Datenbank bereitstellen
2. Authentifizierung und Speicher konfigurieren
3. anmelden
4. Arbeitsbereich erstellen oder öffnen
5. PDF hochladen
6. prüfen, ob es in der Dokumentliste erscheint
7. Dokument in der Vorschau öffnen
8. fragen: „Fasse das Dokument zusammen, das ich gerade hochgeladen habe.“
9. eine Antwort erhalten, die auf dem tatsächlichen Dokumentinhalt basiert

Wenn dieses Szenario fehlschlägt, kann die Installation noch nicht glaubwürdig als einsatzbereit gelten.

---

## Fehlerklassifizierung

Wenn eine Vorabprüfung oder ein Funktionstest fehlschlägt, sollte das Problem eindeutig klassifiziert werden.

### Konfigurationsfehler
Beispiele:
- fehlende Umgebungsvariablen
- falsch formatiertes Geheimnis
- nicht unterstützte Anbieterkombination

### Abhängigkeitsfehler
Beispiele:
- Datenbank nicht erreichbar
- Speicher nicht erreichbar
- Abweichung bei Authentifizierungs-Callback-URLs

### Fehler im Produktablauf
Beispiele:
- Upload erfolgreich, aber Vorschau schlägt fehl
- Dokument vorhanden, aber Modell kann es nicht analysieren
- Arbeitsbereichserstellung läuft in eine Schleife oder erzeugt Duplikate

### Fehler bei Bereichs- oder Vertrauensgrenzen
Beispiele:
- falscher Arbeitsbereichskontext
- Abruf persönlicher Dokumente wurde fälschlich übersprungen
- Vorschau verlangt workspaceId, obwohl es nicht erforderlich sein sollte

---

## Abschließende Empfehlung

Eine Unternehmensinstallation sollte erst als gesund gelten, wenn Folgendes erfolgreich ist:
- Konfigurations-Vorabprüfung
- Erreichbarkeit der abhängigen Dienste
- Funktionstests für Arbeitsbereich, Dokument-Upload, Vorschau und Abfrage

Das ist die Mindestanforderung für verlässliches geschäftliches Self-Hosting.
