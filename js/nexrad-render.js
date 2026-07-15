// Generic WebGL rendering plumbing for a textured mesh, drawn as a Mapbox GL
// "custom" layer. This file knows nothing about NEXRAD or bzip2 — it just
// takes mercator-projected vertices + UVs + an RGBA texture and draws them.
// nexrad.js builds the mesh/texture and hands it to window.NexradRenderer.

const NEXRAD_LAYER_ID = 'nexrad-webgl-layer';

function getNexradMap() {
    return (window && window.map) || null;
}

const nexradVertexShaderSource = `
attribute vec2 a_pos;
attribute vec2 a_uv;
uniform mat4 u_matrix;
varying vec2 v_uv;
void main() {
    gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
    v_uv = a_uv;
}
`;

const nexradFragmentShaderSource = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_opacity;
varying vec2 v_uv;
void main() {
    vec4 color = texture2D(u_texture, v_uv);
    gl_FragColor = vec4(color.rgb * color.a, color.a) * u_opacity;
}
`;

function compileNexradShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`NEXRAD shader compile error: ${info}`);
    }
    return shader;
}

function createNexradProgram(gl) {
    const vertexShader = compileNexradShader(gl, gl.VERTEX_SHADER, nexradVertexShaderSource);
    const fragmentShader = compileNexradShader(gl, gl.FRAGMENT_SHADER, nexradFragmentShaderSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        throw new Error(`NEXRAD program link error: ${info}`);
    }
    return program;
}

function createNexradCustomLayer() {
    let program = null;
    let positionBuffer = null;
    let uvBuffer = null;
    let indexBuffer = null;
    let indexCount = 0;
    let texture = null;
    let attribLocations = null;
    let uniformLocations = null;
    let pendingMesh = null;
    let opacity = (typeof window.radarOpacity === 'number') ? window.radarOpacity : 1;

    function uploadMesh(gl, mesh) {
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        indexCount = mesh.indices.length;

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mesh.textureWidth, mesh.textureHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, mesh.textureData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    return {
        id: NEXRAD_LAYER_ID,
        type: 'custom',
        renderingMode: '2d',

        onAdd(_map, gl) {
            program = createNexradProgram(gl);
            positionBuffer = gl.createBuffer();
            uvBuffer = gl.createBuffer();
            indexBuffer = gl.createBuffer();
            texture = gl.createTexture();

            attribLocations = {
                position: gl.getAttribLocation(program, 'a_pos'),
                uv: gl.getAttribLocation(program, 'a_uv')
            };
            uniformLocations = {
                matrix: gl.getUniformLocation(program, 'u_matrix'),
                texture: gl.getUniformLocation(program, 'u_texture'),
                opacity: gl.getUniformLocation(program, 'u_opacity')
            };

            if (pendingMesh) {
                uploadMesh(gl, pendingMesh);
                pendingMesh = null;
            }

            if (typeof window.ensureRadarLayerOrder === 'function') {
                window.ensureRadarLayerOrder();
            }
        },

        setMesh(mesh, gl) {
            if (program && gl) {
                uploadMesh(gl, mesh);
            } else {
                pendingMesh = mesh;
            }
        },

        setOpacity(value) {
            opacity = value;
        },

        render(gl, matrix) {
            if (!indexCount || !program) return;

            gl.useProgram(program);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

            gl.uniformMatrix4fv(uniformLocations.matrix, false, matrix);
            gl.uniform1f(uniformLocations.opacity, opacity);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(uniformLocations.texture, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.enableVertexAttribArray(attribLocations.position);
            gl.vertexAttribPointer(attribLocations.position, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
            gl.enableVertexAttribArray(attribLocations.uv);
            gl.vertexAttribPointer(attribLocations.uv, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
        },

        onRemove() {
            program = null;
            indexCount = 0;
        }
    };
}

window.NexradRenderer = (function () {
    let layerInstance = null;

    function ensureLayer() {
        const mapInstance = getNexradMap();
        if (!mapInstance || typeof mapInstance.getLayer !== 'function' || typeof mapInstance.addLayer !== 'function') {
            throw new Error('Map is not ready yet.');
        }
        if (!layerInstance) {
            layerInstance = createNexradCustomLayer();
        }
        if (!mapInstance.getLayer(NEXRAD_LAYER_ID)) {
            const beforeLayer = mapInstance.getLayer('alerts-outline')
                ? 'alerts-outline'
                : (mapInstance.getLayer('road-minor') ? 'road-minor' : undefined);

            mapInstance.addLayer(layerInstance, beforeLayer);
            if (typeof window.ensureRadarLayerOrder === 'function') {
                window.ensureRadarLayerOrder();
            }
        }
        return layerInstance;
    }

    return {
        // mesh: { positions: Float32Array, uvs: Float32Array, indices: Uint32Array,
        //         textureData: Uint8ClampedArray, textureWidth, textureHeight }
        render(mesh) {
            const layer = ensureLayer();
            const mapInstance = getNexradMap();
            const gl = mapInstance && mapInstance.painter && mapInstance.painter.context && mapInstance.painter.context.gl;
            layer.setMesh(mesh, gl);
            if (mapInstance && typeof mapInstance.triggerRepaint === 'function') {
                mapInstance.triggerRepaint();
            }
        },
        setVisible(isVisible) {
            const mapInstance = getNexradMap();
            if (mapInstance && typeof mapInstance.getLayer === 'function' && mapInstance.getLayer(NEXRAD_LAYER_ID)) {
                mapInstance.setLayoutProperty(NEXRAD_LAYER_ID, 'visibility', isVisible ? 'visible' : 'none');
            }
        },
        setOpacity(value) {
            if (layerInstance) layerInstance.setOpacity(value);
            const mapInstance = getNexradMap();
            if (mapInstance && typeof mapInstance.triggerRepaint === 'function') {
                mapInstance.triggerRepaint();
            }
        },
        remove() {
            const mapInstance = getNexradMap();
            if (mapInstance && typeof mapInstance.getLayer === 'function' && mapInstance.getLayer(NEXRAD_LAYER_ID)) {
                mapInstance.removeLayer(NEXRAD_LAYER_ID);
            }
            layerInstance = null;
        }
    };
})();