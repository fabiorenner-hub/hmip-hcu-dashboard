'use strict';

/**
 * WebSocket client to the Homematic IP HCU Connect API.
 *
 * Extensions over the basic plugin client:
 *   - Subscribes to HMIP system events via the `hmip-system-events` header.
 *   - Exposes a promise-returning `request()` helper that correlates
 *     HMIP_SYSTEM_RESPONSE messages to their originating HMIP_SYSTEM_REQUEST
 *     by message id, so caller code can `await hcu.request('/hmip/...')`.
 */

const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');
const WebSocket = require('ws');

const logger = require('./logger');
const { hcu, pluginId } = require('./config');

const REQUEST_TIMEOUT_MS = 15000;

class HcuClient extends EventEmitter {
    constructor() {
        super();
        this._ws = null;
        this._reconnectTimer = null;
        this._stopping = false;
        this._handlers = new Map();
        this._pending = new Map(); // id -> { resolve, reject, timer }
    }

    on(type, handler) {
        if (typeof type === 'string' && type === type.toUpperCase() && type.includes('_')) {
            this._handlers.set(type, handler);
            return this;
        }
        return super.on(type, handler);
    }

    start() {
        this._stopping = false;
        this._connect();
    }

    stop() {
        this._stopping = true;
        if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
        if (this._ws) this._ws.close();
        for (const p of this._pending.values()) {
            clearTimeout(p.timer);
            p.reject(new Error('HCU client stopping'));
        }
        this._pending.clear();
    }

    _connect() {
        if (!hcu.authToken) {
            logger.error('No HCU auth token available.');
            this._reconnectTimer = setTimeout(() => this._connect(), hcu.reconnectDelayMs);
            return;
        }

        const url = `wss://${hcu.host}:${hcu.port}`;
        logger.info(`Connecting to HCU Connect API at ${url}`);
        const ws = new WebSocket(url, {
            headers: {
                authtoken: hcu.authToken,
                'plugin-id': pluginId,
                // Opt into HmipSystemEvent pushes covering the whole system.
                'hmip-system-events': 'true',
            },
            rejectUnauthorized: false,
        });

        ws.on('open', () => {
            logger.info('HCU WebSocket open');
            this._ws = ws;
            this.emit('open');
            this.sendPluginState('READY');
        });
        ws.on('message', (raw) => this._onMessage(raw));
        ws.on('close', (code, reason) => this._onClose(code, reason));
        ws.on('error', (err) =>
            logger.warn('HCU ws error:', err && err.message ? err.message : err),
        );
    }

    _onClose(code, reason) {
        logger.warn(
            `HCU ws closed (${code} ${String(reason || '')}), reconnecting in ${hcu.reconnectDelayMs}ms`,
        );
        this._ws = null;
        this.emit('close');
        if (this._stopping) return;
        this._reconnectTimer = setTimeout(() => this._connect(), hcu.reconnectDelayMs);
    }

    _onMessage(raw) {
        let msg;
        try {
            msg = JSON.parse(raw.toString('utf8'));
        } catch (err) {
            logger.warn('Ignoring non-JSON message from HCU:', err.message);
            return;
        }
        logger.debug('HCU ->', msg.type, msg.id);

        // Correlate HMIP_SYSTEM_RESPONSE back to the awaiting request().
        if (msg.type === 'HMIP_SYSTEM_RESPONSE' && this._pending.has(msg.id)) {
            const p = this._pending.get(msg.id);
            clearTimeout(p.timer);
            this._pending.delete(msg.id);
            p.resolve(msg.body || {});
            return;
        }

        const handler = this._handlers.get(msg.type);
        if (!handler) return;
        Promise.resolve()
            .then(() => handler(msg.body || {}, msg))
            .catch((err) => logger.error(`Handler for ${msg.type} threw:`, err));
    }

    send(type, body, idOrEnvelope) {
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
            logger.warn(`Cannot send ${type}, socket not ready`);
            return;
        }
        const id =
            typeof idOrEnvelope === 'string'
                ? idOrEnvelope
                : (idOrEnvelope && idOrEnvelope.id) || randomUUID();
        const envelope = { pluginId, id, type, body: body || {} };
        logger.debug('HCU <-', type, id);
        this._ws.send(JSON.stringify(envelope));
        return id;
    }

    sendPluginState(pluginReadinessStatus, error) {
        this.send('PLUGIN_STATE_RESPONSE', {
            pluginReadinessStatus,
            ...(error ? { error } : {}),
        });
    }

    /**
     * Send an HMIP_SYSTEM_REQUEST and return a promise that resolves with the
     * matching response body. Rejects on timeout.
     */
    request(path, body = {}) {
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('HCU socket not open'));
        }
        const id = randomUUID();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error(`HMIP_SYSTEM_REQUEST ${path} timed out`));
            }, REQUEST_TIMEOUT_MS);
            this._pending.set(id, { resolve, reject, timer });
            this.send('HMIP_SYSTEM_REQUEST', { path, body }, id);
        });
    }
}

module.exports = { HcuClient };
