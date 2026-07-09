// Parsing Bytes and Conversion to WebGL.
// This is an extremely long script.

/* MAJOR REFERENCES:
  netbymatt Level III repo: https://github.com/netbymatt/nexrad-level-3-data
  SteepAtticStairs AtticRadar: https://github.com/SteepAtticStairs/AtticRadar
*/

// VARIABLES

const reflectivityRadarCode = 94;
const refAbbreviations = ['NXQ', 'NYQ', 'NZQ', 'N0Q', 'NAQ', 'N1Q', 'NBQ', 'N2Q', 'N3Q'];

const randomAccessFile = "./RanodmAccessFile/index.js";


const now = new Date();

const modal = document.querySelector(".modal");
const modalContainer = document.querySelector(".modal-container");

const msgModal = document.getElementById("msgModal");
const messageEl = document.getElementById("radarMessage");

function radarMsg() {
    const radarStation = (window.currentRadarId || '').toUpperCase();

    if (!radarStation) return;

    const messageUrl = `https://corsproxy.io/?https://tgftp.nws.noaa.gov/SL.us008001/DF.of/DC.radar/DS.75ftm/SI.${radarStation.toLowerCase()}/sn.last` + "#";

    let method;
    if (messageUrl.includes("cors")) {
        method = "CORS"
    } else {
        method = "RAW"
    }

    if (messageEl) {
        messageEl.textContent = "Loading radar message...";
    }

    fetch(messageUrl, {
        "method": "GET",
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.text();
        })
        .then((text) => {
            console.log(text);
            console.log("✅ Fetching the Message was successful. || Method: " + method)
            if (messageEl) {
                messageEl.textContent = text;
            }
        })
        .catch((error) => {
            console.error('Failed to load radar message:', error);
            if (messageEl) {
                messageEl.innerHTML = `The Message Data could not be retrieved. <a href="https://github.com/JesseWx2011/Deluge/issues/new">Create</a> a new issue on GitHub.`;
            }
        });
}

// Get the latest Level III File.

async function latestLevelIII() {
    // Fetch from the Level III AWS Bucket

    const awsLevelIIIBucket = "https://unidata-nexrad-level3.s3.amazonaws.com/"
    
    // Build the prefix

    // Times automatically converted to UTC.

    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');

    console.log(year + "-" + month + "-" + day);
}
latestLevelIII();

    function messageModal() {
        radarMsg();
        msgModal.style.display = "flex";
        modalContainer.style.display = "flex";
        modalContainer.style.zIndex = "10000";
    }

    function closeModal() {
        modalContainer.style.display = "none";
        modalContainer.style.zIndex = "0";
        modal.style.display = "none";
    }