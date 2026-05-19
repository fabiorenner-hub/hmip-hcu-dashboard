> ðŸ‡¬ðŸ‡§ English | [ðŸ‡©ðŸ‡ª Deutsch](README.de.md)

<p align="center">
  <img src="icon.svg" alt="hmip-dashboard-plugin icon" width="128" height="128"/>
</p>

# hmip-dashboard-plugin

ðŸ“¦ **[Download hmip-dashboard-plugin-1.1.1.tar.gz](https://github.com/fabiorenner-hub/hmip-hcu-dashboard/releases/latest/download/hmip-dashboard-plugin-1.1.1.tar.gz)** â€” install via HCUweb â†’ *Developer mode â†’ Plugins â†’ Install from file*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-dashboard>

Locally hosted web dashboard for the Homematic IP system, served as an HCU
plugin. Once installed it is reachable at `http://hcu1-XXXX.local:8080`
(or whichever port you configure).

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

All values come live via `HmipSystemEvent`, no polling. State changes appear
in the UI within a second.

## Install on your HCU

1. Download the latest `hmip-dashboard-plugin-<version>.tar.gz` from the
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-dashboard/releases).
2. In HCUweb open *Developer mode â†’ Plugins â†’ Install from file* and upload it.
3. Configure the plugin and open
   `http://hcu1-XXXX.local:<port>` in your browser.

## Build it yourself

Requires Docker + buildx on a machine with LAN access to the HCU.

```bash
cd hmip-dashboard-plugin
chmod +x build.sh
./build.sh
```

This produces `hmip-dashboard-plugin-<version>.tar.gz`.

## Prerequisites

- Homematic IP HCU1 with firmware 1.4.7+

## Configuration (HCUweb plugin dialog)

| Field           | Type | Default     | Description                            |
| --------------- | ---- | ----------- | -------------------------------------- |
| Port            | int  | 8080        | TCP port of the web UI                 |
| Title           | text | Smart Home  | Shown in browser tab and header        |
| Allow control   | enum | true        | `false` = read-only (kiosk mode)       |

Saving reloads the HTTP server automatically. The HCU maps the container
port 1:1 to the LAN interface.

## Develop remotely

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

## Architecture

```
HMIP App  <-- cloud ----->  HCU  <-- wss:9001 -->  plugin
                                                    |
                                          HmipSystemEvent (broadcast)
                                                    v
                                          state-store (in-memory)
                                                    v
                       project.js --> UI shape --> web-server --> Browser (SSE)
                                                                 |
                                                          <-- POST /api/control
                                                                 |
                                                                 v
                                                  hmip/device/control/setSwitchState
                                                              etc.
```

- `hcu-client.js`: WebSocket + request/response correlation + SystemEvent push
- `state-store.js`: in-memory cache for devices/groups/home, event merge
- `project.js`: room-grouped, UI-friendly projection
- `web-server.js`: HTTP + SSE + control proxy
- `public/`: static dashboard assets (no build step)

## JSON API

- `GET /api/state` â€” projected state (same as SSE, but a single snapshot)
- `GET /api/raw` â€” unfiltered HMIP snapshot (useful for debugging)
- `GET /api/events` â€” SSE stream, one event = full projected state
- `POST /api/control` â€” body `{path, body}` is forwarded 1:1 as
  `HmipSystemRequest`. Only active when *Allow control* = `true`.

## Security

The dashboard runs without authentication on the local network. If your LAN
is also open to guests, set *Allow control* to `false` or put the HCU behind
a reverse proxy with basic auth (not part of this plugin).

## Author

Issued by **Fabio Renner**.

## License

Apache-2.0
