const webcamSources = [
    {"name": "ISU Webcams", "source": "https://mesonet.agron.iastate.edu/geojson/webcam.geojson?network=TV"}
];

// Fetch local livestreams list from JSON configuration
async function fetchLivestreams() {
    try {
        const response = await fetch('../json/livestreams.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        return data.webcamsLocal || [];
    } catch (error) {
        console.error("Failed to fetch livestreams:", error);
        return [];
    }
}

// Fetch remote GeoJSON datasets for external webcam sources
async function fetchWebcams() {
    const urls = webcamSources.map(item => item.source);

    try {
        const fetches = urls.map(url => fetch(url).then(res => res.json()));
        const data = await Promise.all(fetches);

        // Return raw GeoJSON object for the primary source
        return data[0]; 
    } catch (error) {
        console.error("Failed to fetch webcams:", error);
    }
}

// Map external Iowa State University webcam circle layer
function mapISUCams(geojsonData) {
    const setupLayer = () => {
        if (!map || map.getSource("isuCams")) return;

        map.addSource("isuCams", {
            'type': "geojson",
            'data': geojsonData
        });

        map.addLayer({
            "id": "isuCamsLayer",
            'type': "circle",
            'source': 'isuCams',
            "paint": {
                'circle-radius': 7,
                'circle-stroke-width': 2,
                'circle-color': 'blue',
                'circle-stroke-color': 'white'
            }
        });
    };

    if (map.isStyleLoaded()) {
        setupLayer();
    } else {
        map.once('load', setupLayer);
    }
}

// Inline SVG Data URL string for the camera marker icon
const webcamIconSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="36px" viewBox="0 -960 960 960" width="36px"><circle cx="480" cy="-480" r="440" fill="%233b82f6"/><path d="M480-260q75 0 127.5-52.5T660-440q0-75-52.5-127.5T480-620q-75 0-127.5 52.5T300-440q0 75 52.5 127.5T480-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM160-120q-33 0-56.5-23.5T80-200v-480q0-33 23.5-56.5T160-760h126l74-80h240l74 80h126q33 0 56.5 23.5T880-680v480q0 33-23.5 56.5T800-120H160Zm0-80h640v-480H638l-73-80H395l-73 80H160v480Zm320-240Z" fill="%23e3e3e3"/></svg>';

const WEBCAM_DOCK_MAX_ITEMS = 3;
let webcamDockOpen = false;
let webcamDockItems = [];
let webcamFeatureCatalog = [];

function isPhoneDevice() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
}

function getDockItemKey(item) {
    return `${item.name || ''}|${item.stream || ''}|${item.type || ''}`;
}

