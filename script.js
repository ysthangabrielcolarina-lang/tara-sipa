// =====================================================
//  TARA, SIPA!
//  Tap the sipa to kick it. Don't let it hit the ground.
// =====================================================

// ----- 1. Canvas setup -----
// We always "think" in a 400 x 640 game world, then scale it to fit the screen.
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = 400;
const H = 640;
const GROUND_Y = H - 90; // y position of the ground

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1; // sharp drawing on high-res phones
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  // Scale so that drawing at (400, 640) reaches the bottom-right corner
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}
window.addEventListener("resize", resizeCanvas);

// ----- 2. Game settings (tweak these to change the feel) -----
const BASE_GRAVITY = 900;   // how fast the sipa falls (pixels per second²)
const MAX_GRAVITY = 1800;
const GRAVITY_PER_LEVEL = 70;
const KICK_HEIGHT = 230;    // how high one kick sends the sipa (pixels)
const SIDE_POWER = 260;     // how strongly an off-center tap pushes sideways
const START_RADIUS = 26;    // sipa size at the start
const MIN_RADIUS = 16;      // smallest the sipa can get
const WIND_START = 15;      // wind appears after this score
const POINTS_PER_LEVEL = 10;

// ----- 3. Game state -----
const STATE = { MENU: "menu", PLAYING: "playing", PAUSED: "paused", OVER: "over" };
let state = STATE.MENU;

let score = 0;
let best = Number(loadSetting("sipa-best", 0)) || 0;
let muted = loadSetting("sipa-muted", "false") === "true";
let lastLevel = 0;
let kickCooldown = 0;
let shake = 0;
let lastTime = 0;

let sipa = {};
let wind = {};
let floaters = []; // floating texts like "+1" and "Perfect!"
const player = { x: W / 2, kick: 0 };
const clouds = [
  { x: 40, y: 90, s: 1.0, speed: 12 },
  { x: 230, y: 160, s: 0.7, speed: 8 },
  { x: 330, y: 250, s: 0.9, speed: 10 },
];

// ----- 4. Saving with localStorage (wrapped in try/catch in case it is blocked) -----
function loadSetting(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {
    /* ignore: saving is optional */
  }
}

// ----- 5. Small helper functions -----
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const randomRange = (min, max) => min + Math.random() * (max - min);
const currentLevel = () => Math.floor(score / POINTS_PER_LEVEL);
const currentGravity = () => Math.min(MAX_GRAVITY, BASE_GRAVITY + currentLevel() * GRAVITY_PER_LEVEL);
const targetRadius = () => Math.max(MIN_RADIUS, START_RADIUS - currentLevel());
const windMax = () => Math.min(160, 40 + currentLevel() * 15);

// ----- 6. Sound effects (made with code, no audio files needed) -----
let audioCtx = null;

function getAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function beep(freq, duration, type, volume, slideTo) {
  if (muted) return;
  const ac = getAudio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const now = ac.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration);
}

const playTak = (perfect) => beep(perfect ? 900 : 520, 0.08, "triangle", 0.3, perfect ? 1400 : 300);
const playThud = () => beep(160, 0.3, "sine", 0.35, 50);
const playLevelUp = () => {
  beep(660, 0.1, "square", 0.08);
  setTimeout(() => beep(990, 0.15, "square", 0.08), 100);
};

// ----- 7. Starting, ending and pausing -----
function resetGame() {
  score = 0;
  lastLevel = 0;
  kickCooldown = 0;
  shake = 0;
  floaters = [];
  sipa = { x: W / 2, y: 160, vx: 0, vy: -150, r: START_RADIUS };
  wind = { value: 0, target: 0, timer: 3 };
  player.x = W / 2;
  player.kick = 0;
}

function startGame() {
  getAudio(); // browsers only allow sound after a click, so we unlock it here
  resetGame();
  state = STATE.PLAYING;
  showOverlay(null);
}

function gameOver() {
  state = STATE.OVER;
  sipa.y = GROUND_Y - sipa.r * 0.75;
  sipa.vx = 0;
  sipa.vy = 0;
  shake = 0.35;
  playThud();

  const isNewBest = score > best;
  if (isNewBest) {
    best = score;
    saveSetting("sipa-best", best);
  }

  // Wait a moment so the player sees the sipa land
  setTimeout(() => {
    if (state !== STATE.OVER) return;
    document.getElementById("finalScore").textContent = score;
    document.getElementById("finalBest").textContent = best;
    document.getElementById("newBest").classList.toggle("hidden", !isNewBest);
    document.getElementById("shareMsg").textContent = "";
    showOverlay("gameover");
  }, 700);
}

