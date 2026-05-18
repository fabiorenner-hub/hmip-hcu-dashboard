'use strict';

/**
 * Projection layer: turn the raw Homematic IP system state into a structure
 * the dashboard UI can consume directly.
 *
 * Background:
 *   - Devices have one or more `functionalChannels`, each with its own type
 *     (SHUTTER_CONTACT_CHANNEL, CLIMATE_SENSOR_CHANNEL, SWITCH_CHANNEL, ...).
 *   - Rooms are modelled as META_GROUPs referencing `(deviceId, channelIndex)`
 *     tuples. Heating/cooling data lives on the per-room HEATING group.
 *
 * The projection groups channels by room, classifies them into categories
 * the UI renders, and extracts the relevant scalar values plus control
 * metadata (what path to call for which action).
 */

// Channel types we surface, in UI-display priority.
const CONTACT_TYPES = new Set([
    'SHUTTER_CONTACT_CHANNEL',
    'ROTARY_HANDLE_CHANNEL',
    'CONTACT_INTERFACE_CHANNEL',
]);
const SMOKE_TYPES = new Set(['SMOKE_DETECTOR_CHANNEL']);
const MOTION_TYPES = new Set(['MOTION_DETECTION_CHANNEL', 'PRESENCE_DETECTION_CHANNEL']);
const WATER_TYPES = new Set(['WATER_SENSOR_CHANNEL']);
const SWITCH_TYPES = new Set([
    'SWITCH_CHANNEL',
    'SWITCH_MEASURING_CHANNEL',
    'MULTI_MODE_INPUT_SWITCH_CHANNEL',
]);
const DIMMER_TYPES = new Set(['DIMMER_CHANNEL', 'NOTIFICATION_LIGHT_CHANNEL']);
const SHUTTER_TYPES = new Set(['SHUTTER_CHANNEL', 'BLIND_CHANNEL']);
const CLIMATE_SENSOR_TYPES = new Set([
    'CLIMATE_SENSOR_CHANNEL',
    'WALL_MOUNTED_THERMOSTAT_PRO_CHANNEL',
    'WALL_MOUNTED_THERMOSTAT_WITHOUT_DISPLAY_CHANNEL',
]);
const VALVE_TYPES = new Set(['HEATING_THERMOSTAT_CHANNEL']);

function windowStateLabel(state) {
    switch (state) {
        case 'OPEN':
            return 'offen';
        case 'TILTED':
            return 'gekippt';
        case 'CLOSED':
            return 'geschlossen';
        default:
            return state || 'unbekannt';
    }
}

/**
 * Build a map roomId -> { id, label, channels: [{deviceId, channelIndex}] }
 * from META_GROUPs in the system.
 */
function buildRooms(state) {
    const rooms = new Map();
    for (const g of state.groups.values()) {
        if (g.type !== 'META') continue;
        rooms.set(g.id, {
            id: g.id,
            label: g.label || 'Raum',
            channels: (g.channels || []).map((c) => `${c.deviceId}#${c.channelIndex}`),
            groupIds: [g.id],
        });
    }
    return rooms;
}

/**
 * For each channel reference, find the room it belongs to (first META group
 * that lists it). Returns Map<channelRef, roomId>.
 */
function buildChannelRoomIndex(rooms) {
    const idx = new Map();
    for (const room of rooms.values()) {
        for (const ref of room.channels) idx.set(ref, room.id);
    }
    return idx;
}

/**
 * Derive a "primary" room per device by looking at all META-group entries
 * that mention any of the device's channels and picking the most common one.
 *
 * HMIP typically only assigns a single functional channel (often channel 1)
 * to a room via META group, while multi-channel actuators expose additional
 * channels (e.g. a shutter + blind channel, or a power-meter channel). Those
 * sibling channels are not listed in the META group and would otherwise end
 * up in the "Ohne Raum" bucket. The device-level fallback keeps them with
 * their siblings.
 */
