'use strict';

/**
 * Minimal HTTP server for the dashboard.
 *
 * Routes:
 *   GET  /                   -> index.html
 *   GET  /static/*           -> static assets (css, js, icons)
 *   GET  /api/state          -> projected state (single snapshot)
 *   GET  /api/raw            -> raw HMIP snapshot (for debugging)
 *   GET  /api/events         -> Server-Sent Events stream of updates
 *   POST /api/control        -> {path, body} -> HmipSystemRequest, returns HCU body
 *
 * No framework, no build step, no npm bloat: just Node's http + static files.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const logger = require('./logger');
const cfg = require('./config');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.json': 'application/json; charset=utf-8',
};

function safeJoin(root, rel) {
    const p = path.normalize(path.join(root, rel));
    if (!p.startsWith(root)) return null;
    return p;
}

class WebServer {
    constructor({ stateStore, project, onControl }) {
        this.stateStore = stateStore;
        this.project = project;
        this.onControl = onControl;
        this._server = null;
        this._sseClients = new Set();
        this._stateStore.on('change', () => this._broadcast());
    }

    get _stateStore() {
        return this.stateStore;
    }

    async start() {
        this._server = http.createServer((req, res) => this._handle(req, res));
        await new Promise((resolve) =>
            this._server.listen(cfg.web.port, '0.0.0.0', resolve),
        );
        logger.info(`Dashboard web server listening on :${cfg.web.port}`);
    }

    async stop() {
        for (const c of this._sseClients) c.res.end();
        this._sseClients.clear();
        if (this._server) await new Promise((r) => this._server.close(r));
    }

    _broadcast() {
        if (!this._sseClients.size) return;
        const payload = `data: ${JSON.stringify(this._buildState())}\n\n`;
        for (const c of this._sseClients) {
            try {
                c.res.write(payload);
            } catch (err) {
                logger.debug('SSE write failed:', err.message);
            }
        }
    }

    _buildState() {
        return {
            ts: Date.now(),
            title: cfg.web.title,
            allowControl: cfg.web.allowControl,
            lastSnapshotAt: this.stateStore.lastSnapshotAt,
            ...this.project(this.stateStore),
        };
    }

    async _handle(req, res) {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const path0 = url.pathname;

        try {
            if (req.method === 'GET' && path0 === '/') return this._serveIndex(res);
            if (req.method === 'GET' && path0 === '/favicon.ico')
                return this._serveStatic(res, '/favicon.svg');
            if (req.method === 'GET' && path0.startsWith('/static/'))
                return this._serveStatic(res, path0.slice('/static'.length));
            if (req.method === 'GET' && path0 === '/api/state') {
                return this._json(res, 200, this._buildState());
            }
            if (req.method === 'GET' && path0 === '/api/raw') {
                return this._json(res, 200, this.stateStore.snapshot());
            }
            if (req.method === 'GET' && path0 === '/api/debug/unclassified') {
                const projected = this.project(this.stateStore);
                return this._json(res, 200, {
                    unclassified: projected.unclassified || [],
                    channelTypes: collectChannelTypes(this.stateStore),
                });
            }
            if (req.method === 'GET' && path0 === '/api/events') {
                return this._openSse(req, res);
            }
            if (req.method === 'POST' && path0 === '/api/control') {
                return this._handleControl(req, res);
            }
            res.writeHead(404).end('not found');
        } catch (err) {
            logger.error('Request handling failed:', err);
            if (!res.headersSent) res.writeHead(500).end('internal error');
        }
    }

    _serveIndex(res) {
        const file = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(file, (err, data) => {
            if (err) return res.writeHead(500).end('index missing');
            res.writeHead(200, {
                'Content-Type': MIME['.html'],
                'Cache-Control': 'no-cache',
            });
            res.end(data);
        });
    }

    _serveStatic(res, rel) {
        const file = safeJoin(PUBLIC_DIR, rel);
        if (!file) return res.writeHead(400).end('bad path');
        fs.stat(file, (err, stat) => {
            if (err || !stat.isFile()) return res.writeHead(404).end('not found');
            const ext = path.extname(file).toLowerCase();
            const headers = {
                'Content-Type': MIME[ext] || 'application/octet-stream',
                'Cache-Control': 'public, max-age=600',
            };
            // Allow the service worker served from /static to control the
            // root scope "/". Without this header, the browser would refuse
            // registration because the scope is above the SW's URL.
            if (path.basename(file) === 'sw.js') {
                headers['Service-Worker-Allowed'] = '/';
                headers['Cache-Control'] = 'no-cache';
            }
            res.writeHead(200, headers);
            fs.createReadStream(file).pipe(res);
        });
    }

    _json(res, code, data) {
        res.writeHead(code, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(data));
    }

    _openSse(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        res.write(`retry: 5000\n\n`);
        res.write(`data: ${JSON.stringify(this._buildState())}\n\n`);
        const client = { res };
        this._sseClients.add(client);
        req.on('close', () => this._sseClients.delete(client));
    }

    async _handleControl(req, res) {
        if (!cfg.web.allowControl) {
            return this._json(res, 403, { error: 'control disabled' });
        }
        const body = await readJson(req);
        if (!body || typeof body.path !== 'string') {
            return this._json(res, 400, { error: 'expecting { path, body }' });
        }
        try {
            const result = await this.onControl(body.path, body.body || {});
            return this._json(res, 200, { ok: true, result });
        } catch (err) {
            logger.warn(`control ${body.path} failed:`, err.message);
            return this._json(res, 502, { ok: false, error: err.message });
        }
    }
}

function readJson(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
            } catch (_) {
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
}

function collectChannelTypes(store) {
    const counts = new Map();
    for (const d of store.devices.values()) {
        for (const ch of Object.values(d.functionalChannels || {})) {
            const t = ch.functionalChannelType || '(missing)';
            counts.set(t, (counts.get(t) || 0) + 1);
        }
    }
    return Object.fromEntries(
        Array.from(counts.entries()).sort((a, b) => b[1] - a[1]),
    );
}

module.exports = { WebServer };
