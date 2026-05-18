'use strict';

/* Dashboard client. Pure vanilla JS, no framework. */

const state = {
    data: null,
    view: 'rooms',
    connected: false,
};

const el = {
    overview: document.getElementById('overview'),
    tabs: document.getElementById('tabs'),
    view: document.getElementById('view'),
    title: document.getElementById('app-title'),
    chip: document.getElementById('conn-chip'),
    footer: document.getElementById('footer-info'),
};

// --- Networking -------------------------------------------------------------

function connect() {
    const es = new EventSource('/api/events');
    es.onmessage = (ev) => {
        try {
            const data = JSON.parse(ev.data);
            state.data = data;
            state.connected = true;
            render();
        } catch (err) {
            console.warn('SSE parse', err);
        }
    };
    es.onerror = () => {
        state.connected = false;
        setChip('Verbindung unterbrochen', 'error');
    };
    es.onopen = () => {
        setChip('Live', 'ok');
    };
}

async function control(path, body) {
    try {
        const res = await fetch('/api/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, body }),
        });
        if (!res.ok) {
            const text = await res.text();
            console.warn('control failed', path, text);
        }
    } catch (err) {
        console.warn('control error', err);
    }
}

function setChip(text, cls) {
    el.chip.textContent = text;
    el.chip.classList.remove('ok', 'error');
    if (cls) el.chip.classList.add(cls);
}

// --- Rendering --------------------------------------------------------------

function render() {
    const d = state.data;
    if (!d) return;
    document.title = d.title || 'Smart Home';
    el.title.textContent = d.title || 'Smart Home';
    renderOverview(d);
    renderView(d);
    renderFooter(d);
}

function renderOverview(d) {
    const s = d.stats || {};
    const tiles = [
        {
            label: 'Fenster & Türen',
            value: s.openContacts || 0,
            sub: `${s.totalContacts || 0} insgesamt`,
            cls: s.openContacts > 0 ? 'warn' : 'ok',
        },
        {
            label: 'Alarme aktiv',
            value: s.alarmsActive || 0,
            sub: s.alarmsActive ? 'Bitte prüfen' : 'Alles ruhig',
            cls: s.alarmsActive > 0 ? 'danger' : 'ok',
        },
        {
            label: 'Lichter an',
            value: `${s.lightsOn || 0}`,
            sub: `${s.totalSwitchableLights || 0} schaltbar`,
        },
        {
            label: 'Aktive Steckdosen',
            value: s.activeSockets || 0,
            sub: `${s.totalSockets || 0} insgesamt`,
        },
        {
            label: 'Verbrauch',
            value: `${Math.round(s.totalPowerWatt || 0)} W`,
            sub: 'Summe Messkanäle',
        },
        {
            label: 'Batterie schwach',
            value: s.lowBatteryCount || 0,
            sub: (s.unreachCount || 0) + ' nicht erreichbar',
            cls: s.lowBatteryCount > 0 || s.unreachCount > 0 ? 'warn' : undefined,
        },
    ];
    el.overview.innerHTML =
        weatherTile(d.home?.weather) +
        tiles
            .map(
                (t) => `
            <div class="kpi">
                <div class="label">${t.label}</div>
                <div class="value ${t.cls || ''}">${t.value}</div>
                <div class="sub">${t.sub || ''}</div>
            </div>`,
            )
            .join('');
}

// HMIP weather conditions -> compact emoji + German label. The set comes
// straight from the Connect API `Weather.weatherCondition` enum.
const WEATHER_ICON = {
    CLEAR: ['☀️', 'Klar'],
    LIGHT_CLOUDY: ['🌤️', 'Leicht bewölkt'],
    CLOUDY: ['☁️', 'Bewölkt'],
    HEAVILY_CLOUDY: ['☁️', 'Stark bewölkt'],
    HEAVILY_CLOUDY_WITH_RAIN: ['🌧️', 'Stark bewölkt, Regen'],
    HEAVILY_CLOUDY_WITH_STRONG_RAIN: ['🌧️', 'Starker Regen'],
    HEAVILY_CLOUDY_WITH_SNOW: ['🌨️', 'Stark bewölkt, Schnee'],
    HEAVILY_CLOUDY_WITH_RAIN_AND_SNOW: ['🌨️', 'Regen & Schnee'],
    HEAVILY_CLOUDY_WITH_THUNDER: ['⛈️', 'Gewitter'],
    HEAVILY_CLOUDY_WITH_RAIN_AND_THUNDER: ['⛈️', 'Regen & Gewitter'],
    FOGGY: ['🌫️', 'Nebel'],
    STRONG_WIND: ['💨', 'Starker Wind'],
    UNKNOWN: ['🌡️', 'Unbekannt'],
};