function buildDeviceRoomIndex(rooms) {
    const counts = new Map(); // deviceId -> Map<roomId, count>
    for (const room of rooms.values()) {
        for (const ref of room.channels) {
            const deviceId = ref.split('#')[0];
            if (!counts.has(deviceId)) counts.set(deviceId, new Map());
            const m = counts.get(deviceId);
            m.set(room.id, (m.get(room.id) || 0) + 1);
        }
    }
    const out = new Map();
    for (const [deviceId, m] of counts) {
        let bestRoom = null;
        let bestCount = -1;
        for (const [roomId, c] of m) {
            if (c > bestCount) {
                bestCount = c;
                bestRoom = roomId;
            }
        }
        if (bestRoom) out.set(deviceId, bestRoom);
    }
    return out;
}

/**
 * For every heating group, find the rooms it covers (via `channels`) and
 * attach a climate summary (target/actual temp, humidity, mode, boost).
 */
function indexHeatingGroups(state) {
    const byRoom = new Map(); // roomId (metaGroupId) -> heating group
    for (const g of state.groups.values()) {
        if (g.type !== 'HEATING') continue;
        const roomId = g.metaGroupId;
        if (roomId) byRoom.set(roomId, g);
    }
    return byRoom;
}

function classifyChannel(ch) {
    const t = ch.functionalChannelType || '';

    // Whitelist pass: fastest and unambiguous for native HMIP channels.
    if (CONTACT_TYPES.has(t)) return 'contact';
    if (SMOKE_TYPES.has(t)) return 'smoke';
    if (MOTION_TYPES.has(t)) return 'motion';
    if (WATER_TYPES.has(t)) return 'water';
    if (SWITCH_TYPES.has(t)) return 'switch';
    if (DIMMER_TYPES.has(t)) return 'dimmer';
    if (SHUTTER_TYPES.has(t)) return 'shutter';
    if (CLIMATE_SENSOR_TYPES.has(t)) return 'climateSensor';
    if (VALVE_TYPES.has(t)) return 'valve';

    // Permissive pass: catches plugin-provided channels whose functional
    // channel type does not match the native HMIP naming (e.g. EXTERNAL_
    // prefixed variants from the Velux or Gardena plugins, or future HMIP
    // device types not yet in the whitelist).
    if (/SHUTTER|BLIND|WINDOW_COVERING|JALOUSIE/.test(t)) return 'shutter';
    if (/DIMMER/.test(t)) return 'dimmer';
    if (/SMOKE/.test(t)) return 'smoke';
    if (/MOTION|PRESENCE/.test(t)) return 'motion';
    if (/WATER_SENSOR|MOISTURE/.test(t)) return 'water';
    if (/CONTACT|SHUTTER_CONTACT|ROTARY/.test(t)) return 'contact';
    if (/SWITCH/.test(t) && typeof ch.on === 'boolean') return 'switch';
    if (/CLIMATE_SENSOR|TEMPERATURE_SENSOR|HUMIDITY/.test(t)) return 'climateSensor';
    if (/THERMOSTAT|HEATING_/.test(t)) return 'valve';

    // Feature-detection pass: last-resort fallback, pure duck typing. If a
    // channel offers a shutterLevel, treat it as a shutter no matter what
    // the type name says.
    if (typeof ch.shutterLevel === 'number') return 'shutter';
    if (typeof ch.dimLevel === 'number' && typeof ch.on !== 'boolean') return 'dimmer';
    if (typeof ch.actualTemperature === 'number' && typeof ch.setPointTemperature !== 'number') {
        return 'climateSensor';
    }
    if (typeof ch.on === 'boolean' && t.endsWith('_CHANNEL')) return 'switch';

    return null;
}

