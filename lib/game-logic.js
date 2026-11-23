// Pure, browser/Node-compatible helper functions for the Guess the States game.
// Loaded as a plain <script> in the browser (functions become globals on window).
// Required directly from Node for unit tests.

var ABBREVIATIONS = {
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

var MIN_ZOOM = 2;
var MAX_ZOOM = 8;

function featureBBox(geometry) {
    var minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    function walk(coords) {
        if (typeof coords[0] === "number") {
            if (coords[0] < minLon) minLon = coords[0];
            if (coords[0] > maxLon) maxLon = coords[0];
            if (coords[1] < minLat) minLat = coords[1];
            if (coords[1] > maxLat) maxLat = coords[1];
        } else {
            coords.forEach(walk);
        }
    }
    walk(geometry.coordinates);
    return { minLon: minLon, maxLon: maxLon, minLat: minLat, maxLat: maxLat };
}

function transformCoordinates(coords, fn) {
    if (typeof coords[0] === "number") return fn(coords);
    return coords.map(function (c) { return transformCoordinates(c, fn); });
}

// Area-weighted polygon centroid using the shoelace formula.
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
    if (area === 0) {
        return { area: 0, centroid: ring[0].slice().reverse() };
    }
    cx = cx / (6 * area);
    cy = cy / (6 * area);
    return { area: Math.abs(area), centroid: [cy, cx] }; // [lat, lng]
}

function featureCentroid(geometry) {
    var rings;
    if (geometry.type === "Polygon") {
        rings = [geometry.coordinates[0]];
    } else {
        rings = geometry.coordinates.map(function (poly) { return poly[0]; });
    }
    var best = null;
    rings.forEach(function (ring) {
        var result = ringAreaAndCentroid(ring);
        if (!best || result.area > best.area) {
            best = result;
        }
    });
    return best.centroid;
}

// Input marker dimensions scale linearly with zoom level.
function inputDimensions(zoom) {
    var t = (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
    t = Math.max(0, Math.min(1, t));
    return {
        width: Math.round(38 + t * (76 - 38)),
        height: Math.round(16 + t * (28 - 16)),
        fontSize: Math.round((9 + t * (14 - 9)) * 10) / 10
    };
}

// Returns true when guess matches a state's full name or two-letter abbreviation,
// case-insensitively. Leading/trailing whitespace is ignored.
function isCorrectAnswer(guess, stateName) {
    var value = (guess || "").trim().toLowerCase();
    var abbr = (ABBREVIATIONS[stateName] || "").toLowerCase();
    return value === stateName.toLowerCase() || value === abbr;
}

if (typeof module !== "undefined") {
    module.exports = {
        ABBREVIATIONS,
        MIN_ZOOM,
        MAX_ZOOM,
        featureBBox,
        transformCoordinates,
        ringAreaAndCentroid,
        featureCentroid,
        inputDimensions,
        isCorrectAnswer,
    };
}
