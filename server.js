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

server.listen(PORT, () => {
    console.log(`Arcade Games server running at http://localhost:${PORT}`);
});
