'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_INSTALLED_PATH = '/data/config.json';
const DEFAULT_DEV_PATH = path.join(process.cwd(), 'data', 'config.json');

function isWritable(dir) {
    try {
        fs.accessSync(dir, fs.constants.W_OK);
        return true;
    } catch (_) {
        return false;
    }
}

function resolvePath() {
    if (process.env.HMIP_CONFIG_PATH) return process.env.HMIP_CONFIG_PATH;
    if (isWritable('/data')) return DEFAULT_INSTALLED_PATH;
    return DEFAULT_DEV_PATH;
}

class ConfigStore {
    constructor(filePath) {
        this.filePath = filePath || resolvePath();
    }

    load() {
        try {
            return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        } catch (err) {
            if (err.code !== 'ENOENT') {
                // eslint-disable-next-line no-console
                console.warn(`[config-store] Cannot read ${this.filePath}:`, err.message);
            }
            return {};
        }
    }

    save(data) {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
        fs.renameSync(tmp, this.filePath);
    }
}

module.exports = { ConfigStore };
