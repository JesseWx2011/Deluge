// Additional map overlays: SPC Mesoscale Discussions, Storm Reports (LSR /
// Storm-Based Warning polygons), and the NHC forecast cone.
//
// Uses helpers already defined globally by map.js:
//   fetchAndParseKmz(url), fetchWithCorsFallback(url), window.registerLayerReinit(fn)

const MESOSCALE_KMZ_URL = 'https://www.spc.noaa.gov/products/md/ActiveMD.kmz';
const LSR_BASE_URL = 'https://mesonet.agron.iastate.edu/geojson/sbw.geojson';
const NHC_CURRENT_STORMS_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';

function extraLayersBeforeId() {
    if (typeof map.getLayer !== 'function') return undefined;
    return map.getLayer('alerts-outline') ? 'alerts-outline' : (map.getLayer('road-minor') ? 'road-minor' : undefined);
}

// Adds a geojson source + matching fill/outline layer pair if they don't
// already exist. Layers start hidden — visibility is driven by the Map
// Layers toggle switches in menu.js.
function ensureFillOutlineLayer(sourceId, fillLayerId, outlineLayerId, defaultFill, defaultStroke, fillOpacity) {
    if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }

    const beforeLayer = extraLayersBeforeId();

    if (!map.getLayer(fillLayerId)) {
        map.addLayer({
            id: fillLayerId,
            type: 'fill',
            source: sourceId,
            layout: { visibility: 'none' },
            paint: {
                'fill-color': ['coalesce', ['to-color', ['get', 'fill']], defaultFill],
                'fill-opacity': fillOpacity
            }
        }, beforeLayer);
    }

    if (!map.getLayer(outlineLayerId)) {
        map.addLayer({
            id: outlineLayerId,
            type: 'line',
            source: sourceId,
            layout: { visibility: 'none' },
            paint: {
                'line-color': ['coalesce', ['to-color', ['get', 'stroke']], defaultStroke],
                'line-width': 2
            }
        }, beforeLayer);
    }
}

function setPairVisibility(fillLayerId, outlineLayerId, visible) {
    [fillLayerId, outlineLayerId].forEach((id) => {
        if (map.getLayer(id)) {
            map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        }
    });
}

function buildSimplePopupHtml(barColor, title, bodyHtml) {
    return `
        <div class="outlookPopup">
            <div class="outlookPopupBar" style="background-color:${barColor};"></div>
            <div class="outlookPopupBody">
                <div class="outlookPopupTitle">${title}</div>
                ${bodyHtml || ''}
            </div>
        </div>`;
}

// Shared on/off controller for a fetch-backed overlay: shows/hides the
// layer pair, fetches on first enable, and runs a refresh timer while on.
function createOverlayController(fillLayerId, outlineLayerId, fetchFn, refreshMs) {
    let loaded = false;
    let refreshTimer = null;

    return {
        isLoaded: () => loaded,
        markLoaded: () => { loaded = true; },
        refetchIfLoaded: () => { if (loaded) fetchFn(); },
        setVisible(visible) {
            setPairVisibility(fillLayerId, outlineLayerId, visible);

            if (visible) {
                if (!loaded) fetchFn();
                if (!refreshTimer) refreshTimer = setInterval(fetchFn, refreshMs);
            } else if (refreshTimer) {
                clearInterval(refreshTimer);
                refreshTimer = null;
            }
        }
    };
}

// ---------------------------------------------------------------------
// Mesoscale Discussions
// ---------------------------------------------------------------------

const mesoscaleController = createOverlayController('mesoscale-fill-layer', 'mesoscale-outline-layer', fetchMesoscaleDiscussions, 5 * 60000);

async function fetchMesoscaleDiscussions() {
    try {
        const data = await fetchAndParseKmz(MESOSCALE_KMZ_URL);
        if (map.getSource('mesoscale-source')) map.getSource('mesoscale-source').setData(data);
        mesoscaleController.markLoaded();
    } catch (error) {
        console.warn('[Deluge] Unable to load Mesoscale Discussions:', error);
    }
}

