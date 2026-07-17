// Parsing Bytes and Conversion to WebGL.
// This is an extremely long script.

/* MAJOR REFERENCES:
  netbymatt Level III repo: https://github.com/netbymatt/nexrad-level-3-data
  SteepAtticStairs AtticRadar: https://github.com/SteepAtticStairs/AtticRadar
  ICD FOR THE RPG TO CLASS 1 USER (2620001): https://www.roc.noaa.gov/wsr88d/BuildInfo/Files.aspx

  A note on correctness: the byte offsets below are transcribed from the ICD
  from memory/reference implementations, not verified against a live capture
  in this environment. Every block/packet read is validated (divider check,
  range check) so a wrong offset throws instead of silently drawing garbage —
  that's what lets tryRenderNexradWebGL() fail safely into the IEM tile
  fallback in map.js. If the rendered image looks wrong, log parsedProduct
  (see bottom of tryRenderNexradWebGL) and we can correct offsets from there.
*/

// VARIABLES

const reflectivityRadarCode = 94;
const refAbbreviations = ['NXQ', 'NYQ', 'NZQ', 'N0Q', 'NAQ', 'N1Q', 'NBQ', 'N2Q', 'N3Q'];

const velocityRadarCode = 56;
const velAbbreviations = ['N0G, N1G, N2G, N3G'] 

const awsLevelIIIBucket = "https://unidata-nexrad-level3.s3.amazonaws.com/";

const NEXRAD_L3_PACKET_DIGITAL_RADIAL = 16;
const NEXRAD_L3_PACKET_RLE_RADIAL = 0xAF1F; // 44831 — legacy 16-level Radial Data Packet

const units = {
    153: 'DBz', // Reflectivity
    154: 'm/s', // Velocity
    161: "%", // Correlation Coeffecient
}

// Default byte-value -> physical-unit conversion per product, used when we
// can't confidently pull scale/offset out of the Product Description Block.
// value = (rawByte - offset) / scale
const NEXRAD_DEFAULT_SCALE_OFFSET = {
    N0B: { scale: 2.0, offset: 66.0, unit: 'dBZ' },
    N0G: { scale: 2.0, offset: 128.0, unit: 'm/s' },
    N0C: { scale: 1.0, offset: 0.0, unit: '%' },
    N0K: { scale: 1.0, offset: 0.0, unit: 'dB' },
    TZ0: { scale: 2.0, offset: 66.0, unit: 'dBZ' },
    TZ1: { scale: 2.0, offset: 66.0, unit: 'dBZ' },
    TZ2: { scale: 2.0, offset: 66.0, unit: 'dBZ' },
    TZL: { scale: 2.0, offset: 66.0, unit: 'dBZ' },
    TV0: { scale: 2.0, offset: 128.0, unit: 'm/s' },
    TV1: { scale: 2.0, offset: 128.0, unit: 'm/s' },
    TV2: { scale: 2.0, offset: 128.0, unit: 'm/s' }
};

// Per-product gate geometry (number of range gates x range-scale in km).
// The Digital Radial Data Array packet (16) does carry its own "range scale"
// halfword, but it's an unreliable legacy field across products, so gate
// size is looked up here from the product code instead — same approach as
// netbymatt/nexrad-level-3-data and AtticRadar.
const RADAR_PRODUCT_MAP = {
    // NEXRAD Super-Res
    N0B: { numberOfGates: 1840, rangeScale: 460, desc: "NEXRAD Super-Res Reflectivity", family: 'nexrad' },
    N0G: { numberOfGates: 1200, rangeScale: 300, desc: "NEXRAD Super-Res Velocity", family: 'nexrad' },
    N0C: { numberOfGates: 1200, rangeScale: 300, desc: "NEXRAD Correlation Coefficient", family: 'nexrad' },
    N0K: { numberOfGates: 1200, rangeScale: 300, desc: "NEXRAD Differential Reflectivity", family: 'nexrad' },

    // TDWR Short-Range (High-Res 150m gates)
    TZ0: { numberOfGates: 600, rangeScale: 90, desc: "TDWR Reflectivity (Tilt 1)", family: 'tdwr' },
    TZ1: { numberOfGates: 600, rangeScale: 90, desc: "TDWR Reflectivity (Tilt 2)", family: 'tdwr' },
    TZ2: { numberOfGates: 600, rangeScale: 90, desc: "TDWR Reflectivity (Tilt 3)", family: 'tdwr' },
    TV0: { numberOfGates: 600, rangeScale: 90, desc: "TDWR Velocity (Tilt 1)", family: 'tdwr' },
    TV1: { numberOfGates: 600, rangeScale: 90, desc: "TDWR Velocity (Tilt 2)", family: 'tdwr' },
    TV2: { numberOfGates: 600, rangeScale: 90, desc: "TDWR Velocity (Tilt 3)", family: 'tdwr' },

    // TDWR Long-Range (300m gates)
    TZL: { numberOfGates: 1390, rangeScale: 417, desc: "TDWR Long Range Reflectivity", family: 'tdwr' }
};
window.RADAR_PRODUCT_MAP = RADAR_PRODUCT_MAP;

