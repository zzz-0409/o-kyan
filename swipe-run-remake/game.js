const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const coinsEl = document.getElementById("coins");
const hintEl = document.getElementById("hint");
const effectFill = document.getElementById("effectFill");
const overlay = document.getElementById("overlay");
const dialog = document.getElementById("dialog");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const mainButton = document.getElementById("mainButton");
const rankingEl = document.getElementById("ranking");
const conversion = document.getElementById("conversion");
const convertCoinsEl = document.getElementById("convertCoins");
const convertScoreEl = document.getElementById("convertScore");
const leftButton = document.getElementById("leftButton");
const rightButton = document.getElementById("rightButton");
const jumpButton = document.getElementById("jumpButton");

const W = 390;
const H = 720;
const LANES = [98, 195, 292];
const CENTER = 1;
const PLAYER_Y = 604;
const BASE_SPEED = 225;
const MAX_SPEED = 560;
const SPEED_GAIN = 0.0021;
const JUMP_DURATION = 0.68;
const COIN_VALUE = 100;
const FRAME_MS = 1000 / 30;

const assets = {
  road: loadImage("assets/backgrounds/road-loop.png"),
  runners: [0, 1, 2, 3].map((n) => loadImage(`assets/character/runner-${n}.png`)),
  jump: loadImage("assets/character/runner-jump.png"),
  table: loadImage("assets/obstacles/info-table.png"),
  hole: loadImage("assets/obstacles/hole-cover.png"),
  gate: loadImage("assets/obstacles/lane-gate.png"),
  coin: loadImage("assets/items/coin.png"),
  boost: loadImage("assets/items/boost-pad.png"),
  slow: loadImage("assets/items/slow-pad.png"),
  warning: loadImage("assets/items/warning.png")
};

let state = "title";
let running = false;
let lastTime = 0;
let frameCarry = 0;
let loopActive = false;
let score = 0;
let distance = 0;
let coins = 0;
let runTime = 0;
let best = Number(localStorage.getItem("swipeRunRemakeBest") || 0);
let roadScroll = 0;
let speed = BASE_SPEED;
let spawnTimer = 0;
let coinTimer = 0;
let itemTimer = 0;
let boostTimer = 0;
let slowTimer = 0;
let jumpTimer = 0;
let touchStart = null;
let result = null;
let conversionTimer = 0;

let player = {
  lane: CENTER,
  x: LANES[CENTER]
};
let obstacles = [];
let pickups = [];

function loadImage(src) {
  const image = new Image();
  image.src = src;
  image.addEventListener("load", draw);
  return image;
}

function resizeCanvas() {
  const rect = stage.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  draw();
}

function resetGame() {
  state = "playing";
  running = true;
  score = 0;
  distance = 0;
  coins = 0;
  runTime = 0;
  roadScroll = 0;
  speed = BASE_SPEED;
  spawnTimer = 3.2;
  coinTimer = 0.7;
  itemTimer = 2.6;
  boostTimer = 0;
  slowTimer = 0;
  jumpTimer = 0;
  obstacles = [];
  pickups = [];
  player.lane = CENTER;
  player.x = LANES[CENTER];
  result = null;
  conversionTimer = 0;
  conversion.classList.remove("show");
  dialog.classList.remove("new-best");
  overlay.classList.remove("show");
  stage.classList.add("playing");
  hintEl.textContent = "左右スワイプで移動、タップでジャンプ";
  lastTime = performance.now();
  frameCarry = 0;
  startLoop();
  updateHud();
}