function pauseGame() {
  if (state !== STATE.PLAYING) return;
  state = STATE.PAUSED;
  showOverlay("paused");
}

function resumeGame() {
  if (state !== STATE.PAUSED) return;
  state = STATE.PLAYING;
  showOverlay(null);
}

function goToMenu() {
  state = STATE.MENU;
  resetGame();
  document.getElementById("menuBest").textContent = best;
  showOverlay("menu");
}

// Shows one overlay screen (or none if name is null)
function showOverlay(name) {
  for (const id of ["menu", "paused", "gameover"]) {
    document.getElementById(id).classList.toggle("hidden", id !== name);
  }
}

// ----- 8. Kicking -----
// Converts a click/tap position on the screen into game-world coordinates
function toGamePoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * W,
    y: ((event.clientY - rect.top) / rect.height) * H,
  };
}

function tryKick(tapX, tapY) {
  if (kickCooldown > 0) return;

  const dx = sipa.x - tapX;
  const dy = sipa.y - tapY;
  const distance = Math.hypot(dx, dy);
  const reach = Math.max(sipa.r * 1.6, 36); // a bit bigger than the sipa so it's fair on phones
  if (distance > reach) return; // missed

  // offset: -1 = tapped far right side, 0 = center, +1 = tapped far left side
  const offset = clamp(dx / reach, -1, 1);
  const perfect = Math.abs(offset) < 0.25;

  // Kick speed needed to reach KICK_HEIGHT: v = √(2 × gravity × height)
  sipa.vy = -Math.sqrt(2 * currentGravity() * KICK_HEIGHT);
  sipa.vx = offset * SIDE_POWER + sipa.vx * 0.2;

  const points = perfect ? 2 : 1;
  score += points;
  floaters.push({
    x: sipa.x,
    y: sipa.y - 30,
    text: perfect ? "Perfect! +2" : "+1",
    color: perfect ? "#ffd166" : "#ffffff",
    size: perfect ? 26 : 22,
    life: 0.8,
    maxLife: 0.8,
  });

  kickCooldown = 0.12;
  player.kick = 0.25;
  playTak(perfect);

  // Level up message every 10 points
  const level = currentLevel();
  if (level > lastLevel) {
    lastLevel = level;
    floaters.push({
      x: W / 2, y: H / 2 - 60,
      text: `Level ${level + 1}!`,
      color: "#06d6a0", size: 40, life: 1.4, maxLife: 1.4,
    });
    playLevelUp();
  }
}

canvas.addEventListener("pointerdown", (event) => {
  if (state !== STATE.PLAYING) return;
  event.preventDefault();
  const p = toGamePoint(event);
  tryKick(p.x, p.y);
});

// ----- 9. Update: moves everything forward by dt seconds -----
function update(dt) {
  // Wind: every few seconds, pick a new random wind direction
  if (score >= WIND_START) {
    wind.timer -= dt;
    if (wind.timer <= 0) {
      wind.target = randomRange(-1, 1) * windMax();
      wind.timer = randomRange(3, 5);
    }
  } else {
    wind.target = 0;
  }
  wind.value += (wind.target - wind.value) * Math.min(1, dt * 1.5); // smooth change

  // Physics: gravity pulls down, wind pushes sideways, air slows it a little
  sipa.vy += currentGravity() * dt;
  sipa.vx += wind.value * dt;
  sipa.vx *= 1 - 0.3 * dt;
  sipa.x += sipa.vx * dt;
  sipa.y += sipa.vy * dt;

  // Slowly shrink the sipa as levels go up
  sipa.r += (targetRadius() - sipa.r) * Math.min(1, dt * 2);

  // Bounce off the left/right walls and the ceiling
  if (sipa.x - sipa.r < 0) {
    sipa.x = sipa.r;
    sipa.vx = Math.abs(sipa.vx) * 0.6;
  } else if (sipa.x + sipa.r > W) {
    sipa.x = W - sipa.r;
    sipa.vx = -Math.abs(sipa.vx) * 0.6;
  }
  if (sipa.y - sipa.r < 0) {
    sipa.y = sipa.r;
    sipa.vy = Math.abs(sipa.vy) * 0.3;
  }

  // Touching the ground = game over
  if (sipa.y + sipa.r * 0.75 >= GROUND_Y) {
    gameOver();
    return;
  }

  // The player character follows the sipa
  player.x += (clamp(sipa.x, 40, W - 40) - player.x) * Math.min(1, dt * 4);
  player.kick = Math.max(0, player.kick - dt);
  kickCooldown -= dt;
}

