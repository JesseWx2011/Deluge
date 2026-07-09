const webcamSources = [
    {"name": "ISU Webcams", "source": "https://mesonet.agron.iastate.edu/geojson/webcam.geojson?network=TV"}
];

async function fetchWebcams() {
    const urls = webcamSources.map(item => item.source);

    try {
        const fetches = urls.map(url => fetch(url).then(res => res.json()));
        const data = await Promise.all(fetches);
        
        // Return data[0] so we pass the raw GeoJSON object, not an array containing it
        return data[0]; 
    } catch (error) {
        console.error("Failed to fetch webcams:", error);
    }
}

function mapISUCams(geojsonData) {
    // Ensure we handle map loading safely
    const setupLayer = () => {
        if (map.getSource("isuCams")) return; // Prevent duplicate additions

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

    if (map.loaded()) {
        setupLayer();
    } else {
        map.on('load', setupLayer);
    }
}

// Mapbox click listener pulls data directly from the clicked feature
map.on("click", "isuCamsLayer", (e) => {
    // 1. Get coordinates of the clicked point
    const coordinates = e.features[0].geometry.coordinates.slice();
    
    // 2. Extract properties from the clicked feature
    const { name, imgurl, county, state } = e.features[0].properties;

    // 3. Build the HTML snippet dynamically
    const popupHTML = `
        <div style="font-family: 'Montserrat', sans-serif; padding: 12px; background: #fff; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.35); max-width: 300px;">
            <h3 style="margin: 0 0 5px 0; color: #111;">${name}</h3>
            <p style="margin: 0 0 10px 0; font-size: 12px; color: #666;">${county} County, ${state}</p>
            <img src="${imgurl}" alt="${name}" style="width: 100%; max-width: 276px; border-radius: 4px; display: block;"/>
        </div>
    `;

    // 4. Ensure the popup stays pinned to the point regardless of zoom layer adjustments
    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
    }

    // 5. Render to the map
    new mapboxgl.Popup({ className: 'webcamPopup' })
        .setLngLat(coordinates)
        .setHTML(popupHTML)
        .addTo(map);
});

// Change the cursor to a pointer when hovering over the webcams layer
map.on('mouseenter', 'isuCamsLayer', () => {
    map.getCanvas().style.cursor = 'pointer';
});

map.on('mouseleave', 'isuCamsLayer', () => {
    map.getCanvas().style.cursor = '';
});

async function init() {
    const webcamData = await fetchWebcams();
    if (webcamData) {
        mapISUCams(webcamData);
    }
}

init();