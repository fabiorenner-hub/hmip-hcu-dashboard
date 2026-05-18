'use strict';

/**
 * Plugin configuration, three-layer precedence: persisted > env > defaults.
 */
const fs = require('fs');
const { ConfigStore } = require('./config-store');

const PLUGIN_ID = process.env.HMIP_PLUGIN_ID || 'de.homematicip.plugin.dashboard';

function readTokenFile(p) {
    try {
        return fs.readFileSync(p, 'utf8').trim();
    } catch (_) {
        return '';
    }
}

const tokenFromFile = readTokenFile('/TOKEN');
const authToken = tokenFromFile || process.env.HMIP_HCU_AUTH_TOKEN || '';
const isInstalled = Boolean(tokenFromFile);
const defaultHost = isInstalled ? 'host.containers.internal' : 'hcu1.local';

const store = new ConfigStore();
const persisted = store.load();

function pick(key, fallback) {
    if (persisted[key] !== undefined && persisted[key] !== '') return persisted[key];
    if (process.env[key] !== undefined && process.env[key] !== '') return process.env[key];
    return fallback;
}

const cfg = {
    pluginId: PLUGIN_ID,
    isInstalled,
    store,

    hcu: {
        host: process.env.HMIP_HCU_HOST || defaultHost,
        port: Number(process.env.HMIP_HCU_PORT || 9001),
        authToken,
        reconnectDelayMs: 5000,
    },

    web: {
        port: Number(pick('WEB_PORT', 8080)),
        title: pick('WEB_TITLE', 'Smart Home'),
        // When true the UI exposes write operations. Read-only mode is useful
        // for kiosk displays in the hallway.
        allowControl:
            String(pick('WEB_ALLOW_CONTROL', 'true')).toLowerCase() !== 'false',
    },

    log: {
        level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
    },
};

cfg.applyUpdate = (updates) => {
    const merged = { ...persisted };
    for (const [k, v] of Object.entries(updates || {})) {
        if (v === undefined || v === null) continue;
        merged[k] = typeof v === 'string' ? v.trim() : v;
    }
    store.save(merged);
    Object.assign(persisted, merged);

    cfg.web.port = Number(pick('WEB_PORT', cfg.web.port));
    cfg.web.title = pick('WEB_TITLE', cfg.web.title);
    cfg.web.allowControl =
        String(pick('WEB_ALLOW_CONTROL', String(cfg.web.allowControl))).toLowerCase() !== 'false';
};

module.exports = cfg;
