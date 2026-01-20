// Simplex noise implementation
class SimplexNoise {
    constructor(seed = Math.random()) {
        this.p = new Uint8Array(256);
        this.perm = new Uint8Array(512);

        for (let i = 0; i < 256; i++) this.p[i] = i;

        let n, q;
        for (let i = 255; i > 0; i--) {
            seed = (seed * 16807) % 2147483647;
            n = seed % (i + 1);
            q = this.p[i];
            this.p[i] = this.p[n];
            this.p[n] = q;
        }

        for (let i = 0; i < 512; i++) {
            this.perm[i] = this.p[i & 255];
        }
    }

    noise2D(x, y) {
        const F2 = 0.5 * (Math.sqrt(3) - 1);
        const G2 = (3 - Math.sqrt(3)) / 6;

        let s = (x + y) * F2;
        let i = Math.floor(x + s);
        let j = Math.floor(y + s);

        let t = (i + j) * G2;
        let X0 = i - t;
        let Y0 = j - t;
        let x0 = x - X0;
        let y0 = y - Y0;

        let i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; }
        else { i1 = 0; j1 = 1; }

        let x1 = x0 - i1 + G2;
        let y1 = y0 - j1 + G2;
        let x2 = x0 - 1 + 2 * G2;
        let y2 = y0 - 1 + 2 * G2;

        let ii = i & 255;
        let jj = j & 255;

        const grad = (hash, x, y) => {
            let h = hash & 7;
            let u = h < 4 ? x : y;
            let v = h < 4 ? y : x;
            return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
        };

        let n0, n1, n2;

        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 < 0) n0 = 0;
        else {
            t0 *= t0;
            n0 = t0 * t0 * grad(this.perm[ii + this.perm[jj]], x0, y0);
        }

        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 < 0) n1 = 0;
        else {
            t1 *= t1;
            n1 = t1 * t1 * grad(this.perm[ii + i1 + this.perm[jj + j1]], x1, y1);
        }

        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 < 0) n2 = 0;
        else {
            t2 *= t2;
            n2 = t2 * t2 * grad(this.perm[ii + 1 + this.perm[jj + 1]], x2, y2);
        }

        return 70 * (n0 + n1 + n2);
    }
}

// Block types
const BLOCKS = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    WOOD: 4,
    LEAVES: 5,
    SAND: 6,
    WATER: 7,
    COBBLESTONE: 8,
    PLANKS: 9
};

const BLOCK_COLORS = {
    [BLOCKS.GRASS]: { top: 0x7CFC00, side: 0x8B4513, bottom: 0x8B4513 },
    [BLOCKS.DIRT]: { top: 0x8B4513, side: 0x8B4513, bottom: 0x8B4513 },
    [BLOCKS.STONE]: { top: 0x808080, side: 0x808080, bottom: 0x808080 },
    [BLOCKS.WOOD]: { top: 0x966F33, side: 0x6B4423, bottom: 0x966F33 },
    [BLOCKS.LEAVES]: { top: 0x228B22, side: 0x228B22, bottom: 0x228B22 },
    [BLOCKS.SAND]: { top: 0xF4D03F, side: 0xF4D03F, bottom: 0xF4D03F },
    [BLOCKS.WATER]: { top: 0x4169E1, side: 0x4169E1, bottom: 0x4169E1 },
    [BLOCKS.COBBLESTONE]: { top: 0x696969, side: 0x696969, bottom: 0x696969 },
    [BLOCKS.PLANKS]: { top: 0xDEB887, side: 0xDEB887, bottom: 0xDEB887 }
};

const BLOCK_NAMES = {
    [BLOCKS.GRASS]: 'Grass',
    [BLOCKS.DIRT]: 'Dirt',
    [BLOCKS.STONE]: 'Stone',
    [BLOCKS.WOOD]: 'Wood',
    [BLOCKS.LEAVES]: 'Leaves',
    [BLOCKS.SAND]: 'Sand',
    [BLOCKS.WATER]: 'Water',
    [BLOCKS.COBBLESTONE]: 'Cobble',
    [BLOCKS.PLANKS]: 'Planks'
};

// Game constants
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 64;
const RENDER_DISTANCE = 4;

