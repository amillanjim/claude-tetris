'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#2D2B8C', // J - purple
  '#ffb74d', // L - orange
];

// Skin definitions: each has a 7-entry color palette (parallel to COLORS) plus
// flags/values drawBlock() branches on to change *how* a block is drawn, not
// just its color. Independent from the light/dark theme system (CSS vars).
const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,     // exact current behavior/palette
    glow: 0,
    rounded: false,
    pixel: false,
  },
  neon: {
    label: 'Neón',
    colors: [
      null,
      '#00e5ff', // I - cyan
      '#ffea00', // O - yellow
      '#e040fb', // T - magenta
      '#00e676', // S - green
      '#ff1744', // Z - red
      '#536dfe', // J - blue
      '#ff9100', // L - orange
    ],
    glow: 14,
    rounded: false,
    pixel: false,
  },
  pastel: {
    label: 'Pastel',
    colors: [
      null,
      '#a8dadc', // I
      '#ffe8a3', // O
      '#d8bfd8', // T
      '#b5e5b5', // S
      '#f4a9a8', // Z
      '#b0b0e8', // J
      '#ffd0a3', // L
    ],
    glow: 0,
    rounded: true,
    pixel: false,
  },
  pixel: {
    label: 'Pixel art',
    colors: COLORS,
    glow: 0,
    rounded: false,
    pixel: true,
  },
};

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const POWER_TYPES = ['bomb', 'lightning', 'dye', 'gravity', 'freeze'];
const POWER_CHANCE = 0.09;
const FREEZE_DURATION = 5000;
const POWER_LABELS = {
  bomb:      { icon: '💣', name: 'Bomba',    msg: '¡Bomba! Zona destruida' },
  lightning: { icon: '⚡', name: 'Rayo',      msg: '¡Rayo! Fila y columna despejadas' },
  dye:       { icon: '🎨', name: 'Tinte',     msg: '¡Tinte! Color eliminado' },
  gravity:   { icon: '⬇️', name: 'Gravedad',  msg: '¡Gravedad! Huecos compactados' },
  freeze:    { icon: '❄️', name: 'Congelar',  msg: '¡Congelado! Caída pausada 5s' },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const skinSelectEl = document.getElementById('skin-select');
const toastEl = document.getElementById('toast');
const freezeIndicatorEl = document.getElementById('freeze-indicator');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, freezeUntil, toastTimer;
let currentSkin = 'retro';

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  const isSpecial = Math.random() < POWER_CHANCE;
  const powerType = isSpecial ? POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)] : null;
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0, isSpecial, powerType };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function pieceCenter(piece) {
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c]) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
  return { cx: piece.x + Math.round((minC + maxC) / 2), cy: piece.y + Math.round((minR + maxR) / 2) };
}

function applyBomb(cx, cy) {
  for (let r = cy - 1; r <= cy + 1; r++)
    for (let c = cx - 1; c <= cx + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
}

function applyLightning(cx, cy) {
  if (cy >= 0 && cy < ROWS) board[cy].fill(0);
  if (cx >= 0 && cx < COLS) for (let r = 0; r < ROWS; r++) board[r][cx] = 0;
}

function applyDye(colorType) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === colorType) board[r][c] = 0;
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    const vals = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) vals.push(board[r][c]);
    for (let r = ROWS - 1; r >= 0; r--) board[r][c] = vals.length ? vals.pop() : 0;
  }
}

function applyFreeze() {
  freezeUntil = performance.now() + FREEZE_DURATION;
}

