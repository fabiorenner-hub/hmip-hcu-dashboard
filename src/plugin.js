'use strict';

/**
 * Dashboard plugin: binds the HCU client to an in-memory state cache, keeps
 * the cache current via HmipSystemEvent, and exposes a web UI via a local
 * HTTP server.
 */

const logger = require('./logger');
const { HcuClient } = require('./hcu-client');
const { StateStore } = require('./state-store');
const { WebServer } = require('./web-server');
const { project } = require('./project');
const cfg = require('./config');

class DashboardPlugin {
    constructor() {
        this.hcu = new HcuClient();
        this.state = new StateStore();
        this.web = new WebServer({
            stateStore: this.state,
            project,
            onControl: (path, body) => this.hcu.request(path, body),
        });
    }

    async start() {
        this._wireHcu();
        await this.web.start();
        this.hcu.start();
    }

    async stop() {
        this.hcu.stop();
        await this.web.stop();
    }

    _wireHcu() {
        this.hcu.on('open', async () => {
            logger.info(`Plugin ${cfg.pluginId} connected to HCU, fetching system state.`);
            try {
                const res = await this.hcu.request('/hmip/home/getSystemState', {});
                if (res?.code === 200 && res.body) {
                    this.state.reset(res.body);
                    logger.info(
                        `System state loaded: ${this.state.devices.size} device(s), ${this.state.groups.size} group(s)`,
                    );
                    this.hcu.sendPluginState('READY');
                } else {
                    logger.warn('getSystemState returned unexpected body:', res);
                }
            } catch (err) {
                logger.error('getSystemState failed:', err.message);
                this.hcu.sendPluginState('ERROR');
            }
        });

        this.hcu.on('PLUGIN_STATE_REQUEST', (_body, env) => {
            this.hcu.send(
                'PLUGIN_STATE_RESPONSE',
                { pluginReadinessStatus: 'READY' },
                env,
            );
        });

        this.hcu.on('HMIP_SYSTEM_EVENT', (body) => {
            this.state.applyEvent(body);
        });

        // No devices of our own — we respond with empty sets.
        this.hcu.on('DISCOVER_REQUEST', (_body, env) => {
            this.hcu.send('DISCOVER_RESPONSE', { devices: [], success: true }, env);
        });
        this.hcu.on('STATUS_REQUEST', (_body, env) => {
            this.hcu.send('STATUS_RESPONSE', { devices: [], success: true }, env);
        });

        this.hcu.on('CONFIG_TEMPLATE_REQUEST', (body, env) =>
            this._sendConfigTemplate(body, env),
        );
        this.hcu.on('CONFIG_UPDATE_REQUEST', (body, env) => this._handleConfigUpdate(body, env));

        this.hcu.on('ERROR_RESPONSE', (body) => logger.warn('HCU ERROR_RESPONSE:', body));
    }

    _sendConfigTemplate(body, env) {
        const de = String(body?.languageCode || 'de').toLowerCase().startsWith('de');
        const t = (d, e) => (de ? d : e);
        this.hcu.send(
            'CONFIG_TEMPLATE_RESPONSE',
            {
                groups: {
                    web: {
                        friendlyName: t('Webinterface', 'Web interface'),
                        description: t(
                            'Einstellungen für die lokale Weboberfläche.',
                            'Settings for the local web UI.',
                        ),
                        order: 1,
                    },
                },
                properties: {
                    WEB_PORT: {
                        dataType: 'NUMBER',
                        friendlyName: t('Port', 'Port'),
                        description: t(
                            'TCP-Port für das Webinterface. Aufruf im Browser: http://hcu1-XXXX.local:<Port>',
                            'TCP port for the dashboard. Browse to http://hcu1-XXXX.local:<port>',
                        ),
                        currentValue: cfg.web.port,
                        defaultValue: 8080,
                        minimum: 1025,
                        maximum: 65535,
                        groupId: 'web',
                        order: 1,
                    },
                    WEB_TITLE: {
                        dataType: 'STRING',
                        friendlyName: t('Titel', 'Title'),
                        description: t(
                            'Wird in Browser-Tab und Header angezeigt.',
                            'Shown in the browser tab and header.',
                        ),
                        currentValue: cfg.web.title,
                        maximumLength: 64,
                        groupId: 'web',
                        order: 2,
                    },
                    WEB_ALLOW_CONTROL: {
                        dataType: 'ENUM',
                        friendlyName: t('Steuerung erlauben', 'Allow control'),
                        description: t(
                            'Wenn aus, sind Bedien-Aktionen deaktiviert (reine Anzeige).',
                            'If off, the UI is read-only.',
                        ),
                        currentValue: String(cfg.web.allowControl),
                        values: ['true', 'false'],
                        groupId: 'web',
                        order: 3,
                    },
                },
            },
            env,
        );
    }

    async _handleConfigUpdate(body, env) {
        try {
            const raw = body.properties || {};
            const get = (k) => {
                const v = raw[k];
                if (v && typeof v === 'object' && 'currentValue' in v) return v.currentValue;
                return v;
            };
            const updates = {};
            if (get('WEB_PORT') !== undefined) updates.WEB_PORT = Number(get('WEB_PORT'));
            if (get('WEB_TITLE') !== undefined) updates.WEB_TITLE = String(get('WEB_TITLE'));
            if (get('WEB_ALLOW_CONTROL') !== undefined)
                updates.WEB_ALLOW_CONTROL = String(get('WEB_ALLOW_CONTROL'));
            cfg.applyUpdate(updates);

            // Restart the HTTP server on port change.
            if ('WEB_PORT' in updates) {
                await this.web.stop();
                await this.web.start();
            }

            this.hcu.send(
                'CONFIG_UPDATE_RESPONSE',
                {
                    status: 'APPLIED',
                    message:
                        'Einstellungen gespeichert. Die Weboberfläche ist unter dem neuen Port erreichbar.',
                },
                env,
            );
        } catch (err) {
            logger.error('Config update failed:', err);
            this.hcu.send(
                'CONFIG_UPDATE_RESPONSE',
                { status: 'FAILED', message: err.message },
                env,
            );
        }
    }
}

module.exports = { DashboardPlugin };