// Game state
let scene, camera, renderer;
let player = { x: 0, y: 30, z: 0, yaw: 0, pitch: 0, vy: 0 };
let chunks = new Map();
let blockGeometries = new Map();
let selectedBlock = BLOCKS.DIRT;
let hotbar = [BLOCKS.GRASS, BLOCKS.DIRT, BLOCKS.STONE, BLOCKS.COBBLESTONE, BLOCKS.WOOD, BLOCKS.PLANKS, BLOCKS.LEAVES, BLOCKS.SAND, BLOCKS.WATER];
let selectedSlot = 0;

let keys = {};
let isPointerLocked = false;
let isFlying = true;
let playerName = 'Player';
let playerId = Math.random().toString(36).substr(2, 9);
let otherPlayers = new Map();
let ws = null;

const noise = new SimplexNoise(12345);

// DOM elements
const gameContainer = document.getElementById('game-container');
const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const playerNameInput = document.getElementById('player-name-input');
const positionEl = document.getElementById('position');
const fpsEl = document.getElementById('fps');
const playersListEl = document.getElementById('players');
const hudEl = document.getElementById('hud');

// Initialize Three.js
function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 50, CHUNK_SIZE * RENDER_DISTANCE);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(player.x, player.y, player.z);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    gameContainer.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    scene.add(directionalLight);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Terrain generation
function getHeight(x, z) {
    let height = 0;
    height += noise.noise2D(x * 0.01, z * 0.01) * 20;
    height += noise.noise2D(x * 0.05, z * 0.05) * 5;
    height += noise.noise2D(x * 0.1, z * 0.1) * 2;
    return Math.floor(height + 20);
}