function isCameraAlreadyDocked(properties) {
    const key = getDockItemKey(properties);
    return webcamDockItems.some((item) => getDockItemKey(item) === key);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setWebcamDockOpen(isOpen) {
    webcamDockOpen = isOpen;
    const toggle = document.getElementById('webcamDockToggle');
    const dock = document.getElementById('webcamDock');
    if (toggle) {
        toggle.classList.toggle('active', isOpen);
        toggle.setAttribute('aria-expanded', String(isOpen));
    }
    if (dock) {
        dock.classList.toggle('open', isOpen);
    }
    document.body.classList.toggle('webcamDockOpen', isOpen);
}

function toggleWebcamDock() {
    setWebcamDockOpen(!webcamDockOpen);
}

function formatDockFullscreenTimestamp(date) {
    const time = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
    const dateText = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
    return {
        clock: time,
        date: dateText
    };
}

function setDockFullscreenBanner(item) {
    const now = new Date();
    const { clock, date } = formatDockFullscreenTimestamp(now);
    window.activeDockFullscreenBannerOverride = {
        title: item?.name || 'Camera',
        subtitle: item?.location || 'Location unavailable',
        clock,
        date
    };

    if (typeof window.refreshDockFullscreenBanner === 'function') {
        window.refreshDockFullscreenBanner();
    }
}

function clearDockFullscreenBanner() {
    window.activeDockFullscreenBannerOverride = null;
    if (typeof window.refreshDockFullscreenBanner === 'function') {
        window.refreshDockFullscreenBanner();
    }
}

function bindDockFullscreenVideoEvents(videoEl, item) {
    if (!videoEl) return;

    const onFullscreenChange = () => {
        const isFullscreen = !!(document.fullscreenElement && document.fullscreenElement === videoEl);
        if (isFullscreen) {
            setDockFullscreenBanner(item);
        } else {
            clearDockFullscreenBanner();
        }
    };

    videoEl.addEventListener('dblclick', async () => {
        if (document.fullscreenElement === videoEl) {
            await document.exitFullscreen?.();
            return;
        }
        await videoEl.requestFullscreen?.();
    });

    document.addEventListener('fullscreenchange', onFullscreenChange);
}

function renderWebcamDock() {
    const dockItems = document.getElementById('webcamDockItems');
    if (!dockItems) return;

    if (!webcamDockItems.length) {
        dockItems.innerHTML = '<div class="webcamDockEmpty">Choose cameras to pin here</div>';
        return;
    }

    dockItems.innerHTML = '';

    webcamDockItems.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'webcamDockItem';

        const title = document.createElement('div');
        title.className = 'webcamDockItemTitle';
        title.textContent = item.name || 'Webcam';

        const warningBadge = document.createElement('div');
        warningBadge.className = 'webcamDockWarning';
        warningBadge.textContent = 'Warning: Camera Livestream may have stopped';
        warningBadge.style.display = item.warning ? 'block' : 'none';

        const mediaWrap = document.createElement('div');
        mediaWrap.className = 'webcamDockMediaWrap';
        mediaWrap.innerHTML = buildDockMediaMarkup(item);

        const removeButton = document.createElement('button');
        removeButton.className = 'webcamDockRemove';
        removeButton.type = 'button';
        removeButton.title = 'Remove camera';
        removeButton.innerHTML = '&times;';
        removeButton.addEventListener('click', () => {
            webcamDockItems.splice(index, 1);
            renderWebcamDock();
            if (!webcamDockItems.length && !webcamDockOpen) {
                setWebcamDockOpen(false);
            }
        });

        card.appendChild(removeButton);
        card.appendChild(title);
        card.appendChild(warningBadge);
        card.appendChild(mediaWrap);
        dockItems.appendChild(card);

        const videoEl = card.querySelector('.webcamDockVideo');
        if (videoEl && (item.type === 'm3u8' || item.type === 'mpd')) {
            setupDockVideo(videoEl, item, index);
            bindDockFullscreenVideoEvents(videoEl, item);
        }

        const imageEl = card.querySelector('.webcamDockImage');
        if (imageEl && item.type === 'image') {
            const imageUrl = resolveDockStream(item);
            if (imageUrl) {
                imageEl.src = `${imageUrl}?t=${Date.now()}`;
            }
            imageEl.addEventListener('error', () => setDockItemWarning(index, true));
            imageEl.addEventListener('load', () => setDockItemWarning(index, false));
        }

        if (item.type === 'youtube') {
            const iframeEl = card.querySelector('iframe');
            if (iframeEl) {
                iframeEl.addEventListener('error', () => setDockItemWarning(index, true));
                iframeEl.addEventListener('load', () => setDockItemWarning(index, false));
            }
        }
    });
}

function resolveDockStream(item) {
    if (Array.isArray(item.stream)) {
        return item.stream[0] || '';
    }

    if (typeof item.stream === 'string' && item.stream.startsWith('[')) {
        try {
            const parsed = JSON.parse(item.stream);
            if (Array.isArray(parsed)) {
                return parsed[0] || '';
            }
        } catch (error) {
            console.warn('[Webcams] Could not parse dock stream array:', error);
        }
    }

    return item.stream || '';
}