function weatherTile(w) {
    if (!w) return '';
    const [icon, label] = WEATHER_ICON[w.weatherCondition] ||
        WEATHER_ICON[w.weatherDayTime] || ['🌡️', '—'];
    const temp =
        typeof w.temperature === 'number' ? `${w.temperature.toFixed(1)} °C` : '—';
    const hum = typeof w.humidity === 'number' ? `${Math.round(w.humidity)} %` : null;
    const sub = [label, hum ? `${hum} rel. Luftfeuchte` : null].filter(Boolean).join(' · ');
    return `
        <div class="kpi weather-kpi">
            <div class="label">Wetter</div>
            <div class="value"><span class="weather-icon">${icon}</span>${temp}</div>
            <div class="sub">${escapeHtml(sub)}</div>
        </div>
    `;
}

function renderView(d) {
    switch (state.view) {
        case 'windows':
            return renderWindowsView(d);
        case 'climate':
            return renderClimateView(d);
        case 'lights':
            return renderLightsView(d);
        case 'shutters':
            return renderShuttersView(d);
        case 'safety':
            return renderSafetyView(d);
        case 'maintenance':
            return renderMaintenanceView(d);
        case 'rooms':
        default:
            return renderRoomsView(d);
    }
}

function setView(view) {
    state.view = view;
    for (const t of el.tabs.querySelectorAll('.tab')) {
        t.classList.toggle('active', t.dataset.view === view);
    }
    if (state.data) renderView(state.data);
}

el.tabs.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.tab');
    if (btn) setView(btn.dataset.view);
});

// --- Views ------------------------------------------------------------------

function renderRoomsView(d) {
    const rooms = d.rooms || [];
    if (!rooms.length) return renderEmpty('Keine Räume gefunden.');
    el.view.innerHTML = rooms.map(renderRoomCard).join('');
    wireControls();
}

function renderRoomCard(room) {
    const climate = room.climate ? renderClimate(room) : '';
    const contacts = room.devices.contacts.length
        ? section(
              'Fenster & Türen',
              room.devices.contacts.map(renderContactRow).join(''),
          )
        : '';
    const switches =
        room.devices.switches.length || room.devices.dimmers.length
            ? section(
                  'Licht & Steckdosen',
                  [
                      ...room.devices.switches.map(renderSwitchRow),
                      ...room.devices.dimmers.map(renderDimmerRow),
                  ].join(''),
              )
            : '';
    const shutters = room.devices.shutters.length
        ? section(
              'Rollläden',
              renderRoomShutterActions(room) +
                  room.devices.shutters.map(renderShutterRow).join(''),
          )
        : '';
    const alarms = [];
    if (room.devices.smoke.length)
        alarms.push(...room.devices.smoke.map(renderSmokeRow));
    if (room.devices.motion.length)
        alarms.push(...room.devices.motion.map(renderMotionRow));
    if (room.devices.water.length)
        alarms.push(...room.devices.water.map(renderWaterRow));
    const alarmSection = alarms.length ? section('Sensoren', alarms.join('')) : '';

    const chips = [];
    if (room.devices.contacts.length)
        chips.push(
            `<span class="device-chip"><span class="dot"></span>${room.devices.contacts.length}× Kontakt</span>`,
        );
    if (room.devices.switches.length || room.devices.dimmers.length)
        chips.push(
            `<span class="device-chip"><span class="dot"></span>${
                room.devices.switches.length + room.devices.dimmers.length
            }× Schalter</span>`,
        );
    if (room.devices.valves.length)
        chips.push(
            `<span class="device-chip"><span class="dot"></span>${room.devices.valves.length}× Heizung</span>`,
        );

    return `
        <div class="card room-card">
            <div class="card-head">
                <h2>${escapeHtml(room.label)}</h2>
                <span class="room-meta">${chips.join(' ')}</span>
            </div>
            <div class="card-body">
                ${climate}
                ${contacts}
                ${alarmSection}
                ${switches}
                ${shutters}
            </div>
        </div>
    `;
}