function mapContact(device, channel) {
    return {
        kind: 'contact',
        deviceId: device.id,
        channelIndex: channel.index,
        label: channel.label || device.label || 'Fenster/Tür',
        state: channel.windowState || channel.contactState || null,
        stateLabel: windowStateLabel(channel.windowState || channel.contactState),
        unreach: channel.unreach || false,
        lowBat: channel.lowBat || false,
    };
}

function mapSmoke(device, channel) {
    return {
        kind: 'smoke',
        deviceId: device.id,
        channelIndex: channel.index,
        label: channel.label || device.label || 'Rauchmelder',
        alarmType: channel.smokeDetectorAlarmType || null,
        unreach: channel.unreach || false,
        lowBat: channel.lowBat || false,
    };
}

function mapMotion(device, channel) {
    return {
        kind: 'motion',
        deviceId: device.id,
        channelIndex: channel.index,
        label: channel.label || device.label || 'Bewegungsmelder',
        motionDetected: channel.motionDetected || channel.presenceDetected || false,
        illumination: typeof channel.illumination === 'number' ? channel.illumination : null,
        unreach: channel.unreach || false,
        lowBat: channel.lowBat || false,
    };
}

function mapWater(device, channel) {
    return {
        kind: 'water',
        deviceId: device.id,
        channelIndex: channel.index,
        label: channel.label || device.label || 'Wassersensor',
        waterDetected: channel.waterlevelDetected || channel.moistureDetected || false,
        unreach: channel.unreach || false,
        lowBat: channel.lowBat || false,
    };
}

function mapSwitch(device, channel) {
    return {
        kind: 'switch',
        deviceId: device.id,
        channelIndex: channel.index,
        label: channel.label || device.label || 'Schalter',
        on: Boolean(channel.on),
        powerWatt: typeof channel.currentPowerConsumption === 'number'
            ? channel.currentPowerConsumption
            : null,
        energyWh:
            typeof channel.energyCounter === 'number'
                ? Math.round(channel.energyCounter * 1000) / 1000
                : null,
        unreach: channel.unreach || false,
    };
}

function mapDimmer(device, channel) {
    return {
        kind: 'dimmer',
        deviceId: device.id,
        channelIndex: channel.index,
        label: channel.label || device.label || 'Dimmer',
        dimLevel: typeof channel.dimLevel === 'number' ? channel.dimLevel : 0,
        on: (channel.dimLevel || 0) > 0,
        unreach: channel.unreach || false,
    };
}

function mapShutter(device, channel) {
    return {
        kind: 'shutter',
        deviceId: device.id,
        channelIndex: channel.index,
        label: channel.label || device.label || 'Rollladen',
        shutterLevel: typeof channel.shutterLevel === 'number' ? channel.shutterLevel : null,
        slatsLevel: typeof channel.slatsLevel === 'number' ? channel.slatsLevel : null,
        unreach: channel.unreach || false,
    };
}

function mapClimateSensor(device, channel) {
    return {
        kind: 'climateSensor',
        deviceId: device.id,
        channelIndex: channel.index,
        label: channel.label || device.label || 'Klimasensor',
        actualTemperature:
            typeof channel.actualTemperature === 'number' ? channel.actualTemperature : null,
        humidity: typeof channel.humidity === 'number' ? channel.humidity : null,
        vaporAmount: typeof channel.vaporAmount === 'number' ? channel.vaporAmount : null,
        unreach: channel.unreach || false,
        lowBat: channel.lowBat || false,
    };
}

function mapValve(device, channel) {
    return {
        kind: 'valve',
        deviceId: device.id,
        channelIndex: channel.index,
        label: channel.label || device.label || 'Heizung',
        valvePosition:
            typeof channel.valvePosition === 'number' ? channel.valvePosition : null,
        setPointTemperature:
            typeof channel.setPointTemperature === 'number' ? channel.setPointTemperature : null,
        valveState: channel.valveState || null,
        unreach: channel.unreach || false,
        lowBat: channel.lowBat || false,
    };
}