function buildDockMediaMarkup(item) {
    const streamUrl = resolveDockStream(item);

    switch (item.type) {
        case 'm3u8':
            return '<video class="webcamDockVideo" autoplay muted loop playsinline></video>';
        case 'mpd':
            return '<video class="webcamDockVideo" autoplay muted loop playsinline></video>';
        case 'youtube':
            const videoId = (streamUrl || '').match(/(?:embed\/|v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] || streamUrl;
            return `<iframe src="https://www.youtube.com/embed/${videoId}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        case 'image':
            return `<img class="webcamDockImage" src="${streamUrl}" alt="${escapeHtml(item.name || 'Webcam')}" onerror="this.style.display='none';">`;
        default:
            return '<div class="webcamDockPlaceholder"><i class="fa-solid fa-video"></i><span>Stream unavailable</span></div>';
    }
}

function setDockItemWarning(index, isWarning) {
    if (!webcamDockItems[index]) return;
    if (webcamDockItems[index].warning === isWarning) return;

    webcamDockItems[index].warning = isWarning;

    const dockItems = document.getElementById('webcamDockItems');
    if (!dockItems) return;

    const card = dockItems.querySelectorAll('.webcamDockItem')[index];
    if (!card) return;

    const warningBadge = card.querySelector('.webcamDockWarning');
    if (warningBadge) {
        warningBadge.style.display = isWarning ? 'block' : 'none';
    }
}

function setupDockVideo(videoEl, item, index) {
    const streamUrl = resolveDockStream(item);
    if (!streamUrl) return;

    if (window.Hls && Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(videoEl);
        hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal || data.type === 'networkError') {
                setDockItemWarning(index, true);
            } else {
                setDockItemWarning(index, false);
            }
        });
    } else {
        videoEl.src = streamUrl;
    }

    videoEl.addEventListener('error', () => setDockItemWarning(index, true));
    videoEl.addEventListener('playing', () => setDockItemWarning(index, false));
}

function addCameraToDock(properties) {
    if (isPhoneDevice()) return;
    if (!properties || !properties.name) return;

    if (isCameraAlreadyDocked(properties)) {
        return;
    }

    if (webcamDockItems.length >= WEBCAM_DOCK_MAX_ITEMS) {
        return;
    }

    webcamDockItems.push({ ...properties, warning: false });

    renderWebcamDock();
    setWebcamDockOpen(true);
}

function showAddToDockPopup(feature) {
    if (isPhoneDevice()) return;
    if (!feature || !feature.properties || !map || typeof mapboxgl === 'undefined' || !mapboxgl.Popup) return;

    const coordinates = feature.geometry && Array.isArray(feature.geometry.coordinates)
        ? feature.geometry.coordinates.slice()
        : null;

    if (!coordinates || coordinates.length < 2) return;

    const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, offset: [0, -10] })
        .setLngLat(coordinates)
        .setHTML(`
            <div style="display:flex; flex-direction:column; gap:8px; min-width:180px;">
                <div style="font-weight:700; color:#111827;">${escapeHtml(feature.properties.name || 'Webcam')}</div>
                <button id="dockPopupAddBtn" type="button" style="background:#2563eb; color:white; border:none; border-radius:999px; padding:8px 12px; cursor:pointer; font-weight:700;">Add to dock</button>
            </div>
        `)
        .addTo(map);

    const addButton = popup.getElement()?.querySelector('#dockPopupAddBtn');
    if (addButton) {
        addButton.addEventListener('click', () => {
            addCameraToDock(feature.properties);
            popup.remove();
        });
    }
}
window.showAddToDockPopup = showAddToDockPopup;

function removeCameraFromDock(index) {
    webcamDockItems.splice(index, 1);
    renderWebcamDock();
    if (!webcamDockItems.length) {
        setWebcamDockOpen(false);
    }
}

// Convert raw livestream array elements into standard GeoJSON Point features
function livestreamsToGeoJSON(livestreams) {
    return {
        type: 'FeatureCollection',
        features: livestreams.map(cam => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [parseFloat(cam.lon), parseFloat(cam.lat)]
            },
            properties: {
                name: cam.name,
                stream: cam.stream,
                type: cam.type,
                multiCamera: cam['multi-camera'] || false,
                lat: parseFloat(cam.lat),
                lon: parseFloat(cam.lon)
            }
        }))
    };
}

// Rasterize SVG string onto HTML Canvas to generate compatible ImageData for Mapbox/MapLibre
function loadSvgImage(svgDataUrl, targetWidth = 24, targetHeight = 24) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            
            // Extract raw pixel data
            const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            resolve(imageData);
        };
        img.onerror = (err) => reject(err);
        img.src = svgDataUrl;
    });
}

// Fetch local livestreams, register icon image, and load symbol layer onto map
async function mapLivestreams() {
    const livestreams = await fetchLivestreams();
    if (livestreams.length === 0) {
        console.log('[Webcams] No livestreams found');
        return;
    }

    console.log('[Webcams] Found', livestreams.length, 'livestreams');
    const geojsonData = livestreamsToGeoJSON(livestreams);
    webcamFeatureCatalog = geojsonData.features || [];
    window.webcamFeatureCatalog = webcamFeatureCatalog;

    const setupLayer = async () => {
        if (!map) return;

        // Render SVG to Canvas before adding to map sprite atlas
        if (!map.hasImage('webcam-icon')) {
            try {
                const imageData = await loadSvgImage(webcamIconSvg, 32, 32);
                if (!map.hasImage('webcam-icon')) {
                    map.addImage('webcam-icon', imageData);
                }
                addLivestreamsLayer(geojsonData);
            } catch (error) {
                console.error('[Webcams] Error loading SVG image onto canvas:', error);
            }
        } else {
            addLivestreamsLayer(geojsonData);
        }
    };

    // Add source, symbol layer, and interaction handlers to map
    function addLivestreamsLayer(data) {
        if (map.getSource("livestreamsCams")) {
            console.log('[Webcams] Source already exists, skipping');
            return;
        }

        try {
            map.addSource("livestreamsCams", {
                'type': "geojson",
                'data': data,
                'cluster': true,
                'clusterRadius': 50,
                'clusterMinPoints': 5
            });

            // Add cluster layer with camera icon
            map.addLayer({
                "id": "livestreamsClusters",
                'type': 'symbol',
                'source': 'livestreamsCams',
                'filter': ['has', 'point_count'],
                'layout': {
                    'icon-image': 'webcam-icon',
                    'icon-size': 0.75,
                    'icon-allow-overlap': true
                }
            });

            // Add individual camera markers
            map.addLayer({
                "id": "livestreamsCamsLayer",
                'type': 'symbol',
                'source': 'livestreamsCams',
                'filter': ['!', ['has', 'point_count']],
                'layout': {
                    'icon-image': 'webcam-icon',
                    'icon-size': 0.75,
                    'icon-allow-overlap': true
                }
            });

            console.log('[Webcams] Livestreams layer added successfully with clustering');

            // Handle cluster clicks to show first camera in cluster
            map.on('click', 'livestreamsClusters', (e) => {
                if (e.features.length > 0) {
                    const feature = e.features[0];
                    const clusterId = feature.properties.cluster_id;
                    
                    // Get all points in the cluster
                    map.getSource('livestreamsCams').getClusterLeaves(clusterId, 100, 0, (err, features) => {
                        if (err || !features || features.length === 0) return;
                        
                        // Show modal with the first camera in the cluster
                        const firstCamera = features[0];
                        if (firstCamera.properties) {
                            showWebcamModal(firstCamera.properties);
                        }
                    });
                }
            });

            // Handle individual camera clicks to trigger webcam viewer modal
            map.on('click', 'livestreamsCamsLayer', (e) => {
                if (e.features.length > 0) {
                    const feature = e.features[0];
                    showWebcamModal(feature.properties);
                }
            });

            map.on('contextmenu', 'livestreamsCamsLayer', (e) => {
                if (e.features.length > 0) {
                    e.preventDefault();
                    showAddToDockPopup(e.features[0]);
                }
            });

            // Toggle pointer cursor on hover for clusters
            map.on('mouseenter', 'livestreamsClusters', () => {
                map.getCanvas().style.cursor = 'pointer';
            });

            map.on('mouseleave', 'livestreamsClusters', () => {
                map.getCanvas().style.cursor = '';
            });

            // Toggle pointer cursor on hover for individual cameras
            map.on('mouseenter', 'livestreamsCamsLayer', () => {
                map.getCanvas().style.cursor = 'pointer';
            });

            map.on('mouseleave', 'livestreamsCamsLayer', () => {
                map.getCanvas().style.cursor = '';
            });
        } catch (error) {
            console.error('[Webcams] Error adding layer:', error);
        }
    }

    // Handle initialization timing based on map instantiation state
    if (typeof map === 'undefined') {
        console.warn('[Webcams] Map not defined, waiting...');
        setTimeout(() => mapLivestreams(), 500);
        return;
    }

    if (map.isStyleLoaded()) {
        setupLayer();
    } else {
        map.once('load', setupLayer);
    }
}

// Build and display video stream modal dynamically based on stream type
function showWebcamModal(properties) {
    const { name, stream, type, multiCamera, lat, lon } = properties;
    
    console.log('[Webcams] Modal properties:', { name, type, multiCamera, stream, isArray: Array.isArray(stream), isStringifiedArray: typeof stream === 'string' && stream.startsWith('[') });
    
    // Initialize modal container element
    const phoneMode = isPhoneDevice();
    let modal = document.getElementById('webcamModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'webcamModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;
        document.body.appendChild(modal);
    }

    let content = '';
    let setupScript = null;

    // Parse stream if it's a stringified array
    let parsedStream = stream;
    if (typeof stream === 'string' && stream.startsWith('[')) {
        try {
            const parsed = JSON.parse(stream);
            if (Array.isArray(parsed)) {
                parsedStream = parsed;
            }
        } catch (e) {
            console.log('[Webcams] Could not parse stream as JSON array:', e);
        }
    }

    // Handle multi-camera streams with carousel
    // Check both multiCamera flag and if stream is an array
    if ((multiCamera || Array.isArray(parsedStream)) && Array.isArray(parsedStream)) {
        const streams = parsedStream;
        const currentIndex = 0;

        content = `
            <div style="position: relative; width: 100%; max-width: 800px;">
                <div id="carouselContainer" style="position: relative;">
                    <button id="prevCamera" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); background: rgba(59, 130, 246, 0.8); color: white; border: none; padding: 15px; cursor: pointer; border-radius: 50%; z-index: 10; display: flex; align-items: center; justify-content: center; width: 50px; height: 50px;">
                        <svg xmlns="http://www.w3.org/2000/svg" height="30" viewBox="0 0 24 24" width="30" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                    </button>
                    <button id="nextCamera" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: rgba(59, 130, 246, 0.8); color: white; border: none; padding: 15px; cursor: pointer; border-radius: 50%; z-index: 10; display: flex; align-items: center; justify-content: center; width: 50px; height: 50px;">
                        <svg xmlns="http://www.w3.org/2000/svg" height="30" viewBox="0 0 24 24" width="30" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </button>
                    <div id="cameraContent" style="width: 100%; overflow: hidden; position: relative;">
                        <div id="cameraSlide" style="display: flex; transition: transform 0.3s ease-in-out; width: 100%; align-items: center;"></div>
                    </div>
                    <div id="cameraIndicator" style="text-align: center; color: white; margin-top: 10px;">Camera 1 of ${streams.length}</div>
                </div>
            </div>
        `;

        setupScript = () => {
            let currentCamIndex = 0;
            const slide = document.getElementById('cameraSlide');
            const indicator = document.getElementById('cameraIndicator');
            const slideItems = [];
            
            // Disable preloading to prevent cache issues
            // Preloading was causing cross-camera image cache conflicts

            // Build all camera slides
            function buildSlides() {
                slide.innerHTML = '';
                slideItems.length = 0;
                streams.forEach((camStream, idx) => {
                    const slideItem = document.createElement('div');
                    slideItem.style.flex = '0 0 100%';
                    slideItem.style.width = '100%';
                    slideItem.dataset.index = idx;
                    
                    let camContent = '';
                    switch (type) {
                        case 'youtube':
                            const videoId = camStream.match(/(?:embed\/|v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] || camStream;
                            camContent = `
                                <iframe 
                                    width="800" 
                                    height="450" 
                                    src="https://www.youtube.com/embed/${videoId}" 
                                    frameborder="0" 
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                    allowfullscreen
                                    style="max-width: 100%;"
                                ></iframe>
                            `;
                            break;
                        case 'm3u8':
                            camContent = `<video id="webcamVideo_${idx}" autoplay controls style="width: 100%; max-width: 800px; height: auto;"></video>`;
                            break;
                        case 'image':
                            const cacheBuster = `?t=${Date.now()}_${idx}`;
                            camContent = `<img id="webcamImage_${idx}" src="${camStream}${cacheBuster}" alt="${name}" style="width: auto;max-width: 800px;display: flex;margin: 0 auto;height: 80%;align-items: center;" onerror="this.parentElement.style.display='none';">`;
                            break;
                        default:
                            camContent = '<p style="color: white;">Unsupported webcam type</p>';
                    }
                    
                    slideItem.innerHTML = camContent;
                    slide.appendChild(slideItem);
                    slideItems.push(slideItem);
                });
                
                // Initialize HLS for first video if needed
                if (type === 'm3u8' && streams.length > 0) {
                    setTimeout(() => {
                        const video = document.getElementById('webcamVideo_0');
                        if (video && window.Hls) {
                            const hls = new Hls();
                            hls.loadSource(streams[0]);
                            hls.attachMedia(video);
                        } else if (video) {
                            video.src = streams[0];
                        }
                    }, 100);
                }
                
                // Setup auto-refresh for images with cache-busting
                if (type === 'image') {
                    streams.forEach((camStream, idx) => {
                        const imgInterval = setInterval(() => {
                            const img = document.getElementById(`webcamImage_${idx}`);
                            if (img) {
                                const cacheBuster = `?t=${Date.now()}_${idx}`;
                                img.src = camStream + cacheBuster;
                            } else {
                                clearInterval(imgInterval);
                            }
                        }, 15000);
                    });
                }
            }

            function getVisibleSlideCount() {
                return slideItems.filter(item => item.style.display !== 'none').length;
            }

            function getVisibleSlideIndex(targetIndex) {
                let visibleCount = 0;
                for (let i = 0; i < slideItems.length; i++) {
                    if (slideItems[i].style.display !== 'none') {
                        if (i === targetIndex) return visibleCount;
                        visibleCount++;
                    }
                }
                return visibleCount;
            }

            function getOriginalIndexFromVisible(visibleIndex) {
                let visibleCount = 0;
                for (let i = 0; i < slideItems.length; i++) {
                    if (slideItems[i].style.display !== 'none') {
                        if (visibleCount === visibleIndex) return i;
                        visibleCount++;
                    }
                }
                return 0;
            }

            function updateSlidePosition() {
                const visibleIndex = getVisibleSlideIndex(currentCamIndex);
                slide.style.transform = `translateX(-${visibleIndex * 100}%)`;
                const visibleCount = getVisibleSlideCount();
                indicator.textContent = `Camera ${visibleIndex + 1} of ${visibleCount}`;
            }

            // Build slides
            buildSlides();
            
            // Set initial position
            updateSlidePosition();

            // Setup navigation
            document.getElementById('prevCamera').addEventListener('click', () => {
                let prevIndex = currentCamIndex - 1;
                while (prevIndex >= 0 && slideItems[prevIndex].style.display === 'none') {
                    prevIndex--;
                }
                if (prevIndex < 0) {
                    prevIndex = slideItems.length - 1;
                    while (prevIndex >= 0 && slideItems[prevIndex].style.display === 'none') {
                        prevIndex--;
                    }
                    if (prevIndex < 0) prevIndex = currentCamIndex;
                }
                currentCamIndex = prevIndex;
                updateSlidePosition();
                
                // Initialize HLS for m3u8 if needed
                if (type === 'm3u8') {
                    setTimeout(() => {
                        const video = document.getElementById(`webcamVideo_${currentCamIndex}`);
                        if (video && window.Hls) {
                            const hls = new Hls();
                            hls.loadSource(streams[currentCamIndex]);
                            hls.attachMedia(video);
                        } else if (video) {
                            video.src = streams[currentCamIndex];
                        }
                    }, 100);
                }
            });

            document.getElementById('nextCamera').addEventListener('click', () => {
                let nextIndex = currentCamIndex + 1;
                while (nextIndex < slideItems.length && slideItems[nextIndex].style.display === 'none') {
                    nextIndex++;
                }
                if (nextIndex >= slideItems.length) {
                    nextIndex = 0;
                    while (nextIndex < slideItems.length && slideItems[nextIndex].style.display === 'none') {
                        nextIndex++;
                    }
                    if (nextIndex >= slideItems.length) nextIndex = currentCamIndex;
                }
                currentCamIndex = nextIndex;
                updateSlidePosition();
                
                // Initialize HLS for m3u8 if needed
                if (type === 'm3u8') {
                    setTimeout(() => {
                        const video = document.getElementById(`webcamVideo_${currentCamIndex}`);
                        if (video && window.Hls) {
                            const hls = new Hls();
                            hls.loadSource(streams[currentCamIndex]);
                            hls.attachMedia(video);
                        } else if (video) {
                            video.src = streams[currentCamIndex];
                        }
                    }, 100);
                }
            });
        };
    } else {
        // Single camera - existing logic
        // Inject streaming media handlers based on feed format
        switch (type) {
            case 'm3u8':
                content = `<video id="webcamVideo" autoplay style="width: 100%; max-width: 800px; height: auto;"></video>`;
                setupScript = () => {
                    if (!window.Hls) {
                        const script = document.createElement('script');
                        script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                        script.onload = () => setupHls();
                        document.head.appendChild(script);
                    } else {
                        setupHls();
                    }
                };
                function setupHls() {
                    const video = document.getElementById('webcamVideo');
                    if (Hls.isSupported()) {
                        const hls = new Hls();
                        hls.loadSource(stream);
                        hls.attachMedia(video);
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = stream;
                    }
                }
                break;
            case 'youtube':
                const videoId = stream.match(/(?:embed\/|v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] || stream;
                content = `
                    <iframe 
                        width="800" 
                        height="450" 
                        src="https://www.youtube.com/embed/${videoId}" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen
                        style="max-width: 100%;"
                    ></iframe>
                `;
                break;
            case 'image':
                // Handle both single string and array (fallback for multi-camera not detected)
                let imageUrl = stream;
                
                // Check if stream is an array
                if (Array.isArray(stream)) {
                    imageUrl = stream[0];
                    console.log('[Webcams] Stream is array, using first URL:', imageUrl);
                }
                // Check if stream is a stringified array
                else if (typeof stream === 'string' && stream.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(stream);
                        if (Array.isArray(parsed)) {
                            imageUrl = parsed[0];
                            console.log('[Webcams] Stream is stringified array, using first URL:', imageUrl);
                        }
                    } catch (e) {
                        console.log('[Webcams] Could not parse stream as JSON array:', e);
                    }
                }
                
                const cacheBuster = `?t=${Date.now()}`;
                content = `<img id="webcamImage" src="${imageUrl}${cacheBuster}" alt="${name}" style="width: 100%; max-width: 600px; height: auto;">`;
                setupScript = () => {
                    // Auto-refresh static camera snapshots every 15 seconds with cache-busting
                    const interval = setInterval(() => {
                        const img = document.getElementById('webcamImage');
                        if (img) {
                            const newCacheBuster = `?t=${Date.now()}`;
                            img.src = imageUrl + newCacheBuster;
                        } else {
                            clearInterval(interval);
                        }
                    }, 15000);
                    modal.dataset.imageInterval = interval;
                };
                break;
            case 'mpd':
                content = `<video id="webcamVideo" controls autoplay style="width: 100%; max-width: 800px; height: auto;"></video>`;
                setupScript = () => {
                    if (!window.dashjs) {
                        const script = document.createElement('script');
                        script.src = 'https://cdn.dashjs.org/latest/dash.all.min.js';
                        script.onload = () => setupDash();
                        document.head.appendChild(script);
                    } else {
                        setupDash();
                    }
                };
                function setupDash() {
                    const video = document.getElementById('webcamVideo');
                    const player = dashjs.MediaPlayer().create();
                    player.initialize(video, stream, true);
                }
                break;
            default:
                content = '<p style="color: white;">Unsupported webcam type</p>';
        }
    }

    // Clear active image refresh timers when switching modal content
    if (modal.dataset.imageInterval) {
        clearInterval(parseInt(modal.dataset.imageInterval));
        delete modal.dataset.imageInterval;
    }

    // Clear all image refresh intervals
    if (modal.dataset.imageIntervals) {
        const intervals = JSON.parse(modal.dataset.imageIntervals);
        intervals.forEach(interval => clearInterval(interval));
        delete modal.dataset.imageIntervals;
    }

    // Populate modal markup and reveal layout
    const dockButtonHtml = phoneMode ? '' : '<button id="dockCameraBtn" draggable="true" style="background: #2563eb; color: white; border: none; padding: 8px 12px; cursor: grab; border-radius: 999px; font-size: 12px; font-weight: 700;">Dock to left</button>';
    modal.innerHTML = `
        <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; max-width: 90%; max-height: 90%; overflow: auto; position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 15px;">
                <h2 style="color: white; margin: 0;">${name}</h2>
                <div style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
                    ${dockButtonHtml}
                    <button id="closeModalBtn" style="background: #ff4444; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 5px;">✕</button>
                </div>
            </div>
            <div style="color: #ccc; margin-bottom: 15px; font-size: 14px;">
                <div id="currentTime" style="margin-bottom: 5px;"></div>
                <div id="currentWeather" style="margin-bottom: 5px;"></div>
            </div>
            ${content}
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #333; font-size: 12px; color: #888;">
                <p style="margin: 0;">If you are experiencing issues with a previous camera you selected suddenly loading, try clearing your cache. <a href="https://support.google.com/accounts/answer/32050?hl=en&co=GENIE.Platform%3DDesktop" target="_blank" style="color: #3b82f6; text-decoration: underline;">Learn how to clear your browser cache</a></p>
            </div>
        </div>
    `;

    const dockButton = document.getElementById('dockCameraBtn');
    if (dockButton) {
        dockButton.addEventListener('click', () => {
            addCameraToDock(properties);
            modal.style.display = 'none';
        });
        dockButton.addEventListener('dragstart', (event) => {
            event.dataTransfer.setData('application/webcam-data', JSON.stringify(properties));
            event.dataTransfer.effectAllowed = 'copy';
        });
    }

    // Handle modal close with cache clearing
    document.getElementById('closeModalBtn').addEventListener('click', () => {
        modal.style.display = 'none';
        // Clear image cache
        const images = modal.querySelectorAll('img');
        images.forEach(img => {
            if (img.src) {
                img.src = '';
            }
        });
        // Clear intervals
        if (modal.dataset.imageInterval) {
            clearInterval(parseInt(modal.dataset.imageInterval));
            delete modal.dataset.imageInterval;
        }
        // Clear time interval
        if (timeInterval) {
            clearInterval(timeInterval);
        }
    });

    modal.style.display = 'flex';

    let cameraTimezone = null;

    // Update current time
    function updateTime() {
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            const now = new Date();
            if (cameraTimezone) {
                timeElement.textContent = `Local Time: ${now.toLocaleTimeString('en-US', { timeZone: cameraTimezone })}`;
            } else {
                timeElement.textContent = `Local Time: ${now.toLocaleTimeString()}`;
            }
        }
    }
    updateTime();
    const timeInterval = setInterval(updateTime, 1000);

    // Fetch weather data if lat/lon available
    async function fetchWeather() {
        const weatherElement = document.getElementById('currentWeather');
        if (!weatherElement || !lat || !lon) return;

        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&timezone=auto&past_days=1&forecast_days=1&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch`;
            const response = await fetch(url);
            const data = await response.json();
            
            // Get timezone from API response
            if (data.timezone) {
                cameraTimezone = data.timezone;
                updateTime(); // Update time with correct timezone
            }
            
            if (data.hourly && data.hourly.temperature_2m && data.hourly.temperature_2m.length > 0) {
                const currentHour = new Date().getHours();
                const temp = data.hourly.temperature_2m[currentHour];
                weatherElement.textContent = `Current Temperature: ${temp}°F`;
            }
        } catch (error) {
            console.error('[Webcams] Error fetching weather:', error);
            weatherElement.textContent = 'Weather data unavailable';
        }
    }
    fetchWeather();

    // Execute playback setup callbacks after DOM insertion
    if (setupScript) {
        setupScript();
    }
}
window.showWebcamModal = showWebcamModal;

