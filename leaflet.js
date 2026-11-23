(function () {
    "use strict";

    // ABBREVIATIONS, MIN_ZOOM, MAX_ZOOM, featureBBox, transformCoordinates,
    // ringAreaAndCentroid, featureCentroid, inputDimensions, isCorrectAnswer
    // are all defined as globals by lib/game-logic.js, loaded before this script.

    // States too small/crowded to hold an input on their own borders.
    // Each gets a callout box out in the Atlantic, connected by a line.
    const CALLOUT_ANCHORS = {
        "Vermont": [46.5, -63],
        "New Hampshire": [45.0, -63],
        "Massachusetts": [43.5, -63],
        "Rhode Island": [42.0, -63],
        "Connecticut": [40.5, -63],
        "New Jersey": [39.0, -63],
        "Delaware": [37.5, -63],
        "Maryland": [36.0, -63]
    };

    const TOTAL_STATES = 50;

    var map = L.map("map", {
        // minZoom: MIN_ZOOM,
        // maxZoom: MAX_ZOOM,
        // maxBounds: L.latLngBounds([[3, -180], [78, -40]]),
        // maxBounds: L.latLngBounds([[3, -180], [78, -40]]),
        // maxBoundsViscosity: 1.0
    });


    // Alaska's true position and size dwarf the other 48 states and sit far
    // out of frame. Shrink it and dock it beside Hawaii - the inset
    // convention used on most US maps - by rewriting its coordinates in
    // place, so every downstream feature (centroid, click handling, input
    // placement) treats the inset as Alaska's real geometry.
    var insetBounds = null;
    (function relocateAlaskaNextToHawaii() {
        var features = window.US_STATES_GEOJSON.features;
        var alaska = features.filter(function (f) { return f.properties.name === "Alaska"; })[0];
        var hawaii = features.filter(function (f) { return f.properties.name === "Hawaii"; })[0];
        if (!alaska || !hawaii) return;

        var alaskaBBox = featureBBox(alaska.geometry);
        var hawaiiBBox = featureBBox(hawaii.geometry);

        var scale = 0.28;
        var gap = 1;
        var targetMinLon = hawaiiBBox.minLon;
        var targetMaxLat = hawaiiBBox.minLat - gap;
        var targetMinLat = targetMaxLat - (alaskaBBox.maxLat - alaskaBBox.minLat) * scale;

        alaska.geometry.coordinates = transformCoordinates(alaska.geometry.coordinates, function (pt) {
            return [
                (pt[0] - alaskaBBox.minLon) * scale + targetMinLon,
                (pt[1] - alaskaBBox.minLat) * scale + targetMinLat
            ];
        });

        var alaskaNewBBox = featureBBox(alaska.geometry);
        var padding = 1;
        insetBounds = L.latLngBounds(
            [Math.min(alaskaNewBBox.minLat, hawaiiBBox.minLat) - padding, Math.min(alaskaNewBBox.minLon, hawaiiBBox.minLon) - padding],
            [Math.max(alaskaNewBBox.maxLat, hawaiiBBox.maxLat) + padding, Math.max(alaskaNewBBox.maxLon, hawaiiBBox.maxLon) + padding]
        );
    })();

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


    function updateProgress() {
        var answered = 0;
        Object.keys(stateData).forEach(function (name) {
            if (stateData[name].answered) answered++;
        });
        document.getElementById("progress").textContent = answered + " / " + TOTAL_STATES + " answered";
        document.getElementById("submit-btn").disabled = (answered !== TOTAL_STATES);
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

    // Fit to the actual state bounds rather than a fixed zoom level, so the
    // whole map is framed correctly on any screen size (phone, tablet, desktop).
    // This must run before adding any further vector layers below - Leaflet
    // mishandles a Path added directly to the map (not part of a
    // FeatureGroup) while the map still has no view.
    var fitBoundsTarget = geoLayer.getBounds();
    if (insetBounds) fitBoundsTarget.extend(insetBounds);
    map.fitBounds(fitBoundsTarget, { padding: [12, 12] });

    if (insetBounds) {
        L.rectangle(insetBounds, {
            color: "#34495e",
            weight: 2,
            fill: false,
            interactive: false
        }).addTo(map);
    }

    map.on("zoomend", refreshMarkerIcons);

    document.getElementById("submit-btn").addEventListener("click", function () {
        var correct = 0;
        Object.keys(stateData).forEach(function (name) {
            var entry = stateData[name];
            if (!entry.marker) return;
            var el = entry.marker.getElement();
            var input = el && el.querySelector("input");
            if (!input) return;
            if (isCorrectAnswer(input.value, name)) {
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