function renderClimate(room) {
    const c = room.climate;
    const actual =
        c.actualTemperature !== null && c.actualTemperature !== undefined
            ? `${c.actualTemperature.toFixed(1)} °C`
            : '—';
    const humidity = c.humidity !== null ? `${Math.round(c.humidity)} %` : '—';
    const sp = c.setPointTemperature;
    const spDisplay = sp !== null && sp !== undefined ? `${sp.toFixed(1)} °C` : '—';
    const min = c.minSetPoint;
    const max = c.maxSetPoint;
    const disabled = !d_allowControl() || !room.heatingGroupId ? 'disabled' : '';
    const slider =
        sp !== null && room.heatingGroupId
            ? `
        <div class="setpoint-row">
            <input class="slider setpoint-slider"
                   data-group="${room.heatingGroupId}"
                   min="${min}" max="${max}" step="0.5"
                   value="${sp}" ${disabled} />
            <span class="val">${spDisplay}</span>
        </div>`
            : '';
    const flags = [];
    if (c.boostMode) flags.push('<span class="badge tilted">Boost</span>');
    if (c.windowOpen) flags.push('<span class="badge open">Fenster offen</span>');
    if (c.cooling) flags.push('<span class="badge dim">Kühlen</span>');
    const flagsHtml = flags.length ? `<div>${flags.join(' ')}</div>` : '';

    return `
        <div class="section">
            <div class="climate-big">
                <div class="climate-metric">
                    <div class="l">Temperatur</div>
                    <div class="v">${actual}</div>
                </div>
                <div class="climate-metric">
                    <div class="l">Luftfeuchte</div>
                    <div class="v">${humidity}</div>
                </div>
            </div>
            ${slider}
            ${flagsHtml}
        </div>
    `;
}

function renderContactRow(c) {
    const cls = c.state === 'OPEN' ? 'open' : c.state === 'TILTED' ? 'tilted' : 'closed';
    return `<div class="row"><span class="label">${escapeHtml(c.label)}</span><span class="badge ${cls}">${escapeHtml(c.stateLabel)}</span></div>`;
}

function renderSmokeRow(s) {
    const active = s.alarmType && s.alarmType !== 'IDLE_OFF';
    return `<div class="row"><span class="label">🚨 ${escapeHtml(s.label)}</span><span class="badge ${active ? 'danger' : 'closed'}">${active ? 'ALARM' : 'OK'}</span></div>`;
}

function renderMotionRow(m) {
    const ill = m.illumination !== null ? ` · ${Math.round(m.illumination)} lx` : '';
    return `<div class="row"><span class="label">👟 ${escapeHtml(m.label)}${ill}</span><span class="badge ${m.motionDetected ? 'tilted' : 'dim'}">${m.motionDetected ? 'aktiv' : 'ruhig'}</span></div>`;
}

function renderWaterRow(w) {
    return `<div class="row"><span class="label">💧 ${escapeHtml(w.label)}</span><span class="badge ${w.waterDetected ? 'danger' : 'closed'}">${w.waterDetected ? 'Wasser' : 'trocken'}</span></div>`;
}

function renderSwitchRow(s) {
    const disabled = !d_allowControl() ? 'disabled' : '';
    const power = s.powerWatt !== null ? ` · ${Math.round(s.powerWatt)} W` : '';
    return `
        <div class="row">
            <span class="label">${escapeHtml(s.label)}${power}</span>
            <button class="toggle switch-toggle ${s.on ? 'on' : ''}"
                    data-device="${s.deviceId}" data-channel="${s.channelIndex}" data-on="${!s.on}"
                    ${disabled}>${s.on ? 'An' : 'Aus'}</button>
        </div>
    `;
}

function renderDimmerRow(s) {
    const disabled = !d_allowControl() ? 'disabled' : '';
    const pct = Math.round((s.dimLevel || 0) * 100);
    return `
        <div class="row control-row">
            <span class="label">💡 ${escapeHtml(s.label)}</span>
            <div class="controls">
                <button class="toggle light-toggle ${s.on ? 'on' : ''}"
                        data-device="${s.deviceId}" data-channel="${s.channelIndex}"
                        data-level="${s.on ? 0 : 1}" ${disabled}
                        title="${s.on ? 'Aus' : 'An'}">${s.on ? 'An' : 'Aus'}</button>
                <div class="slider-wrap">
                    <input class="slider dimmer-slider"
                           data-device="${s.deviceId}" data-channel="${s.channelIndex}"
                           min="0" max="1" step="0.05" value="${s.dimLevel || 0}" ${disabled} />
                </div>
                <span class="val">${pct}%</span>
            </div>
        </div>
    `;
}

