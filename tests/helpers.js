// Shared helpers for the Playwright test suite.
//
// The app deliberately doesn't expose its Leaflet map instance globally
// (that was a debug-only hook stripped from production code). Instead we
// patch L.map from the test side, before the page's own scripts run, so
// tests can convert lat/lng to screen coordinates without touching app code.

const { ABBREVIATIONS } = require('../lib/game-logic');

// lib/game-logic.js is loaded as a script in the page, so featureCentroid is
// available as a global there. This function runs inside page.evaluate().
function inPageCentroidScript() {
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
    await page.goto("/index.html");
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
