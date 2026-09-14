// Shared helpers for the Playwright test suite.
//
// The app deliberately doesn't expose its Leaflet map instance globally
// (that was a debug-only hook stripped from production code). Instead we
// patch L.map from the test side, before the page's own scripts run, so
// tests can convert lat/lng to screen coordinates without touching app code.

const ABBREVIATIONS = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
    "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY"
};

// Same area-weighted centroid formula as leaflet.js's featureCentroid, kept
// in sync manually since it's duplicated for test-side use only.
function inPageCentroidScript() {
    function ringAreaAndCentroid(ring) {
        var area = 0, cx = 0, cy = 0;
        for (var i = 0; i < ring.length - 1; i++) {
            var x0 = ring[i][0], y0 = ring[i][1];
            var x1 = ring[i + 1][0], y1 = ring[i + 1][1];
            var cross = x0 * y1 - x1 * y0;
            area += cross;
            cx += (x0 + x1) * cross;
            cy += (y0 + y1) * cross;
        }
        area = area / 2;
        if (area === 0) return { area: 0, centroid: ring[0].slice().reverse() };
        cx = cx / (6 * area);
        cy = cy / (6 * area);
        return { area: Math.abs(area), centroid: [cy, cx] };
    }
    function featureCentroid(geometry) {
        var rings = geometry.type === "Polygon"
            ? [geometry.coordinates[0]]
            : geometry.coordinates.map(function (poly) { return poly[0]; });
        var best = null;
        rings.forEach(function (ring) {
            var result = ringAreaAndCentroid(ring);
            if (!best || result.area > best.area) best = result;
        });
        return best.centroid;
    }
    var byName = {};
    window.US_STATES_GEOJSON.features.forEach(function (f) {
        byName[f.properties.name] = featureCentroid(f.geometry);
    });
    return byName;
}

/** Call before page.goto() so window.__testMap is set once the app creates its map. */
async function installMapHook(page) {
    await page.addInitScript(() => {
        let realL;
        Object.defineProperty(window, "L", {
            configurable: true,
            get() { return realL; },
            set(value) {
                realL = value;
                const originalMap = value.map;
                value.map = function (...args) {
                    const instance = originalMap.apply(value, args);
                    window.__testMap = instance;
                    return instance;
                };
            }
        });
    });
}

async function gotoGame(page) {
    await installMapHook(page);
    await page.goto("/leaflet.html");
    await page.waitForSelector(".leaflet-interactive");
}

async function getCentroids(page) {
    return page.evaluate(inPageCentroidScript);
}

/** Click the map at a state's polygon centroid, opening its input if not already open. */
async function clickState(page, name, centroids) {
    const mapRect = await page.evaluate(() => document.getElementById("map").getBoundingClientRect());
    const point = await page.evaluate(
        (latlng) => window.__testMap.latLngToContainerPoint(latlng),
        centroids[name]
    );
    await page.mouse.click(point.x + mapRect.left, point.y + mapRect.top);
}

/**
 * Like clickState, but for opening a state's input for the first time.
 * A state's true centroid can sit right at the edge of the default view
 * (Alaska's mainland centroid is a real example), so a first click there can
 * miss the rendered polygon. Zoom in on the centroid and retry once before
 * giving up, then restore the original view.
 */
async function openState(page, name, centroids) {
    const before = await page.locator('.state-input').count();
    await clickState(page, name, centroids);

    if ((await page.locator('.state-input').count()) === before) {
        await page.evaluate((c) => window.__testMap.setView(c, 7, { animate: false }), centroids[name]);
        await page.waitForTimeout(150);
        await clickState(page, name, centroids);
        await page.evaluate(() => window.__testMap.setView([40, -97], 4, { animate: false }));
        await page.waitForTimeout(50);
    }
}

function inputFor(page, name) {
    return page.locator(`input[data-state="${name}"]`);
}

async function setZoom(page, zoom) {
    await page.evaluate((z) => window.__testMap.setZoom(z, { animate: false }), zoom);
    await page.waitForTimeout(100);
}

module.exports = {
    ABBREVIATIONS,
    gotoGame,
    getCentroids,
    clickState,
    openState,
    inputFor,
    setZoom,
};