function endGame() {
  running = false;
  state = "gameover";
  stage.classList.remove("playing");
  const distanceScore = Math.floor(distance);
  const finalScore = distanceScore + coins * COIN_VALUE;
  const isBest = finalScore > best;
  best = Math.max(best, finalScore);
  localStorage.setItem("swipeRunRemakeBest", String(best));
  const rank = saveScore(finalScore);
  result = {
    phase: coins > 0 ? "convert" : "done",
    distanceScore,
    finalScore,
    shownScore: distanceScore,
    coinsLeft: coins,
    rank,
    isBest,
    tick: 0
  };
  overlayTitle.textContent = isBest ? "NEW BEST!" : "GAME OVER";
  overlayText.textContent = `${distanceScore}点 + ${coins}枚のコインを換算中`;
  mainButton.textContent = coins > 0 ? "SKIP COINS" : "RESTART";
  dialog.classList.toggle("new-best", isBest);
  conversion.classList.toggle("show", coins > 0);
  convertCoinsEl.textContent = String(coins);
  convertScoreEl.textContent = String(distanceScore);
  renderRanking(rank);
  overlay.classList.add("show");
  updateHud();
}

function updateResult(dt) {
  if (!result || result.phase !== "convert") return;
  result.tick += dt;
  if (result.tick < 0.09) return;
  result.tick = 0;
  result.coinsLeft -= 1;
  result.shownScore += COIN_VALUE;
  scoreEl.textContent = String(result.shownScore);
  coinsEl.textContent = String(Math.max(0, result.coinsLeft));
  convertCoinsEl.textContent = String(Math.max(0, result.coinsLeft));
  convertScoreEl.textContent = String(result.shownScore);
  if (result.coinsLeft <= 0) {
    result.phase = "done";
    conversion.classList.remove("show");
    overlayText.textContent = `${result.finalScore}点 / 距離${result.distanceScore}点 / コイン${coins}枚 / Today #${result.rank}`;
    mainButton.textContent = "RESTART";
    bestEl.textContent = String(best);
  }
}

function handleMainButton() {
  if (state === "title" || !result || result.phase === "done") {
    resetGame();
    return;
  }
  if (result.phase === "convert") {
    result.coinsLeft = 1;
    updateResult(1);
  }
}

function moveLane(direction) {
  if (!running) return;
  player.lane = Math.max(0, Math.min(2, player.lane + direction));
}

function jump() {
  if (!running || jumpTimer > 0) return;
  jumpTimer = JUMP_DURATION;
}

function update(dt) {
  if (state === "gameover") updateResult(dt);
  if (!running) return;
  const base = Math.min(MAX_SPEED, BASE_SPEED + distance * SPEED_GAIN * BASE_SPEED);
  boostTimer = Math.max(0, boostTimer - dt);
  slowTimer = Math.max(0, slowTimer - dt);
  speed = base * (boostTimer > 0 ? 1.48 : 1) * (slowTimer > 0 ? 0.58 : 1);
  runTime += dt;
  distance += speed * dt / 12;
  score = Math.floor(distance) + coins * COIN_VALUE;
  roadScroll += speed * dt;
  jumpTimer = Math.max(0, jumpTimer - dt);
  player.x += (LANES[player.lane] - player.x) * Math.min(1, dt * 15);

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnObstacle();
    const early = distance < 520;
    spawnTimer = (early ? 1.34 : 0.95) + Math.random() * 0.42;
  }

  coinTimer -= dt;
  if (coinTimer <= 0) {
    spawnCoins();
    coinTimer = 1.15 + Math.random() * 1.1;
  }

  itemTimer -= dt;
  if (itemTimer <= 0) {
    spawnPad();
    itemTimer = 4.2 + Math.random() * 3;
  }

  for (const o of obstacles) o.y += speed * dt;
  obstacles = obstacles.filter((o) => o.y < H + 120);
  for (const p of pickups) p.y += speed * dt;
  pickups = pickups.filter((p) => p.y < H + 80 && !p.used);

  checkCollisions();
  updateHud();
}

