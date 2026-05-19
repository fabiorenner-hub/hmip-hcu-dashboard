> [🇬🇧 English](README.md) | 🇩🇪 Deutsch

<p align="center">
  <img src="icon.svg" alt="hmip-dashboard-plugin Symbolbild" width="128" height="128"/>
</p>

# hmip-dashboard-plugin

📦 **[hmip-dashboard-plugin-1.1.2.tar.gz herunterladen](https://github.com/fabiorenner-hub/hmip-hcu-dashboard/releases/latest/download/hmip-dashboard-plugin-1.1.2.tar.gz)** — Installation in HCUweb über *Entwicklermodus → Plugins → Aus Datei installieren*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-dashboard>

Lokal gehostetes Web-Dashboard für die Homematic IP Anlage, ausgeliefert als
HCU-Plugin. Nach der Installation erreichbar unter
`http://hcu1-XXXX.local:8080` (oder dem konfigurierten Port). Live-Übersicht
über Fenster, Klima, Licht, Steckdosen, Rollläden, Sicherheit und Wartung —
alle Werte kommen via `HmipSystemEvent`, ohne Polling.

## Spenden

Wenn dir dieses Plugin hilft, freue ich mich über eine kleine Spende — sie
hält bei mir die Lichter an, während ich weitere HCU-Plugins baue:
[Spenden via PayPal](https://www.paypal.com/donate/?hosted_button_id=JPZRATUUHRT5C).

## Was das Dashboard zeigt

- **Übersicht**: offene Fenster/Türen, aktive Alarme, Licht an, aktive Steckdosen,
  Gesamtleistung, Geräte mit niedriger Batterie oder nicht erreichbar
- **Räume**: pro Raum Klima (Ist-/Soll-Temperatur, Luftfeuchte, Boost,
  Fenster-offen-Flag), Kontakte, Licht und Steckdosen, Rollläden, Sensoren
- **Fenster & Türen**: konsolidierte Liste mit Raumzuordnung
- **Klima**: Klimakarten je geheiztem Raum mit Sollwert-Slider
- **Licht & Steckdosen**: Toggle / Dimmer-Slider
- **Rollläden**: Slider 0..1 (0 = offen, 1 = geschlossen)
- **Sicherheit**: Rauchmelder, Bewegungs-/Präsenzsensoren, Wassersensoren
- **Wartung**: Geräteanzahl, Batterie- und Erreichbarkeits-Warnungen

## Auf der HCU installieren

1. Aktuelle `hmip-dashboard-plugin-<version>.tar.gz` aus den
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-dashboard/releases) holen.
2. In HCUweb *Entwicklermodus → Plugins → Aus Datei installieren* öffnen und hochladen.
3. Plugin konfigurieren und im Browser
   `http://hcu1-XXXX.local:<port>` öffnen.

## Selbst bauen

```powershell
./build.ps1   # Windows
```

```bash
chmod +x build.sh
./build.sh    # macOS / Linux
```

## Voraussetzungen auf der HCU

- Homematic IP HCU1 mit Firmware **1.4.7 oder neuer**
- Entwicklermodus aktiviert

## Konfiguration (HCUweb Plugin-Dialog)

| Feld                | Typ  | Default     | Beschreibung                              |
| ------------------- | ---- | ----------- | ----------------------------------------- |
| Port                | int  | 8080        | TCP-Port der Web-UI                       |
| Titel               | Text | Smart Home  | Wird in Browser-Tab und Kopfzeile gezeigt |
| Steuerung erlauben  | enum | true        | `false` = read-only (Kiosk-Modus)         |

## Sicherheit

Das Dashboard läuft ohne Authentifizierung im lokalen Netz. Wenn dein LAN
auch für Gäste offen ist, *Steuerung erlauben* auf `false` setzen oder die
HCU hinter einen Reverse-Proxy mit Basic-Auth stellen.

## Herausgeber

Herausgegeben von **Fabio Renner**.

### Verwendete Drittanbieter

- Gebaut gegen die [Homematic IP Connect API 1.0.1](https://github.com/homematicip/connect-api) von eQ-3.
- Frontend nutzt reines HTML/CSS/JavaScript; kein externes UI-Framework oder Asset-Bundle.

## Lizenz

Apache-2.0