// TDWR site IDs are 4-letter codes starting with "T" (TATL, TMCO, TOKC...);
// every other NEXRAD site (K***, P***, etc.) is treated as standard NEXRAD.
function isTdwrSite(radarId) {
    return /^T[A-Z]{3}$/.test((radarId || '').toUpperCase());
}
window.isTdwrSite = isTdwrSite;

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

async function fetchLevelIIIListing(radSite, productCode, dateObj) {
    const year = dateObj.getUTCFullYear();
    const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getUTCDate()).padStart(2, '0');

    const prefix = `?prefix=${radSite}_${productCode}_${year}_${month}_${day}`;
    const response = await fetch(awsLevelIIIBucket + prefix);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
    return Array.from(xmlDoc.getElementsByTagName("Key"))
        .map((node) => node.textContent?.trim())
        .filter(Boolean);
}

async function latestLevelIII(radarStation, product) {
    // Fetch from the Level III AWS Bucket. Today's and yesterday's (UTC)
    // prefixes are ALWAYS checked together and merged rather than only
    // falling back to yesterday when today's listing is empty — right
    // around 00Z the "today" prefix can exist but only have a couple of
    // keys in it, which would silently miss the actual latest scan if it
    // landed a few minutes before the UTC day rolled over.
    const radSite = (radarStation || window.currentRadarId || '').slice(1, 4).toUpperCase();
    const productCode = (product || 'N0B').toUpperCase();

    try {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);

        const [todayKeys, yesterdayKeys] = await Promise.all([
            fetchLevelIIIListing(radSite, productCode, today).catch(() => []),
            fetchLevelIIIListing(radSite, productCode, yesterday).catch(() => [])
        ]);

        const keys = [...yesterdayKeys, ...todayKeys].sort();
        const recentKeys = keys.slice(-5);
        console.log("Latest Level III keys:", recentKeys);

        return recentKeys;
    } catch (error) {
        console.error("Failed to parse Level III listing:", error);
        return [];
    }
}

async function fetchLevelIIIBuffer(key) {
    const latestFileUrl = `${awsLevelIIIBucket}${key}`;
    const response = await fetch(latestFileUrl);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.arrayBuffer();
}

// ---------------------------------------------------------------------------
// Binary parsing
// ---------------------------------------------------------------------------

