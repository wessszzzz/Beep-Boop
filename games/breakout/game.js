const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const GAME_NAME = 'breakout';
const PADDLE_WIDTH = 80;
const PADDLE_HEIGHT = 12;
const PADDLE_SPEED = 8;
const BALL_RADIUS = 8;
const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const BRICK_WIDTH = 54;
const BRICK_HEIGHT = 20;
const BRICK_PADDING = 4;
const BRICK_TOP_OFFSET = 40;
const BRICK_LEFT_OFFSET = (canvas.width - (BRICK_COLS * (BRICK_WIDTH + BRICK_PADDING) - BRICK_PADDING)) / 2;

const BRICK_COLORS = [
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#3b82f6'
];

let paddle = { x: 0, y: 0, width: PADDLE_WIDTH, height: PADDLE_HEIGHT };
let ball = { x: 0, y: 0, dx: 0, dy: 0, radius: BALL_RADIUS };
let bricks = [];
let score = 0;
let level = 1;
let lives = 3;
let highScore = parseInt(localStorage.getItem('breakoutHighScore')) || 0;
let gameRunning = false;
let gamePaused = false;
let ballLaunched = false;
let gameLoop = null;

let leftPressed = false;
let rightPressed = false;

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const livesEl = document.getElementById('lives');
const highScoreEl = document.getElementById('high-score');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const gameOverOverlay = document.getElementById('game-over-overlay');
const gameOverTitle = document.getElementById('game-over-title');
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

function initGame() {
    paddle.x = (canvas.width - PADDLE_WIDTH) / 2;
    paddle.y = canvas.height - 30;

    resetBall();
    createBricks();

    score = 0;
    level = 1;
    lives = 3;
    ballLaunched = false;

    scoreEl.textContent = score;
    levelEl.textContent = level;
    livesEl.textContent = lives;
}

function resetBall() {
    ball.x = paddle.x + paddle.width / 2;
    ball.y = paddle.y - BALL_RADIUS;
    ball.dx = 0;
    ball.dy = 0;
    ballLaunched = false;
}

function launchBall() {
    if (ballLaunched) return;

    const angle = (Math.random() * 60 - 30) * Math.PI / 180;
    // Ball speed reduced by 50% (was 5 + level * 0.5, now 2.5 + level * 0.25)
    const speed = 2.5 + level * 0.25;
    ball.dx = Math.sin(angle) * speed;
    ball.dy = -Math.cos(angle) * speed;
    ballLaunched = true;
}

function createBricks() {
    bricks = [];
    for (let row = 0; row < BRICK_ROWS; row++) {
        bricks[row] = [];
        for (let col = 0; col < BRICK_COLS; col++) {
            const x = BRICK_LEFT_OFFSET + col * (BRICK_WIDTH + BRICK_PADDING);
            const y = BRICK_TOP_OFFSET + row * (BRICK_HEIGHT + BRICK_PADDING);
            bricks[row][col] = {
                x: x,
                y: y,
                width: BRICK_WIDTH,
                height: BRICK_HEIGHT,
                color: BRICK_COLORS[row],
                visible: true,
                points: (BRICK_ROWS - row) * 10
            };
        }
    }
}

