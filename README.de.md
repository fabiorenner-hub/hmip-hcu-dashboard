> [🇬🇧 English](README.md) | 🇩🇪 Deutsch

# hmip-dashboard-plugin

📦 **[hmip-dashboard-plugin-1.0.0.tar.gz herunterladen](https://github.com/fabiorenner-hub/hmip-hcu-dashboard/releases/latest/download/hmip-dashboard-plugin-1.0.0.tar.gz)** — Installation in HCUweb über *Entwicklermodus → Plugins → Aus Datei installieren*.

Lokal gehostete Weboberfläche für das Homematic IP System, betrieben als
HCU-Plugin. Nach der Installation erreichbar unter
`http://hcu1-XXXX.local:8080` (oder dem konfigurierten Port).

## Was das Dashboard zeigt

- **Übersicht**: offene Fenster/Türen, aktive Alarme, Lichter an, aktive
  Steckdosen, Summen-Verbrauch in Watt, Geräte mit schwacher Batterie bzw.
  nicht erreichbar
- **Räume**: Klima pro Raum (Ist/Soll-Temperatur, Luftfeuchte, Boost,
  Fenster-Offen-Flag), Kontakte, Licht & Steckdose, Rollläden, Sensoren
- **Fenster & Türen**: konsolidierte Liste mit Raum-Zuordnung
- **Klima**: Klima-Karten aller beheizten Räume inkl. Solltemperatur-Slider
- **Lichter & Steckdosen**: Toggle / Dimmer-Slider
- **Rollläden**: Schieberegler 0..1 (0 = offen, 1 = geschlossen)
- **Sicherheit**: Rauchmelder, Bewegungs-/Anwesenheitsmelder, Wassersensoren
- **Wartung**: Geräteanzahl, Batterie-/Erreichbarkeitswarnungen

Alle Werte kommen live über HmipSystemEvent, ohne Polling. Statusänderungen
tauchen binnen einer Sekunde in der UI auf.

## Auf der HCU installieren

1. Die aktuellste `hmip-dashboard-plugin-<version>.tar.gz` aus den
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-dashboard/releases)
   herunterladen.
2. In HCUweb *Entwicklermodus → Plugins → Aus Datei installieren* öffnen und
   die Datei hochladen.
3. Plugin konfigurieren und im Browser
   `http://hcu1-XXXX.local:<port>` öffnen.

## Voraussetzungen

- Homematic IP HCU1 mit Firmware 1.4.7+
- Docker + buildx auf einem Rechner mit LAN-Zugang zur HCU (nur falls du
  selbst bauen möchtest)

## Selbst bauen

```bash
cd hmip-dashboard-plugin
chmod +x build.sh
./build.sh
```

Raus kommt `hmip-dashboard-plugin-<version>.tar.gz`.

## Konfiguration (HCUweb-Plugin-Dialog)

| Feld                 | Typ    | Default | Beschreibung                              |
| -------------------- | ------ | ------- | ----------------------------------------- |
| Port                 | Zahl   | 8080    | TCP-Port der Weboberfläche                |
| Titel                | Text   | Smart Home | Im Browser-Tab und Header angezeigt    |
| Steuerung erlauben   | Enum   | true    | `false` = Nur-Anzeige (Kiosk-Modus)       |

Nach Speichern lädt der HTTP-Server automatisch neu. Die HCU mappt den
Container-Port 1:1 auf das LAN-Interface.

## Remote entwickeln

```env
HMIP_HCU_HOST=hcu1-XXXX.local
HMIP_HCU_AUTH_TOKEN=<dev-token>
WEB_PORT=8080
LOG_LEVEL=debug
```

```bash
npm install
npm run dev
# -> http://localhost:8080
```

## Architektur

```
HMIP App  <-- cloud ------>  HCU  <-- wss:9001 -->  plugin
                              |
                           HmipSystemEvent (broadcast)
                              v
                          state-store (in-memory)
                              v
          project.js --> UI-Shape --> web-server --> Browser (SSE)
                                           |
                                           <-- POST /api/control
                                           |
                                           v
                           hmip/device/control/setSwitchState
                                        etc.
```

- `hcu-client.js`: WebSocket + Request-Response-Correlation + SystemEvent-Push
- `state-store.js`: In-Memory-Cache für Geräte/Gruppen/Home, Event-Merge
- `project.js`: Raum-gruppierte, UI-freundliche Projektion
- `web-server.js`: HTTP + SSE + Control-Proxy
- `public/`: statische Dashboard-Assets (kein Build-Schritt)

## JSON-API

- `GET /api/state` — projizierter State (wie via SSE, aber Einzel-Snapshot)
- `GET /api/raw` — ungefilterter HMIP-Snapshot (nützlich für Debugging)
- `GET /api/events` — SSE-Stream, ein Event = voller projizierter State
- `POST /api/control` — Body `{path, body}` wird 1:1 als HmipSystemRequest
  durchgereicht. Nur aktiv, wenn `Steuerung erlauben = true`.

## Sicherheit

Das Dashboard läuft ohne Authentifizierung im lokalen Netz. Wenn dein LAN
auch für Gäste offen ist, setze `Steuerung erlauben = false` oder stelle die
HCU hinter einen reverse-proxy mit Basic-Auth (nicht Teil des Plugins).

## Lizenz

Apache-2.0