function project(state) {
    const rooms = buildRooms(state);
    const chanToRoom = buildChannelRoomIndex(rooms);
    const deviceToRoom = buildDeviceRoomIndex(rooms);
    const heatingByRoom = indexHeatingGroups(state);
    const unclassified = [];

    // Accumulators per room.
    const roomBuckets = new Map();
    for (const [id, room] of rooms) {
        roomBuckets.set(id, {
            id,
            label: room.label,
            heatingGroupId: heatingByRoom.get(id)?.id || null,
            climate: null, // filled in below from heating group + sensors
            devices: {
                contacts: [],
                smoke: [],
                motion: [],
                water: [],
                switches: [],
                dimmers: [],
                shutters: [],
                climateSensors: [],
                valves: [],
            },
        });
    }
    const unassigned = {
        id: '__unassigned__',
        label: 'Ohne Raum',
        heatingGroupId: null,
        climate: null,
        devices: {
            contacts: [],
            smoke: [],
            motion: [],
            water: [],
            switches: [],
            dimmers: [],
            shutters: [],
            climateSensors: [],
            valves: [],
        },
    };

    const stats = {
        openContacts: 0,
        totalContacts: 0,
        lightsOn: 0,
        totalSwitchableLights: 0,
        activeSockets: 0,
        totalSockets: 0,
        alarmsActive: 0,
        totalPowerWatt: 0,
        lowBatteryCount: 0,
        unreachCount: 0,
        deviceCount: state.devices ? Object.keys(state.devices).length : 0,
    };

    for (const device of state.devices.values()) {
        const channels = Object.values(device.functionalChannels || {});
        for (const ch of channels) {
            const kind = classifyChannel(ch);
            if (!kind) {
                // Only base channels (index 0) are expected to be unclassified.
                if (ch.index !== 0) {
                    unclassified.push({
                        deviceId: device.id,
                        deviceLabel: device.label,
                        channelIndex: ch.index,
                        channelType: ch.functionalChannelType,
                        keys: Object.keys(ch).filter(
                            (k) =>
                                !['index', 'label', 'groupIndex', 'groups', 'functionalChannelType', 'deviceId']
                                    .includes(k),
                        ),
                    });
                }
                continue;
            }

            const ref = `${device.id}#${ch.index}`;
            // Channel-level mapping first (explicit META-group assignment),
            // device-level fallback second (sibling channel has a room).
            const roomId = chanToRoom.get(ref) || deviceToRoom.get(device.id);
            const bucket = roomId ? roomBuckets.get(roomId) : unassigned;
            if (!bucket) continue;

            switch (kind) {
                case 'contact': {
                    const v = mapContact(device, ch);
                    bucket.devices.contacts.push(v);
                    stats.totalContacts += 1;
                    if (v.state === 'OPEN' || v.state === 'TILTED') stats.openContacts += 1;
                    break;
                }
                case 'smoke': {
                    const v = mapSmoke(device, ch);
                    bucket.devices.smoke.push(v);
                    if (v.alarmType && v.alarmType !== 'IDLE_OFF') stats.alarmsActive += 1;
                    break;
                }
                case 'motion':
                    bucket.devices.motion.push(mapMotion(device, ch));
                    break;
                case 'water': {
                    const v = mapWater(device, ch);
                    bucket.devices.water.push(v);
                    if (v.waterDetected) stats.alarmsActive += 1;
                    break;
                }
                case 'switch': {
                    const v = mapSwitch(device, ch);
                    bucket.devices.switches.push(v);
                    if (typeof v.powerWatt === 'number') stats.totalPowerWatt += v.powerWatt;
                    const isLight = /light|licht|lamp/i.test(v.label || '');
                    if (isLight) {
                        stats.totalSwitchableLights += 1;
                        if (v.on) stats.lightsOn += 1;
                    } else {
                        stats.totalSockets += 1;
                        if (v.on) stats.activeSockets += 1;
                    }
                    break;
                }
                case 'dimmer': {
                    const v = mapDimmer(device, ch);
                    bucket.devices.dimmers.push(v);
                    stats.totalSwitchableLights += 1;
                    if (v.on) stats.lightsOn += 1;
                    break;
                }
                case 'shutter':
                    bucket.devices.shutters.push(mapShutter(device, ch));
                    break;
                case 'climateSensor':
                    bucket.devices.climateSensors.push(mapClimateSensor(device, ch));
                    break;
                case 'valve':
                    bucket.devices.valves.push(mapValve(device, ch));
                    break;
            }
        }

        // Device-level maintenance stats for the header summary.
        const base = Object.values(device.functionalChannels || {}).find(
            (c) => c.index === 0 || c.functionalChannelType?.endsWith('_BASE_CHANNEL'),
        );
        if (base) {
            if (base.lowBat) stats.lowBatteryCount += 1;
            if (base.unreach) stats.unreachCount += 1;
        }
    }

    // Compute per-room climate summary from heating group + sensors.
    for (const bucket of roomBuckets.values()) {
        const g = bucket.heatingGroupId ? state.groups.get(bucket.heatingGroupId) : null;
        const sensor = bucket.devices.climateSensors[0];
        const firstValve = bucket.devices.valves[0];

        const setPoint =
            g?.setPointTemperature ??
            firstValve?.setPointTemperature ??
            null;
        const actual = sensor?.actualTemperature ?? g?.actualTemperature ?? null;
        const humidity = sensor?.humidity ?? g?.humidity ?? null;
        bucket.climate =
            setPoint !== null || actual !== null || humidity !== null
                ? {
                      actualTemperature: actual,
                      setPointTemperature: setPoint,
                      humidity,
                      controlMode: g?.controlMode || null,
                      boostMode: g?.boostMode || false,
                      minSetPoint: typeof g?.minTemperature === 'number' ? g.minTemperature : 5,
                      maxSetPoint: typeof g?.maxTemperature === 'number' ? g.maxTemperature : 30,
                      cooling: g?.cooling || false,
                      windowOpen: g?.windowOpen || false,
                  }
                : null;
    }

    // Drop empty rooms to keep the UI tidy.
    const roomsOut = Array.from(roomBuckets.values()).filter(hasAnyDevices);
    if (hasAnyDevices(unassigned)) roomsOut.push(unassigned);
    roomsOut.sort((a, b) => (a.label || '').localeCompare(b.label || '', 'de'));

    return {
        home: projectHome(state.home),
        stats,
        rooms: roomsOut,
        unclassified,
    };
}

function hasAnyDevices(bucket) {
    const d = bucket.devices;
    return (
        bucket.climate ||
        d.contacts.length ||
        d.smoke.length ||
        d.motion.length ||
        d.water.length ||
        d.switches.length ||
        d.dimmers.length ||
        d.shutters.length ||
        d.climateSensors.length ||
        d.valves.length
    );
}

function projectHome(home) {
    if (!home) return null;
    return {
        id: home.id,
        label: home.label || null,
        currentAPVersion: home.currentAPVersion || null,
        absenceType: home.absenceType || null,
        absenceEndTime: home.absenceEndTime || null,
        cooling: home.cooling || false,
        securityAndAlarmHome:
            home.functionalHomes?.SECURITY_AND_ALARM?.securityZoneActivationMode || null,
        climateControlDisplay: home.functionalHomes?.INDOOR_CLIMATE?.coolingEnabled ? 'cool' : 'heat',
        weather: home.weather
            ? {
                  temperature: home.weather.temperature ?? null,
                  humidity: home.weather.humidity ?? null,
                  weatherCondition: home.weather.weatherCondition ?? null,
                  weatherDayTime: home.weather.weatherDayTime ?? null,
              }
            : null,
    };
}

module.exports = { project };