function update() {
    if (leftPressed && paddle.x > 0) {
        paddle.x -= PADDLE_SPEED;
    }
    if (rightPressed && paddle.x < canvas.width - paddle.width) {
        paddle.x += PADDLE_SPEED;
    }

    if (!ballLaunched) {
        ball.x = paddle.x + paddle.width / 2;
        ball.y = paddle.y - BALL_RADIUS;
        return;
    }

    ball.x += ball.dx;
    ball.y += ball.dy;

    if (ball.x - ball.radius < 0) {
        ball.x = ball.radius;
        ball.dx = -ball.dx;
    } else if (ball.x + ball.radius > canvas.width) {
        ball.x = canvas.width - ball.radius;
        ball.dx = -ball.dx;
    }

    if (ball.y - ball.radius < 0) {
        ball.y = ball.radius;
        ball.dy = -ball.dy;
    }

    if (ball.y + ball.radius > paddle.y &&
        ball.y - ball.radius < paddle.y + paddle.height &&
        ball.x > paddle.x &&
        ball.x < paddle.x + paddle.width) {

        const hitPos = (ball.x - paddle.x) / paddle.width;
        const angle = (hitPos - 0.5) * Math.PI * 0.7;
        const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);

        ball.dx = Math.sin(angle) * speed;
        ball.dy = -Math.abs(Math.cos(angle) * speed);
        ball.y = paddle.y - ball.radius;
    }

    if (ball.y > canvas.height) {
        lives--;
        livesEl.textContent = lives;

        if (lives <= 0) {
            gameOver(false);
        } else {
            resetBall();
        }
        return;
    }

    let allBricksCleared = true;
    for (let row = 0; row < BRICK_ROWS; row++) {
        for (let col = 0; col < BRICK_COLS; col++) {
            const brick = bricks[row][col];
            if (!brick.visible) continue;

            allBricksCleared = false;

            if (ball.x + ball.radius > brick.x &&
                ball.x - ball.radius < brick.x + brick.width &&
                ball.y + ball.radius > brick.y &&
                ball.y - ball.radius < brick.y + brick.height) {

                brick.visible = false;
                score += brick.points;
                scoreEl.textContent = score;

                const overlapLeft = ball.x + ball.radius - brick.x;
                const overlapRight = brick.x + brick.width - (ball.x - ball.radius);
                const overlapTop = ball.y + ball.radius - brick.y;
                const overlapBottom = brick.y + brick.height - (ball.y - ball.radius);

                const minOverlapX = Math.min(overlapLeft, overlapRight);
                const minOverlapY = Math.min(overlapTop, overlapBottom);

                if (minOverlapX < minOverlapY) {
                    ball.dx = -ball.dx;
                } else {
                    ball.dy = -ball.dy;
                }

                break;
            }
        }
    }

    if (allBricksCleared) {
        level++;
        levelEl.textContent = level;

        if (level > 5) {
            gameOver(true);
        } else {
            createBricks();
            resetBall();
        }
    }
}

function draw() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < BRICK_ROWS; row++) {
        for (let col = 0; col < BRICK_COLS; col++) {
            const brick = bricks[row][col];
            if (!brick.visible) continue;

            const gradient = ctx.createLinearGradient(
                brick.x, brick.y,
                brick.x, brick.y + brick.height
            );
            gradient.addColorStop(0, brick.color);
            gradient.addColorStop(1, shadeColor(brick.color, -30));

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 4);
            ctx.fill();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(brick.x + 2, brick.y + 2, brick.width - 4, 3);
        }
    }

    const paddleGradient = ctx.createLinearGradient(
        paddle.x, paddle.y,
        paddle.x, paddle.y + paddle.height
    );
    paddleGradient.addColorStop(0, '#ffffff');
    paddleGradient.addColorStop(1, '#a0a0a0');

    ctx.fillStyle = paddleGradient;
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 6);
    ctx.fill();

    const ballGradient = ctx.createRadialGradient(
        ball.x - 2, ball.y - 2, 0,
        ball.x, ball.y, ball.radius
    );
    ballGradient.addColorStop(0, '#ffffff');
    ballGradient.addColorStop(1, '#e94560');

    ctx.fillStyle = ballGradient;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    if (!ballLaunched && gameRunning && !gamePaused) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Press SPACE to launch', canvas.width / 2, canvas.height / 2);
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

function shadeColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function gameStep() {
    if (!gamePaused) {
        update();
    }
    draw();
    gameLoop = requestAnimationFrame(gameStep);
}

function startGame() {
    if (gameRunning) return;

    initGame();
    gameRunning = true;
    gamePaused = false;
    startBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    gameOverOverlay.classList.add('hidden');

    gameLoop = requestAnimationFrame(gameStep);
}

function togglePause() {
    if (!gameRunning) return;

    gamePaused = !gamePaused;
    pauseBtn.textContent = gamePaused ? 'Resume' : 'Pause';
    draw();
}

function gameOver(won) {
    gameRunning = false;
    cancelAnimationFrame(gameLoop);

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('breakoutHighScore', highScore);
        highScoreEl.textContent = highScore;
    }

    gameOverTitle.textContent = won ? 'You Win!' : 'Game Over!';
    finalScoreEl.textContent = score;
    submitScoreSection.style.display = 'block';
    playerNameInput.value = localStorage.getItem('playerName') || '';
    gameOverOverlay.classList.remove('hidden');
    startBtn.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
}

document.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
    }

    if (e.code === 'ArrowLeft') {
        leftPressed = true;
    } else if (e.code === 'ArrowRight') {
        rightPressed = true;
    } else if (e.code === 'Space') {
        if (!gameRunning) {
            startGame();
        } else if (gamePaused) {
            togglePause();
        } else if (!ballLaunched) {
            launchBall();
        } else {
            togglePause();
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') {
        leftPressed = false;
    } else if (e.code === 'ArrowRight') {
        rightPressed = false;
    }
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