class BinReader {
    constructor(buffer, byteOffset = 0) {
        this.view = new DataView(buffer);
        this.pos = byteOffset;
    }
    get remaining() {
        return this.view.byteLength - this.pos;
    }
    u8() { const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
    i16() { const v = this.view.getInt16(this.pos); this.pos += 2; return v; }
    u16() { const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
    i32() { const v = this.view.getInt32(this.pos); this.pos += 4; return v; }
    u32() { const v = this.view.getUint32(this.pos); this.pos += 4; return v; }
    f32() { const v = this.view.getFloat32(this.pos); this.pos += 4; return v; }
    bytes(n) {
        const out = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, n);
        this.pos += n;
        return out;
    }
    skip(n) { this.pos += n; }
}

// The AWS Level III objects begin with a short ASCII WMO abbreviated heading
// (e.g. "SDUS53 KLOT 141230\r\r\nN0B00\r\r\n") before the binary Message
// Header Block starts. Binary data begins right after the last CRCRLF
// sequence found in the leading text.
function stripWmoHeader(buffer) {
    const bytes = new Uint8Array(buffer);
    const searchLimit = Math.min(bytes.length, 200);
    let lastTerminator = -1;

    for (let i = 0; i < searchLimit - 2; i++) {
        if (bytes[i] === 0x0d && bytes[i + 1] === 0x0d && bytes[i + 2] === 0x0a) {
            lastTerminator = i + 3;
        }
    }

    return lastTerminator > -1 ? buffer.slice(lastTerminator) : buffer;
}

// Message Header Block: 18 bytes.
function parseMessageHeader(reader) {
    return {
        messageCode: reader.i16(),
        messageDate: reader.u16(),
        messageTime: reader.u32(),
        messageLength: reader.u32(),
        sourceId: reader.i16(),
        destinationId: reader.i16(),
        numBlocks: reader.u16()
    };
}

// Product Description Block: 102 bytes, immediately follows the message header.
function parsePDB(reader) {
    const divider = reader.i16();
    if (divider !== -1) {
        throw new Error(`Product Description Block divider mismatch (got ${divider}, expected -1) — file layout doesn't match what this parser expects.`);
    }

    const latitude = reader.i32() / 1000;
    const longitude = reader.i32() / 1000;
    const heightFeet = reader.i16();
    const productCode = reader.i16();
    const operationalMode = reader.i16();
    const vcp = reader.i16();
    const sequenceNumber = reader.i16();
    const volumeScanNumber = reader.i16();
    const volumeScanDate = reader.u16();
    const volumeScanStartTime = reader.u32();
    const productGenerationDate = reader.u16();
    const productGenerationTime = reader.u32();

    // Halfwords 18-29 (bytes 34-57) are product-dependent thresholds/params —
    // not decoded here beyond the raw values, since packet 16 carries its own
    // scale in the packet header rather than relying on these.
    const productDependent = [];
    for (let i = 0; i < 10; i++) productDependent.push(reader.i16());

    // Remainder of the 102-byte block: elevation, more product-dependent
    // params, and the compression flag/original length used by some
    // products. We don't rely on these for packet 16 digital products, but
    // skip forward to keep the reader position correct.
    reader.skip(102 - (2 + 4 + 4 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 4 + 2 + 4 + (10 * 2)));

    return {
        latitude,
        longitude,
        heightFeet,
        productCode,
        operationalMode,
        vcp,
        sequenceNumber,
        volumeScanNumber,
        volumeScanDate,
        volumeScanStartTime,
        productGenerationDate,
        productGenerationTime,
        productDependent
    };
}

function looksLikeBzip2(bytes, offset) {
    return bytes[offset] === 0x42 && bytes[offset + 1] === 0x5a && bytes[offset + 2] === 0x68; // "BZh"
}

function looksLikeZlib(bytes, offset) {
    // Common zlib header bytes: 0x78 0x01 / 0x78 0x9c / 0x78 0xda / 0x78 0x5e
    return bytes[offset] === 0x78 && [0x01, 0x9c, 0xda, 0x5e].includes(bytes[offset + 1]);
}

function decompressTailIfNeeded(buffer, offset) {
    const bytes = new Uint8Array(buffer);

    if (looksLikeBzip2(bytes, offset)) {
        if (typeof bzip2 === 'undefined') {
            throw new Error('Symbology block is bzip2-compressed but the bzip2.js library is not loaded.');
        }
        const compressed = bytes.slice(offset);
        const bitstream = bzip2.array(compressed);
        const decompressedString = bzip2.simple(bitstream);
        const out = new Uint8Array(decompressedString.length);
        for (let i = 0; i < decompressedString.length; i++) {
            out[i] = decompressedString.charCodeAt(i) & 0xff;
        }
        return out;
    }

    if (looksLikeZlib(bytes, offset)) {
        if (typeof pako === 'undefined') {
            throw new Error('Symbology block is zlib-compressed but pako is not loaded.');
        }
        return pako.inflate(bytes.slice(offset));
    }

    // Not compressed — the rest of the buffer is the raw block data.
    return bytes.slice(offset);
}

// Digital Radial Data Array Packet (packet code 16). Used by digital base
// products such as N0B (reflectivity) and N0G (base velocity).
function parseDigitalRadialPacket(reader, product) {
    const firstBin = reader.i16();
    const numBins = reader.u16();
    const iSweep = reader.i16();
    const jSweep = reader.i16();
    const rangeScale = reader.u16(); // raw packet scale factor — not trusted, see RADAR_PRODUCT_MAP note above
    const numRadials = reader.u16();

    if (numBins <= 0 || numBins > 2000) {
        throw new Error(`Digital radial packet numBins out of range: ${numBins}`);
    }
    if (numRadials <= 0 || numRadials > 720) {
        throw new Error(`Digital radial packet numRadials out of range: ${numRadials}`);
    }

    const radials = [];
    for (let r = 0; r < numRadials; r++) {
        const numBytes = reader.u16();
        const startAngleRaw = reader.u16();
        const angleDeltaRaw = reader.u16();

        if (numBytes <= 0 || numBytes > 2000) {
            throw new Error(`Digital radial packet radial ${r} byte count out of range: ${numBytes}`);
        }

        const startAngle = startAngleRaw / 10;
        const angleDelta = angleDeltaRaw / 10;

        if (startAngle < 0 || startAngle > 360.5 || angleDelta <= 0 || angleDelta > 45) {
            throw new Error(`Digital radial packet radial ${r} has an implausible angle (start ${startAngle}, delta ${angleDelta}) — offsets likely wrong.`);
        }

        const data = reader.bytes(numBytes).slice(); // copy out of the shared buffer
        if (numBytes % 2 === 1) reader.skip(1); // halfword alignment padding

        radials.push({ startAngle, angleDelta, data });
    }

    const productInfo = RADAR_PRODUCT_MAP[(product || 'N0B').toUpperCase()] || RADAR_PRODUCT_MAP.N0B;
    const gateSizeKm = productInfo.rangeScale / productInfo.numberOfGates;
    const firstBinKm = (firstBin || 0) * gateSizeKm;

    return {
        firstBinKm,
        gateSizeKm,
        numBins,
        numRadials,
        iSweep,
        jSweep,
        radials
    };
}

// Legacy Radial Data Packet (code 0xAF1F). Used by older, non-"digital"
// products — this is very likely what N0G (Base Velocity) and some
// TDWR products actually send, rather than the Digital Radial Data Array
// Packet (16): each gate is a 4-bit level (0-15), two gates packed per byte
// as (runLength << 4 | level), run-length encoded instead of one full byte
// per gate.
//
// NOTE: transcribed from the ICD reference, not verified against a live
// capture in this environment (no network access to NWS/AWS from here) —
// the per-radial header order mirrors packet 16's. Color mapping spreads
// the 16 levels evenly across the product's existing color stops rather
// than decoding the PDB's real per-scan data-level thresholds, so treat the
// resulting colors as an approximation to refine once you can check it
// against a real file.
function parseRleRadialPacket(reader, product) {
    const firstBin = reader.i16();
    const numBins = reader.i16();
    reader.i16(); // I center of sweep — unused, we already have radar lat/lon from the PDB
    reader.i16(); // J center of sweep — unused
    reader.i16(); // in-packet range-scale factor — not trusted, see RADAR_PRODUCT_MAP note above
    const numRadials = reader.i16();

    if (numBins <= 0 || numBins > 2000) {
        throw new Error(`RLE radial packet numBins out of range: ${numBins}`);
    }
    if (numRadials <= 0 || numRadials > 720) {
        throw new Error(`RLE radial packet numRadials out of range: ${numRadials}`);
    }

    const radials = [];
    for (let r = 0; r < numRadials; r++) {
        const numRleHalfwords = reader.u16();
        const startAngleRaw = reader.u16();
        const angleDeltaRaw = reader.u16();

        if (numRleHalfwords <= 0 || numRleHalfwords > 2000) {
            throw new Error(`RLE radial packet radial ${r} halfword count out of range: ${numRleHalfwords}`);
        }

        const startAngle = startAngleRaw / 10;
        const angleDelta = angleDeltaRaw / 10;
        if (startAngle < 0 || startAngle > 360.5 || angleDelta <= 0 || angleDelta > 45) {
            throw new Error(`RLE radial packet radial ${r} has an implausible angle (start ${startAngle}, delta ${angleDelta}) — offsets likely wrong.`);
        }

        const runBytes = reader.bytes(numRleHalfwords * 2).slice();
        const data = new Uint8Array(numBins);
        let gate = 0;
        for (let i = 0; i < runBytes.length && gate < numBins; i++) {
            const run = runBytes[i] >> 4;
            const level = runBytes[i] & 0x0f;
            const count = Math.min(run || 1, numBins - gate);
            data.fill(level, gate, gate + count);
            gate += count;
        }

        radials.push({ startAngle, angleDelta, data });
    }

    const productInfo = RADAR_PRODUCT_MAP[(product || 'N0B').toUpperCase()] || RADAR_PRODUCT_MAP.N0B;
    const gateSizeKm = productInfo.rangeScale / productInfo.numberOfGates;
    const firstBinKm = (firstBin || 0) * gateSizeKm;

    return {
        firstBinKm,
        gateSizeKm,
        numBins,
        numRadials,
        radials,
        is16Level: true
    };
}

// Walks Block Divider / Layer Divider framing to find the first Digital
// Radial Data Array Packet (code 16) in the Symbology Block. We don't need
// pre-computed byte offsets to locate the symbology block — it always
// follows the 18-byte header + 102-byte PDB directly, and blocks/layers are
// self-describing via their length fields.
function findDigitalRadialPacket(symbologyBytes, product) {
    const reader = new BinReader(symbologyBytes.buffer, symbologyBytes.byteOffset);
    const seenPacketCodes = [];

    const blockDivider = reader.i16();
    if (blockDivider !== -1) {
        throw new Error(`Symbology block divider mismatch (got ${blockDivider}, expected -1).`);
    }
    const blockId = reader.i16();
    if (blockId !== 1) {
        throw new Error(`Expected Symbology Block (id 1), got block id ${blockId}.`);
    }
    reader.i32(); // block length, not needed since we validate via layer dividers instead
    const numLayers = reader.i16();

    for (let layer = 0; layer < numLayers; layer++) {
        const layerDivider = reader.i16();
        if (layerDivider !== -1) {
            throw new Error(`Layer divider mismatch on layer ${layer} (got ${layerDivider}, expected -1).`);
        }
        const layerLength = reader.i32();
        const layerEnd = reader.pos + layerLength;

        while (reader.pos < layerEnd) {
            const packetCode = reader.u16();
            seenPacketCodes.push(packetCode);

            if (packetCode === NEXRAD_L3_PACKET_DIGITAL_RADIAL) {
                return parseDigitalRadialPacket(reader, product);
            }
            if (packetCode === NEXRAD_L3_PACKET_RLE_RADIAL) {
                return parseRleRadialPacket(reader, product);
            }

            // Unknown packet type: most Level III packet types encode a
            // byte-length of their own payload as the next halfword. Skip
            // past it rather than trying to interpret it.
            const packetDataLength = reader.u16();
            reader.skip(packetDataLength);
        }

        reader.pos = layerEnd;
    }

    throw new Error(`No Digital Radial Data Array Packet (16) or legacy RLE Radial Data Packet (0xAF1F) found — packet codes seen: [${seenPacketCodes.map(c => '0x' + c.toString(16)).join(', ')}]`);
}

async function parseLevelIIIBuffer(rawBuffer, product) {
    const buffer = stripWmoHeader(rawBuffer);
    const reader = new BinReader(buffer);

    const messageHeader = parseMessageHeader(reader);
    const pdb = parsePDB(reader);

    // From here (byte 120), the Symbology/Graphic/Tabular blocks follow —
    // possibly compressed as a single bzip2 or zlib stream.
    const tailOffset = reader.pos;
    const symbologyBytes = decompressTailIfNeeded(buffer, tailOffset);

    const radial = findDigitalRadialPacket(symbologyBytes, product);

    return { messageHeader, pdb, radial };
}

// Level III dates are "modified Julian" day counts where day 1 = Jan 1 1970,
// and times are seconds past midnight UTC. Used to derive the scan time
// shown in the product drawer.
function nexradEpochToDate(days, secondsPastMidnight) {
    if (!days || typeof secondsPastMidnight !== 'number') return null;
    const msPerDay = 86400000;
    const dayStartUtc = Date.UTC(1970, 0, 1) + (days - 1) * msPerDay;
    const date = new Date(dayStartUtc + secondsPastMidnight * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatScanTimeUTC(date) {
    if (!date) return null;
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const mon = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    return `${mon} ${date.getUTCDate()}, ${hh}:${mm} UTC`;
}

// ---------------------------------------------------------------------------
// Geometry: polar (range/azimuth from the radar) -> lon/lat -> Mercator
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371.0088;

function destinationPoint(lat0, lon0, bearingDeg, distanceKm) {
    const bearing = (bearingDeg * Math.PI) / 180;
    const lat1 = (lat0 * Math.PI) / 180;
    const lon1 = (lon0 * Math.PI) / 180;
    const angDist = distanceKm / EARTH_RADIUS_KM;

    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angDist) + Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearing)
    );
    const lon2 = lon1 + Math.atan2(
        Math.sin(bearing) * Math.sin(angDist) * Math.cos(lat1),
        Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    );

