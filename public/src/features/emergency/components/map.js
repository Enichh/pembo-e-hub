// features/emergency/components/map.js
// Emergency SOS location map (SRP: owns ONLY the client-side Leaflet map that
// shows a single SOS location). Depends on the vendored Leaflet global (loaded
// as a classic script in staffdashboard.html before this ES module).
//
// Everything here is client-side: the latitude/longitude already delivered by
// `list_active_sos` is the only input. Tiles come from Carto's free, key-less
// raster basemap over HTTPS (required on Z.com's SSL-terminated hosting).

const PATTERN = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const DEFAULT_ZOOM = 17;

// Self-contained marker built as an inline SVG <divIcon>. This deliberately
// avoids Leaflet's default marker image (`images/marker-icon.png`, etc.), which
// is missing from the vendored `leaflet/` bundle and would otherwise render as
// a broken/absent pin. A divIcon needs no asset files and always draws.
const MARKER_SIZE = 34;
const MARKER_ICON = L.divIcon({
    className: 'sos-map-pin',
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE],
    popupAnchor: [0, -MARKER_SIZE],
    html:
        '<svg width="' + MARKER_SIZE + '" height="' + MARKER_SIZE + '" viewBox="0 0 24 24" '
        + 'fill="#dc2626" stroke="#ffffff" stroke-width="1.5" '
        + 'aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#ffffff" stroke="none"/></svg>',
});

// Photon (komoot) reverse geocoder — free, key-less, CORS-enabled, and built on
// OpenStreetMap data. Unlike Nominatim it lets browsers call it directly (no
// User-Agent header needed) and imposes much gentler rate limits.
const PHOTON_REVERSE = 'https://photon.komoot.io/reverse';
const PHOTON_LANG = 'en';

/** @type {import('leaflet').Map|null} */
let map = null;

/** @type {{ marker: import('leaflet').Marker, coords: [number, number] }|null} */
let state = null;

/**
 * Initialize the single shared map instance and attach it to a host element.
 * Safe to call more than once (no-op if already created).
 *
 * @param {HTMLElement} host Empty element that will hold the map.
 * @returns {import('leaflet').Map}
 */
export function initMap(host) {
    if (map) {
        return map;
    }
    map = L.map(host, {
        center: [14.55, 121.05], // Metro Manila / Taguig fallback before a pin is shown.
        zoom: DEFAULT_ZOOM,
        scrollWheelZoom: true,
    });

    L.tileLayer(PATTERN, {
        attribution: ATTRIBUTION,
        maxZoom: 19,
        detectRetina: true,
    }).addTo(map);

    return map;
}

/**
 * Reposition the shared map (and its single marker) onto a new SOS location.
 * Reuses one marker to avoid stacking pins on repeated opens.
 *
 * @param {number} latitude  SOS latitude (-90..90).
 * @param {number} longitude SOS longitude (-180..180).
 */
export function showLocation(latitude, longitude) {
    if (!map) {
        throw new Error('Map not initialized. Call initMap() first.');
    }
    const coords = [Number(latitude), Number(longitude)];

    if (!state) {
        state = { marker: L.marker(coords, { icon: MARKER_ICON }).addTo(map), coords };
    } else {
        state.marker.setLatLng(coords);
        state.coords = coords;
    }

    map.setView(coords, Math.max(map.getZoom(), DEFAULT_ZOOM));
}

/**
 * Resolve a human-readable address for given coordinates via Photon.
 * Returns null when the location has no describable name (e.g. open water).
 *
 * @param {number} latitude  SOS latitude.
 * @param {number} longitude SOS longitude.
 * @returns {Promise<string|null>} Display address, or null if unavailable.
 */
export async function reverseGeocode(latitude, longitude) {
    const url = PHOTON_REVERSE + '?lon=' + Number(longitude)
        + '&lat=' + Number(latitude)
        + '&limit=1&lang=' + PHOTON_LANG;

    let res;
    try {
        res = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (e) {
        return null;
    }
    if (!res.ok) {
        return null;
    }

    let body;
    try {
        body = await res.json();
    } catch (e) {
        return null;
    }

    const feat = Array.isArray(body && body.features) ? body.features[0] : null;
    if (!feat || !feat.properties) {
        return null;
    }

    return formatAddress(feat.properties);
}

/**
 * Build a single-line address from a Photon `properties` object. Prefers a
 * street name when present, otherwise the place name, and always appends the
 * most specific administrative context that isn't duplicated.
 *
 * @param {Record<string, any>} p Photon feature `properties`.
 * @returns {string|null}
 */
function formatAddress(p) {
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    const type = typeof p.type === 'string' ? p.type : '';
    const house = typeof p.housenumber === 'string' ? p.housenumber.trim() : '';

    // Primary label: house number + street/place name.
    const street = name && type !== 'city' && type !== 'state' && type !== 'country'
        ? (house ? house + ' ' + name : name)
        : '';

    const locality = typeof p.locality === 'string' ? p.locality.trim() : '';
    const city = typeof p.city === 'string' ? p.city.trim() : '';
    const state = typeof p.state === 'string' ? p.state.trim() : '';
    const country = typeof p.country === 'string' ? p.country.trim() : '';

    const parts = [];
    if (street) parts.push(street);
    else if (name) parts.push(name);

    if (locality && locality !== name) parts.push(locality);
    if (city && city !== name && city !== locality) parts.push(city);
    if (state && state !== city) parts.push(state);
    if (country && country !== state) parts.push(country);

    return parts.length ? parts.join(', ') : null;
}

/**
 * Fix a map whose container was `display:none` when initialized (tiles render
 * blank until size is known). Call after the modal becomes visible.
 */
export function refreshSize() {
    if (map) {
        map.invalidateSize();
        if (state) {
            map.setView(state.coords, Math.max(map.getZoom(), DEFAULT_ZOOM));
        }
    }
}

/**
 * Dispose the shared map (clears the marker + instance) so the next open fresh.
 */
export function destroyMap() {
    if (map) {
        map.remove();
        map = null;
        state = null;
    }
}
