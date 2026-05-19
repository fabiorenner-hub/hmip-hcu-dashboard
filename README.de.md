> [ðŸ‡¬ðŸ‡§ English](README.md) | ðŸ‡©ðŸ‡ª Deutsch

<p align="center">
  <img src="icon.svg" alt="hmip-dashboard-plugin Symbolbild" width="128" height="128"/>
</p>

# hmip-dashboard-plugin

ðŸ“¦ **[hmip-dashboard-plugin-1.1.1.tar.gz herunterladen](https://github.com/fabiorenner-hub/hmip-hcu-dashboard/releases/latest/download/hmip-dashboard-plugin-1.1.1.tar.gz)** â€” Installation in HCUweb Ã¼ber *Entwicklermodus â†’ Plugins â†’ Aus Datei installieren*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-dashboard>

Lokal gehostetes Web-Dashboard fÃ¼r die Homematic IP Anlage, ausgeliefert als
HCU-Plugin. Nach der Installation erreichbar unter
`http://hcu1-XXXX.local:8080` (oder dem konfigurierten Port).

## Spenden

Wenn dir dieses Plugin hilft, freue ich mich über eine kleine Spende — sie
hält bei mir die Lichter an, während ich weitere HCU-Plugins baue:
[Spenden via PayPal](https://www.paypal.com/donate/?hosted_button_id=JPZRATUUHRT5C).

## Was das Dashboard zeigt

- **Ãœbersicht**: offene Fenster/TÃ¼ren, aktive Alarme, Licht an, aktive Steckdosen,
  Gesamtleistung, GerÃ¤te mit niedriger Batterie oder nicht erreichbar
- **RÃ¤ume**: pro Raum Klima (Ist-/Soll-Temperatur, Luftfeuchte, Boost,
  Fenster-offen-Flag), Kontakte, Licht und Steckdosen, RolllÃ¤den, Sensoren
- **Fenster & TÃ¼ren**: konsolidierte Liste mit Raumzuordnung
- **Klima**: Klimakarten je geheiztem Raum mit Sollwert-Slider
- **Licht & Steckdosen**: Toggle / Dimmer-Slider
- **RolllÃ¤den**: Slider 0..1 (0 = offen, 1 = geschlossen)
- **Sicherheit**: Rauchmelder, Bewegungs-/PrÃ¤senzsensoren, Wassersensoren
- **Wartung**: GerÃ¤teanzahl, Batterie- und Erreichbarkeits-Warnungen

Alle Werte kommen live Ã¼ber `HmipSystemEvent`, ohne Polling.
StatusÃ¤nderungen erscheinen innerhalb einer Sekunde im UI.

## Auf der HCU installieren

1. Aktuelle `hmip-dashboard-plugin-<version>.tar.gz` aus den
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-dashboard/releases) holen.
2. In HCUweb *Entwicklermodus â†’ Plugins â†’ Aus Datei installieren* Ã¶ffnen und hochladen.
3. Plugin konfigurieren und im Browser
   `http://hcu1-XXXX.local:<port>` Ã¶ffnen.

## Selbst bauen

BenÃ¶tigt Docker + buildx auf einem Rechner mit LAN-Zugang zur HCU.

```bash
cd hmip-dashboard-plugin
chmod +x build.sh
./build.sh
```

Erzeugt `hmip-dashboard-plugin-<version>.tar.gz`.

## Voraussetzungen

- Homematic IP HCU1 mit Firmware 1.4.7+

## Konfiguration (HCUweb Plugin-Dialog)

| Feld            | Typ  | Default     | Beschreibung                              |
| --------------- | ---- | ----------- | ----------------------------------------- |
| Port            | int  | 8080        | TCP-Port der Web-UI                       |
| Titel           | Text | Smart Home  | Wird in Browser-Tab und Kopfzeile gezeigt |
| Steuerung erlauben | enum | true     | `false` = read-only (Kiosk-Modus)         |

Speichern lÃ¤dt den HTTP-Server automatisch neu. Die HCU mappt den
Container-Port 1:1 auf die LAN-Schnittstelle.

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

## Sicherheit

Das Dashboard lÃ¤uft ohne Authentifizierung im lokalen Netz. Wenn dein LAN
auch fÃ¼r GÃ¤ste offen ist, *Steuerung erlauben* auf `false` setzen oder die
HCU hinter einen Reverse-Proxy mit Basic-Auth stellen (nicht Teil des Plugins).

## Herausgeber

Herausgegeben von **Fabio Renner**.

## Lizenz

Apache-2.0
