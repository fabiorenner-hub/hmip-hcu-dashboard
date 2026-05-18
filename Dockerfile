# HCU plugin image. Must be linux/arm64 and carry the metadata label.
FROM --platform=linux/arm64 ghcr.io/homematicip/alpine-node-simple:0.0.1

WORKDIR /app

COPY package.json .npmrc ./
COPY package-lock.jso[n] ./
RUN npm install --omit=dev --no-audit --no-fund --loglevel=error

COPY src ./src
COPY public ./public

# /data is created by the HCU for installed plugins and persists across
# container updates. Editable config lives there.
VOLUME ["/data"]

# Dashboard HTTP port. The HCU maps container ports 1:1 to the host, so the
# dashboard will be reachable at http://hcu1-XXXX.local:8080 on the LAN.
EXPOSE 8080

ENV NODE_ENV=production \
    HMIP_PLUGIN_ID=de.homematicip.plugin.dashboard \
    LOG_LEVEL=info

ENTRYPOINT ["node", "src/index.js"]

LABEL de.eq3.hmip.plugin.metadata="{\"pluginId\":\"de.homematicip.plugin.dashboard\",\"issuer\":\"Community\",\"version\":\"1.0.0\",\"hcuMinVersion\":\"1.4.7\",\"scope\":\"LOCAL\",\"friendlyName\":{\"de\":\"Smart Home Dashboard\",\"en\":\"Smart Home Dashboard\"},\"description\":{\"de\":\"Lokale Weboberflaeche mit Uebersicht ueber Fenster, Klima, Licht und Rollaeden der Homematic IP Anlage.\",\"en\":\"Locally hosted web dashboard with windows, climate, lights and shutters from the Homematic IP system.\"},\"settings\":[],\"changelog\":\"1.0.0 - Initial public release.\",\"logsEnabled\":true}"