function spawnObstacle() {
  if (runTime < 3.2) {
    spawnTimer = 0.4;
    return;
  }
  if (!hasClearance(-100, -20, 185)) {
    spawnTimer = 0.35;
    return;
  }
  const roll = Math.random();
  if (roll < 0.26 && distance > 240) {
    const lane = Math.floor(Math.random() * 3);
    obstacles.push({ type: "gate", lanes: [lane], y: -108, h: 94 });
  } else if (roll < 0.52 && runTime > 8) {
    obstacles.push({ type: "hole", lanes: [0, 1, 2], y: -64, h: 54 });
  } else {
    const lane = Math.floor(Math.random() * 3);
    const wide = distance > 380 && Math.random() < 0.2;
    if (wide) {
      const left = lane === 2 ? 1 : lane;
      obstacles.push({ type: "table", lanes: [left, left + 1], y: -94, h: 82 });
    } else {
      obstacles.push({ type: "table", lanes: [lane], y: -94, h: 82 });
    }
  }
}

function spawnCoins() {
  if (!hasClearance(-150, -20, 70)) return;
  const lane = Math.floor(Math.random() * 3);
  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i += 1) {
    pickups.push({ type: "coin", lane, y: -35 - i * 34, r: 12, used: false });
  }
}

function spawnPad() {
  if (!hasClearance(-80, -15, 150)) return;
  const lane = Math.floor(Math.random() * 3);
  const type = Math.random() < 0.55 ? "boost" : "slow";
  pickups.push({ type, lane, y: -62, h: 42, used: false });
}

function hasClearance(top, bottom, gap) {
  for (const o of obstacles) {
    if (rangesClose(top, bottom, o.y, o.y + o.h, gap)) return false;
  }
  for (const p of pickups) {
    const h = p.h || p.r * 2;
    if (rangesClose(top, bottom, p.y, p.y + h, gap * 0.72)) return false;
  }
  return true;
}

function rangesClose(aTop, aBottom, bTop, bBottom, gap) {
  return aTop < bBottom + gap && aBottom + gap > bTop;
}

function checkCollisions() {
  const p = playerRect();
  const feet = playerFootRect();
  for (const obstacle of obstacles) {
    if (obstacle.y > PLAYER_Y + 45) continue;
    if (obstacle.type === "hole") {
      if (jumpTimer > 0) continue;
      for (const lane of obstacle.lanes) {
        if (rectsOverlap(feet, shrink(laneRect(lane, obstacle.y, obstacle.h), 10, 8))) {
          endGame();
          return;
        }
      }
      continue;
    }
    for (const lane of obstacle.lanes) {
      if (rectsOverlap(shrink(p, 5, 6), shrink(laneRect(lane, obstacle.y, obstacle.h), 7, 6))) {
        endGame();
        return;
      }
    }
  }

  for (const item of pickups) {
    if (item.used) continue;
    if (item.type === "coin") {
      if (rectsOverlap(p, coinRect(item))) {
        item.used = true;
        coins += 1;
        hintEl.textContent = `コイン +1 / ${coins}`;
      }
      continue;
    }
    if (rectsOverlap(playerFootRect(), padRect(item))) {
      item.used = true;
      if (item.type === "boost") {
        boostTimer = 3.2;
        slowTimer = 0;
        hintEl.textContent = "スピードアップ！";
      } else {
        slowTimer = 3.3;
        boostTimer = 0;
        hintEl.textContent = "注意マットでスロー";
      }
    }
  }
}

function playerRect() {
  return { x: player.x - 23, y: PLAYER_Y - 38, w: 46, h: 64 };
}

function playerFootRect() {
  return { x: player.x - 14, y: PLAYER_Y + 16, w: 28, h: 12 };
}

function laneRect(lane, y, h) {
  return { x: LANES[lane] - 36, y, w: 72, h };
}

function coinRect(coin) {
  return { x: LANES[coin.lane] - coin.r, y: coin.y - coin.r, w: coin.r * 2, h: coin.r * 2 };
}

