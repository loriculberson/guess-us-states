const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
    ABBREVIATIONS,
    MIN_ZOOM,
    MAX_ZOOM,
    featureBBox,
    transformCoordinates,
    ringAreaAndCentroid,
    featureCentroid,
    inputDimensions,
    isCorrectAnswer,
} = require('../lib/game-logic');

// ---------------------------------------------------------------------------
// featureBBox
// ---------------------------------------------------------------------------

describe('featureBBox', () => {
    test('returns correct bounds for a simple Polygon', () => {
        const geometry = {
            type: 'Polygon',
            coordinates: [[[0, 10], [5, 10], [5, 20], [0, 20], [0, 10]]],
        };
        assert.deepStrictEqual(featureBBox(geometry), {
            minLon: 0, maxLon: 5, minLat: 10, maxLat: 20,
        });
    });

    test('spans all sub-polygons in a MultiPolygon', () => {
        const geometry = {
            type: 'MultiPolygon',
            coordinates: [
                [[[- 10, 20], [-5, 20], [-5, 25], [-10, 25], [-10, 20]]],
                [[[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]]],
            ],
        };
        assert.deepStrictEqual(featureBBox(geometry), {
            minLon: -10, maxLon: 3, minLat: 0, maxLat: 25,
        });
    });

    test('handles a single-point degenerate ring', () => {
        const geometry = {
            type: 'Polygon',
            coordinates: [[[7, 42], [7, 42]]],
        };
        assert.deepStrictEqual(featureBBox(geometry), {
            minLon: 7, maxLon: 7, minLat: 42, maxLat: 42,
        });
    });
});

// ---------------------------------------------------------------------------
// transformCoordinates
// ---------------------------------------------------------------------------

describe('transformCoordinates', () => {
    test('applies fn to a leaf coordinate pair', () => {
        const result = transformCoordinates([1, 2], ([x, y]) => [x * 2, y * 2]);
        assert.deepStrictEqual(result, [2, 4]);
    });

    test('applies fn recursively to all leaf pairs in a nested array', () => {
        const coords = [[1, 2], [3, 4]];
        const result = transformCoordinates(coords, ([x, y]) => [x + 1, y + 1]);
        assert.deepStrictEqual(result, [[2, 3], [4, 5]]);
    });

    test('handles three levels of nesting', () => {
        const coords = [[[1, 2], [3, 4]], [[5, 6]]];
        const result = transformCoordinates(coords, ([x, y]) => [x * 10, y * 10]);
        assert.deepStrictEqual(result, [[[10, 20], [30, 40]], [[50, 60]]]);
    });

    test('identity function returns a structurally equal copy', () => {
        const coords = [[-122, 37], [-118, 34]];
        const result = transformCoordinates(coords, (c) => c.slice());
        assert.deepStrictEqual(result, coords);
    });
});

// ---------------------------------------------------------------------------
// ringAreaAndCentroid
// ---------------------------------------------------------------------------

describe('ringAreaAndCentroid', () => {
    test('unit square: area=1, centroid=[0.5, 0.5]', () => {
        // GeoJSON coords are [lon, lat]; centroid is returned as [lat, lon]
        const ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
        const { area, centroid } = ringAreaAndCentroid(ring);
        assert.strictEqual(area, 1);
        assert.deepStrictEqual(centroid, [0.5, 0.5]);
    });

    test('right triangle [[0,0],[3,0],[0,3]]: area=4.5, centroid=[1,1]', () => {
        const ring = [[0, 0], [3, 0], [0, 3], [0, 0]];
        const { area, centroid } = ringAreaAndCentroid(ring);
        assert.strictEqual(area, 4.5);
        assert.deepStrictEqual(centroid, [1, 1]);
    });

    test('degenerate ring (zero area) returns area=0 and reversed first point', () => {
        const ring = [[5, 10], [5, 10], [5, 10]];
        const { area, centroid } = ringAreaAndCentroid(ring);
        assert.strictEqual(area, 0);
        // ring[0].slice().reverse() = [10, 5]
        assert.deepStrictEqual(centroid, [10, 5]);
    });

    test('area is always non-negative regardless of winding order', () => {
        // CW winding (opposite of above unit square)
        const cwRing = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
        const { area } = ringAreaAndCentroid(cwRing);
        assert.ok(area >= 0);
    });
});

// ---------------------------------------------------------------------------
// featureCentroid
// ---------------------------------------------------------------------------

