'use strict';

/**
 * Authoritative in-memory cache of the Homematic IP system state.
 *
 * Flow:
 *   1. On startup the plugin calls /hmip/home/getSystemState and passes the
 *      full snapshot to `reset()`.
 *   2. Every subsequent HmipSystemEvent carries a transaction object with
 *      one or more push events. `applyEvent()` updates the cache in place
 *      using the same shape as the snapshot (devices keyed by id, groups
 *      keyed by id, home object).
 *   3. Consumers (the HTTP layer) either read `snapshot()` for a full view
 *      or subscribe to `on('change', ...)` to stream live diffs.
 *
 * The event schema is documented in Connect API 6.9 (Homematic IP system
 * events). We handle the types we can detect; unknown push-event types are
 * logged and ignored.
 */

const { EventEmitter } = require('events');
const logger = require('./logger');

class StateStore extends EventEmitter {
    constructor() {
        super();
        this.home = null;
        this.devices = new Map(); // deviceId -> device object
        this.groups = new Map(); // groupId -> group object
        this.clients = new Map(); // clientId -> client object
        this.lastSnapshotAt = 0;
    }

    reset(systemState) {
        if (!systemState || typeof systemState !== 'object') return;
        this.home = systemState.home || null;
        this.devices.clear();
        this.groups.clear();
        this.clients.clear();
        const devices = systemState.devices || {};
        const groups = systemState.groups || {};
        const clients = systemState.clients || {};
        for (const [id, d] of Object.entries(devices)) this.devices.set(id, d);
        for (const [id, g] of Object.entries(groups)) this.groups.set(id, g);
        for (const [id, c] of Object.entries(clients)) this.clients.set(id, c);
        this.lastSnapshotAt = Date.now();
        this.emit('change', { kind: 'reset' });
    }

    applyEvent(body) {
        const tx = body?.eventTransaction;
        if (!tx || !Array.isArray(tx.events)) {
            // Some HCU firmwares wrap events in `pushEvents` instead.
            const events = Object.values(tx?.pushEvents || {});
            if (!events.length) return;
            for (const ev of events) this._applyPushEvent(ev);
            this.emit('change', { kind: 'event', count: events.length });
            return;
        }
        for (const ev of tx.events) this._applyPushEvent(ev);
        this.emit('change', { kind: 'event', count: tx.events.length });
    }

    _applyPushEvent(ev) {
        const type = ev?.pushEventType;
        if (!type) return;
        switch (type) {
            case 'DEVICE_ADDED':
            case 'DEVICE_CHANGED':
                if (ev.device?.id) this.devices.set(ev.device.id, ev.device);
                return;
            case 'DEVICE_REMOVED':
                if (ev.id) this.devices.delete(ev.id);
                return;
            case 'GROUP_ADDED':
            case 'GROUP_CHANGED':
                if (ev.group?.id) this.groups.set(ev.group.id, ev.group);
                return;
            case 'GROUP_REMOVED':
                if (ev.id) this.groups.delete(ev.id);
                return;
            case 'HOME_CHANGED':
                if (ev.home) this.home = ev.home;
                return;
            case 'CLIENT_ADDED':
            case 'CLIENT_CHANGED':
                if (ev.client?.id) this.clients.set(ev.client.id, ev.client);
                return;
            case 'CLIENT_REMOVED':
                if (ev.id) this.clients.delete(ev.id);
                return;
            case 'SECURITY_JOURNAL_CHANGED':
            case 'INCLUSION_REQUESTED':
            case 'DEVICE_CHANNEL_EVENT':
                // Not exposed by the dashboard yet — suppress noise.
                return;
            default:
                logger.debug('Unhandled pushEventType', type);
        }
    }

    snapshot() {
        return {
            lastSnapshotAt: this.lastSnapshotAt,
            home: this.home,
            devices: Object.fromEntries(this.devices),
            groups: Object.fromEntries(this.groups),
            clients: Object.fromEntries(this.clients),
        };
    }

    getDevice(id) {
        return this.devices.get(id);
    }

    getGroup(id) {
        return this.groups.get(id);
    }
}

module.exports = { StateStore };