// Things that keep moving even on the menu / pause screens
function updateScenery(dt) {
  for (const c of clouds) {
    c.x += (c.speed + wind.value * 0.4) * dt;
    if (c.x > W + 80) c.x = -80;
    if (c.x < -80) c.x = W + 80;
  }
  for (const f of floaters) {
    f.y -= 40 * dt;
    f.life -= dt;
  }
  floaters = floaters.filter((f) => f.life > 0);
  shake = Math.max(0, shake - dt);
}

// ----- 10. Drawing -----
function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function drawCloud(c) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  circle(c.x, c.y, 22 * c.s);
  circle(c.x + 24 * c.s, c.y - 10 * c.s, 26 * c.s);
  circle(c.x + 50 * c.s, c.y, 20 * c.s);
}

function drawBackground() {
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, "#5ec8f2");
  sky.addColorStop(1, "#d4f1ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // Sun
  ctx.fillStyle = "#ffd166";
  circle(320, 95, 34);

  for (const c of clouds) drawCloud(c);

  // Far mountain (like Mt. Makiling seen from Calauan)
  ctx.fillStyle = "#7fb069";
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(0, 470);
  ctx.quadraticCurveTo(90, 400, 160, 432);
  ctx.quadraticCurveTo(250, 345, 330, 420);
  ctx.quadraticCurveTo(370, 445, W, 440);
  ctx.lineTo(W, GROUND_Y);
  ctx.closePath();
  ctx.fill();

  // Near hills
  ctx.fillStyle = "#5a9449";
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.quadraticCurveTo(100, 490, 210, 520);
  ctx.quadraticCurveTo(320, 485, W, 515);
  ctx.lineTo(W, GROUND_Y);
  ctx.closePath();
  ctx.fill();

  // Ground (concrete barangay court)
  ctx.fillStyle = "#d9c7a3";
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = "#bfa97f";
  ctx.fillRect(0, GROUND_Y, W, 6);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 3;
  line(0, GROUND_Y + 45, W, GROUND_Y + 45);
}

function drawPlayer() {
  const x = player.x;
  const gy = GROUND_Y;
  const kicking = player.kick > 0;
  const skin = "#8d5a3b";

  ctx.lineCap = "round";

  // Legs
  ctx.strokeStyle = skin;
  ctx.lineWidth = 7;
  line(x - 6, gy - 34, x - 10, gy - 2);
  if (kicking) line(x + 6, gy - 34, x + 28, gy - 46); // kicking leg up
  else line(x + 6, gy - 34, x + 10, gy - 2);

  // Shorts and maroon shirt
  ctx.fillStyle = "#2b2d42";
  roundRect(x - 12, gy - 46, 24, 15, 4);
  ctx.fillStyle = "#7b1e2b";
  roundRect(x - 13, gy - 76, 26, 34, 6);

  // Arms
  ctx.strokeStyle = skin;
  ctx.lineWidth = 6;
  line(x - 12, gy - 70, x - 24, gy - (kicking ? 62 : 50));
  line(x + 12, gy - 70, x + 24, gy - (kicking ? 78 : 52));

  // Head and hair
  ctx.fillStyle = skin;
  circle(x, gy - 88, 11);
  ctx.fillStyle = "#1b1b1b";
  ctx.beginPath();
  ctx.arc(x, gy - 90, 11, Math.PI, 0);
  ctx.fill();
}

function drawSipa(time) {
  const { x, y, r } = sipa;

  // Shadow on the ground: smaller and lighter when the sipa is high up
  const height = GROUND_Y - y;
  const shadow = Math.max(0.3, 1 - height / 600);
  ctx.fillStyle = `rgba(0, 0, 0, ${0.25 * shadow})`;
  ctx.beginPath();
  ctx.ellipse(x, GROUND_Y + 4, r * 1.2 * shadow, r * 0.35 * shadow, 0, 0, Math.PI * 2);
  ctx.fill();

  // Colorful plastic strips trail behind the direction it is moving
  let tx = -sipa.vx;
  let ty = -sipa.vy - 80;
  const len = Math.hypot(tx, ty) || 1;
  const baseAngle = Math.atan2(ty / len, tx / len);
  const colors = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#f78c6b", "#9b5de5", "#ef476f"];

  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(3, r * 0.22);
  colors.forEach((color, i) => {
    const spread = (i - (colors.length - 1) / 2) * 0.17;
    const wiggle = Math.sin(time * 12 + i) * 0.05;
    const a = baseAngle + spread + wiggle;
    ctx.strokeStyle = color;
    line(x, y, x + Math.cos(a) * r * 2.1, y + Math.sin(a) * r * 2.1);
  });

  // Metal washer (the heavy base of the sipa)
  ctx.fillStyle = "#9aa5b1";
  circle(x, y, r * 0.75);
  ctx.strokeStyle = "#5c6670";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#d8e0e6";
  circle(x, y, r * 0.28);
}