function renderShutterRow(s) {
    const disabled = !d_allowControl() ? 'disabled' : '';
    const level = s.shutterLevel ?? 0;
    const pct = Math.round(level * 100);
    const stateLabel = level <= 0.02 ? 'offen' : level >= 0.98 ? 'zu' : `${pct} % zu`;
    return `
        <div class="row shutter-row">
            <div class="shutter-head">
                <span class="label">🪟 ${escapeHtml(s.label)}</span>
                <span class="badge ${level >= 0.98 ? 'closed' : level <= 0.02 ? 'tilted' : 'dim'}">${stateLabel}</span>
            </div>
            <div class="shutter-actions">
                <button class="btn btn-lg shutter-up"
                        data-device="${s.deviceId}" data-channel="${s.channelIndex}"
                        ${disabled} title="Hoch">⬆ Hoch</button>
                <button class="btn btn-lg shutter-stop"
                        data-device="${s.deviceId}" data-channel="${s.channelIndex}"
                        ${disabled} title="Stopp">⏹ Stop</button>
                <button class="btn btn-lg shutter-down"
                        data-device="${s.deviceId}" data-channel="${s.channelIndex}"
                        ${disabled} title="Runter">⬇ Runter</button>
            </div>
            <div class="shutter-slider-row">
                <span class="slider-end">offen</span>
                <input class="slider shutter-slider"
                       data-device="${s.deviceId}" data-channel="${s.channelIndex}"
                       min="0" max="1" step="0.05" value="${level}" ${disabled} />
                <span class="slider-end">zu</span>
            </div>
        </div>
    `;
}

function renderRoomShutterActions(room) {
    if (!d_allowControl() || room.devices.shutters.length < 2) return '';
    const refs = JSON.stringify(
        room.devices.shutters.map((s) => ({ deviceId: s.deviceId, channelIndex: s.channelIndex })),
    );
    return `
        <div class="group-actions">
            <button class="btn group-shutter" data-level="0" data-refs='${escapeAttr(refs)}'>⬆ Alle hoch</button>
            <button class="btn group-shutter" data-level="1" data-refs='${escapeAttr(refs)}'>⬇ Alle runter</button>
        </div>
    `;
}