function applyPowerUp(piece) {
  const { cx, cy } = pieceCenter(piece);
  if (piece.powerType === 'bomb') applyBomb(cx, cy);
  else if (piece.powerType === 'lightning') applyLightning(cx, cy);
  else if (piece.powerType === 'dye') applyDye(piece.type);
  else if (piece.powerType === 'gravity') applyGravity();
  else if (piece.powerType === 'freeze') applyFreeze();
  showToast(`${POWER_LABELS[piece.powerType].icon} ${POWER_LABELS[piece.powerType].msg}`);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  if (current.isSpecial) applyPowerUp(current);
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  } else if (current.isSpecial) {
    showToast(`${POWER_LABELS[current.powerType].icon} Pieza especial: ${POWER_LABELS[current.powerType].name}`);
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function showToast(text, duration = 1800) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

function updateFreezeIndicator(active) {
  if (!active) {
    freezeIndicatorEl.classList.add('hidden');
    return;
  }
  const remaining = Math.max(0, (freezeUntil - performance.now()) / 1000).toFixed(1);
  freezeIndicatorEl.textContent = `❄️ ${remaining}s`;
  freezeIndicatorEl.classList.remove('hidden');
}

function roundedRectPath(context, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(x, y, w, h, r);
    return;
  }
  // Manual fallback for canvas contexts without roundRect().
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r);
  context.lineTo(x + w, y + h - r);
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  context.lineTo(x + r, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawPixelTexture(context, x, y, w, h) {
  const cell = Math.max(3, Math.floor(Math.min(w, h) / 4));
  context.save();
  context.beginPath();
  context.rect(x, y, w, h);
  context.clip();
  let rowIdx = 0;
  for (let ty = y; ty < y + h; ty += cell) {
    let colIdx = 0;
    for (let tx = x; tx < x + w; tx += cell) {
      context.fillStyle = (rowIdx + colIdx) % 2 === 0
        ? 'rgba(0,0,0,0.14)'
        : 'rgba(255,255,255,0.10)';
      context.fillRect(tx, ty, cell, cell);
      colIdx++;
    }
    rowIdx++;
  }
  context.restore();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin] || SKINS.retro;
  const color = skin.colors[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  const h = size - 2;

  context.save();
  context.globalAlpha = alpha ?? 1;

  if (skin.glow) {
    context.shadowColor = color;
    context.shadowBlur = skin.glow;
  }

  context.fillStyle = color;
  const cornerR = Math.min(6, w / 4, h / 4);
  if (skin.rounded) {
    roundedRectPath(context, px, py, w, h, cornerR);
    context.fill();
  } else {
    context.fillRect(px, py, w, h);
  }

  // Highlight strip should not inherit the glow shadow.
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.12)';
  const hlH = Math.min(4, h);
  if (skin.rounded) {
    // Clip to the block's own rounded path so the highlight's top corners
    // follow the block outline instead of getting an independent (and
    // mismatched) corner radius of its own.
    context.save();
    roundedRectPath(context, px, py, w, h, cornerR);
    context.clip();
    context.fillRect(px, py, w, hlH);
    context.restore();
  } else {
    context.fillRect(px, py, w, hlH);
  }

  if (skin.pixel) {
    drawPixelTexture(context, px, py, w, h);
  }

  context.restore();
}

function drawPieceGlow(context, piece, size) {
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c]) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
  const px = (piece.x + minC) * size;
  const py = (piece.y + minR) * size;
  const w = (maxC - minC + 1) * size;
  const h = (maxR - minR + 1) * size;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 150);

  context.save();
  context.shadowColor = '#fff';
  context.shadowBlur = 6 + pulse * 10;
  context.strokeStyle = `rgba(255,255,255,${0.4 + pulse * 0.5})`;
  context.lineWidth = 2 + pulse * 2;
  context.strokeRect(px + 1, py + 1, w - 2, h - 2);
  context.restore();

  context.font = `${Math.floor(size * 0.6)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(POWER_LABELS[piece.powerType].icon, px + w / 2, py + h / 2);
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  if (current.isSpecial) drawPieceGlow(ctx, current, BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);

  if (next.isSpecial) drawPieceGlow(nextCtx, { shape, x: offX, y: offY, powerType: next.powerType }, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  const isLight = theme === 'light';
  themeToggleBtn.textContent = isLight ? '☀️' : '🌙';
  themeToggleBtn.setAttribute('aria-pressed', String(isLight));
  themeToggleBtn.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
  if (current) draw();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggleBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});

function applySkin(skin) {
  if (!SKINS[skin]) skin = 'retro';
  currentSkin = skin;
  document.documentElement.dataset.skin = skin;
  localStorage.setItem(SKIN_KEY, skin);
  if (skinSelectEl) skinSelectEl.value = skin;
  if (current) draw();
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(SKINS[saved] ? saved : 'retro');
}

if (skinSelectEl) {
  skinSelectEl.addEventListener('change', () => {
    applySkin(skinSelectEl.value);
  });
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  const frozen = ts < freezeUntil;
  if (!frozen) {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
        if (gameOver) return;
      }
    }
  }
  draw();
  updateFreezeIndicator(frozen);
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  freezeUntil = 0;
  clearTimeout(toastTimer);
  toastEl.classList.remove('show');
  freezeIndicatorEl.classList.add('hidden');
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

initTheme();
initSkin();
init();