function initMesoscaleLayer() {
    ensureFillOutlineLayer('mesoscale-source', 'mesoscale-fill-layer', 'mesoscale-outline-layer', '#ffb703', '#e08e00', 0.3);

    map.on('click', 'mesoscale-fill-layer', (e) => {
        if (!e.features.length) return;
        const props = e.features[0].properties || {};
        const text = String(props.description || 'No discussion text available.')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 1500);

        new mapboxgl.Popup({ closeButton: true, className: 'outlookMapboxPopup', maxWidth: '360px' })
            .setLngLat(e.lngLat)
            .setHTML(buildSimplePopupHtml('#ffb703', props.LABEL || 'Mesoscale Discussion',
                `<div style="font-size:12px; color:#d9e2f5; line-height:1.5; max-height:260px; overflow-y:auto; margin-top:8px;">${text}</div>`))
            .addTo(map);
    });

    map.on('mouseenter', 'mesoscale-fill-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'mesoscale-fill-layer', () => { map.getCanvas().style.cursor = ''; });
}

function setMesoscaleVisibility(visible) {
    mesoscaleController.setVisible(visible);
}
window.setMesoscaleVisibility = setMesoscaleVisibility;

// ---------------------------------------------------------------------
// Storm Reports (IEM's Storm-Based Warning polygons, rolling 24h window)
// ---------------------------------------------------------------------

const lsrController = createOverlayController('lsr-fill-layer', 'lsr-outline-layer', fetchLsrReports, 5 * 60000);

function getLsrTimeRange() {
    const ets = new Date();
    const sts = new Date(ets.getTime() - 24 * 60 * 60 * 1000);
    return { stsISO: sts.toISOString(), etsISO: ets.toISOString() };
}

async function fetchLsrReports() {
    try {
        const { stsISO, etsISO } = getLsrTimeRange();
        const url = `${LSR_BASE_URL}?sts=${encodeURIComponent(stsISO)}&ets=${encodeURIComponent(etsISO)}&wfos=`;

        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (map.getSource('lsr-source')) map.getSource('lsr-source').setData(data);
        lsrController.markLoaded();
    } catch (error) {
        console.warn('[Deluge] Unable to load Storm Reports:', error);
    }
}

