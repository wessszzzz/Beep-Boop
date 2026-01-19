const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-piece-canvas');
const nextCtx = nextCanvas.getContext('2d');

const GAME_NAME = 'tetris';
const BLOCK_SIZE = 30;
const COLS = canvas.width / BLOCK_SIZE;
const ROWS = canvas.height / BLOCK_SIZE;

const COLORS = {
    I: '#00f5ff',
    O: '#ffeb3b',
    T: '#9c27b0',
    S: '#4caf50',
    Z: '#f44336',
    J: '#2196f3',
    L: '#ff9800'
};

const TETROMINOES = {
    I: [
        [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
        [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
        [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]],
        [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]]
    ],
    O: [
        [[1, 1], [1, 1]],
        [[1, 1], [1, 1]],
        [[1, 1], [1, 1]],
        [[1, 1], [1, 1]]
    ],
    T: [
        [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
        [[0, 1, 0], [0, 1, 1], [0, 1, 0]],
        [[0, 0, 0], [1, 1, 1], [0, 1, 0]],
        [[0, 1, 0], [1, 1, 0], [0, 1, 0]]
    ],
    S: [
        [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
        [[0, 1, 0], [0, 1, 1], [0, 0, 1]],
        [[0, 0, 0], [0, 1, 1], [1, 1, 0]],
        [[1, 0, 0], [1, 1, 0], [0, 1, 0]]
    ],
    Z: [
        [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
        [[0, 0, 1], [0, 1, 1], [0, 1, 0]],
        [[0, 0, 0], [1, 1, 0], [0, 1, 1]],
        [[0, 1, 0], [1, 1, 0], [1, 0, 0]]
    ],
    J: [
        [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
        [[0, 1, 1], [0, 1, 0], [0, 1, 0]],
        [[0, 0, 0], [1, 1, 1], [0, 0, 1]],
        [[0, 1, 0], [0, 1, 0], [1, 1, 0]]
    ],
    L: [
        [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
        [[0, 1, 0], [0, 1, 0], [0, 1, 1]],
        [[0, 0, 0], [1, 1, 1], [1, 0, 0]],
        [[1, 1, 0], [0, 1, 0], [0, 1, 0]]
    ]
};

let board = [];
let currentPiece = null;
let nextPiece = null;
let score = 0;
let level = 1;
let lines = 0;
let highScore = parseInt(localStorage.getItem('tetrisHighScore')) || 0;
let gameRunning = false;
let gamePaused = false;
let gameLoop = null;
let dropInterval = 1000;
let lastDrop = 0;

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const highScoreEl = document.getElementById('high-score');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const gameOverOverlay = document.getElementById('game-over-overlay');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const leaderboardList = document.getElementById('leaderboard-list');
const playerNameInput = document.getElementById('player-name');
const submitScoreBtn = document.getElementById('submit-score-btn');
const submitScoreSection = document.getElementById('submit-score-section');

highScoreEl.textContent = highScore;

// Leaderboard functions
async function fetchLeaderboard() {
    try {
        const response = await fetch(`/api/leaderboard/${GAME_NAME}`);
        const scores = await response.json();
        displayLeaderboard(scores);
    } catch (e) {
        leaderboardList.innerHTML = '<li class="error">Could not load leaderboard</li>';
    }
}

function displayLeaderboard(scores) {
    if (scores.length === 0) {
        leaderboardList.innerHTML = '<li class="empty">No scores yet!</li>';
        return;
    }

    leaderboardList.innerHTML = scores.map((entry, index) => `
        <li>
            <span class="rank">${index + 1}.</span>
            <span class="name">${entry.name}</span>
            <span class="score">${entry.score}</span>
        </li>
    `).join('');
}

async function submitScore(name, scoreVal) {
    try {
        await fetch(`/api/leaderboard/${GAME_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, score: scoreVal })
        });
        fetchLeaderboard();
    } catch (e) {
        console.error('Failed to submit score:', e);
    }
}

class Piece {
    constructor(type) {
        this.type = type;
        this.rotationState = 0;
        this.shape = TETROMINOES[type][0];
        this.color = COLORS[type];
        this.x = Math.floor(COLS / 2) - Math.ceil(this.shape[0].length / 2);
        this.y = 0;
    }

    rotate() {
        this.rotationState = (this.rotationState + 1) % 4;
        this.shape = TETROMINOES[this.type][this.rotationState];
    }

    rotateBack() {
        this.rotationState = (this.rotationState + 3) % 4;
        this.shape = TETROMINOES[this.type][this.rotationState];
    }
}

function initGame() {
    board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
    score = 0;
    level = 1;
    lines = 0;
    dropInterval = 1000;
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = lines;
    currentPiece = createRandomPiece();
    nextPiece = createRandomPiece();
    drawNextPiece();
}

function createRandomPiece() {
    const types = Object.keys(TETROMINOES);
    const type = types[Math.floor(Math.random() * types.length)];
    return new Piece(type);
}

function isValidMove(piece, offsetX = 0, offsetY = 0) {
    for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
            if (piece.shape[y][x]) {
                const newX = piece.x + x + offsetX;
                const newY = piece.y + y + offsetY;

                if (newX < 0 || newX >= COLS || newY >= ROWS) {
                    return false;
                }

                if (newY >= 0 && board[newY][newX]) {
                    return false;
                }
            }
        }
    }
    return true;
}

function lockPiece() {
    for (let y = 0; y < currentPiece.shape.length; y++) {
        for (let x = 0; x < currentPiece.shape[y].length; x++) {
            if (currentPiece.shape[y][x]) {
                const boardY = currentPiece.y + y;
                const boardX = currentPiece.x + x;

                if (boardY < 0) {
                    gameOver();
                    return;
                }

                board[boardY][boardX] = currentPiece.color;
            }
        }
    }

    clearLines();
    currentPiece = nextPiece;
    nextPiece = createRandomPiece();
    drawNextPiece();

    if (!isValidMove(currentPiece)) {
        gameOver();
    }
}

function clearLines() {
    let linesCleared = 0;

    for (let y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(cell => cell !== null)) {
            board.splice(y, 1);
            board.unshift(Array(COLS).fill(null));
            linesCleared++;
            y++;
        }
    }

    if (linesCleared > 0) {
        const points = [0, 100, 300, 500, 800];
        score += points[linesCleared] * level;
        lines += linesCleared;
        scoreEl.textContent = score;
        linesEl.textContent = lines;

        const newLevel = Math.floor(lines / 10) + 1;
        if (newLevel > level) {
            level = newLevel;
            levelEl.textContent = level;
            dropInterval = Math.max(100, 1000 - (level - 1) * 100);
        }
    }
}

function moveLeft() {
    if (isValidMove(currentPiece, -1, 0)) {
        currentPiece.x--;
    }
}

function moveRight() {
    if (isValidMove(currentPiece, 1, 0)) {
        currentPiece.x++;
    }
}

function moveDown() {
    if (isValidMove(currentPiece, 0, 1)) {
        currentPiece.y++;
        return true;
    }
    return false;
}

function hardDrop() {
    while (moveDown()) {}
    lockPiece();
}

function rotate() {
    currentPiece.rotate();
    if (!isValidMove(currentPiece)) {
        if (isValidMove(currentPiece, -1, 0)) {
            currentPiece.x--;
        } else if (isValidMove(currentPiece, 1, 0)) {
            currentPiece.x++;
        } else if (isValidMove(currentPiece, -2, 0)) {
            currentPiece.x -= 2;
        } else if (isValidMove(currentPiece, 2, 0)) {
            currentPiece.x += 2;
        } else {
            currentPiece.rotateBack();
        }
    }
}

function drawBlock(context, x, y, color, size = BLOCK_SIZE) {
    const gradient = context.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, shadeColor(color, -30));

    context.fillStyle = gradient;
    context.fillRect(x + 1, y + 1, size - 2, size - 2);

    context.fillStyle = 'rgba(255, 255, 255, 0.3)';
    context.fillRect(x + 1, y + 1, size - 2, 3);
    context.fillRect(x + 1, y + 1, 3, size - 2);

    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    context.fillRect(x + size - 4, y + 1, 3, size - 2);
    context.fillRect(x + 1, y + size - 4, size - 2, 3);
}

function shadeColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function draw() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * BLOCK_SIZE, 0);
        ctx.lineTo(x * BLOCK_SIZE, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * BLOCK_SIZE);
        ctx.lineTo(canvas.width, y * BLOCK_SIZE);
        ctx.stroke();
    }

    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (board[y][x]) {
                drawBlock(ctx, x * BLOCK_SIZE, y * BLOCK_SIZE, board[y][x]);
            }
        }
    }

    if (currentPiece) {
        let ghostY = currentPiece.y;
        while (isValidMove(currentPiece, 0, ghostY - currentPiece.y + 1)) {
            ghostY++;
        }

        ctx.globalAlpha = 0.3;
        for (let y = 0; y < currentPiece.shape.length; y++) {
            for (let x = 0; x < currentPiece.shape[y].length; x++) {
                if (currentPiece.shape[y][x]) {
                    drawBlock(
                        ctx,
                        (currentPiece.x + x) * BLOCK_SIZE,
                        (ghostY + y) * BLOCK_SIZE,
                        currentPiece.color
                    );
                }
            }
        }
        ctx.globalAlpha = 1;

        for (let y = 0; y < currentPiece.shape.length; y++) {
            for (let x = 0; x < currentPiece.shape[y].length; x++) {
                if (currentPiece.shape[y][x]) {
                    drawBlock(
                        ctx,
                        (currentPiece.x + x) * BLOCK_SIZE,
                        (currentPiece.y + y) * BLOCK_SIZE,
                        currentPiece.color
                    );
                }
            }
        }
    }

    if (gamePaused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
    }
}

function drawNextPiece() {
    nextCtx.fillStyle = '#16213e';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

    if (!nextPiece) return;

    const blockSize = 25;
    const offsetX = (nextCanvas.width - nextPiece.shape[0].length * blockSize) / 2;
    const offsetY = (nextCanvas.height - nextPiece.shape.length * blockSize) / 2;

    for (let y = 0; y < nextPiece.shape.length; y++) {
        for (let x = 0; x < nextPiece.shape[y].length; x++) {
            if (nextPiece.shape[y][x]) {
                drawBlock(
                    nextCtx,
                    offsetX + x * blockSize,
                    offsetY + y * blockSize,
                    nextPiece.color,
                    blockSize
                );
            }
        }
    }
}

function update(timestamp) {
    if (!gameRunning) return;

    if (!gamePaused) {
        if (timestamp - lastDrop > dropInterval) {
            if (!moveDown()) {
                lockPiece();
            }
            lastDrop = timestamp;
        }
    }

    draw();
    gameLoop = requestAnimationFrame(update);
}

function startGame() {
    if (gameRunning) return;

    initGame();
    gameRunning = true;
    gamePaused = false;
    startBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    gameOverOverlay.classList.add('hidden');

    lastDrop = performance.now();
    gameLoop = requestAnimationFrame(update);
}

function togglePause() {
    if (!gameRunning) return;

    gamePaused = !gamePaused;
    pauseBtn.textContent = gamePaused ? 'Resume' : 'Pause';

    if (!gamePaused) {
        lastDrop = performance.now();
    }

    draw();
}

function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(gameLoop);

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('tetrisHighScore', highScore);
        highScoreEl.textContent = highScore;
    }

    finalScoreEl.textContent = score;
    submitScoreSection.style.display = 'block';
    playerNameInput.value = localStorage.getItem('playerName') || '';
    gameOverOverlay.classList.remove('hidden');
    startBtn.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
}

document.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
    }

    if (e.code === 'Space') {
        if (gameRunning && !gamePaused) {
            hardDrop();
        } else if (gameRunning) {
            togglePause();
        } else {
            startGame();
        }
        return;
    }

    if (!gameRunning || gamePaused) return;

    switch (e.code) {
        case 'ArrowLeft':
            moveLeft();
            break;
        case 'ArrowRight':
            moveRight();
            break;
        case 'ArrowDown':
            moveDown();
            break;
        case 'ArrowUp':
            rotate();
            break;
    }

    draw();
});

startBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', togglePause);
restartBtn.addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    startGame();
});

submitScoreBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name) {
        localStorage.setItem('playerName', name);
        submitScore(name, score);
        submitScoreSection.style.display = 'none';
    }
});

playerNameInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
        submitScoreBtn.click();
    }
});

// Initialize
fetchLeaderboard();
draw();
drawNextPiece();