function drawText(text, x, y, size, color, align = "center") {
  ctx.font = `bold ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size / 8);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawHUD() {
  drawText(String(score), W / 2, 92, 64, "#ffffff");
  drawText(`Best ${best}`, W / 2, 120, 16, "#ffffff");
  drawText(`Lvl ${currentLevel() + 1}`, 16, 34, 18, "#ffffff", "left");

  // Wind indicator
  if (Math.abs(wind.value) > 5) {
    const strength = wind.value / 160; // -1 to 1
    const cx = 52;
    const cy = 58;
    const half = 10 + Math.abs(strength) * 26;
    const dir = Math.sign(strength);
    drawText("Wind", 16, 64, 13, "#ffffff", "left");
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    line(cx + 10, cy, cx + 10 + half * dir, cy);
    line(cx + 10 + half * dir, cy, cx + 10 + (half - 8) * dir, cy - 6);
    line(cx + 10 + half * dir, cy, cx + 10 + (half - 8) * dir, cy + 6);
  }

  // Hint at the very start
  if (score === 0) {
    drawText("Tap the sipa!", W / 2, sipa.y - 50, 20, "#ffd166");
  }
}

function drawFloaters() {
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
    drawText(f.text, f.x, f.y, f.size, f.color);
  }
  ctx.globalAlpha = 1;
}

function draw(time) {
  ctx.save();
  if (shake > 0) {
    ctx.translate(randomRange(-6, 6) * shake, randomRange(-6, 6) * shake);
  }

  drawBackground();
  drawPlayer();

  if (state === STATE.MENU) {
    // Gentle floating sipa behind the menu
    sipa.x = W / 2;
    sipa.y = 300 + Math.sin(time * 2) * 20;
  }
  drawSipa(time);

  if (state !== STATE.MENU) {
    drawHUD();
    drawFloaters();
  }
  ctx.restore();
}

// ----- 11. The game loop: runs about 60 times per second -----
function loop(timestamp) {
  // dt = seconds since last frame (capped so a lag spike doesn't break physics)
  const dt = Math.min(0.033, (timestamp - lastTime) / 1000 || 0);
  lastTime = timestamp;

  if (state === STATE.PLAYING) update(dt);
  updateScenery(dt);
  draw(timestamp / 1000);

  requestAnimationFrame(loop);
}

// ----- 12. Buttons and keyboard -----
document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("retryBtn").addEventListener("click", startGame);
document.getElementById("resumeBtn").addEventListener("click", resumeGame);
document.getElementById("quitBtn").addEventListener("click", goToMenu);

document.getElementById("pauseBtn").addEventListener("click", () => {
  if (state === STATE.PLAYING) pauseGame();
  else if (state === STATE.PAUSED) resumeGame();
});

const muteBtn = document.getElementById("muteBtn");
function updateMuteButton() {
  muteBtn.textContent = muted ? "🔇" : "🔊";
  muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
}
muteBtn.addEventListener("click", () => {
  muted = !muted;
  saveSetting("sipa-muted", muted);
  updateMuteButton();
});

document.getElementById("shareBtn").addEventListener("click", async () => {
  const msg = document.getElementById("shareMsg");
  const text = `I kicked the sipa ${score} times in Tara, Sipa! 🪶 Can you beat me? ${location.href}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Tara, Sipa!", text });
    } else {
      await navigator.clipboard.writeText(text);
      msg.textContent = "Copied! Paste it anywhere to share.";
    }
  } catch (e) {
    msg.textContent = "Couldn't share. Try taking a screenshot instead!";
  }
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "p" || key === "escape") {
    if (state === STATE.PLAYING) pauseGame();
    else if (state === STATE.PAUSED) resumeGame();
  }
  const gameoverShown = !document.getElementById("gameover").classList.contains("hidden");
  if ((key === " " || key === "enter") && (state === STATE.MENU || gameoverShown)) {
    event.preventDefault();
    startGame();
  }
});

// Pause automatically if the player switches tabs
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});

// ----- 13. Start everything -----
resizeCanvas();
resetGame();
updateMuteButton();
document.getElementById("menuBest").textContent = best;
requestAnimationFrame(loop);