function padRect(pad) {
  return { x: LANES[pad.lane] - 38, y: pad.y, w: 76, h: pad.h };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function shrink(r, x, y) {
  return { x: r.x + x, y: r.y + y, w: r.w - x * 2, h: r.h - y * 2 };
}

function jumpLift() {
  if (jumpTimer <= 0) return 0;
  const t = 1 - jumpTimer / JUMP_DURATION;
  return Math.sin(t * Math.PI) * 64;
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawRoad();
  drawPickups();
  drawObstacles();
  drawPlayer();
  drawEffectLabel();
}

function drawRoad() {
  if (ready(assets.road)) {
    drawCover(assets.road, 0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#bfe1ff");
    g.addColorStop(1, "#f5e2bd");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#d7b889";
    ctx.fillRect(44, 0, W - 88, H);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 4;
    for (let i = 1; i < 3; i += 1) {
      const x = (LANES[i - 1] + LANES[i]) / 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  }
  drawMovingPavement();
  const shade = ctx.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.18)");
  shade.addColorStop(0.18, "rgba(0,0,0,0)");
  shade.addColorStop(0.82, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
}

function drawMovingPavement() {
  const offset = ((roadScroll * 0.34) % 72 + 72) % 72;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.5;
  for (let y = -72 + offset; y < H + 72; y += 72) {
    ctx.beginPath();
    ctx.moveTo(66, y);
    ctx.lineTo(W - 66, y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "multiply";
  ctx.strokeStyle = "rgba(90,85,75,0.08)";
  ctx.lineWidth = 1;
  for (let y = -36 + offset; y < H + 72; y += 72) {
    ctx.beginPath();
    ctx.moveTo(78, y);
    ctx.lineTo(W - 78, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPickups() {
  for (const item of pickups) {
    if (item.type === "coin") {
      drawSprite(assets.coin, LANES[item.lane] - 18, item.y - 18, 36, 36, () => {
        ctx.fillStyle = "#ffd35d";
        ctx.beginPath();
        ctx.arc(LANES[item.lane], item.y, 11, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      const r = padRect(item);
      drawSprite(item.type === "boost" ? assets.boost : assets.slow, r.x, r.y, r.w, r.h, () => {
        ctx.fillStyle = item.type === "boost" ? "rgba(36,119,212,0.75)" : "rgba(255,155,60,0.75)";
        ctx.fillRect(r.x, r.y, r.w, r.h);
      });
    }
  }
}

function drawObstacles() {
  for (const obstacle of obstacles) {
    for (const lane of obstacle.lanes) {
      const r = laneRect(lane, obstacle.y, obstacle.h);
      const image = obstacle.type === "hole" ? assets.hole : obstacle.type === "gate" ? assets.gate : assets.table;
      const pad = obstacle.type === "gate" ? -10 : 0;
      drawSprite(image, r.x - pad, r.y - 8, r.w + pad * 2, r.h + 18, () => {
        ctx.fillStyle = obstacle.type === "hole" ? "#313942" : "#2d78cf";
        ctx.fillRect(r.x, r.y, r.w, r.h);
      });
    }
  }
}

function drawPlayer() {
  const lift = jumpLift();
  const phase = Math.floor(roadScroll / 18) % assets.runners.length;
  const image = jumpTimer > 0 ? assets.jump : assets.runners[phase];
  const bob = jumpTimer > 0 ? 0 : Math.sin(roadScroll * 0.16) * 3;
  ctx.fillStyle = "rgba(30,40,55,0.26)";
  ctx.beginPath();
  ctx.ellipse(player.x, PLAYER_Y + 25, 20, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  drawSprite(image, player.x - 33, PLAYER_Y - 88 - lift + bob, 66, 96, () => {
    ctx.fillStyle = "#2477d4";
    ctx.fillRect(player.x - 18, PLAYER_Y - 60 - lift, 36, 52);
    ctx.fillStyle = "#1b283b";
    ctx.fillRect(player.x - 14, PLAYER_Y - 12 - lift, 10, 28);
    ctx.fillRect(player.x + 4, PLAYER_Y - 12 - lift, 10, 28);
  });
}

function drawEffectLabel() {
  const maxTimer = Math.max(boostTimer, slowTimer);
  effectFill.style.width = maxTimer > 0 ? `${Math.min(100, maxTimer / 3.3 * 100)}%` : "0%";
  if (maxTimer <= 0) return;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.strokeStyle = "rgba(15,35,58,0.32)";
  ctx.lineWidth = 3;
  ctx.font = "900 17px Segoe UI, sans-serif";
  ctx.textAlign = "right";
  const label = boostTimer > 0 ? "BOOST" : "SLOW";
  ctx.strokeText(label, W - 16, 30);
  ctx.fillText(label, W - 16, 30);
}

function drawSprite(image, x, y, w, h, fallback) {
  if (ready(image)) {
    ctx.drawImage(image, x, y, w, h);
  } else {
    fallback();
  }
}

function ready(image) {
  return image && image.complete && image.naturalWidth > 0;
}

function drawCover(image, x, y, w, h) {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (image.naturalWidth - sw) / 2;
  const sy = (image.naturalHeight - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

function updateHud() {
  scoreEl.textContent = String(Math.floor(score));
  bestEl.textContent = String(Math.floor(best));
  coinsEl.textContent = String(coins);
}

function todayKey() {
  const d = new Date();
  return `swipeRunRemake:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function loadScores() {
  try {
    return JSON.parse(localStorage.getItem(todayKey()) || "[]");
  } catch {
    return [];
  }
}

function saveScore(value) {
  const entry = { score: value, time: Date.now() };
  const scores = [...loadScores(), entry].sort((a, b) => b.score - a.score).slice(0, 5);
  localStorage.setItem(todayKey(), JSON.stringify(scores));
  return scores.findIndex((item) => item.time === entry.time) + 1;
}

function renderRanking(currentRank = 0) {
  const scores = loadScores();
  if (!scores.length) {
    rankingEl.innerHTML = "<li><span>今日のランキング</span><strong>まだ記録なし</strong></li>";
    return;
  }
  rankingEl.innerHTML = scores.map((item, index) => {
    const rank = index + 1;
    const mark = rank === currentRank ? " ★" : "";
    return `<li><span>${rank}位${mark}</span><strong>${item.score}点</strong></li>`;
  }).join("");
}

function startLoop() {
  if (loopActive) return;
  loopActive = true;
  requestAnimationFrame(loop);
}

function loop(now) {
  const elapsed = now - lastTime + frameCarry;
  if (elapsed < FRAME_MS) {
    requestAnimationFrame(loop);
    return;
  }
  const dt = Math.min(0.05, elapsed / 1000 || 0);
  frameCarry = elapsed % FRAME_MS;
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function onPointerDown(event) {
  touchStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
}

function onPointerUp(event) {
  if (!touchStart) return;
  const dx = event.clientX - touchStart.x;
  const dy = event.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) {
    moveLane(dx < 0 ? -1 : 1);
    return;
  }
  jump();
}

function control(event, action) {
  event.preventDefault();
  event.stopPropagation();
  action();
}

function onKeyDown(event) {
  if (event.repeat) return;
  if ((event.code === "Space" || event.code === "Enter") && !running && overlay.classList.contains("show")) {
    event.preventDefault();
    handleMainButton();
    return;
  }
  if (event.code === "ArrowLeft") {
    event.preventDefault();
    moveLane(-1);
  } else if (event.code === "ArrowRight") {
    event.preventDefault();
    moveLane(1);
  } else if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();
    jump();
  }
}

mainButton.addEventListener("click", handleMainButton);
leftButton.addEventListener("pointerdown", (event) => control(event, () => moveLane(-1)));
rightButton.addEventListener("pointerdown", (event) => control(event, () => moveLane(1)));
jumpButton.addEventListener("pointerdown", (event) => control(event, jump));
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", () => {
  touchStart = null;
});
window.addEventListener("keydown", onKeyDown);
window.addEventListener("resize", resizeCanvas);

bestEl.textContent = String(best);
renderRanking();
resizeCanvas();
draw();