function generateChunk(chunkX, chunkZ) {
    const blocks = new Map();

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const worldX = chunkX * CHUNK_SIZE + x;
            const worldZ = chunkZ * CHUNK_SIZE + z;
            const height = getHeight(worldX, worldZ);

            for (let y = 0; y < WORLD_HEIGHT; y++) {
                let block = BLOCKS.AIR;

                if (y < height - 4) {
                    block = BLOCKS.STONE;
                } else if (y < height - 1) {
                    block = BLOCKS.DIRT;
                } else if (y === height - 1) {
                    block = BLOCKS.GRASS;
                }

                if (block !== BLOCKS.AIR) {
                    blocks.set(`${x},${y},${z}`, block);
                }
            }

            // Add trees occasionally
            if (height > 15 && Math.random() < 0.01) {
                const treeHeight = 4 + Math.floor(Math.random() * 3);
                for (let ty = 0; ty < treeHeight; ty++) {
                    blocks.set(`${x},${height + ty},${z}`, BLOCKS.WOOD);
                }
                // Leaves
                for (let lx = -2; lx <= 2; lx++) {
                    for (let lz = -2; lz <= 2; lz++) {
                        for (let ly = treeHeight - 2; ly <= treeHeight + 1; ly++) {
                            if (Math.abs(lx) + Math.abs(lz) <= 3 && (lx !== 0 || lz !== 0 || ly > treeHeight)) {
                                const key = `${x + lx},${height + ly},${z + lz}`;
                                if (!blocks.has(key)) {
                                    blocks.set(key, BLOCKS.LEAVES);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return blocks;
}

function getChunkKey(chunkX, chunkZ) {
    return `${chunkX},${chunkZ}`;
}

function worldToChunk(x, z) {
    return {
        chunkX: Math.floor(x / CHUNK_SIZE),
        chunkZ: Math.floor(z / CHUNK_SIZE),
        localX: ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
        localZ: ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    };
}

function getBlock(x, y, z) {
    const { chunkX, chunkZ, localX, localZ } = worldToChunk(x, z);
    const chunk = chunks.get(getChunkKey(chunkX, chunkZ));
    if (!chunk) return BLOCKS.AIR;
    return chunk.blocks.get(`${localX},${y},${localZ}`) || BLOCKS.AIR;
}

function setBlock(x, y, z, blockType) {
    const { chunkX, chunkZ, localX, localZ } = worldToChunk(x, z);
    const chunkKey = getChunkKey(chunkX, chunkZ);
    let chunk = chunks.get(chunkKey);

    if (!chunk) return;

    const key = `${localX},${y},${localZ}`;
    if (blockType === BLOCKS.AIR) {
        chunk.blocks.delete(key);
    } else {
        chunk.blocks.set(key, blockType);
    }

    rebuildChunkMesh(chunkX, chunkZ);

    // Rebuild adjacent chunks if on edge
    if (localX === 0) rebuildChunkMesh(chunkX - 1, chunkZ);
    if (localX === CHUNK_SIZE - 1) rebuildChunkMesh(chunkX + 1, chunkZ);
    if (localZ === 0) rebuildChunkMesh(chunkX, chunkZ - 1);
    if (localZ === CHUNK_SIZE - 1) rebuildChunkMesh(chunkX, chunkZ + 1);

    // Send to server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'block',
            x, y, z,
            blockType
        }));
    }
}

function createBlockMesh(blockType, x, y, z, neighbors) {
    const colors = BLOCK_COLORS[blockType];
    if (!colors) return null;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials = [
        new THREE.MeshLambertMaterial({ color: colors.side }),   // right
        new THREE.MeshLambertMaterial({ color: colors.side }),   // left
        new THREE.MeshLambertMaterial({ color: colors.top }),    // top
        new THREE.MeshLambertMaterial({ color: colors.bottom }), // bottom
        new THREE.MeshLambertMaterial({ color: colors.side }),   // front
        new THREE.MeshLambertMaterial({ color: colors.side })    // back
    ];

    if (blockType === BLOCKS.LEAVES) {
        materials.forEach(m => { m.transparent = true; m.opacity = 0.9; });
    }
    if (blockType === BLOCKS.WATER) {
        materials.forEach(m => { m.transparent = true; m.opacity = 0.6; });
    }

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    return mesh;
}

function buildChunkMesh(chunkX, chunkZ) {
    const chunk = chunks.get(getChunkKey(chunkX, chunkZ));
    if (!chunk) return;

    const group = new THREE.Group();

    chunk.blocks.forEach((blockType, key) => {
        const [lx, ly, lz] = key.split(',').map(Number);
        const wx = chunkX * CHUNK_SIZE + lx;
        const wz = chunkZ * CHUNK_SIZE + lz;

        // Check if any face is visible
        const neighbors = {
            px: getBlock(wx + 1, ly, wz),
            nx: getBlock(wx - 1, ly, wz),
            py: getBlock(wx, ly + 1, wz),
            ny: getBlock(wx, ly - 1, wz),
            pz: getBlock(wx, ly, wz + 1),
            nz: getBlock(wx, ly, wz - 1)
        };

        const hasVisibleFace = Object.values(neighbors).some(n => n === BLOCKS.AIR || n === BLOCKS.WATER);

        if (hasVisibleFace || blockType === BLOCKS.WATER) {
            const mesh = createBlockMesh(blockType, wx, ly, wz, neighbors);
            if (mesh) group.add(mesh);
        }
    });

    return group;
}

function rebuildChunkMesh(chunkX, chunkZ) {
    const chunkKey = getChunkKey(chunkX, chunkZ);
    const chunk = chunks.get(chunkKey);
    if (!chunk) return;

    if (chunk.mesh) {
        scene.remove(chunk.mesh);
        chunk.mesh.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
    }

    chunk.mesh = buildChunkMesh(chunkX, chunkZ);
    if (chunk.mesh) scene.add(chunk.mesh);
}

function updateChunks() {
    const playerChunkX = Math.floor(player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.z / CHUNK_SIZE);

    // Load new chunks
    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
        for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
            const chunkX = playerChunkX + dx;
            const chunkZ = playerChunkZ + dz;
            const key = getChunkKey(chunkX, chunkZ);

            if (!chunks.has(key)) {
                const blocks = generateChunk(chunkX, chunkZ);
                const chunk = { blocks, mesh: null };
                chunks.set(key, chunk);
                chunk.mesh = buildChunkMesh(chunkX, chunkZ);
                if (chunk.mesh) scene.add(chunk.mesh);
            }
        }
    }

    // Unload far chunks
    chunks.forEach((chunk, key) => {
        const [cx, cz] = key.split(',').map(Number);
        const dist = Math.max(Math.abs(cx - playerChunkX), Math.abs(cz - playerChunkZ));

        if (dist > RENDER_DISTANCE + 1) {
            if (chunk.mesh) {
                scene.remove(chunk.mesh);
                chunk.mesh.traverse(obj => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(m => m.dispose());
                        } else {
                            obj.material.dispose();
                        }
                    }
                });
            }
            chunks.delete(key);
        }
    });
}