    return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

// ---------------------------------------------------------------------------
// Color ramps
// ---------------------------------------------------------------------------

const REFLECTIVITY_STOPS = [
    [-30, [0, 0, 0, 0]],
    [5, [100, 165, 230, 255]],
    [15, [30, 110, 200, 255]],
    [20, [30, 200, 90, 255]],
    [30, [20, 150, 40, 255]],
    [35, [235, 220, 40, 255]],
    [40, [235, 160, 30, 255]],
    [45, [220, 60, 30, 255]],
    [50, [180, 20, 20, 255]],
    [55, [230, 90, 220, 255]],
    [60, [170, 60, 220, 255]],
    [65, [220, 220, 250, 255]],
    [75, [255, 255, 255, 255]]
];

const VELOCITY_STOPS = [
    // Extreme Inbound (Light Pink to Bright Cyan)
    [-174, [255, 192, 203, 255]],
    [-150, [255, 0, 255, 255]],
    [-130, [148, 0, 211, 255]],
    [-110, [75, 0, 130, 255]],
    [-95, [0, 0, 180, 255]],
    [-80, [0, 80, 255, 255]],
    [-65, [0, 160, 255, 255]],
    [-50, [0, 225, 255, 255]],
    
    // Moderate to Weak Inbound (Cyan to Greens)
    [-38, [0, 255, 170, 255]],
    [-26, [0, 200, 80, 255]],
    [-16, [0, 130, 30, 255]],
    [-8, [0, 75, 15, 255]],
    [-3, [0, 35, 5, 255]],
    [-1, [0, 15, 0, 150]],
    
    // Center / Zero Isodop
    [0, [30, 30, 30, 0]],
    
    // Weak to Moderate Outbound (Reds/Oranges)
    [1, [15, 0, 0, 150]],
    [3, [45, 5, 5, 255]],
    [8, [85, 10, 10, 255]],
    [16, [130, 15, 15, 255]],
    [26, [185, 15, 15, 255]],
    [38, [230, 10, 10, 255]],
    
    // Strong to Extreme Outbound (Orange, Yellow, Coral, Pink, White)
    [50, [245, 85, 0, 255]],
    [65, [255, 145, 0, 255]],
    [80, [255, 205, 0, 255]],
    [95, [255, 255, 120, 255]],
    [-110, [255, 160, 160, 255]],
    [130, [255, 90, 150, 255]],
    [150, [240, 0, 130, 255]],
    [174, [255, 220, 240, 255]]
];

const CORRELATION_COEFFICIENT_STOPS = [
    [0, [0, 0, 0, 0]],
    [50, [255, 0, 0, 255]],
    [70, [255, 165, 0, 255]],
    [80, [255, 255, 0, 255]],
    [90, [0, 255, 0, 255]],
    [95, [0, 128, 255, 255]],
    [100, [0, 0, 255, 255]]
];

const DIFFERENTIAL_REFLECTIVITY_STOPS = [
    [-5, [0, 0, 255, 255]],
    [-2, [0, 128, 255, 255]],
    [0, [0, 255, 0, 255]],
    [1, [255, 255, 0, 255]],
    [3, [255, 165, 0, 255]],
    [5, [255, 0, 0, 255]],
    [7, [128, 0, 128, 255]]
];


function interpolateStops(stops, value) {
    if (value <= stops[0][0]) return stops[0][1];
    if (value >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];

    for (let i = 0; i < stops.length - 1; i++) {
        const [v0, c0] = stops[i];
        const [v1, c1] = stops[i + 1];
        if (value >= v0 && value <= v1) {
            const t = (value - v0) / (v1 - v0);
            return [
                c0[0] + (c1[0] - c0[0]) * t,
                c0[1] + (c1[1] - c0[1]) * t,
                c0[2] + (c1[2] - c0[2]) * t,
                c0[3] + (c1[3] - c0[3]) * t
            ];
        }
    }
    return stops[stops.length - 1][1];
}

// Attempts to read this project's own colortable JSON (see `colortables` in
// map.js). Handles a couple of plausible shapes defensively; returns null if
// the file is missing or doesn't match, so the caller can fall back to the
// built-in ramp above instead of failing the whole render.
async function loadProjectColorLut(product) {
    try {
        // Map products to their colortable subdirectories
        const productToSubdir = {
            // Reflectivity products
            'N0B': 'Reflectivity',
            'TZ0': 'Reflectivity',
            'TZ1': 'Reflectivity',
            'TZ2': 'Reflectivity',
            'TZL': 'Reflectivity',
            // Velocity products
            'N0G': 'Velocity',
            'TV0': 'Velocity',
            'TV1': 'Velocity',
            'TV2': 'Velocity',
            // Correlation Coefficient
            'N0C': 'CC',
            // Differential Reflectivity
            'N0K': 'DF'
        };

        const subdir = productToSubdir[product] || 'Reflectivity';
        
        // Get color table for this specific product type
        let selectedTable = 'IEM';
        if (typeof window.getColorTableForProduct === 'function') {
            selectedTable = window.getColorTableForProduct(product);
        } else if (window.selectedColorTable) {
            selectedTable = window.selectedColorTable;
        }
        
        // Map color table names to file extensions
        // Reflectivity: IEM.json, Base.pal, Jesse.pal, Radarscope.pal
        // Velocity: IEM.json, Default.pal
        // CC: Default.pal
        // DF: Default.pal
        const tableExtensions = {
            'IEM': '.json',
            'Base': '.pal',
            'Jesse': '.pal',
            'Radarscope': '.pal',
            'Default': '.pal',
            'DefaultI': '.pal',
        };
        
        const extension = tableExtensions[selectedTable] || '.json';
        const filename = selectedTable + extension;
        
        const response = await fetch(`../json/colortables/${subdir}/${filename}`);
        if (!response.ok) return null;
        const text = await response.text();

        let stops = null;
        
        if (extension === '.json') {
            // Parse JSON format
            const json = JSON.parse(text);
            if (Array.isArray(json)) {
                if (Array.isArray(json[0])) {
                    // [[value, [r,g,b,a]], ...] or [[value, "#rrggbb"], ...]
                    stops = json.map(([value, color]) => [value, normalizeColor(color)]);
                } else if (json[0] && typeof json[0] === 'object') {
                    // [{ value, color }, ...]
                    stops = json.map((entry) => [entry.value, normalizeColor(entry.color)]);
                }
            } else if (json && typeof json === 'object') {
                // { "value": "#rrggbb", ... }
                stops = Object.entries(json).map(([value, color]) => [Number(value), normalizeColor(color)]);
            }
        } else if (extension === '.pal') {
            // Parse .pal format (custom format with lines like "color: value r g b" or "SolidColor: value r g b")
            stops = [];
            const lines = text.split('\n');
            for (const line of lines) {
                // Match both "color:" and "SolidColor:" formats
                const match = line.match(/^(?:color(?:\d+)?|SolidColor):\s*(-?\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s+(\d+)/);
                if (match) {
                    const value = parseFloat(match[1]);
                    const r = parseInt(match[2], 10);
                    const g = parseInt(match[3], 10);
                    const b = parseInt(match[4], 10);
                    stops.push([value, [r, g, b, 255]]);
                }
            }
            console.log(`Parsed ${stops.length} color stops from ${filename}`);
        }

        // Validate that we got valid stops
        if (!stops || stops.length === 0) {
            console.warn(`No color stops parsed from ${filename}, returning null`);
            return null;
        }
        
        if (stops.some((s) => !Number.isFinite(s[0]) || !s[1])) return null;
        stops.sort((a, b) => a[0] - b[0]);
        return stops;
    } catch (error) {
        console.warn(`No usable colortable for ${product}, using built-in ramp:`, error);
        return null;
    }
}

function normalizeColor(color) {
    if (Array.isArray(color)) {
        return [color[0], color[1], color[2], color.length > 3 ? color[3] : 255];
    }
    if (typeof color === 'string' && color.startsWith('#')) {
        const hex = color.slice(1);
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return [r, g, b, 255];
    }
    return null;
}

// Products whose values are velocity (kt), so they should use VELOCITY_STOPS
// instead of the default REFLECTIVITY_STOPS.
function isVelocityProduct(product) {
    return ['N0G', 'TV0', 'TV1', 'TV2'].includes((product || '').toUpperCase());
}

// Products whose values are correlation coefficient (percentage)
function isCorrelationCoefficientProduct(product) {
    return ['N0C'].includes((product || '').toUpperCase());
}

// Products whose values are differential reflectivity (dB)
function isDifferentialReflectivityProduct(product) {
    return ['N0K'].includes((product || '').toUpperCase());
}

// Builds a 256-entry lookup table (byte value -> RGBA) for a given product.
// `is16Level` is set when the data came from the legacy RLE Radial Data
// Packet (0xAF1F) rather than the Digital Radial Data Array Packet (16) —
// in that case only the first 16 entries are meaningful (see
// parseRleRadialPacket's note on this being an approximate color mapping).
async function buildColorLut(product, is16Level) {
    const conversion = NEXRAD_DEFAULT_SCALE_OFFSET[product] || NEXRAD_DEFAULT_SCALE_OFFSET.N0B;
    const projectStops = await loadProjectColorLut(product);
    let stops;
    if (projectStops && projectStops.length > 0) {
        stops = projectStops;
    } else if (isVelocityProduct(product)) {
        stops = VELOCITY_STOPS;
    } else if (isCorrelationCoefficientProduct(product)) {
        stops = CORRELATION_COEFFICIENT_STOPS;
    } else if (isDifferentialReflectivityProduct(product)) {
        stops = DIFFERENTIAL_REFLECTIVITY_STOPS;
    } else {
        stops = REFLECTIVITY_STOPS;
    }

    // Validate stops array before proceeding
    if (!stops || stops.length === 0) {
        console.warn(`No valid color stops found for product ${product}, using REFLECTIVITY_STOPS as fallback`);
        stops = REFLECTIVITY_STOPS;
    }

    const lut = new Uint8ClampedArray(256 * 4);

    if (is16Level) {
        const minVal = stops[0][0];
        const maxVal = stops[stops.length - 1][0];
        for (let level = 0; level < 16; level++) {
            const rgba = level === 0
                ? [0, 0, 0, 0] // below threshold / no coverage
                : interpolateStops(stops, minVal + ((level - 1) / 14) * (maxVal - minVal));
            lut[level * 4] = rgba[0];
            lut[level * 4 + 1] = rgba[1];
            lut[level * 4 + 2] = rgba[2];
            lut[level * 4 + 3] = rgba[3];
        }
        return lut;
    }

    for (let raw = 0; raw < 256; raw++) {
        let rgba;
        if (raw === 0) {
            rgba = [0, 0, 0, 0]; // below threshold / no coverage
        } else if (raw === 1) {
            rgba = [130, 130, 130, 90]; // range-folded convention
        } else {
            const physicalValue = (raw - conversion.offset) / conversion.scale;
            rgba = interpolateStops(stops, physicalValue);
        }
        lut[raw * 4] = rgba[0];
        lut[raw * 4 + 1] = rgba[1];
        lut[raw * 4 + 2] = rgba[2];
        lut[raw * 4 + 3] = rgba[3];
    }
    return lut;
}

// ---------------------------------------------------------------------------
// Mesh construction: a polar "fan" grid, (numRadials+1) x (numBins+1)
// vertices, projected to Mapbox Mercator coordinates on the CPU.
// ---------------------------------------------------------------------------

function buildRadialMesh(radial, radarLat, radarLon, colorLut) {
    const { numBins, numRadials, radials, firstBinKm, gateSizeKm } = radial;

    const cols = numBins + 1;
    const rows = numRadials + 1;

    const azimuths = new Float32Array(rows);
    const ranges = new Float32Array(cols);

    for (let i = 0; i < numRadials; i++) {
        const startAz = (radials[i]?.startAngle ?? 0) % 360;
        const endAz = (startAz + (radials[i]?.angleDelta ?? 0)) % 360;
        const centerAz = (startAz + endAz) / 2;
        azimuths[i] = centerAz;
    }

    // The last boundary row should be the end of the last radial, not the
    // start of a non-existent one. That keeps the fan mesh closed without
    // introducing an extra, poorly defined sweep edge.
    if (numRadials > 0) {
        const lastRadial = radials[numRadials - 1];
        const lastStartAz = (lastRadial?.startAngle ?? 0) % 360;
        const lastEndAz = (lastStartAz + (lastRadial?.angleDelta ?? 0)) % 360;
        azimuths[numRadials] = lastEndAz;
    }

    const gateWidthKm = gateSizeKm || 1;
    for (let col = 0; col < cols; col++) {
        // Use the center of each range gate rather than the gate edge. This
        // makes the projected quad cells line up with the actual radial sample
        // locations more closely.
        ranges[col] = ((firstBinKm || 0) + gateWidthKm / 2) + col * gateWidthKm;
    }

    const positions = new Float32Array(rows * cols * 2);
    const uvs = new Float32Array(rows * cols * 2);

    for (let row = 0; row < rows; row++) {
        const azimuth = azimuths[row];
        const bearingDeg = (azimuth + 360) % 360;

        for (let col = 0; col < cols; col++) {
            const rangeKm = ranges[col];
            const [lon, lat] = destinationPoint(radarLat, radarLon, bearingDeg, rangeKm);
            const mercator = mapboxgl.MercatorCoordinate.fromLngLat([lon, lat], 0);

            const vertexIndex = row * cols + col;
            positions[vertexIndex * 2] = mercator.x;
            positions[vertexIndex * 2 + 1] = mercator.y;

            uvs[vertexIndex * 2] = col / numBins;
            uvs[vertexIndex * 2 + 1] = row / numRadials;
        }
    }

    const indices = new Uint32Array(numRadials * numBins * 6);
    let idx = 0;
    for (let row = 0; row < numRadials; row++) {
        for (let col = 0; col < numBins; col++) {
            const topLeft = row * cols + col;
            const topRight = topLeft + 1;
            const bottomLeft = (row + 1) * cols + col;
            const bottomRight = bottomLeft + 1;

            indices[idx++] = topLeft;
            indices[idx++] = bottomLeft;
            indices[idx++] = topRight;

            indices[idx++] = topRight;
            indices[idx++] = bottomLeft;
            indices[idx++] = bottomRight;
        }
    }

    // Texture: one texel per gate (numBins wide, numRadials tall), colored
    // via the LUT. This is what the fragment shader samples — the CPU does
    // the byte -> color lookup once per frame load, not per pixel.
    const textureData = new Uint8ClampedArray(numRadials * numBins * 4);
    for (let row = 0; row < numRadials; row++) {
        const gateValues = radials[row].data;
        for (let col = 0; col < numBins; col++) {
            const raw = col < gateValues.length ? gateValues[col] : 0;
            const texelIndex = (row * numBins + col) * 4;
            textureData[texelIndex] = colorLut[raw * 4];
            textureData[texelIndex + 1] = colorLut[raw * 4 + 1];
            textureData[texelIndex + 2] = colorLut[raw * 4 + 2];
            textureData[texelIndex + 3] = colorLut[raw * 4 + 3];
        }
    }

    return {
        positions,
        uvs,
        indices,
        textureData,
        textureWidth: numBins,
        textureHeight: numRadials
    };
}


// ---------------------------------------------------------------------------
// Orchestration — this is what map.js calls, and it either resolves after
// successfully adding/updating the WebGL layer, or rejects with a descriptive
// error so map.js can fall back to the IEM raster tiles.
// ---------------------------------------------------------------------------

async function tryRenderNexradWebGL(radarId, product) {
    if (typeof window.NexradRenderer === 'undefined') {
        throw new Error('NexradRenderer is not loaded (missing nexrad-render.js script tag?).');
    }

    const keys = await latestLevelIII(radarId, product);
    if (!keys || keys.length === 0) {
        throw new Error(`No recent Level III ${product} files found for ${radarId}.`);
    }
    const latestKey = keys[keys.length - 1];

    const rawBuffer = await fetchLevelIIIBuffer(latestKey);
    const parsedProduct = await parseLevelIIIBuffer(rawBuffer, product);

    console.info('[Deluge] Parsed NEXRAD Level III product:', parsedProduct.pdb, parsedProduct.radial.numRadials, 'radials x', parsedProduct.radial.numBins, 'bins');

    const colorLut = await buildColorLut(product.toUpperCase(), parsedProduct.radial.is16Level);
    const mesh = buildRadialMesh(parsedProduct.radial, parsedProduct.pdb.latitude, parsedProduct.pdb.longitude, colorLut);

    window.NexradRenderer.render(mesh);

    const scanDate = nexradEpochToDate(parsedProduct.pdb.volumeScanDate, parsedProduct.pdb.volumeScanStartTime);
    const scanTimeEl = document.getElementById('scanTime');
    if (scanTimeEl) scanTimeEl.textContent = formatScanTimeUTC(scanDate) || '';

    return parsedProduct;
}

// ---------------------------------------------------------------------------
// Radar site switching — clears the previous site's WebGL mesh (and the IEM
// raster fallback, if it's currently visible) before loading the new site,
// so a stale frame from the old radar never lingers on screen while the new
// one loads. Also updates the product drawer's TDWR/NEXRAD indicator and
// filters the visible product list to whichever family the new site supports.
// ---------------------------------------------------------------------------

function clearRadarLayers() {
    if (window.NexradRenderer && typeof window.NexradRenderer.remove === 'function') {
        window.NexradRenderer.remove();
    }
    if (typeof map !== 'undefined' && map && typeof map.getLayer === 'function' && map.getLayer('radar-image-layer')) {
        map.setLayoutProperty('radar-image-layer', 'visibility', 'none');
    }
    const scanTimeEl = document.getElementById('scanTime');
    if (scanTimeEl) scanTimeEl.textContent = '';
}
window.clearRadarLayers = clearRadarLayers;

// Shows/hides productRow elements in the drawer based on data-family, and
// toggles the yellow/black site-type dot next to the radar site name.
function refreshProductDrawerForSite(radarId) {
    const tdwr = isTdwrSite(radarId);

    document.querySelectorAll('.productRow[data-family]').forEach((row) => {
        const show = tdwr ? row.dataset.family === 'tdwr' : row.dataset.family === 'nexrad';
        row.classList.toggle('hidden-family', !show);
    });

    const dot = document.getElementById('radarTypeDot');
    if (dot) dot.classList.toggle('tdwr', tdwr);

    return tdwr;
}
window.refreshProductDrawerForSite = refreshProductDrawerForSite;

// Call this from the radar-site selection handler (in map.js) instead of
// setting window.currentRadarId directly, e.g.:
//   await window.switchRadarSite('KLOT');
async function switchRadarSite(newRadarId, product) {
    clearRadarLayers();

    window.currentRadarId = (newRadarId || '').toUpperCase();
    refreshProductDrawerForSite(window.currentRadarId);

    const radarSiteEl = document.getElementById('radarSite');
    if (radarSiteEl) radarSiteEl.textContent = window.currentRadarId || '----';

    if (typeof window.loadStormTracks === 'function') {
        window.loadStormTracks(window.currentRadarId);
    }

    const activeProduct = (product || window.currentSelectedProduct || 'N0B').toUpperCase();
    return tryRenderNexradWebGL(window.currentRadarId, activeProduct);
}
window.switchRadarSite = switchRadarSite;

window.latestLevelIII = latestLevelIII;
window.tryRenderNexradWebGL = tryRenderNexradWebGL;

// AtticRadar: https://github.com/SteepAtticStairs/AtticRadar/blob/main/app/radar/libnexrad/detect_level.js


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

    window.messageModal = messageModal;
    window.closeModal = closeModal;