// Master initialization sequence for both webcam feeds
async function initWebcams() {
    const isuData = await fetchWebcams();
    if (isuData) {
        mapISUCams(isuData);
    }
    await mapLivestreams();
}

const dockToggle = document.getElementById('webcamDockToggle');
if (dockToggle) {
    dockToggle.addEventListener('click', toggleWebcamDock);
    dockToggle.title = 'This is the camera dock! Keep an eye on what these cameras are seeing by clicking on a camera icon on the map and selecting the camera icon. Your selected cameras will appear here!';
}

const dockCloseButton = document.getElementById('webcamDockClose');
if (dockCloseButton) {
    dockCloseButton.addEventListener('click', () => setWebcamDockOpen(false));
}

const dockPanel = document.getElementById('webcamDock');
if (dockPanel) {
    dockPanel.addEventListener('dragover', (event) => {
        if (event.dataTransfer.types.includes('application/webcam-data')) {
            event.preventDefault();
            dockPanel.classList.add('dragover');
        }
    });
    dockPanel.addEventListener('dragleave', () => {
        dockPanel.classList.remove('dragover');
    });
    dockPanel.addEventListener('drop', (event) => {
        event.preventDefault();
        dockPanel.classList.remove('dragover');
        const payload = event.dataTransfer.getData('application/webcam-data');
        if (!payload) return;
        try {
            const camera = JSON.parse(payload);
            addCameraToDock(camera);
        } catch (error) {
            console.warn('[Webcams] Could not parse dropped camera payload:', error);
        }
    });
}

renderWebcamDock();

// Hook setup process into map initialization and load lifecycles
if (typeof map !== 'undefined') {
    if (map.isStyleLoaded()) {
        initWebcams();
    } else {
        map.once('load', initWebcams);
    }
} else {
    window.addEventListener('load', () => {
        if (typeof map !== 'undefined') {
            if (map.isStyleLoaded()) {
                initWebcams();
            } else {
                map.once('load', initWebcams);
            }
        }
    });
}

// Re-register layers when dynamic map style changes occur
if (typeof window.registerLayerReinit === 'function') {
    window.registerLayerReinit(initWebcams);
}