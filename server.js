const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'leaderboard.json');

// Initialize leaderboard data
function loadLeaderboard() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading leaderboard:', e);
    }
    return { snake: [], tetris: [], breakout: [] };
}

function saveLeaderboard(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let leaderboard = loadLeaderboard();

// MIME types for static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon'
};

function serveStatic(req, res) {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
}

function handleAPI(req, res, game, method) {
    res.setHeader('Content-Type', 'application/json');

    if (!['snake', 'tetris', 'breakout'].includes(game)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid game' }));
        return;
    }

    if (method === 'GET') {
        // Return top 10 scores for the game
        const scores = leaderboard[game] || [];
        res.writeHead(200);
        res.end(JSON.stringify(scores.slice(0, 10)));
    } else if (method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { name, score } = JSON.parse(body);

                if (!name || typeof score !== 'number') {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid data' }));
                    return;
                }

                // Sanitize name (max 20 chars, alphanumeric + spaces)
                const sanitizedName = name.slice(0, 20).replace(/[^a-zA-Z0-9 ]/g, '');

                // Add score
                leaderboard[game].push({
                    name: sanitizedName,
                    score: score,
                    date: new Date().toISOString()
                });

                // Sort by score descending and keep top 100
                leaderboard[game].sort((a, b) => b.score - a.score);
                leaderboard[game] = leaderboard[game].slice(0, 100);

                saveLeaderboard(leaderboard);

                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    }
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // API routes
    const apiMatch = url.pathname.match(/^\/api\/leaderboard\/(\w+)$/);
    if (apiMatch) {
        handleAPI(req, res, apiMatch[1], req.method);
        return;
    }

    // Static files
    if (req.method === 'GET') {
        serveStatic(req, res);
    } else {
        res.writeHead(405);
        res.end('Method Not Allowed');
    }
});

// WebSocket for Minecraft multiplayer
const players = new Map();
const blockChanges = [];

// Simple WebSocket implementation (without external dependency)
function handleWebSocket(req, socket) {
    const key = req.headers['sec-websocket-key'];
    const acceptKey = require('crypto')
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
    );

    let playerId = null;

    function send(data) {
        const json = JSON.stringify(data);
        const buf = Buffer.from(json);
        const frame = Buffer.alloc(buf.length + 2);
        frame[0] = 0x81; // text frame
        frame[1] = buf.length;
        buf.copy(frame, 2);
        socket.write(frame);
    }

    function broadcast(data, excludeId = null) {
        players.forEach((player, id) => {
            if (id !== excludeId && player.socket) {
                try {
                    const json = JSON.stringify(data);
                    const buf = Buffer.from(json);
                    const frame = Buffer.alloc(buf.length + 2);
                    frame[0] = 0x81;
                    frame[1] = buf.length;
                    buf.copy(frame, 2);
                    player.socket.write(frame);
                } catch (e) {}
            }
        });
    }

    function broadcastPlayerList() {
        const playerList = Array.from(players.values()).map(p => ({
            id: p.id,
            name: p.name,
            x: p.x,
            y: p.y,
            z: p.z
        }));
        broadcast({ type: 'players', players: playerList });
    }

    socket.on('data', (buffer) => {
        try {
            // Parse WebSocket frame
            const firstByte = buffer[0];
            const opcode = firstByte & 0x0f;

            if (opcode === 0x08) {
                // Connection close
                socket.end();
                return;
            }

            if (opcode !== 0x01) return; // Only handle text frames

            const secondByte = buffer[1];
            const isMasked = (secondByte & 0x80) !== 0;
            let payloadLength = secondByte & 0x7f;

            let offset = 2;
            if (payloadLength === 126) {
                payloadLength = buffer.readUInt16BE(2);
                offset = 4;
            } else if (payloadLength === 127) {
                payloadLength = Number(buffer.readBigUInt64BE(2));
                offset = 10;
            }

            let mask;
            if (isMasked) {
                mask = buffer.slice(offset, offset + 4);
                offset += 4;
            }

            const payload = buffer.slice(offset, offset + payloadLength);

            if (isMasked) {
                for (let i = 0; i < payload.length; i++) {
                    payload[i] ^= mask[i % 4];
                }
            }

            const message = JSON.parse(payload.toString());

            switch (message.type) {
                case 'join':
                    playerId = message.id;
                    players.set(playerId, {
                        id: playerId,
                        name: message.name,
                        x: message.x || 0,
                        y: message.y || 30,
                        z: message.z || 0,
                        socket: socket
                    });
                    console.log(`Player joined: ${message.name}`);
                    broadcastPlayerList();
                    break;

                case 'move':
                    if (playerId && players.has(playerId)) {
                        const player = players.get(playerId);
                        player.x = message.x;
                        player.y = message.y;
                        player.z = message.z;
                        broadcast({
                            type: 'playerMove',
                            id: playerId,
                            x: message.x,
                            y: message.y,
                            z: message.z
                        }, playerId);
                    }
                    break;

                case 'block':
                    // Broadcast block change to all other players
                    broadcast({
                        type: 'block',
                        x: message.x,
                        y: message.y,
                        z: message.z,
                        blockType: message.blockType
                    }, playerId);
                    break;
            }
        } catch (e) {
            // Ignore parse errors
        }
    });

    socket.on('close', () => {
        if (playerId) {
            const player = players.get(playerId);
            if (player) {
                console.log(`Player left: ${player.name}`);
            }
            players.delete(playerId);
            broadcast({ type: 'playerLeave', id: playerId });
            broadcastPlayerList();
        }
    });

    socket.on('error', () => {
        if (playerId) {
            players.delete(playerId);
            broadcast({ type: 'playerLeave', id: playerId });
        }
    });
}

server.on('upgrade', (req, socket, head) => {
    if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
        handleWebSocket(req, socket);
    } else {
        socket.destroy();
    }
});

server.listen(PORT, () => {
    console.log(`Arcade Games server running at http://localhost:${PORT}`);
    console.log('Minecraft multiplayer WebSocket enabled');
});
