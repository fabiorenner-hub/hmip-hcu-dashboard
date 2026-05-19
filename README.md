> 🇬🇧 English | [🇩🇪 Deutsch](README.de.md)

<p align="center">
  <img src="icon.svg" alt="hmip-dashboard-plugin icon" width="128" height="128"/>
</p>

# hmip-dashboard-plugin

📦 **[Download hmip-dashboard-plugin-1.1.2.tar.gz](https://github.com/fabiorenner-hub/hmip-hcu-dashboard/releases/latest/download/hmip-dashboard-plugin-1.1.2.tar.gz)** — install via HCUweb → *Developer mode → Plugins → Install from file*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-dashboard>

Locally hosted web dashboard for the Homematic IP system, served as an HCU
plugin. Once installed it is reachable at `http://hcu1-XXXX.local:8080`
(or whichever port you configure). Live overview of windows, climate, lights,
sockets, shutters, security and maintenance — all values pushed via
`HmipSystemEvent`, no polling.

## Support

If this plugin is useful to you, please consider a small donation — it helps
me keep the lights on while building more HCU plugins:
[Donate via PayPal](https://www.paypal.com/donate/?hosted_button_id=JPZRATUUHRT5C).

## What the dashboard shows

- **Overview**: open windows/doors, active alarms, lights on, active sockets,
  total power consumption, devices with low battery or unreachable
- **Rooms**: per-room climate (current/setpoint temperature, humidity, boost,
  window-open flag), contacts, lights and sockets, shutters, sensors
- **Windows & doors**: consolidated list with room mapping
- **Climate**: climate cards for every heated room with setpoint slider
- **Lights & sockets**: toggle / dimmer slider
- **Shutters**: slider 0..1 (0 = open, 1 = closed)
- **Security**: smoke detectors, motion/presence sensors, water sensors
- **Maintenance**: device count, battery and reachability warnings

## Install on your HCU

1. Download the latest `hmip-dashboard-plugin-<version>.tar.gz` from the
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-dashboard/releases).
2. In HCUweb open *Developer mode → Plugins → Install from file* and upload it.
3. Configure the plugin and open
   `http://hcu1-XXXX.local:<port>` in your browser.

## Build it yourself

```powershell
./build.ps1   # Windows
```

```bash
chmod +x build.sh
./build.sh    # macOS / Linux
```

## HCU requirements

- Homematic IP HCU1 with firmware **1.4.7 or newer**
- Developer mode enabled

## Configuration (HCUweb plugin dialog)

| Field           | Type | Default     | Description                            |
| --------------- | ---- | ----------- | -------------------------------------- |
| Port            | int  | 8080        | TCP port of the web UI                 |
| Title           | text | Smart Home  | Shown in browser tab and header        |
| Allow control   | enum | true        | `false` = read-only (kiosk mode)       |

## Security

The dashboard runs without authentication on the local network. If your LAN
is also open to guests, set *Allow control* to `false` or put the HCU behind
a reverse proxy with basic auth.

## Author

Issued by **Fabio Renner**.

### Third-party components

- Built against the [Homematic IP Connect API 1.0.1](https://github.com/homematicip/connect-api) by eQ-3.
- Frontend uses vanilla HTML/CSS/JavaScript; no external UI framework or asset bundle.

## License

Apache-2.0