describe('featureCentroid', () => {
    test('Polygon: returns centroid of the outer ring', () => {
        const geometry = {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        };
        assert.deepStrictEqual(featureCentroid(geometry), [0.5, 0.5]);
    });

    test('MultiPolygon: returns centroid of the largest ring', () => {
        // Small 1×1 square at origin, large 4×4 square at (10,10)
        const geometry = {
            type: 'MultiPolygon',
            coordinates: [
                [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],       // area = 1
                [[[10, 10], [14, 10], [14, 14], [10, 14], [10, 10]]], // area = 16
            ],
        };
        assert.deepStrictEqual(featureCentroid(geometry), [12, 12]);
    });

    test('MultiPolygon with single polygon behaves like Polygon', () => {
        const poly = {
            type: 'Polygon',
            coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
        };
        const multi = {
            type: 'MultiPolygon',
            coordinates: [[[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]],
        };
        assert.deepStrictEqual(featureCentroid(poly), featureCentroid(multi));
    });
});

// ---------------------------------------------------------------------------
// inputDimensions
// ---------------------------------------------------------------------------

describe('inputDimensions', () => {
    test('at MIN_ZOOM returns minimum dimensions', () => {
        assert.deepStrictEqual(inputDimensions(MIN_ZOOM), {
            width: 38, height: 16, fontSize: 9,
        });
    });

    test('at MAX_ZOOM returns maximum dimensions', () => {
        assert.deepStrictEqual(inputDimensions(MAX_ZOOM), {
            width: 76, height: 28, fontSize: 14,
        });
    });

    test('at zoom=5 returns interpolated dimensions', () => {
        // t = (5-2)/(8-2) = 0.5
        assert.deepStrictEqual(inputDimensions(5), {
            width: 57, height: 22, fontSize: 11.5,
        });
    });

    test('zoom below MIN_ZOOM clamps to minimum dimensions', () => {
        assert.deepStrictEqual(inputDimensions(0), inputDimensions(MIN_ZOOM));
    });

    test('zoom above MAX_ZOOM clamps to maximum dimensions', () => {
        assert.deepStrictEqual(inputDimensions(20), inputDimensions(MAX_ZOOM));
    });

    test('width and height are integers', () => {
        for (const zoom of [2, 3, 4, 5, 6, 7, 8]) {
            const { width, height } = inputDimensions(zoom);
            assert.ok(Number.isInteger(width), `width at zoom ${zoom} should be an integer`);
            assert.ok(Number.isInteger(height), `height at zoom ${zoom} should be an integer`);
        }
    });
});

// ---------------------------------------------------------------------------
// isCorrectAnswer
// ---------------------------------------------------------------------------

describe('isCorrectAnswer', () => {
    test('exact full name match', () => {
        assert.ok(isCorrectAnswer('Texas', 'Texas'));
    });

    test('full name match is case-insensitive', () => {
        assert.ok(isCorrectAnswer('texas', 'Texas'));
        assert.ok(isCorrectAnswer('TEXAS', 'Texas'));
        assert.ok(isCorrectAnswer('tExAs', 'Texas'));
    });

    test('two-letter abbreviation match', () => {
        assert.ok(isCorrectAnswer('TX', 'Texas'));
    });

    test('abbreviation match is case-insensitive', () => {
        assert.ok(isCorrectAnswer('tx', 'Texas'));
        assert.ok(isCorrectAnswer('Tx', 'Texas'));
    });

    test('multi-word state name match', () => {
        assert.ok(isCorrectAnswer('New York', 'New York'));
        assert.ok(isCorrectAnswer('new york', 'New York'));
        assert.ok(isCorrectAnswer('ny', 'New York'));
        assert.ok(isCorrectAnswer('NY', 'New York'));
    });

    test('wrong answer returns false', () => {
        assert.ok(!isCorrectAnswer('Wyoming', 'Texas'));
    });

    test('partial name returns false', () => {
        assert.ok(!isCorrectAnswer('new', 'New York'));
        assert.ok(!isCorrectAnswer('Tex', 'Texas'));
    });

    test('empty string returns false', () => {
        assert.ok(!isCorrectAnswer('', 'Texas'));
    });

    test('whitespace-only string returns false', () => {
        assert.ok(!isCorrectAnswer('   ', 'Texas'));
    });

    test('leading/trailing whitespace is ignored in a correct answer', () => {
        assert.ok(isCorrectAnswer('  Texas  ', 'Texas'));
        assert.ok(isCorrectAnswer('  tx  ', 'Texas'));
    });

    test('all 50 states are recognised by abbreviation', () => {
        for (const [name, abbr] of Object.entries(ABBREVIATIONS)) {
            assert.ok(
                isCorrectAnswer(abbr, name),
                `${abbr} should be accepted for ${name}`
            );
        }
    });

    test('all 50 states are recognised by full name', () => {
        for (const name of Object.keys(ABBREVIATIONS)) {
            assert.ok(
                isCorrectAnswer(name, name),
                `"${name}" should be accepted for ${name}`
            );
        }
    });
});
