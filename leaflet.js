(function () {
    "use strict";

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

    // States too small/crowded to hold an input on their own borders.
    // Each gets a callout box out in the Atlantic, connected by a line.
    var CALLOUT_ANCHORS = {
        "Vermont": [46.5, -63],
        "New Hampshire": [45.0, -63],
        "Massachusetts": [43.5, -63],
        "Rhode Island": [42.0, -63],
        "Connecticut": [40.5, -63],
        "New Jersey": [39.0, -63],
        "Delaware": [37.5, -63],
        "Maryland": [36.0, -63]
    };

    var TOTAL_STATES = 50;
    var MIN_ZOOM = 3;
    var MAX_ZOOM = 8;

    var map = L.map("map", {
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        maxBounds: L.latLngBounds([[3, -180], [78, -40]]),
        maxBoundsViscosity: 1.0
    }).setView([40, -97], 4);

    var baseStyle = {
        color: "#34495e",
        weight: 1.2,
        fillColor: "#f4e9d8",
        fillOpacity: 0.9
    };

    var hoverStyle = { weight: 2.5, fillOpacity: 1 };
    var answeredFill = "#c8e6c9";

    // name -> { layer, marker, line, answered }
    var stateData = {};

    // Proper area-weighted polygon centroid (shoelace formula), not a plain
    // vertex average - a vertex average drifts outside concave/jagged
    // coastlines (Michigan, Maine, New York, ...).
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

    function updateProgress() {
        var answered = 0;
        Object.keys(stateData).forEach(function (name) {
            if (stateData[name].answered) answered++;
        });
        document.getElementById("progress").textContent = answered + " / " + TOTAL_STATES + " answered";
        document.getElementById("submit-btn").disabled = (answered !== TOTAL_STATES);
    }

    // Input markers scale with zoom so they stay well-separated at low zoom
    // (where states are small on screen) without being tiny at high zoom.
    function inputDimensions(zoom) {
        var t = (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
        t = Math.max(0, Math.min(1, t));
        return {
            width: Math.round(38 + t * (76 - 38)),
            height: Math.round(16 + t * (28 - 16)),
            fontSize: Math.round((9 + t * (14 - 9)) * 10) / 10
        };
    }

    function buildIcon(dims, value, answered, name) {
        var safeValue = (value || "").replace(/"/g, "&quot;");
        var safeName = (name || "").replace(/"/g, "&quot;");
        var cls = "state-input" + (answered ? " answered" : "");
        var style = "width:" + dims.width + "px;height:" + dims.height + "px;font-size:" + dims.fontSize + "px;";
        var html = '<input type="text" class="' + cls + '" style="' + style + '" ' +
            'data-state="' + safeName + '" aria-label="' + safeName + ' answer" ' +
            'value="' + safeValue + '" autocomplete="off" spellcheck="false" />';
        return L.divIcon({
            className: "state-input-icon",
            html: html,
            iconSize: [dims.width, dims.height],
            iconAnchor: [dims.width / 2, dims.height / 2]
        });
    }

    // The state whose input last received focus. Only one empty input
    // should be open at a time, so focusing a different state's input
    // closes this one first if the user never typed anything into it.
    var activeStateName = null;

    function closeIfEmpty(name) {
        var entry = stateData[name];
        if (!entry || !entry.marker) return;

        var input = entry.marker.getElement().querySelector("input");
        if (input && input.value.trim().length > 0) return;

        map.removeLayer(entry.marker);
        entry.marker = null;
        if (entry.line) {
            map.removeLayer(entry.line);
            entry.line = null;
        }
    }

    function wireInput(entry, name) {
        var el = entry.marker.getElement();
        var input = el.querySelector("input");

        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);

        input.addEventListener("focus", function () {
            if (activeStateName && activeStateName !== name) {
                closeIfEmpty(activeStateName);
            }
            activeStateName = name;
        });

        input.addEventListener("input", function () {
            markAnswered(name, input.value.trim().length > 0);
        });

        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                markAnswered(name, input.value.trim().length > 0);
                input.blur();
            }
        });

        return input;
    }

    function refreshMarkerIcons() {
        var dims = inputDimensions(map.getZoom());
        Object.keys(stateData).forEach(function (name) {
            var entry = stateData[name];
            if (!entry.marker) return;

            var oldInput = entry.marker.getElement().querySelector("input");
            var currentValue = oldInput ? oldInput.value : "";
            var wasFocused = oldInput === document.activeElement;

            entry.marker.setIcon(buildIcon(dims, currentValue, entry.answered, name));
            var newInput = wireInput(entry, name);
            if (wasFocused) newInput.focus();
        });
    }

    function markAnswered(name, isAnswered) {
        stateData[name].answered = isAnswered;
        var layer = stateData[name].layer;
        layer.setStyle({ fillColor: isAnswered ? answeredFill : baseStyle.fillColor });
        updateProgress();
    }

    function openInputForState(name) {
        var entry = stateData[name];

        if (entry.marker) {
            var existingInput = entry.marker.getElement();
            if (existingInput) {
                var inputEl = existingInput.querySelector("input");
                if (inputEl) inputEl.focus();
            }
            return;
        }

        var geometry = entry.layer.feature.geometry;
        var centroid = featureCentroid(geometry);

        // A state's true centroid can fall outside the currently visible
        // viewport (e.g. Alaska's mainland centroid sits just above the
        // header at the default view). Clamp to visible screen space so the
        // input always appears where the user can see and use it.
        var margin = 24;
        var size = map.getSize();
        var screenPoint = map.latLngToContainerPoint(centroid);
        screenPoint.x = Math.min(Math.max(screenPoint.x, margin), size.x - margin);
        screenPoint.y = Math.min(Math.max(screenPoint.y, margin), size.y - margin);
        centroid = map.containerPointToLatLng(screenPoint);

        var inputLatLng = centroid;
        if (CALLOUT_ANCHORS[name]) {
            var anchor = CALLOUT_ANCHORS[name];
            var line = L.polyline([centroid, anchor], { className: "callout-line" }).addTo(map);
            entry.line = line;
            inputLatLng = anchor;
        }

        var dims = inputDimensions(map.getZoom());
        var marker = L.marker(inputLatLng, { icon: buildIcon(dims, "", false, name), interactive: true }).addTo(map);
        entry.marker = marker;

        var input = wireInput(entry, name);
        input.focus();
    }

    var geoLayer = L.geoJSON(window.US_STATES_GEOJSON, {
        style: baseStyle,
        onEachFeature: function (feature, layer) {
            var name = feature.properties.name;
            stateData[name] = { layer: layer, marker: null, line: null, answered: false };

            layer.on("mouseover", function () {
                layer.setStyle(hoverStyle);
            });
            layer.on("mouseout", function () {
                layer.setStyle({
                    weight: baseStyle.weight,
                    fillOpacity: baseStyle.fillOpacity
                });
            });
            layer.on("click", function () {
                openInputForState(name);
            });
        }
    }).addTo(map);

    map.on("zoomend", refreshMarkerIcons);

    document.getElementById("submit-btn").addEventListener("click", function () {
        var correct = 0;
        Object.keys(stateData).forEach(function (name) {
            var entry = stateData[name];
            if (!entry.marker) return;
            var el = entry.marker.getElement();
            var input = el && el.querySelector("input");
            if (!input) return;
            var value = input.value.trim().toLowerCase();
            var abbr = (ABBREVIATIONS[name] || "").toLowerCase();
            if (value === name.toLowerCase() || value === abbr) {
                correct++;
            }
        });

        var banner = document.getElementById("result-banner");
        banner.innerHTML = "You correctly identified " + correct + " / " + TOTAL_STATES + " states." +
            '<span class="close-hint">Click to dismiss and keep editing your answers.</span>';
        banner.style.display = "block";
    });

    document.getElementById("result-banner").addEventListener("click", function () {
        this.style.display = "none";
    });
})();