function escapeAttr(s) {
    return String(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// --- Focused tabs ---

function renderWindowsView(d) {
    const items = (d.rooms || []).flatMap((r) =>
        r.devices.contacts.map((c) => ({ ...c, room: r.label })),
    );
    if (!items.length) return renderEmpty('Keine Fenster- oder Türkontakte gefunden.');
    items.sort((a, b) => {
        const rank = (s) => (s === 'OPEN' ? 0 : s === 'TILTED' ? 1 : 2);
        return rank(a.state) - rank(b.state) || a.room.localeCompare(b.room, 'de');
    });
    el.view.innerHTML = `
        <div class="card">
            <div class="card-head"><h2>Fenster & Türen</h2><span class="room-meta">${items.length} Kontakte</span></div>
            <div class="card-body">
                ${items.map((c) => renderContactRowWithRoom(c)).join('')}
            </div>
        </div>
    `;
}

function renderContactRowWithRoom(c) {
    const cls = c.state === 'OPEN' ? 'open' : c.state === 'TILTED' ? 'tilted' : 'closed';
    return `<div class="row"><span class="label">${escapeHtml(c.room)} – ${escapeHtml(c.label)}</span><span class="badge ${cls}">${escapeHtml(c.stateLabel)}</span></div>`;
}

function renderClimateView(d) {
    const cards = (d.rooms || [])
        .filter((r) => r.climate)
        .map((r) => `
            <div class="card">
                <div class="card-head"><h2>${escapeHtml(r.label)}</h2></div>
                <div class="card-body">${renderClimate(r)}</div>
            </div>
        `)
        .join('');
    el.view.innerHTML = cards || emptyCard('Keine Klimadaten verfügbar.');
    wireControls();
}

function renderLightsView(d) {
    const rooms = (d.rooms || []).filter(
        (r) => r.devices.switches.length || r.devices.dimmers.length,
    );
    if (!rooms.length) return renderEmpty('Keine schaltbaren Geräte gefunden.');
    el.view.innerHTML = rooms
        .map(
            (r) => `
            <div class="card">
                <div class="card-head"><h2>${escapeHtml(r.label)}</h2></div>
                <div class="card-body">
                    ${r.devices.switches.map(renderSwitchRow).join('')}
                    ${r.devices.dimmers.map(renderDimmerRow).join('')}
                </div>
            </div>
        `,
        )
        .join('');
    wireControls();
}

function renderShuttersView(d) {
    const rooms = (d.rooms || []).filter((r) => r.devices.shutters.length);
    if (!rooms.length) return renderEmpty('Keine Rollläden gefunden.');
    el.view.innerHTML = rooms
        .map(
            (r) => `
            <div class="card">
                <div class="card-head"><h2>${escapeHtml(r.label)}</h2></div>
                <div class="card-body">
                    ${r.devices.shutters.map(renderShutterRow).join('')}
                </div>
            </div>
        `,
        )
        .join('');
    wireControls();
}

function renderSafetyView(d) {
    const smoke = [];
    const motion = [];
    const water = [];
    for (const r of d.rooms || []) {
        for (const s of r.devices.smoke) smoke.push({ ...s, room: r.label });
        for (const m of r.devices.motion) motion.push({ ...m, room: r.label });
        for (const w of r.devices.water) water.push({ ...w, room: r.label });
    }
    if (!smoke.length && !motion.length && !water.length)
        return renderEmpty('Keine Sicherheitssensoren gefunden.');
    el.view.innerHTML = `
        ${smoke.length ? card('Rauchmelder', smoke.map((s) => renderContactLikeRow('🚨', s.room, s.label, s.alarmType && s.alarmType !== 'IDLE_OFF' ? 'danger' : 'closed', s.alarmType && s.alarmType !== 'IDLE_OFF' ? 'ALARM' : 'OK')).join('')) : ''}
        ${water.length ? card('Wassersensoren', water.map((w) => renderContactLikeRow('💧', w.room, w.label, w.waterDetected ? 'danger' : 'closed', w.waterDetected ? 'Wasser' : 'trocken')).join('')) : ''}
        ${motion.length ? card('Bewegung & Anwesenheit', motion.map((m) => renderContactLikeRow('👟', m.room, m.label, m.motionDetected ? 'tilted' : 'dim', m.motionDetected ? 'aktiv' : 'ruhig')).join('')) : ''}
    `;
}

function renderMaintenanceView(d) {
    const s = d.stats || {};
    el.view.innerHTML = `
        <div class="card">
            <div class="card-head"><h2>System</h2></div>
            <div class="card-body">
                ${row('Geräte gesamt', `${s.deviceCount || 0}`)}
                ${row('Batterie schwach', `${s.lowBatteryCount || 0}`, s.lowBatteryCount ? 'danger' : 'closed')}
                ${row('Nicht erreichbar', `${s.unreachCount || 0}`, s.unreachCount ? 'danger' : 'closed')}
            </div>
        </div>
    `;
}

// --- Helpers ---------------------------------------------------------------

function row(label, value, badgeCls = 'dim') {
    return `<div class="row"><span class="label">${escapeHtml(label)}</span><span class="badge ${badgeCls}">${escapeHtml(String(value))}</span></div>`;
}

function renderContactLikeRow(icon, room, label, cls, value) {
    return `<div class="row"><span class="label">${icon} ${escapeHtml(room)} – ${escapeHtml(label)}</span><span class="badge ${cls}">${escapeHtml(value)}</span></div>`;
}

function card(title, bodyHtml) {
    return `<div class="card"><div class="card-head"><h2>${escapeHtml(title)}</h2></div><div class="card-body">${bodyHtml}</div></div>`;
}

function section(title, body) {
    return `<div class="section"><div class="section-title">${escapeHtml(title)}</div>${body}</div>`;
}

function renderEmpty(msg) {
    el.view.innerHTML = emptyCard(msg);
}

function emptyCard(msg) {
    return `<div class="card"><div class="empty">${escapeHtml(msg)}</div></div>`;
}

function renderFooter(d) {
    const ts = d.lastSnapshotAt ? new Date(d.lastSnapshotAt).toLocaleTimeString('de-DE') : '—';
    el.footer.textContent = `Stand: ${ts} · ${d.stats.deviceCount} Geräte · ${d.rooms.length} Räume`;
}

function d_allowControl() {
    return state.data?.allowControl !== false;
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function throttle(fn, ms) {
    let last = 0;
    let pending = null;
    return (...args) => {
        const now = Date.now();
        if (now - last >= ms) {
            last = now;
            fn(...args);
        } else {
            clearTimeout(pending);
            pending = setTimeout(() => {
                last = Date.now();
                fn(...args);
            }, ms - (now - last));
        }
    };
}

function wireControls() {
    // Switch toggles
    for (const btn of el.view.querySelectorAll('.switch-toggle')) {
        btn.addEventListener('click', (ev) => {
            const b = ev.currentTarget;
            const deviceId = b.dataset.device;
            const channelIndex = Number(b.dataset.channel);
            const on = b.dataset.on === 'true';
            control('/hmip/device/control/setSwitchState', {
                deviceId,
                channelIndex,
                on,
            });
        });
    }
    // Light (dimmer) on/off toggle — resume to 100% when turning back on.
    for (const btn of el.view.querySelectorAll('.light-toggle')) {
        btn.addEventListener('click', (ev) => {
            const b = ev.currentTarget;
            control('/hmip/device/control/setDimLevel', {
                deviceId: b.dataset.device,
                channelIndex: Number(b.dataset.channel),
                dimLevel: Number(b.dataset.level),
            });
        });
    }
    // Dimmer sliders: commit only on release so dragging doesn't spam the HCU.
    for (const sl of el.view.querySelectorAll('.dimmer-slider')) {
        sl.addEventListener('change', (ev) => {
            const s = ev.currentTarget;
            control('/hmip/device/control/setDimLevel', {
                deviceId: s.dataset.device,
                channelIndex: Number(s.dataset.channel),
                dimLevel: Number(s.value),
            });
        });
    }
    // Shutter: dedicated Up/Stop/Down buttons plus a slider for fine control.
    for (const btn of el.view.querySelectorAll('.shutter-up')) {
        btn.addEventListener('click', (ev) => {
            const b = ev.currentTarget;
            control('/hmip/device/control/setShutterLevel', {
                deviceId: b.dataset.device,
                channelIndex: Number(b.dataset.channel),
                shutterLevel: 0,
            });
        });
    }
    for (const btn of el.view.querySelectorAll('.shutter-down')) {
        btn.addEventListener('click', (ev) => {
            const b = ev.currentTarget;
            control('/hmip/device/control/setShutterLevel', {
                deviceId: b.dataset.device,
                channelIndex: Number(b.dataset.channel),
                shutterLevel: 1,
            });
        });
    }
    for (const btn of el.view.querySelectorAll('.shutter-stop')) {
        btn.addEventListener('click', (ev) => {
            const b = ev.currentTarget;
            control('/hmip/device/control/stop', {
                deviceId: b.dataset.device,
                channelIndex: Number(b.dataset.channel),
            });
        });
    }
    for (const sl of el.view.querySelectorAll('.shutter-slider')) {
        sl.addEventListener('change', (ev) => {
            const s = ev.currentTarget;
            control('/hmip/device/control/setShutterLevel', {
                deviceId: s.dataset.device,
                channelIndex: Number(s.dataset.channel),
                shutterLevel: Number(s.value),
            });
        });
    }
    // Group actions: fire one HmipSystemRequest per device. (The HCU doesn't
    // expose a bulk "all shutters in meta group" call directly; iterating
    // stays well within the 10+ req/s budget for a typical household.)
    for (const btn of el.view.querySelectorAll('.group-shutter')) {
        btn.addEventListener('click', (ev) => {
            const b = ev.currentTarget;
            const level = Number(b.dataset.level);
            let refs = [];
            try {
                refs = JSON.parse(b.dataset.refs);
            } catch (_) {
                return;
            }
            for (const r of refs) {
                control('/hmip/device/control/setShutterLevel', {
                    deviceId: r.deviceId,
                    channelIndex: r.channelIndex,
                    shutterLevel: level,
                });
            }
        });
    }
    // Setpoint sliders (heating group)
    for (const sl of el.view.querySelectorAll('.setpoint-slider')) {
        sl.addEventListener('change', (ev) => {
            const s = ev.currentTarget;
            control('/hmip/group/heating/setSetPointTemperature', {
                groupId: s.dataset.group,
                setPointTemperature: Number(s.value),
            });
        });
    }
}

// --- Boot ------------------------------------------------------------------

connect();