// Player controls
function initControls() {
    document.addEventListener('keydown', (e) => {
        keys[e.code] = true;

        // Number keys for hotbar
        if (e.code >= 'Digit1' && e.code <= 'Digit9') {
            selectedSlot = parseInt(e.code.charAt(5)) - 1;
            selectedBlock = hotbar[selectedSlot];
            updateHUD();
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isPointerLocked) return;

        player.yaw -= e.movementX * 0.002;
        player.pitch -= e.movementY * 0.002;
        player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
    });

    renderer.domElement.addEventListener('click', () => {
        if (!isPointerLocked) {
            renderer.domElement.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        isPointerLocked = document.pointerLockElement === renderer.domElement;
    });

    document.addEventListener('mousedown', (e) => {
        if (!isPointerLocked) return;

        const hit = raycast();
        if (!hit) return;

        if (e.button === 0) { // Left click - break
            setBlock(hit.x, hit.y, hit.z, BLOCKS.AIR);
        } else if (e.button === 2) { // Right click - place
            const nx = hit.x + hit.normal.x;
            const ny = hit.y + hit.normal.y;
            const nz = hit.z + hit.normal.z;

            // Don't place block inside player
            const px = Math.floor(player.x);
            const py = Math.floor(player.y);
            const pz = Math.floor(player.z);
            if ((nx === px && (ny === py || ny === py - 1) && nz === pz)) return;

            setBlock(nx, ny, nz, selectedBlock);
        }
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());
}

function raycast() {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    const step = 0.1;
    const maxDist = 6;

    let px = camera.position.x;
    let py = camera.position.y;
    let pz = camera.position.z;

    let lastX = Math.floor(px);
    let lastY = Math.floor(py);
    let lastZ = Math.floor(pz);

    for (let d = 0; d < maxDist; d += step) {
        const x = Math.floor(px + direction.x * d);
        const y = Math.floor(py + direction.y * d);
        const z = Math.floor(pz + direction.z * d);

        const block = getBlock(x, y, z);

        if (block !== BLOCKS.AIR && block !== BLOCKS.WATER) {
            return {
                x, y, z,
                normal: {
                    x: lastX - x,
                    y: lastY - y,
                    z: lastZ - z
                }
            };
        }

        lastX = x;
        lastY = y;
        lastZ = z;
    }

    return null;
}

function updatePlayer(dt) {
    const speed = isFlying ? 15 : 5;
    const moveSpeed = speed * dt;

    // Calculate movement direction
    let moveX = 0;
    let moveZ = 0;

    if (keys['KeyW']) { moveX += Math.sin(player.yaw); moveZ += Math.cos(player.yaw); }
    if (keys['KeyS']) { moveX -= Math.sin(player.yaw); moveZ -= Math.cos(player.yaw); }
    if (keys['KeyA']) { moveX += Math.cos(player.yaw); moveZ -= Math.sin(player.yaw); }
    if (keys['KeyD']) { moveX -= Math.cos(player.yaw); moveZ += Math.sin(player.yaw); }

    // Normalize
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
        moveX = (moveX / len) * moveSpeed;
        moveZ = (moveZ / len) * moveSpeed;
    }

    // Apply movement with collision
    const newX = player.x + moveX;
    const newZ = player.z + moveZ;

    // Simple collision check
    const py = Math.floor(player.y);
    if (getBlock(Math.floor(newX), py, Math.floor(player.z)) === BLOCKS.AIR &&
        getBlock(Math.floor(newX), py - 1, Math.floor(player.z)) === BLOCKS.AIR) {
        player.x = newX;
    }
    if (getBlock(Math.floor(player.x), py, Math.floor(newZ)) === BLOCKS.AIR &&
        getBlock(Math.floor(player.x), py - 1, Math.floor(newZ)) === BLOCKS.AIR) {
        player.z = newZ;
    }

    // Vertical movement
    if (isFlying) {
        if (keys['Space']) player.y += moveSpeed;
        if (keys['ShiftLeft']) player.y -= moveSpeed;
    } else {
        // Gravity
        player.vy -= 25 * dt;
        player.y += player.vy * dt;

        // Ground collision
        const groundY = Math.floor(player.y - 1.6);
        if (getBlock(Math.floor(player.x), groundY, Math.floor(player.z)) !== BLOCKS.AIR) {
            player.y = groundY + 2.6;
            player.vy = 0;

            if (keys['Space']) {
                player.vy = 8;
            }
        }
    }

    // Update camera
    camera.position.set(player.x, player.y, player.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    // Update position display
    positionEl.textContent = `Position: ${Math.floor(player.x)}, ${Math.floor(player.y)}, ${Math.floor(player.z)}`;
}

// HUD
function updateHUD() {
    hudEl.innerHTML = hotbar.map((block, i) => {
        const color = BLOCK_COLORS[block]?.top || 0x888888;
        const hexColor = '#' + color.toString(16).padStart(6, '0');
        return `
            <div class="hotbar-slot ${i === selectedSlot ? 'selected' : ''}">
                <div class="block-preview" style="background: ${hexColor}"></div>
            </div>
        `;
    }).join('');
}

// Multiplayer
function connectMultiplayer() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to server');
            ws.send(JSON.stringify({
                type: 'join',
                id: playerId,
                name: playerName,
                x: player.x,
                y: player.y,
                z: player.z
            }));
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
        };

        ws.onclose = () => {
            console.log('Disconnected from server');
            setTimeout(connectMultiplayer, 3000);
        };

        ws.onerror = (err) => {
            console.log('WebSocket error (server may not support WebSocket)');
        };
    } catch (e) {
        console.log('WebSocket not available');
    }
}