function initLsrLayer() {
    ensureFillOutlineLayer('lsr-source', 'lsr-fill-layer', 'lsr-outline-layer', '#3ea2ff', '#1c6fd9', 0.25);

    map.on('click', 'lsr-fill-layer', (e) => {
        if (!e.features.length) return;
        const props = e.features[0].properties || {};
        const title = [props.phenomena, props.significance].filter(Boolean).join(' ') || 'Storm Report';

        new mapboxgl.Popup({ closeButton: true, className: 'outlookMapboxPopup', maxWidth: '300px' })
            .setLngLat(e.lngLat)
            .setHTML(buildSimplePopupHtml('#3ea2ff', title, `
                <div class="outlookPopupRow"><span class="outlookPopupLabel">WFO</span><span class="outlookPopupValue">${props.wfo || 'N/A'}</span></div>
                <div class="outlookPopupRow"><span class="outlookPopupLabel">Issued</span><span class="outlookPopupValue">${props.issue || 'N/A'}</span></div>
                <div class="outlookPopupRow"><span class="outlookPopupLabel">Expires</span><span class="outlookPopupValue">${props.expire || 'N/A'}</span></div>
            `))
            .addTo(map);
    });

    map.on('mouseenter', 'lsr-fill-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'lsr-fill-layer', () => { map.getCanvas().style.cursor = ''; });
}

function setLsrVisibility(visible) {
    lsrController.setVisible(visible);
}
window.setLsrVisibility = setLsrVisibility;

// ---------------------------------------------------------------------
// NHC Forecast Cone
// ---------------------------------------------------------------------
// NHC doesn't publish a single stable "give me the cone KMZ" endpoint with a
// documented field name, so this walks CurrentStorms.json looking for any
// string value that looks like a forecast-cone KMZ link. If nothing matches
// (e.g. no active storms), the layer is simply left empty.

const nhcConeController = createOverlayController('nhc-cone-fill-layer', 'nhc-cone-outline-layer', fetchNhcCone, 10 * 60000);

function findConeKmzUrls(node, found = []) {
    if (!node) return found;

    if (typeof node === 'string') {
        if (/cone/i.test(node) && /\.kmz(\?|$)/i.test(node)) found.push(node);
        return found;
    }

    if (Array.isArray(node)) {
        node.forEach((item) => findConeKmzUrls(item, found));
        return found;
    }

    if (typeof node === 'object') {
        Object.values(node).forEach((value) => findConeKmzUrls(value, found));
    }

    return found;
}

async function fetchNhcCone() {
    try {
        let response;
        try {
            response = await fetch(NHC_CURRENT_STORMS_URL, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch (directError) {
            response = await fetchWithCorsFallback(NHC_CURRENT_STORMS_URL);
        }

        const json = await response.json();
        const coneUrls = Array.from(new Set(findConeKmzUrls(json)));

        if (!coneUrls.length) {
            if (map.getSource('nhc-cone-source')) {
                map.getSource('nhc-cone-source').setData({ type: 'FeatureCollection', features: [] });
            }
            nhcConeController.markLoaded();
            return;
        }

        const parsedCollections = await Promise.all(coneUrls.map((url) =>
            fetchAndParseKmz(url).catch((error) => {
                console.warn('[Deluge] Failed to parse NHC cone KMZ:', url, error);
                return null;
            })
        ));

        const features = parsedCollections
            .filter(Boolean)
            .flatMap((collection) => collection.features || []);

        if (map.getSource('nhc-cone-source')) {
            map.getSource('nhc-cone-source').setData({ type: 'FeatureCollection', features });
        }
        nhcConeController.markLoaded();
    } catch (error) {
        console.warn('[Deluge] Unable to load NHC forecast cone (no active storms, or NHC is unreachable):', error);
    }
}

function initNhcConeLayer() {
    ensureFillOutlineLayer('nhc-cone-source', 'nhc-cone-fill-layer', 'nhc-cone-outline-layer', 'rgba(255,255,255,0.35)', '#ffffff', 0.22);

    map.on('click', 'nhc-cone-fill-layer', (e) => {
        if (!e.features.length) return;
        const props = e.features[0].properties || {};
        new mapboxgl.Popup({ closeButton: true, className: 'outlookMapboxPopup', maxWidth: '300px' })
            .setLngLat(e.lngLat)
            .setHTML(buildSimplePopupHtml('#ffffff', props.LABEL || props.name || 'Forecast Cone'))
            .addTo(map);
    });

    map.on('mouseenter', 'nhc-cone-fill-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'nhc-cone-fill-layer', () => { map.getCanvas().style.cursor = ''; });
}

function setNhcConeVisibility(visible) {
    nhcConeController.setVisible(visible);
}
window.setNhcConeVisibility = setNhcConeVisibility;

// ---------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------

function initExtraLayers() {
    initMesoscaleLayer();
    initLsrLayer();
    initNhcConeLayer();
}

if (map.loaded()) {
    initExtraLayers();
} else {
    map.on('load', initExtraLayers);
}

// A base-style switch (Settings panel) wipes every custom source/layer, so
// rebuild the layer shells and re-fetch anything that was actively toggled on.
if (typeof window.registerLayerReinit === 'function') {
    window.registerLayerReinit(() => {
        initExtraLayers();
        mesoscaleController.refetchIfLoaded();
        lsrController.refetchIfLoaded();
        nhcConeController.refetchIfLoaded();
    });
}