function handleServerMessage(data) {
    switch (data.type) {
        case 'players':
            updatePlayersList(data.players);
            break;
        case 'playerMove':
            updateOtherPlayer(data);
            break;
        case 'playerLeave':
            removeOtherPlayer(data.id);
            break;
        case 'block':
            // Block placed by another player
            const { chunkX, chunkZ } = worldToChunk(data.x, data.z);
            const chunk = chunks.get(getChunkKey(chunkX, chunkZ));
            if (chunk) {
                const localX = ((data.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
                const localZ = ((data.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
                const key = `${localX},${data.y},${localZ}`;
                if (data.blockType === BLOCKS.AIR) {
                    chunk.blocks.delete(key);
                } else {
                    chunk.blocks.set(key, data.blockType);
                }
                rebuildChunkMesh(chunkX, chunkZ);
            }
            break;
    }
}

function updatePlayersList(players) {
    playersListEl.innerHTML = players.map(p =>
        `<li style="color: ${p.id === playerId ? '#4ade80' : 'white'}">${p.name}</li>`
    ).join('');

    // Update other player meshes
    players.forEach(p => {
        if (p.id !== playerId) {
            updateOtherPlayer(p);
        }
    });
}

function updateOtherPlayer(data) {
    if (data.id === playerId) return;

    let playerMesh = otherPlayers.get(data.id);

    if (!playerMesh) {
        // Create player mesh (simple box for now)
        const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
        const material = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
        playerMesh = new THREE.Mesh(geometry, material);
        scene.add(playerMesh);
        otherPlayers.set(data.id, playerMesh);
    }

    playerMesh.position.set(data.x, data.y - 0.9, data.z);
}

function removeOtherPlayer(id) {
    const mesh = otherPlayers.get(id);
    if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        otherPlayers.delete(id);
    }
}

function sendPosition() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'move',
            id: playerId,
            x: player.x,
            y: player.y,
            z: player.z
        }));
    }
}

// Main game loop
let lastTime = performance.now();
let frameCount = 0;
let fpsTime = 0;

function gameLoop() {
    requestAnimationFrame(gameLoop);

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // FPS counter
    frameCount++;
    fpsTime += dt;
    if (fpsTime >= 1) {
        fpsEl.textContent = `FPS: ${frameCount}`;
        frameCount = 0;
        fpsTime = 0;
    }

    updatePlayer(dt);
    updateChunks();

    renderer.render(scene, camera);
}

// Position update interval
setInterval(sendPosition, 100);

// Start game
function startGame() {
    playerName = playerNameInput.value.trim() || 'Player';
    localStorage.setItem('playerName', playerName);

    startScreen.style.display = 'none';

    initThreeJS();
    initControls();
    updateHUD();
    updateChunks();
    connectMultiplayer();
    gameLoop();
}

// Event listeners
playBtn.addEventListener('click', startGame);
playerNameInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') startGame();
});

// Load saved name
playerNameInput.value = localStorage.getItem('playerName') || '';
