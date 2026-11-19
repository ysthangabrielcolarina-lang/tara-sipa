// =====================================================
//  TARA, SIPA!
//  Pick your Iskolar, then tap the sipa to kick it.
//  Don't let it hit the ground.
// =====================================================

// ----- 1. Canvas setup -----
// We always "think" in a 400 x 640 game world, then scale it to fit the screen.
const canvas = document.getElementById("game");
let ctx = canvas.getContext("2d"); // "let" so we can borrow the drawing functions for small previews
const W = 400;
const H = 640;
const GROUND_Y = H - 90; // y position of the ground (the road)

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1; // sharp drawing on high-res phones
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  // Scale so that drawing at (400, 640) reaches the bottom-right corner
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  backgroundDirty = true; // the saved background pictures must be redrawn at the new size
}
window.addEventListener("resize", resizeCanvas);

// The parts of the background that never move are drawn ONCE into two hidden canvases
// ("layers") and then just copied every frame. This keeps the game fast even with lots of detail.
const skyLayer = document.createElement("canvas");    // sky, sun, mountains
const groundLayer = document.createElement("canvas"); // trees, buildings, grass, road
let backgroundDirty = true;

// ----- 2. Game settings (tweak these to change the feel) -----
const BASE_GRAVITY = 1350;  // how fast the sipa falls (pixels per second²)
const MAX_GRAVITY = 2400;
const GRAVITY_PER_LEVEL = 70;
const KICK_HEIGHT = 230;    // how high one kick sends the sipa (pixels)
const SIDE_POWER = 260;     // how strongly an off-center tap pushes sideways
const START_RADIUS = 20;    // sipa size at the start
const MIN_RADIUS = 14;      // smallest the sipa can get
const WIND_START = 15;      // wind appears after this score
const POINTS_PER_LEVEL = 10;
const PLAYER_SCALE = 1.35;  // how big the character is drawn in the game
// The sipa can only be kicked when it is below this line (within the player's reach)
const KICK_ZONE_Y = GROUND_Y - 270;

// Student rank shown above the player: it goes up every 100 points
const RANKS = [
  { name: "Freshman",  min: 0,   color: "#06d6a0" },
  { name: "Sophomore", min: 100, color: "#4cc9f0" },
  { name: "Junior",    min: 200, color: "#c77dff" },
  { name: "Senior",    min: 300, color: "#ffd166" },
  { name: "Graduate",  min: 400, color: "#fff3b0" }, // wears a toga + confetti!
];

// Power-ups: items that fall from the sky. Tap them (or hit them with the sipa) to use them.
const POWERUP_START = 3;    // power-ups start appearing after this score
const POWERUP_MIN_GAP = 7;  // seconds between power-ups
const POWERUP_MAX_GAP = 12;
const POWERUPS = {
  kape:      { label: "Kape",      icon: "☕",  color: "#6f4e37", duration: 3,  message: "Kape! Slow-mo" },
  allowance: { label: "Allowance", icon: "💰", color: "#2a9d55", duration: 5, message: "Allowance! x2 points" },
  uno:       { label: "Uno",       icon: "1.0", color: "#7b1e2b", duration: 20, message: "Uno! Shield for 20s" },
  merienda:  { label: "Merienda",  icon: "🍢", color: "#e76f51", duration: 0,  message: "Merienda! Ganap cleared!" },
  reviewer:  { label: "Reviewer",  icon: "📚", color: "#1d6fb8", duration: 5,  message: "Reviewer! Bigger sipa" },
};

// Random events: special rounds that change the game for a few seconds
// Jeepneys and tricycles drive by on the road regularly during the whole game
const JEEP_MIN_GAP = 5;     // seconds between vehicles
const JEEP_MAX_GAP = 9;
const JEEP_SCALE = 1.3;     // how big the jeepney is drawn
const TRIKE_SCALE = 1.25;   // how big the tricycle is drawn
const ASPIN_CHANCE = 0.25;  // 25% are an aspin (stray dog) running by
const TRIKE_CHANCE = 0.35;  // 35% are tricycles, the rest (40%) are jeepneys

const EVENT_START = 5;      // events start happening after this score
const EVENT_FIRST_DELAY = 3; // seconds after reaching EVENT_START before the first event
const EVENT_MIN_GAP = 8;    // seconds between events
const EVENT_MAX_GAP = 14;
const EVENT_DURATION = 10;  // how long one event lasts
const EVENTS = {
  // group = events in the same group never happen at the same time (no storm + heat wave!)
  walangPasok: { group: "weather", title: "WALANG PASOK!",    subtitle: "Bagyo! Strong wind, x3 points", color: "#9ad1ff" },
  examWeek:    { title: "EXAM WEEK!",       subtitle: "Everything is faster!",         color: "#ff6b6b" },
  handouts:    { title: "FLYING HANDOUTS!", subtitle: "Watch out for paper!",          color: "#ffffff" },
  maya:        { title: "MAYA BIRDS!",      subtitle: "Don't let the maya hit the sipa!", color: "#e8c39e" },
  tagInit:     { group: "weather", title: "ANG INIT!",        subtitle: "Sobrang init! +1 bonus per kick",  color: "#ffb347" },
  // weight = how often it is picked compared to the others (default 1)
  // tapToStart = the game goes slow-motion and shows instructions until the player taps
  // introSeconds = slow-motion instructions for that many seconds, then it starts by itself
  // instructions = the lines shown on that banner; duration = how long the event lasts
  prof: {
    weight: 3, title: "NAKATINGIN SI PROF!", subtitle: "Tap your PLAYER to kick! x2 points", color: "#c9b3ff",
    tapToStart: true, duration: 6,
    instructions: ["Tap your PLAYER to kick", "for 6 seconds! (x2 points)"],
  },
  // Naku Baha happens often (weight 3) and ALWAYS right after Walang Pasok
  baha: {
    weight: 3, group: "weather", title: "NAKU BAHA!", subtitle: "You can't kick the sipa in the flood!", color: "#7fd1ff",
    introSeconds: 3, duration: 8, // slow-motion warning for 3 seconds, then starts by itself
    instructions: ["You CAN'T kick the sipa", "when it's IN the flood water!"],
  },
};

// Kuya Balita: the over-acting reporter who announces every Ganap.
// face = which over-acting expression he makes ("shock", "panic", "hot" or "scared")
const BALITA_LINES = {
  walangPasok: { face: "shock", text: "Bagyo na, mga schoolmates!!" },
  baha:        { face: "panic", text: "NAKU POOO!! BAHAA NANAMAN!!" },
  examWeek:    { face: "panic", text: "EXAM WEEK NA!! Bilisan mo, bilisan mo!!" },
  handouts:    { face: "shock", text: "AYYY!! Ingat sa papel!!" },
  maya:        { face: "shock", text: "ANDAMEE!!" },
  tagInit:     { face: "hot",   text: "GRABE ANG INIT!!" },
};

// ----- 3. Game state -----
const STATE = {
  MENU: "menu",
  SELECT: "select",   // choosing a character
  PLAYING: "playing",
  PAUSED: "paused",
  OVER: "over",
};
let state = STATE.MENU;

let score = 0;
let best = Number(loadSetting("sipa-best", 0)) || 0;
let muted = loadSetting("sipa-muted", "false") === "true";
let selectedChar = loadSetting("sipa-character", "boy"); // "boy" or "girl"
let lastRankName = "Freshman";
let kickCooldown = 0;
let shake = 0;
let lastTime = 0;
let tooHighCooldown = 0; // stops "Too high!" from spamming

let sipa = {};
let wind = {};
let floaters = []; // floating texts like "+1" and "Perfect!"
let confetti = [];  // graduation confetti pieces
let balita = null;      // Kuya Balita's current announcement
let balitaQueue = [];   // announcements waiting their turn
let powerUps = [];  // falling power-up items
let obstacles = []; // paper planes, handouts and maya birds
let raindrops = [];
let vehicles = [];  // jeepneys and tricycles driving on the road
let lightning = 0;  // flash timer during Walang Pasok
let effects = { kape: 0, allowance: 0, reviewer: 0, uno: 0 }; // seconds left for each effect
const hasShield = () => effects.uno > 0; // the Uno shield is active for 20 seconds
// The random events happening right now. Usually 1, but from Junior rank up to 2 at once.
// Each one looks like { type: "examWeek", timeLeft: 10, waiting: false, introAge: 3 }
let activeEvents = [];
let nextPowerUpIn = 0;
let nextEventIn = 0;
let nextObstacleIn = 0;
let nextJeepIn = 0;
const player = { x: W / 2, kick: 0 };
const clouds = [
  { x: 40, y: 80, s: 1.0, speed: 12 },
  { x: 230, y: 150, s: 0.7, speed: 8 },
  { x: 120, y: 230, s: 0.8, speed: 10 },
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
// Finds the highest rank whose "min" score you have reached
const currentRank = () => {
  let rank = RANKS[0];
  for (const r of RANKS) if (score >= r.min) rank = r;
  return rank;
};
// Hidden difficulty step: every 10 points the sipa gets a bit faster and smaller (no level shown)
const currentLevel = () => Math.floor(score / POINTS_PER_LEVEL);
const currentGravity = () => Math.min(MAX_GRAVITY, BASE_GRAVITY + currentLevel() * GRAVITY_PER_LEVEL);
const targetRadius = () =>
  Math.max(MIN_RADIUS, START_RADIUS - currentLevel()) + (effects.reviewer > 0 ? 12 : 0);
const windMax = () => Math.min(160, 40 + currentLevel() * 15);
const getEvent = (type) => activeEvents.find((ev) => ev.type === type) || null;
const isEvent = (type) => getEvent(type) !== null;
// How many events can happen at once: 1, or 2 once you reach Junior (200 points)
const maxEvents = () => (score >= 200 ? 2 : 1);

// Kape slows the game down, Exam Week speeds it up
// The warning before an event (like Nakatingin si Prof) is in slow motion
// 0 -> 1 during the first second of an event, 1 -> 0 during its last second (for smooth effects)
const eventFade = (type) => {
  const ev = getEvent(type);
  if (!ev || ev.waiting) return 0;
  const total = EVENTS[type].duration || EVENT_DURATION;
  const elapsed = total - ev.timeLeft;
  return clamp(Math.min(elapsed, ev.timeLeft) / 1.2, 0, 1);
};
// true while the slow-motion instructions are showing (until the player taps)
// Phones and tablets have no keyboard, so there a tap starts the event instead of a key
const IS_TOUCH_DEVICE = window.matchMedia("(pointer: coarse)").matches;
const START_HINT = IS_TOUCH_DEVICE ? "👆 Tap the screen to start" : "⌨️ Press any key to start";

const hasIntro = (setup) => setup.tapToStart === true || setup.introSeconds > 0;

const waitingEvent = () => activeEvents.find((ev) => ev.waiting) || null;
const inEventIntro = () => waitingEvent() !== null;
const gameSpeed = () =>
  (effects.kape > 0 ? 0.55 : 1) * (isEvent("examWeek") ? 1.35 : 1) * (inEventIntro() ? 0.12 : 1) * (isEvent("baha") ? 0.75 : 1);

// Naku Baha: the flood reaches the player's waist. The sipa can't be kicked under the water.
const WAIST_Y = GROUND_Y - 54 * PLAYER_SCALE;
const sipaInFlood = () => isEvent("baha") && !inEventIntro() && sipa.y > WAIST_Y;

// Can the sipa be kicked right now? It must be low enough to reach, but not in the flood.
const canKickNow = () => sipa.y >= KICK_ZONE_Y && !sipaInFlood();
// Allowance doubles points, Walang Pasok triples them
// Nakatingin si Prof doubles points too
const pointMultiplier = () =>
  (effects.allowance > 0 ? 2 : 1) * (isEvent("walangPasok") ? 3 : 1) * (isEvent("prof") ? 2 : 1);

// The area you must tap during "Nakatingin si Prof" (around the player's body)
const PLAYER_TAP_HALF_W = 45;
const PLAYER_TAP_H = 130 * PLAYER_SCALE;
const isOnPlayer = (x, y) =>
  Math.abs(x - player.x) < PLAYER_TAP_HALF_W && y > GROUND_Y - PLAYER_TAP_H && y < GROUND_Y + 15;

// Drawing helpers. "g" is the canvas context to draw on
// (the main game canvas or a small character card).
function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function ellipse(g, x, y, rx, ry, rotation = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
  g.fill();
}

function line(g, x1, y1, x2, y2) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

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

// ----- 6b. Background music + ambient sounds (all made with code) -----
// A cheerful looping chiptune (chords C - G - Am - F), birds chirping on nice days,
// and the sound of rain during Walang Pasok. The 🎵 button turns it on/off.
let musicOn = loadSetting("sipa-music", "true") === "true";
const MUSIC_BPM = 112;
const STEP = 60 / MUSIC_BPM / 4; // one 16th note, in seconds
const BASS = [48, 43, 45, 41];   // one bass note per bar: C, G, A, F (MIDI note numbers)
const MELODY = [                 // 64 steps (4 bars x 16). 0 = no note
  72, 0, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 74, 0, 0, 0,
  74, 0, 79, 0, 83, 0, 79, 0, 77, 0, 76, 0, 74, 0, 0, 0,
  72, 0, 76, 0, 81, 0, 79, 0, 76, 0, 74, 0, 72, 0, 0, 0,
  69, 0, 72, 0, 77, 0, 76, 0, 74, 0, 72, 0, 71, 0, 0, 0,
];
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let musicStep = 0;
let nextNoteTime = 0;
let noiseBuffer = null;
let rainGain = null;
let birdIn = 3;
let wasRinging = false;

function playNote(freq, when, dur, type, vol) {
  const ac = audioCtx;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(vol, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(when);
  osc.stop(when + dur);
}

// White noise (random numbers) is used for the hi-hat and the rain
function getNoise() {
  if (!noiseBuffer) {
    noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function playHiHat(when) {
  const src = audioCtx.createBufferSource();
  src.buffer = getNoise();
  const filter = audioCtx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 7000;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.012, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  src.connect(filter).connect(gain).connect(audioCtx.destination);
  src.start(when);
  src.stop(when + 0.05);
}

// Notes are scheduled a little ahead of time so the music never stutters
function scheduleMusic() {
  const ac = audioCtx;
  if (nextNoteTime < ac.currentTime) nextNoteTime = ac.currentTime + 0.05;
  while (nextNoteTime < ac.currentTime + 0.15) {
    const s = musicStep % 64;
    const bar = Math.floor(s / 16);
    const inBar = s % 16;
    if (MELODY[s]) playNote(midiToHz(MELODY[s]), nextNoteTime, STEP * 1.6, "triangle", 0.035);
    if (inBar % 4 === 0) playNote(midiToHz(BASS[bar]), nextNoteTime, STEP * 2.5, "square", 0.02);
    if (inBar % 4 === 2) playHiHat(nextNoteTime);
    nextNoteTime += STEP;
    musicStep++;
  }
}

// Rain: looping noise through a "lowpass" filter (only the deep rumble gets through)
function setupRain() {
  if (rainGain) return;
  const src = audioCtx.createBufferSource();
  src.buffer = getNoise();
  src.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  rainGain = audioCtx.createGain();
  rainGain.gain.value = 0;
  src.connect(filter).connect(rainGain).connect(audioCtx.destination);
  src.start();
}

// Runs every frame: music, rain volume and the occasional bird
function updateAudio(dt) {
  if (!audioCtx || audioCtx.state !== "running") return;
  const soundOn = musicOn && !muted;
  if (soundOn) scheduleMusic();

  setupRain();
  const raining = soundOn && state !== STATE.MENU && isEvent("walangPasok");
  rainGain.gain.setTargetAtTime(raining ? 0.07 : 0, audioCtx.currentTime, 0.4); // fades smoothly

  // The ice scramble vendor rings his bell every 5 seconds ("ting ting!")
  const ringNow = state !== STATE.MENU && performance.now() / 1000 % 5 < 0.8;
  if (ringNow && !wasRinging && soundOn) {
    beep(2093, 0.12, "triangle", 0.02);
    setTimeout(() => beep(2093, 0.12, "triangle", 0.02), 180);
  }
  wasRinging = ringNow;

  // Birds chirp now and then, but not during bad weather
  const niceDay = !isEvent("walangPasok") && !isEvent("baha");
  birdIn -= dt;
  if (birdIn <= 0) {
    birdIn = randomRange(4, 8);
    if (soundOn && niceDay) {
      beep(2400, 0.07, "sine", 0.015, 3200);
      setTimeout(() => beep(2600, 0.07, "sine", 0.015, 3400), 110);
    }
  }
}

const playTak = (perfect) => beep(perfect ? 900 : 520, 0.08, "triangle", 0.3, perfect ? 1400 : 300);
const playThud = () => beep(160, 0.3, "sine", 0.35, 50);
const playSelect = () => beep(700, 0.06, "square", 0.08, 900);
const playBump = () => beep(300, 0.1, "square", 0.1, 180);
const playShield = () => beep(400, 0.25, "triangle", 0.2, 1200);
const playPowerUp = () => {
  beep(523, 0.08, "square", 0.08);
  setTimeout(() => beep(784, 0.08, "square", 0.08), 80);
  setTimeout(() => beep(1046, 0.12, "square", 0.08), 160);
};
const playAlarm = () => {
  beep(880, 0.12, "sawtooth", 0.06);
  setTimeout(() => beep(660, 0.12, "sawtooth", 0.06), 150);
  setTimeout(() => beep(880, 0.12, "sawtooth", 0.06), 300);
};
const playHonk = () => {
  beep(392, 0.18, "square", 0.07);
  setTimeout(() => beep(330, 0.25, "square", 0.07), 200);
};
const playTrikeHorn = () => {
  beep(620, 0.1, "square", 0.06);
  setTimeout(() => beep(620, 0.12, "square", 0.06), 150);
};
const playFanfare = () => {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, "square", 0.08), i * 140));
};
const playBark = () => {
  beep(330, 0.08, "square", 0.08, 250);
  setTimeout(() => beep(330, 0.08, "square", 0.08, 250), 130);
};
const playThunder = () => beep(70, 0.7, "sawtooth", 0.12, 30);

// ----- 7. Screens: menu, character select, playing, paused, game over -----
function resetGame() {
  score = 0;
  lastRankName = RANKS[0].name;
  kickCooldown = 0;
  shake = 0;
  floaters = [];
  confetti = [];
  balita = null;
  balitaQueue = [];
  sipa = { x: W / 2, y: 160, vx: 0, vy: -150, r: START_RADIUS };
  wind = { value: 0, target: 0, timer: 3 };
  player.x = W / 2;
  player.kick = 0;

  powerUps = [];
  obstacles = [];
  raindrops = [];
  vehicles = [];
  lightning = 0;
  effects = { kape: 0, allowance: 0, reviewer: 0, uno: 0 };
  activeEvents = [];
  nextPowerUpIn = randomRange(POWERUP_MIN_GAP, POWERUP_MAX_GAP);
  nextEventIn = EVENT_FIRST_DELAY;
  nextObstacleIn = 0;
  nextJeepIn = randomRange(3, 5);
}

function openCharacterSelect() {
  getAudio(); // browsers only allow sound after a click, so we unlock it here
  state = STATE.SELECT;
  updateCardHighlight();
  showOverlay("select");
}

function chooseCharacter(type) {
  selectedChar = type;
  saveSetting("sipa-character", type);
  updateCardHighlight();
  playSelect();
}

function startGame() {
  getAudio();
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
    const rank = currentRank();
    const rankEl = document.getElementById("finalRank");
    rankEl.textContent = rank.name;
    rankEl.style.color = rank.color;
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
  for (const id of ["menu", "events", "powerups", "select", "paused", "gameover"]) {
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

// Tap ANYWHERE on the screen to kick, as long as the sipa is low enough (glowing).
// Where you tap decides the direction:
//   tap to the LEFT of the sipa  -> it flies left
//   tap to the RIGHT of the sipa -> it flies right
//   tap in line with the sipa    -> straight up = Perfect!
// centerX = what the tap is compared to (the sipa, or the player during Nakatingin si Prof)
// spread  = how far from centerX a tap must be to send the sipa fully sideways
function tryKick(tapX, centerX = sipa.x, spread = 120) {
  if (kickCooldown > 0) return;

  // Out of reach: too high (or, during the flood, too low under the water)
  if (!canKickNow()) {
    if (tooHighCooldown <= 0) {
      const inFlood = sipaInFlood();
      floaters.push({
        x: sipa.x, y: sipa.y + (inFlood ? -40 : 45), text: inFlood ? "Nasa baha! Can't kick!" : "Too high!",
        color: "#ff9f9f", size: 18, life: 0.6, maxLife: 0.6,
      });
      tooHighCooldown = 0.5;
    }
    return;
  }

  // offset: -1 = tapped far to the left, 0 = in line with the sipa, +1 = far to the right
  const offset = clamp((tapX - centerX) / spread, -1, 1);
  const perfect = Math.abs(offset) < 0.25;

  // Kick speed needed to reach KICK_HEIGHT: v = √(2 × gravity × height)
  sipa.vy = -Math.sqrt(2 * currentGravity() * KICK_HEIGHT);
  sipa.vx = offset * SIDE_POWER + sipa.vx * 0.2;

  // Tag-init gives +1 bonus on every kick
  const points = (perfect ? 2 : 1) * pointMultiplier() + (isEvent("tagInit") ? 1 : 0);
  score += points;
  floaters.push({
    x: sipa.x,
    y: sipa.y - 30,
    text: perfect ? `Perfect! +${points}` : `+${points}`,
    color: perfect ? "#ffd166" : "#ffffff",
    size: perfect ? 26 : 22,
    life: 0.8,
    maxLife: 0.8,
  });

  kickCooldown = 0.12;
  player.kick = 0.25;
  playTak(perfect);

  // Rank up every 100 points: Freshman -> Sophomore -> Junior -> Senior
  const rank = currentRank();
  if (rank.name !== lastRankName) {
    lastRankName = rank.name;
    floaters.push({
      x: W / 2, y: H / 2 - 130,
      text: `${rank.name} ka na! 🎓`,
      color: rank.color, size: 32, life: 2, maxLife: 2,
    });
    if (rank.name === "Graduate") {
      floaters.pop(); // replace the normal message with a bigger celebration
      floaters.push({ x: W / 2, y: H / 2 - 140, text: "GRADUATE KA NA! 🎓", color: rank.color, size: 32, life: 3, maxLife: 3 });
      floaters.push({ x: W / 2, y: H / 2 - 110, text: "Congrats, Iskolar ng Bayan!", color: "#ffffff", size: 17, life: 3, maxLife: 3 });
      launchConfetti();
      playFanfare();
    }
    if (rank.name === "Junior") {
      floaters.push({
        x: W / 2, y: H / 2 - 98, text: "2 Ganap can happen at once!",
        color: "#ffffff", size: 16, life: 2.4, maxLife: 2.4,
      });
    }
    playPowerUp();
  }

}

canvas.addEventListener("pointerdown", (event) => {
  if (state !== STATE.PLAYING) return;
  event.preventDefault();
  const p = toGamePoint(event);

  // Instructions are showing: on a computer you must press a KEY (clicking does nothing).
  // On a phone/tablet there is no keyboard, so a tap works instead.
  if (inEventIntro()) {
    if (IS_TOUCH_DEVICE) finishEventIntro();
    return;
  }

  // Tapping a falling power-up collects it
  for (const item of powerUps) {
    if (!item.collected && Math.hypot(item.x - p.x, item.y - p.y) < item.r + 14) {
      collectPowerUp(item);
    }
  }
  if (isEvent("prof")) {
    // Nakatingin si Prof: you can only kick by tapping your player
    if (isOnPlayer(p.x, p.y)) {
      tryKick(p.x, player.x, PLAYER_TAP_HALF_W);
    } else if (tooHighCooldown <= 0) {
      floaters.push({ x: player.x, y: GROUND_Y - PLAYER_TAP_H - 30, text: "Tap your player!", color: "#c9b3ff", size: 18, life: 0.7, maxLife: 0.7 });
      tooHighCooldown = 0.6;
    }
  } else {
    tryKick(p.x);
  }
});

// Ends the slow-motion instructions and starts the event(s).
// We wait 0.6s first so a key or tap meant for the sipa doesn't skip the instructions by accident.
function finishEventIntro() {
  if (!inEventIntro() || waitingEvent().introAge <= 0.6) return;
  if (!EVENTS[waitingEvent().type].tapToStart) return; // timed warnings (Naku Baha) can't be skipped
  for (const ev of activeEvents) ev.waiting = false;
  floaters.push({ x: W / 2, y: H / 2 - 60, text: "GO!", color: "#ffd166", size: 40, life: 0.8, maxLife: 0.8 });
  playSelect();
}

// ----- 8b. Power-ups and random events -----
function spawnPowerUp() {
  // Merienda only falls while a Ganap is happening (it clears them)
  const types = Object.keys(POWERUPS).filter((t) => t !== "merienda" || activeEvents.length > 0);
  const type = types[Math.floor(Math.random() * types.length)];
  const x = randomRange(60, W - 60);
  powerUps.push({ type, x, baseX: x, y: -30, r: 20, age: 0, collected: false });
}

function collectPowerUp(item) {
  item.collected = true;
  const info = POWERUPS[item.type];
  if (item.type === "merienda") clearAllGanap();
  else effects[item.type] = info.duration;

  floaters.push({
    x: clamp(item.x, 90, W - 90), y: item.y,
    text: info.message, color: "#ffd166", size: 20, life: 1.3, maxLife: 1.3,
  });
  playPowerUp();
}

// Kuya Balita: queue an announcement for this Ganap
function announceGanap(type) {
  const lineInfo = BALITA_LINES[type];
  if (!lineInfo) return;
  balitaQueue.push({
    ...lineInfo,
    age: 0,
    lastChar: 0,
    duration: Math.max(3, lineInfo.text.length / 30 + 1.8), // longer lines stay longer
  });
}

// Runs every frame while playing (real time, so it doesn't slow down in slow-motion)
function updateBalita(dt) {
  if (!balita && balitaQueue.length > 0) balita = balitaQueue.shift();
  if (!balita) return;
  balita.age += dt;

  // Typewriter "voice": a quick random-pitch blip every few letters, like gibberish talking
  const chars = Math.floor(balita.age * 30);
  if (chars > balita.lastChar && chars <= balita.text.length && chars % 3 === 0) {
    beep(randomRange(280, 620), 0.04, "square", 0.035);
  }
  balita.lastChar = chars;

  if (balita.age >= balita.duration) balita = null;
}

// Merienda: ends every Ganap right away (no flood after the storm, either!)
function clearAllGanap() {
  activeEvents = [];
  raindrops = [];
  obstacles = [];
  lightning = 0;
  nextEventIn = randomRange(EVENT_MIN_GAP, EVENT_MAX_GAP);
}

// Picks a random event. Events with a bigger "weight" are picked more often:
// all weights are added up, then a random number lands inside one event's share.
function pickRandomEvent() {
  const types = Object.keys(EVENTS).filter((t) => {
    if (EVENTS[t].followUpOnly || isEvent(t)) return false;
    // don't mix events from the same group, or two events that both stop for instructions
    return !activeEvents.some((ev) => {
      const other = EVENTS[ev.type];
      return (other.group && other.group === EVENTS[t].group) || (hasIntro(other) && hasIntro(EVENTS[t]));
    });
  });
  if (types.length === 0) return null;
  const total = types.reduce((sum, t) => sum + (EVENTS[t].weight || 1), 0);
  let roll = Math.random() * total;
  for (const t of types) {
    roll -= EVENTS[t].weight || 1;
    if (roll <= 0) return t;
  }
  return types[types.length - 1];
}

function startRandomEvent() {
  const type = pickRandomEvent();
  if (type) startEvent(type);
}

function startEvent(type) {
  const setup = EVENTS[type];
  const ev = {
    type,
    timeLeft: setup.duration || EVENT_DURATION,
    waiting: hasIntro(setup), // slow-motion instructions first (until a key/tap, or for introSeconds)
    introAge: 0,                         // seconds since the event appeared
  };
  activeEvents.push(ev);
  announceGanap(type);
  nextEventIn = randomRange(EVENT_MIN_GAP, EVENT_MAX_GAP); // gap before another one can start
  nextObstacleIn = 0.6;
  if (type === "walangPasok") wind.timer = 0; // storm wind starts right away

  const info = EVENTS[type];
  // When a 2nd event joins, show its title a bit lower so it doesn't cover the first one
  const shift = activeEvents.length > 1 ? 70 : 0;
  if (ev.waiting) {
    playAlarm(); // these events show a big instruction banner instead (drawEventIntro)
    return;
  }
  floaters.push({ x: W / 2, y: H / 2 - 110 + shift, text: info.title, color: info.color, size: 34, life: 2.2, maxLife: 2.2 });
  floaters.push({ x: W / 2, y: H / 2 - 80 + shift, text: info.subtitle, color: "#ffffff", size: 17, life: 2.2, maxLife: 2.2 });
  playAlarm();
}

function endEvent(ev) {
  activeEvents = activeEvents.filter((e) => e !== ev);
  if (ev.type === "walangPasok") raindrops = [];

  // After the storm comes the flood!
  if (ev.type === "walangPasok") {
    startEvent("baha");
    return;
  }
  if (activeEvents.length > 0) return; // another event is still going
  nextEventIn = randomRange(EVENT_MIN_GAP, EVENT_MAX_GAP);
  floaters.push({ x: W / 2, y: H / 2 - 100, text: "Balik normal!", color: "#06d6a0", size: 26, life: 1.4, maxLife: 1.4 });
}

// kind: "plane", "paper" or "maya"
function spawnObstacle(kind) {
  const fromLeft = Math.random() < 0.5;
  const speed = kind === "maya" ? randomRange(150, 210) : randomRange(140, 200);
  obstacles.push({
    kind,
    x: fromLeft ? -30 : W + 30,
    y: randomRange(150, GROUND_Y - 170),
    vx: fromLeft ? speed : -speed,
    r: kind === "maya" ? 12 : 13,
    spin: randomRange(-3, 3),
    age: 0,
    hit: false,
  });
}

function spawnVehicle() {
  const roll = Math.random();
  const kind = roll < ASPIN_CHANCE ? "aspin" : roll < ASPIN_CHANCE + TRIKE_CHANCE ? "trike" : "jeep";
  const fromLeft = Math.random() < 0.5;
  const speeds = { aspin: [170, 220], trike: [200, 250], jeep: [230, 290] };
  const speed = randomRange(...speeds[kind]);
  vehicles.push({
    kind, x: fromLeft ? -180 : W + 180, vx: fromLeft ? speed : -speed,
    gusted: false, jumpT: -1, // jumpT = time since the aspin jumped (-1 = hasn't jumped)
    honkT: -1,      // time since the last honk/bark bubble appeared (-1 = none showing)
    onScreen: false, // becomes true the first time it drives into view
  });
}

// Honk (or bark) with a sound + a red comic "BEEP BEEP!" bubble beside the vehicle
function honk(v) {
  v.honkT = 0;
  // Every honk/bark startles the sipa: it bumps up a little and sideways (the way the vehicle goes)
  if (state === STATE.PLAYING && !inEventIntro()) {
    sipa.vy -= 170;
    sipa.vx += Math.sign(v.vx) * 140;
    shake = Math.max(shake, 0.12);
  }
  if (v.kind === "aspin") playBark();
  else if (v.kind === "trike") playTrikeHorn();
  else playHonk();
}

// dt = real seconds, pdt = "game" seconds (slower with Kape, faster in Exam Week)
function updatePowerUpsAndEvents(dt, pdt) {
  // Count down active effects
  for (const key in effects) effects[key] = Math.max(0, effects[key] - dt);

  // Spawn a power-up every few seconds
  if (score >= POWERUP_START) {
    nextPowerUpIn -= dt;
    if (nextPowerUpIn <= 0) {
      if (powerUps.length < 2) spawnPowerUp();
      nextPowerUpIn = randomRange(POWERUP_MIN_GAP, POWERUP_MAX_GAP);
    }
  }

  // Power-ups float down in a wavy line; the sipa can also grab them
  for (const item of powerUps) {
    item.age += pdt;
    item.y += 85 * pdt;
    item.x = item.baseX + Math.sin(item.age * 2) * 25;
    if (!item.collected && Math.hypot(item.x - sipa.x, item.y - sipa.y) < item.r + sipa.r * 0.75) {
      collectPowerUp(item);
    }
  }
  powerUps = powerUps.filter((item) => !item.collected && item.y < GROUND_Y - 10);

  // Start or end random events
  // While instructions are showing, every event timer waits for the player's tap
  const paused = inEventIntro();
  for (const ev of [...activeEvents]) {
    ev.introAge += dt;
    // Timed warnings (like Naku Baha) start by themselves after introSeconds
    const secs = EVENTS[ev.type].introSeconds;
    if (ev.waiting && secs && ev.introAge >= secs) {
      ev.waiting = false;
      floaters.push({ x: W / 2, y: H / 2 - 60, text: "GO!", color: "#ffd166", size: 40, life: 0.8, maxLife: 0.8 });
      playSelect();
    }
    if (!ev.waiting && !paused) {
      ev.timeLeft -= dt;
      if (ev.timeLeft <= 0) endEvent(ev);
    }
  }
  // Start a new event when there is room (1 event, or 2 from Junior rank)
  if (score >= EVENT_START && activeEvents.length < maxEvents() && !paused) {
    nextEventIn -= dt;
    if (nextEventIn <= 0) startRandomEvent();
  }

  // Flying handouts and maya birds
  if (isEvent("handouts") || isEvent("maya")) {
    nextObstacleIn -= dt;
    if (nextObstacleIn <= 0) {
      // If both events are on, pick one of them at random each time
      const useMaya = isEvent("maya") && (!isEvent("handouts") || Math.random() < 0.5);
      if (useMaya) {
        // Maya birds come in small flocks of 1 to 3
        const flock = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < flock; i++) spawnObstacle("maya");
      } else {
        spawnObstacle(Math.random() < 0.5 ? "plane" : "paper");
      }
      nextObstacleIn = randomRange(1.0, 1.8);
    }
  }
  for (const o of obstacles) {
    o.age += pdt;
    o.x += o.vx * pdt;
    if (o.kind === "paper") o.y += Math.sin(o.age * 3) * 30 * pdt;  // flutters
    if (o.kind === "maya") o.y += Math.sin(o.age * 6) * 35 * pdt;   // bouncy little flight

    // Hitting the sipa pushes it sideways
    if (!o.hit && Math.hypot(o.x - sipa.x, o.y - sipa.y) < o.r + sipa.r * 0.75) {
      o.hit = true;
      sipa.vx += Math.sign(o.vx) * 260;
      sipa.vy -= 80;
      floaters.push({ x: sipa.x, y: sipa.y - 30, text: "Bump!", color: "#ff6b6b", size: 20, life: 0.7, maxLife: 0.7 });
      playBump();
    }
  }
  obstacles = obstacles.filter((o) => o.x > -60 && o.x < W + 60);

  // Jeepneys and tricycles drive by regularly; when one passes under a low sipa, its gust pushes it
  if (!isEvent("baha")) nextJeepIn -= dt; // no vehicles while the road is flooded
  if (nextJeepIn <= 0) {
    spawnVehicle();
    nextJeepIn = randomRange(JEEP_MIN_GAP, JEEP_MAX_GAP);
  }
  for (const v of vehicles) {
    v.x += v.vx * pdt;

    // Honk once when it drives into view, and keep the bubble timer running
    if (!v.onScreen && v.x > 30 && v.x < W - 30) {
      v.onScreen = true;
      honk(v);
    }
    if (v.honkT >= 0) {
      v.honkT += dt;
      if (v.honkT > 0.9) v.honkT = -1;
    }

    // Aspin: when it runs under a low sipa, it JUMPS at it and knocks it up and sideways
    if (v.kind === "aspin") {
      if (v.jumpT >= 0) v.jumpT += pdt;
      if (v.jumpT < 0 && Math.abs(v.x - sipa.x) < 45 && sipa.y > GROUND_Y - 200) {
        v.jumpT = 0;
        sipa.vy = -Math.sqrt(2 * currentGravity() * 180);
        sipa.vx += Math.sign(v.vx) * 180;
        honk(v); // "AW AW!"
      }
      continue; // the aspin has no wind gust
    }

    const isTrike = v.kind === "trike";
    const gustRange = isTrike ? 70 : 125;  // the big jeepney's gust reaches wider
    if (!v.gusted && Math.abs(v.x - sipa.x) < gustRange && sipa.y > GROUND_Y - 260) {
      v.gusted = true;
      sipa.vx += Math.sign(v.vx) * (isTrike ? 220 : 320);
      sipa.vy -= 60;
      honk(v); // "BEEP BEEP!" / "POT POT!"
    }
  }
  vehicles = vehicles.filter((v) => v.x > -260 && v.x < W + 260);

  // Tag-init: heat waves make the sipa wobble left and right
  if (isEvent("tagInit")) {
    sipa.vx += Math.sin(getEvent("tagInit").timeLeft * 7) * 90 * pdt;
  }

  // Heavy rain + lightning during Walang Pasok
  if (isEvent("walangPasok")) {
    while (raindrops.length < 170) {
      raindrops.push({ x: randomRange(-60, W + 60), y: randomRange(-H, 0), speed: randomRange(650, 900) });
    }
    if (Math.random() < dt * 0.3) {
      lightning = 0.3;
      setTimeout(playThunder, 250);
    }
  }
  lightning = Math.max(0, lightning - dt);
  for (const d of raindrops) {
    d.y += d.speed * dt;
    d.x += wind.value * 0.6 * dt;
  }
  raindrops = raindrops.filter((d) => d.y < GROUND_Y);
}

// ----- 9. Update: moves everything forward by dt seconds -----
function update(dt) {
  // pdt = "game time": slower with Kape, faster during Exam Week
  const pdt = dt * gameSpeed();

  // Wind: every few seconds, pick a new random wind direction.
  // During Walang Pasok the wind is stronger and changes more often.
  const stormy = isEvent("walangPasok");
  if (score >= WIND_START || stormy) {
    wind.timer -= dt;
    if (wind.timer <= 0) {
      wind.target = randomRange(-1, 1) * (stormy ? 220 : windMax());
      wind.timer = stormy ? randomRange(1.5, 2.5) : randomRange(3, 5);
    }
  } else {
    wind.target = 0;
  }
  wind.value += (wind.target - wind.value) * Math.min(1, dt * 1.5); // smooth change

  // Physics: gravity pulls down, wind pushes sideways, air slows it a little
  sipa.vy += currentGravity() * pdt;
  sipa.vx += wind.value * pdt;
  sipa.vx *= 1 - 0.3 * pdt;
  sipa.x += sipa.vx * pdt;
  sipa.y += sipa.vy * pdt;

  // Slowly change the sipa size (smaller each level, bigger with Reviewer)
  sipa.r += (targetRadius() - sipa.r) * Math.min(1, dt * 3);

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

  // Touching the ground = game over (unless the Uno shield saves you)
  if (sipa.y + sipa.r * 0.75 >= GROUND_Y) {
    if (inEventIntro()) {
      // While the instructions are showing, the sipa gently bounces so you can't lose
      sipa.y = GROUND_Y - sipa.r * 0.75 - 1;
      sipa.vy = -Math.sqrt(2 * currentGravity() * KICK_HEIGHT);
    } else if (hasShield()) {
      effects.uno = 0; // the shield is used up
      sipa.y = GROUND_Y - sipa.r * 0.75 - 1;
      sipa.vy = -Math.sqrt(2 * currentGravity() * KICK_HEIGHT);
      floaters.push({ x: sipa.x, y: sipa.y - 40, text: "Uno saved you!", color: "#ffd166", size: 24, life: 1.2, maxLife: 1.2 });
      playShield();
    } else {
      gameOver();
      return;
    }
  }

  updatePowerUpsAndEvents(dt, pdt);
  updateBalita(dt);

  // The player character follows the sipa
  player.x += (clamp(sipa.x, 50, W - 50) - player.x) * Math.min(1, pdt * 4);
  player.kick = Math.max(0, player.kick - dt);
  kickCooldown -= dt;
  tooHighCooldown -= dt;
}

// Graduation confetti: lots of little colored pieces falling and spinning
function launchConfetti() {
  const colors = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#7b1e2b", "#ffffff"];
  for (let i = 0; i < 140; i++) {
    confetti.push({
      x: randomRange(0, W), y: randomRange(-300, -10),
      vx: randomRange(-40, 40), vy: randomRange(90, 180),
      spin: randomRange(-6, 6), angle: randomRange(0, Math.PI),
      color: colors[i % colors.length],
    });
  }
}

function drawConfetti() {
  for (const c of confetti) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = c.color;
    ctx.fillRect(-4, -2, 8, 4);
    ctx.restore();
  }
}

// Things that keep moving even on the menu / pause screens
function updateScenery(dt) {
  for (const c of confetti) {
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.angle += c.spin * dt;
  }
  confetti = confetti.filter((c) => c.y < H + 20);
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

// ----- 10. Drawing the PUP background -----
function drawCloud(c) {
  // Soft blue-gray bottom first, then white puffs slightly higher = a cloud with shading
  ctx.fillStyle = "rgba(205, 225, 240, 0.95)";
  ellipse(ctx, c.x + 24 * c.s, c.y + 8 * c.s, 46 * c.s, 13 * c.s);
  ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
  circle(ctx, c.x, c.y, 20 * c.s);
  circle(ctx, c.x + 24 * c.s, c.y - 10 * c.s, 25 * c.s);
  circle(ctx, c.x + 50 * c.s, c.y, 18 * c.s);
}

// Sky gradient, a glowing sun and hazy mountains (like Mt. Makiling seen from Calauan)
function paintSkyLayer() {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
  sky.addColorStop(0, "#4aa6e6");
  sky.addColorStop(0.55, "#9ed5f4");
  sky.addColorStop(1, "#e8f7ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HORIZON_Y);

  const glow = ctx.createRadialGradient(330, 92, 8, 330, 92, 120);
  glow.addColorStop(0, "rgba(255, 246, 210, 0.95)");
  glow.addColorStop(0.25, "rgba(255, 238, 180, 0.35)");
  glow.addColorStop(1, "rgba(255, 238, 180, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(200, 0, 200, 230);
  ctx.fillStyle = "#fff6d5";
  circle(ctx, 330, 92, 22);

  ctx.fillStyle = "#a9c6d8"; // far mountain (hazy blue)
  ctx.beginPath();
  ctx.moveTo(0, HORIZON_Y);
  ctx.lineTo(0, 412);
  ctx.quadraticCurveTo(70, 380, 130, 372);
  ctx.quadraticCurveTo(200, 330, 240, 338);
  ctx.quadraticCurveTo(300, 352, 350, 384);
  ctx.quadraticCurveTo(380, 398, W, 400);
  ctx.lineTo(W, HORIZON_Y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8db2a6"; // nearer green hills
  ctx.beginPath();
  ctx.moveTo(0, HORIZON_Y);
  ctx.lineTo(0, 428);
  ctx.quadraticCurveTo(110, 398, 210, 418);
  ctx.quadraticCurveTo(300, 404, W, 422);
  ctx.lineTo(W, HORIZON_Y);
  ctx.closePath();
  ctx.fill();
}

// Little numbers that look random but are the same every time (so the road specks don't jump)
function seededRandom(seed) {
  const v = Math.sin(seed * 127.1) * 43758.5453;
  return v - Math.floor(v);
}

// The campus is drawn SMALL and sitting on a far "horizon line" (HORIZON_Y),
// with grass and a driveway coming toward the viewer. This makes the gate and
// pylon look far away, so the big player in front looks closer, not giant.
const HORIZON_Y = 478;

function drawTrees() {
  // A row of far trees along the horizon
  const blobs = [
    [0, 440, 30], [40, 430, 34], [85, 438, 28], [130, 428, 32], [175, 436, 30],
    [215, 432, 28], [330, 438, 30], [370, 430, 34], [405, 440, 28],
  ];
  ctx.fillStyle = "#6b4a2b"; // trunks peeking out at the bottom
  for (const [x, , r] of blobs) ctx.fillRect(x - 3, HORIZON_Y - 22, 6, 22);
  ctx.fillStyle = "#2f6b33"; // dark shade
  for (const [x, y, r] of blobs) circle(ctx, x, y, r);
  ctx.fillStyle = "#3f8a40"; // middle green
  for (const [x, y, r] of blobs) circle(ctx, x - r * 0.12, y - r * 0.14, r * 0.8);
  ctx.fillStyle = "#5aa64f"; // sunny highlight (sun is on the right)
  for (const [x, y, r] of blobs) circle(ctx, x + r * 0.2, y - r * 0.32, r * 0.42);
}

function drawPylon() {
  // The 3 white pillars with "P U P"
  const pillars = [
    { x: 262, w: 22, top: 334, letter: "P" },
    { x: 284, w: 23, top: 328, letter: "U" },
    { x: 307, w: 22, top: 334, letter: "P" },
  ];

  // Soft shadow and a light gray base platform
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  ellipse(ctx, 296, HORIZON_Y + 2, 48, 5);
  ctx.fillStyle = "#cfcfca";
  ctx.fillRect(256, HORIZON_Y - 6, 80, 6);

  for (const p of pillars) {
    const bottom = HORIZON_Y - 6; // standing on the base platform
    // main face with a gentle light-to-shade gradient
    const face = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
    face.addColorStop(0, "#ffffff");
    face.addColorStop(1, "#e6e5df");
    ctx.fillStyle = face;
    ctx.fillRect(p.x, p.top, p.w, bottom - p.top);
    // shaded right side for a 3D look
    ctx.fillStyle = "#d4d3cc";
    ctx.fillRect(p.x + p.w - 4, p.top, 4, bottom - p.top);
    // thin grooves
    ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
    ctx.lineWidth = 1;
    line(ctx, p.x + p.w * 0.35, p.top + 30, p.x + p.w * 0.35, bottom);
    line(ctx, p.x + p.w * 0.6, p.top + 30, p.x + p.w * 0.6, bottom);
    // letter, with a light edge so it looks carved into the stone
    ctx.font = "bold 17px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(p.letter, p.x + (p.w - 4) / 2 + 0.8, p.top + 22.8);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillText(p.letter, p.x + (p.w - 4) / 2, p.top + 22);
  }
}

function drawCampusGround() {
  // Grass: darker far away, brighter up close, with mowing stripes
  const grass = ctx.createLinearGradient(0, HORIZON_Y, 0, GROUND_Y);
  grass.addColorStop(0, "#6fa851");
  grass.addColorStop(1, "#86c262");
  ctx.fillStyle = grass;
  ctx.fillRect(0, HORIZON_Y, W, GROUND_Y - HORIZON_Y);
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  for (let i = 0; i < 6; i++) {
    const y1 = HORIZON_Y + i * i * 2.2 + i * 2;
    ctx.fillRect(0, y1, W, 2 + i);
  }
  ctx.fillStyle = "#5e9446";
  ctx.fillRect(0, HORIZON_Y, W, 3);
  ctx.fillStyle = "#5f9a45"; // little grass tufts
  for (let i = 0; i < 40; i++) {
    const tx = seededRandom(i) * W;
    const ty = HORIZON_Y + 8 + seededRandom(i + 50) * (GROUND_Y - HORIZON_Y - 12);
    ctx.fillRect(tx, ty, 2, 3);
    ctx.fillRect(tx + 2, ty + 1, 1.5, 2);
  }

  // Driveway that gets wider as it comes closer (perspective), with light curbs
  ctx.fillStyle = "#c9c5bb";
  ctx.beginPath();
  ctx.moveTo(103, HORIZON_Y);
  ctx.lineTo(177, HORIZON_Y);
  ctx.lineTo(276, GROUND_Y);
  ctx.lineTo(14, GROUND_Y);
  ctx.closePath();
  ctx.fill();
  const drive = ctx.createLinearGradient(0, HORIZON_Y, 0, GROUND_Y);
  drive.addColorStop(0, "#8a8a8f");
  drive.addColorStop(1, "#77777c");
  ctx.fillStyle = drive;
  ctx.beginPath();
  ctx.moveTo(106, HORIZON_Y);
  ctx.lineTo(174, HORIZON_Y);
  ctx.lineTo(270, GROUND_Y);
  ctx.lineTo(20, GROUND_Y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)"; // center line
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 8]);
  line(ctx, 140, HORIZON_Y, 145, GROUND_Y);
  ctx.setLineDash([]);
}

// Square gray helipad lying flat on the grass. Because it is far away and flat, the
// square looks like a trapezoid: the far (top) edge is shorter than the near (bottom) edge.
// padPoint(u, v) turns a spot ON the square (u: -1 left to 1 right, v: 0 far to 1 near)
// into a spot on the screen, so the white border and the "H" get the same perspective.
const PAD = { cx: 346, top: 488, bottom: 518, topHalf: 36, bottomHalf: 52 }; // on the grass, right of the driveway
function padPoint(u, v) {
  const half = PAD.topHalf + (PAD.bottomHalf - PAD.topHalf) * v;
  return [PAD.cx + u * half, PAD.top + (PAD.bottom - PAD.top) * v];
}
function padShape(u1, v1, u2, v2) { // fills a rectangle given in square coordinates
  const corners = [padPoint(u1, v1), padPoint(u2, v1), padPoint(u2, v2), padPoint(u1, v2)];
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function drawHelipad() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)"; // soft shadow on the grass
  ellipse(ctx, PAD.cx + 4, PAD.bottom + 4, PAD.bottomHalf + 4, 5);
  ctx.fillStyle = "#6f7277"; // a little thickness under the near edge
  ctx.fillRect(PAD.cx - PAD.bottomHalf, PAD.bottom, PAD.bottomHalf * 2, 4);
  ctx.fillStyle = "#8d9096"; // concrete square
  padShape(-1, 0, 1, 1);

  ctx.fillStyle = "#f4f4f4"; // white border (4 thin strips)
  padShape(-0.9, 0.08, 0.9, 0.13);
  padShape(-0.9, 0.87, 0.9, 0.92);
  padShape(-0.9, 0.08, -0.85, 0.92);
  padShape(0.85, 0.08, 0.9, 0.92);

  padShape(-0.45, 0.25, -0.28, 0.75); // the "H": left leg
  padShape(0.28, 0.25, 0.45, 0.75);   // right leg
  padShape(-0.28, 0.44, 0.28, 0.56);  // middle bar
}

// Arch sign with "POLYTECHNIC UNIVERSITY OF THE PHILIPPINES" curved along the top.
// Each letter is placed on the circle and rotated so the text follows the curve.
function drawArchSign() {
  const cx = 140;
  const cy = 448;  // center of the arch's circle
  const R = 60;    // radius of the arch

  ctx.fillStyle = "rgba(0, 0, 0, 0.15)"; // shadows of the posts
  ellipse(ctx, cx - R, HORIZON_Y + 1, 9, 2.5);
  ellipse(ctx, cx + R, HORIZON_Y + 1, 9, 2.5);
  ctx.fillStyle = "#7b1e2b"; // two maroon posts, with a darker side
  ctx.fillRect(cx - R - 6, cy - 2, 11, HORIZON_Y - cy + 2);
  ctx.fillRect(cx + R - 5, cy - 2, 11, HORIZON_Y - cy + 2);
  ctx.fillStyle = "#5e1621";
  ctx.fillRect(cx - R + 2, cy - 2, 3, HORIZON_Y - cy + 2);
  ctx.fillRect(cx + R + 3, cy - 2, 3, HORIZON_Y - cy + 2);

  ctx.lineCap = "butt";
  ctx.strokeStyle = "#7b1e2b"; // the arch band
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#f4c542"; // thin gold trims
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 6.5, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R - 6.5, Math.PI, Math.PI * 2);
  ctx.stroke();

  // Curved text: measure every letter, then spread them evenly around the top of the arch
  const text = "POLYTECHNIC UNIVERSITY OF THE PHILIPPINES";
  ctx.font = "bold 6px Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const totalAngle = widths.reduce((a, b) => a + b, 0) / R; // arc length / radius = angle
  let angle = -Math.PI / 2 - totalAngle / 2;                 // start so the text is centered
  [...text].forEach((ch, i) => {
    const a = angle + widths[i] / 2 / R;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.rotate(a + Math.PI / 2); // turn the letter to follow the curve
    ctx.fillText(ch, 0, 2);
    ctx.restore();
    angle += widths[i] / R;
  });
}

// A 3-storey campus building beside the arch: cream walls, rows of windows, maroon roof
function drawCampusBuilding() {
  const left = -4;
  const right = 72;
  const top = 396;
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)"; // shadow on the ground
  ctx.fillRect(left, HORIZON_Y, right - left + 8, 4);
  const wall = ctx.createLinearGradient(left, 0, right, 0);
  wall.addColorStop(0, "#f5ecd8");
  wall.addColorStop(1, "#ddd0b4"); // darker on the shady side
  ctx.fillStyle = wall;
  ctx.fillRect(left, top, right - left, HORIZON_Y - top);
  ctx.fillStyle = "#7b1e2b"; // maroon roof + floor lines
  ctx.beginPath();
  ctx.moveTo(left - 4, top + 2);
  ctx.lineTo(left + 10, top - 10);
  ctx.lineTo(right - 10, top - 10);
  ctx.lineTo(right + 4, top + 2);
  ctx.closePath();
  ctx.fill();
  for (let floor = 1; floor < 3; floor++) ctx.fillRect(left, top + floor * 27, right - left, 2);
  for (let floor = 0; floor < 3; floor++) { // windows: 3 floors x 4 windows
    for (let col = 0; col < 4; col++) {
      const wx = left + 6 + col * 17;
      const wy = top + 7 + floor * 27;
      ctx.fillStyle = "#5e1621"; // frame
      ctx.fillRect(wx - 1, wy - 1, 13, 15);
      ctx.fillStyle = "#8fb0c4"; // glass
      ctx.fillRect(wx, wy, 11, 13);
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)"; // sky reflection
      ctx.beginPath();
      ctx.moveTo(wx, wy + 7);
      ctx.lineTo(wx + 7, wy);
      ctx.lineTo(wx + 10, wy);
      ctx.lineTo(wx, wy + 10);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = "#6b4a2b"; // door
  ctx.fillRect(left + 30, HORIZON_Y - 14, 14, 14);
}

// Ice scramble vendor parked on the campus driveway: a motorcycle with a sidecar cart,
// a striped blue-and-yellow canopy, "SPECIAL ICE SCRAMBLE" signs, and the vendor in a
// red cap, sunglasses and a yellow shirt with red sleeves. He rings his little bell sometimes.
function drawIceScramble(time) {
  ctx.save();
  ctx.translate(40, 499); // parked on the grass beside the building, off the driveway
  ctx.scale(0.5, 0.5);    // small, because it is farther away
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const outline = "#1a1a1a";

  ctx.fillStyle = "rgba(0, 0, 0, 0.18)"; // shadow
  ellipse(ctx, 0, 2, 82, 6);

  // --- Canopy: silver posts + striped roof + "ICE SCRAMBLE" sign ---
  ctx.strokeStyle = "#c9ccd1";
  ctx.lineWidth = 3;
  line(ctx, -70, -62, -70, -112);
  line(ctx, 4, -62, 4, -112);
  ctx.save();
  ctx.beginPath(); // roof shape
  ctx.moveTo(-82, -110);
  ctx.lineTo(16, -118);
  ctx.lineTo(18, -110);
  ctx.lineTo(-80, -104);
  ctx.closePath();
  ctx.clip(); // only paint stripes inside the roof
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#2b59c3" : "#f6c945";
    ctx.fillRect(-84 + i * 9, -122, 9, 22);
  }
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-64, -101, 58, 11);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  ctx.strokeRect(-64, -101, 58, 11);
  ctx.fillStyle = "#d62828";
  ctx.font = "bold 7px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ICE SCRAMBLE", -35, -93, 54);

  // --- Things on top of the cart: cups, orange and green boxes, a bucket with a red lid ---
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(-67, -80, 8, 18);
  ctx.fillStyle = "#f08a24";
  ctx.fillRect(-56, -73, 17, 11);
  ctx.fillStyle = "#57c96b";
  ctx.fillRect(-37, -71, 19, 9);
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(-15, -78, 14, 16);
  ctx.fillStyle = "#d62828";
  ctx.fillRect(-16, -80, 16, 3);

  // --- The cart box ---
  ctx.fillStyle = "#eef0f2";
  ctx.fillRect(-72, -62, 80, 40);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-72, -62, 80, 40);
  ctx.fillStyle = "#1d4e89"; // blue trim lines
  ctx.fillRect(-72, -50, 80, 2);
  ctx.fillRect(-72, -38, 80, 2);
  ctx.fillStyle = "#d62828";
  ctx.font = "bold 8px Arial, sans-serif";
  ctx.fillText("SPECIAL ICE SCRAMBLE", -32, -41.5, 76);
  for (const dx of [-52, -32, -12]) { // round decals with a little cup
    ctx.fillStyle = "#2b59c3";
    circle(ctx, dx, -29, 6);
    ctx.fillStyle = "#f6c945";
    circle(ctx, dx, -29, 4);
    ctx.fillStyle = "#e86a92";
    ctx.fillRect(dx - 1.5, -31, 3, 4);
  }

  // --- Motorcycle ---
  ctx.strokeStyle = "#444"; // frame and fork
  ctx.lineWidth = 3;
  line(ctx, 8, -30, 50, -36);
  line(ctx, 52, -60, 62, -14);
  ctx.fillStyle = "#c62828"; // red fuel tank
  roundRect(ctx, 26, -46, 18, 9, 4);
  ctx.fillStyle = "#222"; // seat
  roundRect(ctx, 12, -44, 16, 6, 3);
  ctx.fillStyle = "#e9ecef"; // headlight
  circle(ctx, 58, -50, 4);
  ctx.strokeStyle = "#999"; // handlebar
  ctx.lineWidth = 2.5;
  line(ctx, 48, -60, 56, -63);

  // --- Vendor: jeans, yellow shirt with red sleeves, red cap, sunglasses ---
  ctx.strokeStyle = "#2f4b7c"; // jeans
  ctx.lineWidth = 6;
  line(ctx, 20, -44, 36, -38);
  line(ctx, 36, -38, 38, -22);
  ctx.fillStyle = "#f2d43d"; // yellow shirt
  roundRect(ctx, 12, -74, 18, 30, 5);
  // Every few seconds he lifts his arm to ring his bell, otherwise both hands are on the handlebar
  const ringing = time % 5 < 0.8;
  ctx.strokeStyle = "#d62828"; // red sleeves
  ctx.lineWidth = 5;
  line(ctx, 26, -68, 48, -60);
  if (ringing) {
    const shakeBell = Math.sin(time * 40) * 3;
    line(ctx, 16, -68, 10 + shakeBell, -90);
    ctx.fillStyle = "#e1b84a"; // little gold bell
    ctx.beginPath();
    ctx.arc(10 + shakeBell, -95, 4, Math.PI, 0);
    ctx.lineTo(14 + shakeBell, -91);
    ctx.lineTo(6 + shakeBell, -91);
    ctx.closePath();
    ctx.fill();
  } else {
    line(ctx, 16, -68, 46, -58);
  }
  ctx.fillStyle = "#d9a77c"; // head
  circle(ctx, 22, -82, 7);
  ctx.fillStyle = "#d62828"; // red cap + brim
  ctx.beginPath();
  ctx.arc(22, -84, 7.5, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(22, -85, 12, 2.5);
  ctx.fillStyle = "#111"; // sunglasses
  ctx.fillRect(22, -83, 9, 3);

  // --- Wheels with chrome fenders ---
  for (const [wx, fender] of [[-55, true], [24, false], [62, true]]) {
    if (fender) {
      ctx.strokeStyle = "#c9ccd1";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(wx, -14, 16, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
    ctx.fillStyle = "#222";
    circle(ctx, wx, -14, 13);
    ctx.fillStyle = "#b0b4b8";
    circle(ctx, wx, -14, 5);
  }
  ctx.restore();

  // "Ting ting!" when he rings the bell
  if (time % 5 < 0.8) drawText("ting ting!", 40, 432, 10, "#ffffff");
}

function drawRoad() {
  // Sidewalk with tile lines
  ctx.fillStyle = "#d3cbbb";
  ctx.fillRect(0, GROUND_Y, W, 10);
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  for (let x = 0; x < W; x += 24) ctx.fillRect(x, GROUND_Y, 1.5, 10);
  // Curb
  ctx.fillStyle = "#9c968b";
  ctx.fillRect(0, GROUND_Y + 10, W, 3);
  // Asphalt road: slightly lighter far away, darker up close, with little specks
  const asphalt = ctx.createLinearGradient(0, GROUND_Y + 13, 0, H);
  asphalt.addColorStop(0, "#66666b");
  asphalt.addColorStop(1, "#4f4f54");
  ctx.fillStyle = asphalt;
  ctx.fillRect(0, GROUND_Y + 13, W, H - GROUND_Y - 13);
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  for (let i = 0; i < 70; i++) {
    ctx.fillRect(seededRandom(i + 7) * W, GROUND_Y + 14 + seededRandom(i + 99) * (H - GROUND_Y - 16), 1.5, 1.5);
  }
  // Dashed lane line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 16]);
  line(ctx, 0, GROUND_Y + 52, W, GROUND_Y + 52);
  ctx.setLineDash([]);
}

let bgTime = 0; // current time, for the few moving things in the background

// Draws one layer into its hidden canvas, at the same sharpness as the real game canvas
function paintLayer(layer, paintFn) {
  layer.width = canvas.width;
  layer.height = canvas.height;
  const g = layer.getContext("2d");
  g.setTransform(layer.width / W, 0, 0, layer.height / H, 0, 0);
  g.clearRect(0, 0, W, H);
  drawOn(g, paintFn);
}

function drawBackground() {
  if (backgroundDirty) {
    paintLayer(skyLayer, paintSkyLayer);
    paintLayer(groundLayer, () => {
      drawTrees();
      drawPylon();
      drawCampusBuilding();
      drawArchSign();
      drawCampusGround();
      drawHelipad(); // drawn after the grass so it sits on top of it
      drawRoad();
    });
    backgroundDirty = false;
  }
  ctx.drawImage(skyLayer, 0, 0, W, H);
  for (const c of clouds) drawCloud(c); // clouds move, so they are drawn live
  ctx.drawImage(groundLayer, 0, 0, W, H);
  drawIceScramble(bgTime);              // the vendor rings his bell, so he is drawn live
}

// ----- 11. Drawing the characters (PUP uniform) -----
// type: "boy" or "girl"; (x, gy) is the point between the feet; kick > 0 means kicking
// outfit = "toga" for the graduation gown (anything else = PUP uniform)
function drawCharacter(g, type, x, gy, kick, time, outfit) {
  const kicking = kick > 0;
  const isGirl = type === "girl";

  const skin = "#c68863";
  const white = "#fbfbfb";
  const outline = "#c9c9c9";
  const maroon = "#7b1e2b";
  const brown = "#4a2c22";   // skirt and pants
  const shoe = "#151515";
  const hair = "#1b1410";

  const hw = isGirl ? 13 : 15;          // half the width of the body
  const top = gy - 92;                  // shoulders
  const waist = isGirl ? gy - 52 : gy - 54;
  const headY = top - 18;
  const idSwing = Math.sin(time * 14) * kick * 14; // ID card swings when kicking

  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";

  // Shadow on the ground
  g.fillStyle = "rgba(0, 0, 0, 0.18)";
  ellipse(g, x, gy + 2, 22, 5);

  // Girl's long hair (drawn first so it is behind the body)
  if (isGirl) {
    g.fillStyle = hair;
    roundRect(g, x - 14, headY - 8, 28, top + 18 - (headY - 8), 10);
  }

  // Legs
  if (isGirl) {
    g.strokeStyle = skin;
    g.lineWidth = 7;
    line(g, x - 6, gy - 34, x - 7, gy - 8);
    if (kicking) line(g, x + 6, gy - 34, x + 30, gy - 48);
    else line(g, x + 6, gy - 34, x + 7, gy - 8);
  } else {
    g.strokeStyle = brown;
    g.lineWidth = 10;
    line(g, x - 6, gy - 50, x - 8, gy - 8);
    if (kicking) line(g, x + 6, gy - 50, x + 30, gy - 58);
    else line(g, x + 6, gy - 50, x + 8, gy - 8);
  }

  // Black shoes
  g.fillStyle = shoe;
  ellipse(g, x - 10, gy - 5, 8, 4.5);
  if (kicking) ellipse(g, x + 33, isGirl ? gy - 49 : gy - 59, 8, 4.5, -0.4);
  else ellipse(g, x + 10, gy - 5, 8, 4.5);

  // Brown pants top + belt (boy) or pleated skirt (girl)
  if (isGirl) {
    const sway = kicking ? 5 : 0;
    g.fillStyle = brown;
    g.beginPath();
    g.moveTo(x - 13, waist - 2);
    g.lineTo(x + 13, waist - 2);
    g.lineTo(x + 20 + sway, gy - 30);
    g.lineTo(x - 20 + sway * 0.5, gy - 30);
    g.closePath();
    g.fill();
    g.strokeStyle = "#341d16"; // pleats
    g.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      line(g, x + i * 5, waist, x + i * 8 + sway * 0.7, gy - 31);
    }
  } else {
    g.fillStyle = brown;
    roundRect(g, x - hw + 1, waist - 2, hw * 2 - 2, 12, 3);
    g.fillStyle = "#222";
    g.fillRect(x - hw + 1, waist - 2, hw * 2 - 2, 3);
  }

  // Arms (out for balance when kicking)
  g.strokeStyle = skin;
  g.lineWidth = 6;
  line(g, x - hw - 2, top + 12, x - hw - 9, top + (kicking ? 20 : 34));
  line(g, x + hw + 2, top + 12, x + hw + 11, top + (kicking ? 6 : 34));

  // Short white sleeves
  g.fillStyle = white;
  g.strokeStyle = outline;
  g.lineWidth = 1.2;
  roundRect(g, x - hw - 6, top + 2, 10, 13, 3);
  g.stroke();
  roundRect(g, x + hw - 4, top + 2, 10, 13, 3);
  g.stroke();

  // White polo / blouse, with a soft shadow on one side
  roundRect(g, x - hw, top, hw * 2, waist - top, 6);
  g.stroke();
  g.fillStyle = "rgba(0, 0, 0, 0.06)";
  g.fillRect(x + hw - 6, top + 3, 5, waist - top - 5);

  // Collar (boy)
  if (!isGirl) {
    g.strokeStyle = outline;
    g.lineWidth = 1.5;
    line(g, x - 7, top + 1, x, top + 8);
    line(g, x + 7, top + 1, x, top + 8);
  }

  // Maroon lanyard + ID card
  const idX = x + idSwing * 0.5;
  g.strokeStyle = maroon;
  g.lineWidth = 2.5;
  line(g, x - 6, top + 1, idX, top + 22);
  line(g, x + 6, top + 1, idX, top + 22);
  g.fillStyle = white;
  roundRect(g, idX - 5, top + 21, 10, 13, 2);
  g.strokeStyle = outline;
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = maroon;
  g.fillRect(idX - 5, top + 21, 10, 4);

  // PUP logo patch on the left chest
  g.fillStyle = "#b3202e";
  circle(g, x + hw - 7, top + 11, 3.8);
  g.fillStyle = "#f4c542";
  circle(g, x + hw - 7, top + 11, 1.5);

  // Ribbon bow (girl)
  if (isGirl) {
    g.fillStyle = "#4a0d16";
    g.beginPath();
    g.moveTo(x, top + 3);
    g.lineTo(x - 8, top - 1);
    g.lineTo(x - 8, top + 7);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(x, top + 3);
    g.lineTo(x + 8, top - 1);
    g.lineTo(x + 8, top + 7);
    g.closePath();
    g.fill();
    circle(g, x, top + 3, 2.2);
    g.strokeStyle = "#4a0d16";
    g.lineWidth = 2;
    line(g, x - 1, top + 4, x - 4, top + 15);
    line(g, x + 1, top + 4, x + 4, top + 15);
  }

  // Graduation toga: black gown with wide sleeves and a maroon-and-gold stole (PUP colors)
  if (outfit === "toga") {
    g.fillStyle = "#1b1b1f";
    g.beginPath();
    g.moveTo(x - hw - 3, top + 1);
    g.lineTo(x + hw + 3, top + 1);
    g.lineTo(x + hw + 9, gy - 28);
    g.lineTo(x - hw - 9, gy - 28);
    g.closePath();
    g.fill();
    roundRect(g, x - hw - 10, top + 2, 12, kicking ? 18 : 28, 4); // wide sleeves
    roundRect(g, x + hw - 2, top + 2, 12, kicking ? 14 : 28, 4);
    g.fillStyle = "#7b1e2b"; // stole
    g.fillRect(x - 8, top + 2, 5, 40);
    g.fillRect(x + 3, top + 2, 5, 40);
    g.fillStyle = "#f4c542";
    g.fillRect(x - 8, top + 40, 5, 3);
    g.fillRect(x + 3, top + 40, 5, 3);
  }

  // Neck and head
  g.fillStyle = skin;
  g.fillRect(x - 4, top - 8, 8, 9);
  circle(g, x, headY, 12);

  // Hair on top
  g.fillStyle = hair;
  if (isGirl) {
    ellipse(g, x, headY - 7, 13, 7);
    ellipse(g, x - 6, headY - 3, 7, 5, 0.5); // side bangs
  } else {
    ellipse(g, x, headY - 8, 12.5, 5.5);
    g.beginPath();
    g.arc(x, headY - 1, 12.5, Math.PI * 1.05, Math.PI * 1.95);
    g.fill();
  }

  // Graduation cap (mortarboard) with a gold tassel
  if (outfit === "toga") {
    g.fillStyle = "#1b1b1f";
    g.fillRect(x - 10, headY - 13, 20, 6);  // the part that sits on the head
    g.beginPath();                            // the flat square board on top
    g.moveTo(x - 18, headY - 13);
    g.lineTo(x, headY - 19);
    g.lineTo(x + 18, headY - 13);
    g.lineTo(x, headY - 7);
    g.closePath();
    g.fill();
    g.strokeStyle = "#f4c542";
    g.lineWidth = 1.5;
    const sway = Math.sin(time * 4) * 2;
    line(g, x, headY - 13, x + 12, headY - 11);
    line(g, x + 12, headY - 11, x + 12 + sway, headY - 1);
  }

  // Shine on the hair
  g.strokeStyle = "rgba(255, 255, 255, 0.25)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(x + 2, headY - 3, 7, Math.PI * 1.25, Math.PI * 1.5);
  g.stroke();

  // Face: eyes with a tiny white sparkle, rosy cheeks, smile
  g.fillStyle = "#1b1410";
  circle(g, x - 4, headY + 1, 1.6);
  circle(g, x + 4, headY + 1, 1.6);
  g.fillStyle = "#ffffff";
  circle(g, x - 3.5, headY + 0.4, 0.5);
  circle(g, x + 4.5, headY + 0.4, 0.5);
  g.fillStyle = "rgba(235, 110, 110, 0.35)";
  circle(g, x - 7, headY + 4, 2.2);
  circle(g, x + 7, headY + 4, 2.2);
  g.strokeStyle = "#7a3b2a";
  g.lineWidth = 1.3;
  g.beginPath();
  g.arc(x, headY + 4, 3.5, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();

  g.restore();
}

// ----- 12. Drawing the sipa, HUD and floating texts -----
function drawSipa(time) {
  const { x, y, r } = sipa;

  // Shadow on the ground: smaller and lighter when the sipa is high up
  const height = GROUND_Y - y;
  const shadow = Math.max(0.3, 1 - height / 600);
  ctx.fillStyle = `rgba(0, 0, 0, ${0.25 * shadow})`;
  ellipse(ctx, x, GROUND_Y + 4, r * 1.2 * shadow, r * 0.35 * shadow);

  // Colorful plastic strips trail behind the direction it is moving
  const tx = -sipa.vx;
  const ty = -sipa.vy - 80;
  const baseAngle = Math.atan2(ty, tx);
  const colors = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#f78c6b", "#9b5de5", "#ef476f"];

  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(3, r * 0.22);
  colors.forEach((color, i) => {
    const spread = (i - (colors.length - 1) / 2) * 0.17;
    const wiggle = Math.sin(time * 12 + i) * 0.05;
    const a = baseAngle + spread + wiggle;
    ctx.strokeStyle = color;
    line(ctx, x, y, x + Math.cos(a) * r * 2.1, y + Math.sin(a) * r * 2.1);
  });

  // Soft glow when the sipa is low enough to kick
  if (state === STATE.PLAYING && canKickNow()) {
    ctx.fillStyle = "rgba(255, 240, 150, 0.45)";
    circle(ctx, x, y, r * 1.25);
  }

  // Metal washer (the heavy base of the sipa), shiny like real metal
  const metal = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 0.8);
  metal.addColorStop(0, "#e7edf2");
  metal.addColorStop(0.6, "#9aa5b1");
  metal.addColorStop(1, "#6e7984");
  ctx.fillStyle = metal;
  circle(ctx, x, y, r * 0.75);
  ctx.strokeStyle = "#5c6670";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#d8e0e6";
  circle(ctx, x, y, r * 0.28);
}

function drawText(text, x, y, size, color, align = "center") {
  ctx.font = `bold ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size / 8);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawHUD() {
  drawText(String(score), W / 2, 92, 64, "#ffffff");
  drawText(`Best ${best}`, W / 2, 120, 16, "#ffffff");

  // Wind indicator
  if (Math.abs(wind.value) > 5) {
    const strength = wind.value / 160; // -1 to 1
    const centerX = 92; // arrow sits to the right of the "Wind" label
    const cy = 28;
    const length = 10 + Math.min(1, Math.abs(strength)) * 26;
    const dir = Math.sign(strength);
    const startX = centerX - (length / 2) * dir;
    const endX = centerX + (length / 2) * dir;
    drawText("Wind", 16, 34, 13, "#ffffff", "left");
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    line(ctx, startX, cy, endX, cy);
    line(ctx, endX, cy, endX - 8 * dir, cy - 6);
    line(ctx, endX, cy, endX - 8 * dir, cy + 6);
  }

  // Active power-up effects (left side)
  let badgeY = 66;
  const badge = (text, color) => {
    drawPill(text, 16, badgeY, 13, color, "left");
    badgeY += 24;
  };
  if (effects.kape > 0) badge(`☕ Kape ${Math.ceil(effects.kape)}s`, "#f1d1b5");
  if (effects.allowance > 0) badge(`💰 x2 points ${Math.ceil(effects.allowance)}s`, "#9ef0b8");
  if (effects.reviewer > 0) badge(`📚 Big sipa ${Math.ceil(effects.reviewer)}s`, "#a9d4ff");
  if (hasShield()) badge(`1.0 Uno shield ${Math.ceil(effects.uno)}s`, "#ffd166");

  // Current random event (under the score)
  activeEvents.forEach((ev, i) => {
    const info = EVENTS[ev.type];
    const waitText = EVENTS[ev.type].introSeconds ? "Get ready..." : IS_TOUCH_DEVICE ? "Tap to start" : "Press any key";
    const timeText = ev.waiting || inEventIntro() ? waitText : `${Math.ceil(ev.timeLeft)}s`;
    drawPill(`${info.title} ${timeText}`, W / 2, 148 + i * 23, 13, info.color, "center");
  });

  // Hint at the very start (hidden while event instructions are showing)
  if (score === 0 && !inEventIntro()) {
    drawText(canKickNow() ? "Tap anywhere!" : "Wait for the glow...", W / 2, 200, 20, "#ffd166");
  }
}

// Floating texts pop in (grow quickly from small) and then fade away
function drawFloaters() {
  for (const f of floaters) {
    const age = f.maxLife - f.life;
    const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.5 : age < 0.2 ? 1.1 - ((age - 0.12) / 0.08) * 0.1 : 1;
    ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(pop, pop);
    drawText(f.text, 0, 0, f.size, f.color);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// A label inside a rounded dark "pill" (for timers and event names)
function drawPill(text, x, y, size, color, align = "left") {
  ctx.font = `bold ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
  const w = ctx.measureText(text).width + 14;
  const left = align === "center" ? x - w / 2 : x - 7;
  ctx.fillStyle = "rgba(10, 20, 40, 0.45)";
  roundRect(ctx, left, y - size - 1, w, size + 9, (size + 9) / 2);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function drawPowerUps(time) {
  for (const item of powerUps) drawPowerUpItem(item, time);
}

// Draws one power-up bubble (used in the game and in the Power-ups guide)
function drawPowerUpItem(item, time) {
  {
    const info = POWERUPS[item.type];
    const pulse = 1 + Math.sin(time * 6) * 0.08;

    ctx.fillStyle = "rgba(255, 209, 102, 0.35)"; // glow
    circle(ctx, item.x, item.y, item.r * 1.45 * pulse);
    ctx.fillStyle = info.color;
    circle(ctx, item.x, item.y, item.r);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (item.type === "uno") {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 15px Georgia, serif";
    } else {
      ctx.font = `${item.r}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    }
    ctx.fillText(info.icon, item.x, item.y + 1);
    ctx.textBaseline = "alphabetic";

    drawText(info.label, item.x, item.y + item.r + 15, 12, "#ffffff");
  }
}

function drawObstacles(time) {
  for (const o of obstacles) drawObstacle(o, time);
}

// Draws one paper plane, handout or maya bird
function drawObstacle(o, time) {
  {
    const dir = Math.sign(o.vx); // 1 = flying right, -1 = flying left
    ctx.save();
    ctx.translate(o.x, o.y);

    if (o.kind === "plane") {
      // Paper plane
      ctx.scale(dir, 1);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#9aa4ad";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-14, -9);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-14, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      line(ctx, 16, 0, -8, 0);
    } else if (o.kind === "paper") {
      // Spinning handout with lines of text
      ctx.rotate(o.age * o.spin);
      ctx.fillStyle = "#fffdf5";
      ctx.fillRect(-10, -13, 20, 26);
      ctx.strokeStyle = "#b8b8b8";
      ctx.lineWidth = 1;
      ctx.strokeRect(-10, -13, 20, 26);
      ctx.strokeStyle = "#9bb3d1";
      for (let ly = -7; ly <= 8; ly += 5) line(ctx, -6, ly, 6, ly);
    } else {
      // Maya bird (Eurasian tree sparrow): brown cap, white cheeks, black cheek spot and bib
      ctx.scale(dir, 1);
      const flap = Math.sin(time * 22 + o.age * 7);
      ctx.fillStyle = "#5a3d2b"; // tail
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(-16, -3);
      ctx.lineTo(-16, 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#a57c55"; // brown body
      ellipse(ctx, 0, 1, 10, 7);
      ctx.fillStyle = "#ddd0bb"; // pale belly
      ellipse(ctx, 2, 4, 7, 3.5);
      ctx.fillStyle = "#f2ede4"; // white cheeks
      circle(ctx, 8, -4, 5.5);
      ctx.fillStyle = "#8b4a2b"; // chestnut cap
      ctx.beginPath();
      ctx.arc(8, -4, 5.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222"; // black cheek spot, bib and eye
      circle(ctx, 8.5, -2.5, 1.4);
      ellipse(ctx, 11.5, 1, 2.2, 2);
      circle(ctx, 10.5, -5, 1);
      ctx.fillStyle = "#3a3a3a"; // short thick beak
      ctx.beginPath();
      ctx.moveTo(13, -4.5);
      ctx.lineTo(17, -3);
      ctx.lineTo(13, -1.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7a5536"; // flapping wing
      ctx.beginPath();
      ctx.moveTo(-5, -1);
      ctx.lineTo(5, -1);
      ctx.lineTo(-1, -1 - 12 * flap);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#e8dccb"; // white wing bar
      ctx.lineWidth = 1;
      line(ctx, -2, -1 - 4 * flap, 2, -1 - 4 * flap);
    }
    ctx.restore();
  }
}

// Tints drawn on the BACKGROUND only (behind the player and sipa, so they stay visible)
function drawSceneTints(time) {
  if (isEvent("walangPasok")) {
    ctx.fillStyle = "rgba(15, 22, 40, 0.6)"; // very dark stormy sky
    ctx.fillRect(0, 0, W, H);
  }
  if (isEvent("tagInit")) {
    // Big hot sun + bright washed-out sky
    ctx.fillStyle = "rgba(255, 200, 80, 0.35)";
    circle(ctx, 330, 90, 70 + Math.sin(time * 3) * 4);
    ctx.fillStyle = "#ffd166";
    circle(ctx, 330, 90, 42);
    ctx.fillStyle = "rgba(255, 236, 190, 0.2)"; // light warm tint
    ctx.fillRect(0, 0, W, H);
  }
}

// Effects drawn ON TOP of everything
function drawScreenEffects(time) {
  if (isEvent("walangPasok")) {
    ctx.fillStyle = "rgba(15, 22, 40, 0.18)";
    ctx.fillRect(0, 0, W, H);
  }
  if (raindrops.length) {
    ctx.strokeStyle = "rgba(190, 215, 255, 0.75)";
    ctx.lineWidth = 2;
    for (const d of raindrops) line(ctx, d.x, d.y, d.x + wind.value * 0.05, d.y + 22);
  }
  if (lightning > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${lightning * 2.2})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (isEvent("tagInit")) {
    // Heat waves rising from the ground
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const baseX = 30 + i * 68;
      ctx.beginPath();
      for (let y = GROUND_Y; y > GROUND_Y - 160; y -= 8) {
        const wx = baseX + Math.sin(y * 0.08 + time * 6 + i) * 6;
        if (y === GROUND_Y) ctx.moveTo(wx, y);
        else ctx.lineTo(wx, y);
      }
      ctx.stroke();
    }
  }
  if (isEvent("examWeek")) {
    ctx.strokeStyle = `rgba(255, 70, 70, ${0.45 + Math.sin(time * 8) * 0.2})`;
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, W, H);
  }
  if (effects.kape > 0) {
    ctx.fillStyle = "rgba(111, 78, 55, 0.12)";
    ctx.fillRect(0, 0, W, H);
  }
}

// Writes text that stays readable even when the vehicle is flipped to drive left
function vehicleText(text, x, y, maxWidth, dir) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1); // undo the flip just for the text
  ctx.fillText(text, 0, 0, maxWidth);
  ctx.restore();
}

// Yellow swirl decorations painted on the jeepney's side
function drawSwirls(x1, x2, y, size) {
  ctx.strokeStyle = "#f6c945";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let x = x1; x <= x2; x += 2) {
    const wy = y + Math.sin((x - x1) * 0.25) * size * 0.5;
    if (x === x1) ctx.moveTo(x, wy);
    else ctx.lineTo(x, wy);
  }
  ctx.stroke();
  for (let x = x1 + 6; x < x2 - 4; x += 14) {
    ctx.beginPath();
    ctx.arc(x, y - size * 0.3, size * 0.45, 0, Math.PI * 1.5); // little curls
    ctx.stroke();
  }
}

// A big colorful jeepney (side view), based on the classic Filipino jeepney:
// red body with yellow swirls, cream front visor, yellow hood, chrome bull bar,
// yellow rims with blue hubs. It always faces the way it drives.
function drawJeepney(j) {
  const dir = Math.sign(j.vx);
  ctx.save();
  ctx.translate(j.x, H - 4);  // bottom of the wheels sits near the bottom of the road
  ctx.scale(dir * JEEP_SCALE, JEEP_SCALE); // flip to face where it drives, and make it bigger
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const outline = "#1a1a1a";

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ellipse(ctx, 0, 2, 105, 7);

  // Roof posts (yellow) and side rail (silver) - the sides are open like a real jeepney
  ctx.strokeStyle = "#e8b23a";
  ctx.lineWidth = 3;
  for (let x = -88; x <= 28; x += 23) line(ctx, x, -60, x, -92);
  ctx.strokeStyle = "#c9ccd1";
  ctx.lineWidth = 2;
  line(ctx, -92, -70, 32, -70);
  ctx.fillStyle = "#e9b949"; // yellow seats seen through the open side
  ctx.fillRect(-84, -66, 110, 6);

  // Red canopy roof + cream front visor with the route
  ctx.fillStyle = "#e0262b";
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-100, -92);
  ctx.quadraticCurveTo(-100, -100, -90, -100);
  ctx.lineTo(42, -100);
  ctx.lineTo(42, -92);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f8dca8";
  ctx.beginPath();
  ctx.moveTo(40, -104);
  ctx.lineTo(76, -102);
  ctx.lineTo(78, -86);
  ctx.lineTo(40, -88);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#7b1e2b";
  ctx.font = "bold 9px Arial, sans-serif";
  ctx.textAlign = "center";
  vehicleText("CALAUAN", 59, -92, 32, dir); // 32 = max width, keeps it inside the visor

  // Front cab pillar with light green windshield glass and a side mirror
  ctx.fillStyle = "#e0262b";
  ctx.fillRect(40, -88, 30, 30);
  ctx.strokeRect(40, -88, 30, 30);
  ctx.fillStyle = "#e3f0b8";
  ctx.fillRect(46, -84, 20, 18);
  ctx.strokeRect(46, -84, 20, 18);
  ctx.strokeStyle = "#c9ccd1";
  ctx.lineWidth = 2;
  line(ctx, 70, -80, 78, -86);
  ctx.fillStyle = "#222";
  ctx.fillRect(76, -94, 6, 12);

  // Red main body
  ctx.fillStyle = "#e0262b";
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-100, -60);
  ctx.lineTo(40, -60);
  ctx.lineTo(40, -20);
  ctx.lineTo(-96, -20);
  ctx.quadraticCurveTo(-102, -20, -102, -28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Blue stripe with little dividers + yellow swirls
  ctx.fillStyle = "#38b6e8";
  ctx.fillRect(-100, -41, 140, 4);
  ctx.fillStyle = "#1a1a1a";
  for (let x = -92; x < 36; x += 12) ctx.fillRect(x, -41, 2, 4);
  drawSwirls(-94, 34, -51, 7);
  drawSwirls(-94, 34, -29, 6);

  // Yellow hood + red front fender
  ctx.fillStyle = "#f2b33d";
  ctx.beginPath();
  ctx.moveTo(40, -60);
  ctx.quadraticCurveTo(64, -66, 92, -60);
  ctx.lineTo(92, -46);
  ctx.lineTo(40, -46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e0262b";
  ctx.beginPath();
  ctx.moveTo(40, -46);
  ctx.lineTo(96, -46);
  ctx.lineTo(98, -20);
  ctx.lineTo(40, -20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  drawSwirls(46, 90, -36, 6);

  // Grille edge (gold frame) + square headlight
  ctx.fillStyle = "#c9a227";
  ctx.fillRect(94, -64, 6, 44);
  ctx.strokeRect(94, -64, 6, 44);
  ctx.fillStyle = "#e9ecef";
  ctx.fillRect(90, -56, 9, 8);
  ctx.strokeRect(90, -56, 9, 8);

  // Chrome bull-bar bumper
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(92, -26);
  ctx.lineTo(110, -26);
  ctx.quadraticCurveTo(116, -26, 116, -19);
  ctx.quadraticCurveTo(116, -12, 110, -12);
  ctx.lineTo(92, -12);
  ctx.stroke();
  ctx.strokeStyle = "#eef0f2";
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Running board (step) + black mud flap
  ctx.fillStyle = "#38b6e8";
  ctx.fillRect(-46, -20, 76, 4);
  ctx.fillStyle = "#9ea3a8";
  ctx.fillRect(-46, -16, 76, 3);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-90, -20, 6, 14);

  // Wheels: dark tires, yellow rims, blue hubs with spokes
  for (const wx of [-64, 62]) {
    ctx.fillStyle = "#e0262b"; // red fender arch
    ctx.beginPath();
    ctx.arc(wx, -18, 19, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#2b2b2b";
    circle(ctx, wx, -15, 15);
    ctx.fillStyle = "#f2b33d";
    circle(ctx, wx, -15, 9.5);
    ctx.fillStyle = "#38b6e8";
    circle(ctx, wx, -15, 7);
    ctx.strokeStyle = "#1d6fa0";
    ctx.lineWidth = 1.2;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
      line(ctx, wx, -15, wx + Math.cos(a + j.x * 0.05) * 6.5, -15 + Math.sin(a + j.x * 0.05) * 6.5);
    }
    ctx.fillStyle = "#1d6fa0";
    circle(ctx, wx, -15, 2);
  }
  ctx.restore();
}

// A Filipino tricycle (side view): a motorcycle with a white covered sidecar
// that has red, orange and green stripes, a yellow plate and a "GOD BLESS" sign.
function drawTricycle(v) {
  const dir = Math.sign(v.vx);
  ctx.save();
  ctx.translate(v.x, H - 4);
  ctx.scale(dir * TRIKE_SCALE, TRIKE_SCALE);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const outline = "#1a1a1a";
  const spin = v.x * 0.06; // makes the wheel spokes turn

  ctx.fillStyle = "rgba(0, 0, 0, 0.25)"; // shadow
  ellipse(ctx, 0, 2, 62, 6);

  // --- Motorcycle in front (driver side) ---
  ctx.strokeStyle = "#555"; // frame
  ctx.lineWidth = 3;
  line(ctx, 10, -22, 44, -28);
  line(ctx, 44, -50, 50, -14); // front fork
  ctx.fillStyle = "#c62828"; // red fuel tank
  roundRect(ctx, 18, -36, 22, 10, 4);
  ctx.fillStyle = "#222"; // seat
  roundRect(ctx, 4, -36, 16, 6, 3);
  ctx.strokeStyle = "#999"; // handlebar
  ctx.lineWidth = 2.5;
  line(ctx, 40, -52, 50, -54);
  ctx.fillStyle = "#e9ecef"; // headlight
  circle(ctx, 50, -44, 4);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Driver in a red shirt and helmet
  ctx.strokeStyle = "#2b2d42"; // legs
  ctx.lineWidth = 5;
  line(ctx, 10, -36, 22, -28);
  line(ctx, 22, -28, 24, -16);
  ctx.fillStyle = "#d62828"; // shirt
  roundRect(ctx, 2, -62, 14, 26, 5);
  ctx.strokeStyle = "#c68863"; // arm to handlebar
  ctx.lineWidth = 4;
  line(ctx, 12, -56, 40, -52);
  ctx.fillStyle = "#c68863"; // head
  circle(ctx, 9, -68, 6);
  ctx.fillStyle = "#1d4e89"; // helmet
  ctx.beginPath();
  ctx.arc(9, -70, 6.5, Math.PI, Math.PI * 2);
  ctx.fill();

  // Front wheel
  ctx.fillStyle = "#222";
  circle(ctx, 50, -12, 11);
  ctx.fillStyle = "#b0b4b8";
  circle(ctx, 50, -12, 6);
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 1;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    line(ctx, 50, -12, 50 + Math.cos(a + spin) * 6, -12 + Math.sin(a + spin) * 6);
  }

  // --- White sidecar cab (closest to us, so it is drawn on top) ---
  ctx.fillStyle = "#f4f4f2";
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-58, -14);
  ctx.lineTo(-58, -62);
  ctx.quadraticCurveTo(-58, -72, -46, -72);
  ctx.lineTo(10, -72);
  ctx.quadraticCurveTo(18, -72, 20, -62);
  ctx.lineTo(24, -14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Yellow roof trim + roof rack
  ctx.fillStyle = "#f6c945";
  ctx.fillRect(-58, -76, 74, 5);
  ctx.strokeRect(-58, -76, 74, 5);
  ctx.strokeStyle = "#b9bdc2";
  ctx.lineWidth = 2;
  line(ctx, -54, -80, 10, -80);
  line(ctx, -50, -80, -50, -76);
  line(ctx, 6, -80, 6, -76);

  // Windows (light blue glass)
  ctx.fillStyle = "#cfe6f2";
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  roundRect(ctx, -52, -66, 26, 20, 4);
  ctx.stroke();
  roundRect(ctx, -20, -66, 30, 20, 4);
  ctx.stroke();

  // Colorful stripes: red, orange, green
  ctx.fillStyle = "#e63946";
  ctx.fillRect(-58, -42, 81, 4);
  ctx.fillStyle = "#f4a261";
  ctx.fillRect(-58, -38, 81, 3);
  ctx.fillStyle = "#2a9d8f";
  ctx.fillRect(-58, -35, 81, 3);

  // Yellow plate number + "GOD BLESS" sign at the back
  ctx.fillStyle = "#f6c945";
  ctx.fillRect(-30, -31, 26, 9);
  ctx.strokeRect(-30, -31, 26, 9);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 7px Arial, sans-serif";
  ctx.textAlign = "center";
  vehicleText("1226", -17, -24, 24, dir);
  ctx.fillStyle = "#fff6d6";
  ctx.fillRect(-56, -22, 22, 8);
  ctx.strokeRect(-56, -22, 22, 8);
  ctx.fillStyle = "#c1121f";
  ctx.font = "bold 5px Georgia, serif";
  vehicleText("GOD BLESS", -45, -16, 20, dir);

  // Sidecar wheel
  ctx.fillStyle = "#222";
  circle(ctx, -36, -11, 10);
  ctx.fillStyle = "#b0b4b8";
  circle(ctx, -36, -11, 5);
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 1;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    line(ctx, -36, -11, -36 + Math.cos(a + spin) * 5, -11 + Math.sin(a + spin) * 5);
  }
  ctx.restore();
}

// Red comic-book honk bubble ("BEEP BEEP!", "POT POT!", "AW AW!") beside a vehicle.
// It pops in big, wobbles, and sits in front of the vehicle in the direction it drives.
const HONK_TEXT = { jeep: "BEEP BEEP!", trike: "POT POT!", aspin: "AW AW!" };
const HONK_SPOT = { jeep: [150, H - 150], trike: [90, H - 125], aspin: [55, GROUND_Y - 10] }; // [ahead, y]

function drawHonk(v, time) {
  if (v.honkT < 0) return;
  const dir = Math.sign(v.vx);
  const [ahead, y] = HONK_SPOT[v.kind];
  const x = clamp(v.x + dir * ahead, 60, W - 60);
  const pop = 0.6 + Math.min(1, v.honkT / 0.12) * 0.5;     // pops in
  const fade = clamp((0.9 - v.honkT) / 0.2, 0, 1);         // fades out at the end
  const text = HONK_TEXT[v.kind];

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y);
  ctx.rotate(-0.12 * dir + Math.sin(v.honkT * 30) * 0.05);  // tilted + wobbling
  ctx.scale(pop, pop);

  // Spiky yellow "BAM!" burst behind the text
  ctx.font = 'bold 18px "Comic Sans MS", "Chalkboard SE", "Comic Neue", "Marker Felt", cursive';
  const half = ctx.measureText(text).width / 2 + 14;
  ctx.fillStyle = "#ffe066";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const spikes = 14;
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.72; // alternate long and short points
    const px = Math.cos(a) * half * r;
    const py = Math.sin(a) * 24 * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Red comic text with a thick black outline
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#1a1a1a";
  ctx.strokeText(text, 0, 1);
  ctx.fillStyle = "#e63946";
  ctx.fillText(text, 0, 1);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// Aspin (Filipino stray dog): tan, short fur, perky ears and a curled tail.
// It runs along the road and jumps when it reaches a low sipa.
function drawAspin(v, time) {
  const dir = Math.sign(v.vx);
  const jump = v.jumpT >= 0 && v.jumpT < 0.5 ? Math.sin((v.jumpT / 0.5) * Math.PI) * 60 : 0;
  const run = Math.sin(time * 20 + v.x * 0.05); // legs swing back and forth
  ctx.save();
  ctx.translate(v.x, GROUND_Y + 40 - jump);
  ctx.scale(dir * 1.4, 1.4);
  ctx.lineCap = "round";

  ctx.fillStyle = "rgba(0, 0, 0, 0.2)"; // shadow stays on the ground
  ellipse(ctx, 0, jump / 1.4 + 1, 20, 3);

  ctx.strokeStyle = "#8a5a2b"; // legs
  ctx.lineWidth = 3.5;
  line(ctx, -12, -12, -12 - run * 5, 0);
  line(ctx, -7, -12, -7 + run * 5, 0);
  line(ctx, 9, -12, 9 + run * 5, 0);
  line(ctx, 14, -12, 14 - run * 5, 0);

  ctx.strokeStyle = "#b57d45"; // curled tail
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-21, -22, 5, Math.PI * 0.3, Math.PI * 1.9);
  ctx.stroke();

  ctx.fillStyle = "#c8955a"; // body
  ellipse(ctx, 0, -17, 20, 8.5);
  ctx.fillStyle = "#e3c08d"; // light chest
  ellipse(ctx, 12, -14, 7, 5);

  ctx.fillStyle = "#c8955a"; // head
  circle(ctx, 20, -27, 7.5);
  ctx.fillStyle = "#e3c08d"; // snout
  ellipse(ctx, 27, -24.5, 5.5, 3.5);
  ctx.fillStyle = "#8a5a2b"; // perky ear
  ctx.beginPath();
  ctx.moveTo(16, -32);
  ctx.lineTo(19, -41);
  ctx.lineTo(22, -32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#111"; // nose and eye
  circle(ctx, 32, -25.5, 1.6);
  circle(ctx, 22.5, -29, 1.2);
  if (jump > 0) { // open mouth while jumping
    ctx.fillStyle = "#c1121f";
    ellipse(ctx, 28, -21.5, 2.5, 1.5);
  }
  ctx.restore();
}

// Kuya Balita himself (upper body, feet below the screen), facing right.
// mouth = 0 (closed) to 1 (wide open). The face changes with the "face" setting.
function drawReporter(face, time, mouth) {
  const skin = "#c68863";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Navy blazer, white collar and red tie
  ctx.fillStyle = "#1d3557";
  roundRect(ctx, -24, -40, 48, 46, 10);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.moveTo(-8, -40); ctx.lineTo(8, -40); ctx.lineTo(0, -26); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#d62828";
  ctx.beginPath(); ctx.moveTo(-2.5, -38); ctx.lineTo(2.5, -38); ctx.lineTo(0, -20); ctx.closePath(); ctx.fill();

  // Neck, head, slick pompadour hair
  ctx.fillStyle = skin;
  ctx.fillRect(-5, -47, 10, 9);
  circle(ctx, 0, -61, 15);
  ctx.fillStyle = "#151515";
  ellipse(ctx, 0, -73, 15, 6);
  ellipse(ctx, -5, -77, 10, 6, -0.3);

  // Eyebrows: shoot up high when shocked or scared, droop when hot
  ctx.strokeStyle = "#151515";
  ctx.lineWidth = 2.2;
  if (face === "hot") {
    line(ctx, -10, -67, -3, -66);
    line(ctx, 3, -66, 10, -67);
  } else if (face === "panic" || face === "scared") {
    line(ctx, -11, -67, -3, -71); // worried: inner ends go up
    line(ctx, 3, -71, 11, -67);
  } else {
    ctx.beginPath(); ctx.arc(-6, -66, 5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(6, -66, 5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }

  // Eyes
  if (face === "hot") {
    ctx.lineWidth = 2; // tired half-closed eyes
    line(ctx, -9, -61, -3, -61);
    line(ctx, 3, -61, 9, -61);
  } else {
    const jitter = face === "panic" ? Math.sin(time * 50) * 1 : 0;   // shaking pupils
    const look = face === "scared" ? 2 : 0;                           // eyes looking sideways
    ctx.fillStyle = "#ffffff";
    circle(ctx, -6, -61, 5);
    circle(ctx, 6, -61, 5);
    ctx.strokeStyle = "#151515";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(-6, -61, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(6, -61, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#151515";
    circle(ctx, -6 + look + jitter, -61, 1.6);
    circle(ctx, 6 + look + jitter, -61, 1.6);
  }

  // Mouth: a huge screaming mouth (or a tongue out from the heat, or a small "shh")
  if (face === "scared") {
    ctx.fillStyle = "#5a1f14";
    ellipse(ctx, 0, -51, 2.5, 2.5);
  } else {
    const open = 2 + mouth * 6;
    ctx.fillStyle = "#5a1f14";
    ellipse(ctx, 0, -50, face === "panic" ? 7 : 5.5, open);
    ctx.fillStyle = "#ef7a85"; // tongue
    if (face === "hot") ellipse(ctx, 0, -44 + open * 0.3, 3.5, 5); // tongue hanging out
    else ellipse(ctx, 0, -50 + open * 0.55, 3.5, 1.8);
  }

  // Sweat drops (panic and heat) and red cheeks (heat)
  if (face === "panic" || face === "hot") {
    ctx.fillStyle = "#7fd1ff";
    const drip = (time * 20) % 8;
    ellipse(ctx, 15, -70 + drip, 2, 3);
    ellipse(ctx, -16, -64 + drip * 0.7, 1.8, 2.8);
  }
  if (face === "hot") {
    ctx.fillStyle = "rgba(230, 60, 60, 0.45)";
    circle(ctx, -10, -55, 3.5);
    circle(ctx, 10, -55, 3.5);
  }

  // Hands: one on his cheek (so dramatic!), the other holding the microphone.
  // When scared, one finger goes to his lips: "SHHH!"
  ctx.fillStyle = skin;
  if (face === "scared") {
    circle(ctx, 4, -45, 4.5);
    ctx.strokeStyle = skin;
    ctx.lineWidth = 3;
    line(ctx, 3, -46, 2, -55); // finger on lips
  } else {
    circle(ctx, -16, -55, 5); // hand on cheek
  }
  ctx.strokeStyle = "#333"; // microphone
  ctx.lineWidth = 4;
  line(ctx, 18, -28, 14, -42);
  ctx.fillStyle = "#555";
  circle(ctx, 13, -45, 5);
  ctx.fillStyle = skin;
  circle(ctx, 18, -30, 4.5);
}

// Kuya Balita pops up from the bottom-left with a typewriter speech bubble
function drawBalita(time) {
  if (!balita || (state !== STATE.PLAYING && state !== STATE.PAUSED)) return;
  const b = balita;
  const slideIn = clamp(b.age / 0.25, 0, 1);
  const slideOut = clamp((b.duration - b.age) / 0.25, 0, 1);
  const k = Math.min(slideIn, slideOut);
  const talking = Math.floor(b.age * 30) < b.text.length;
  const mouth = talking ? (Math.sin(time * 25) + 1) / 2 : 0.3;

  // Over-acting: he shakes and bounces the whole time
  ctx.save();
  ctx.translate(46 + Math.sin(time * 40) * 1.3, H + 6 + (1 - k) * 100 - Math.abs(Math.sin(time * 9)) * 3);
  ctx.scale(1.15, 1.15);
  drawReporter(b.face, time, mouth);
  ctx.restore();

  if (k < 0.6) return;

  // Red "LIVE" tag
  ctx.fillStyle = "#d62828";
  roundRect(ctx, 14, H - 118, 40, 14, 4);
  ctx.fillStyle = "#ffffff";
  ctx.font = 'bold 9px Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("● LIVE", 34, H - 108);

  // Break the FULL text into lines first, so words don't jump around while typing
  ctx.font = 'bold 13px "Trebuchet MS", "Segoe UI", sans-serif';
  const maxWidth = 270;
  const lines = [];
  let current = "";
  for (const word of b.text.split(" ")) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  lines.push(current);

  // Speech bubble with a little tail pointing at his mouth
  const bx = 96;
  const by = H - 82;
  const bw = 296;
  const bh = 14 + lines.length * 17;
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.beginPath();
  ctx.moveTo(bx + 2, by + 14);
  ctx.lineTo(bx - 14, by + 22);
  ctx.lineTo(bx + 2, by + 26);
  ctx.closePath();
  ctx.fill();

  // Typewriter effect: show only the letters "said" so far
  let shown = Math.floor(b.age * 30);
  ctx.fillStyle = "#1b1b1b";
  ctx.textAlign = "left";
  lines.forEach((text, i) => {
    const part = text.slice(0, Math.max(0, shown));
    shown -= text.length + 1;
    ctx.fillText(part, bx + 10, by + 20 + i * 17);
  });
}

// The professor PEEKS in from the right edge during "Nakatingin si Prof"
function drawProf(time) {
  // Slides in slowly from off-screen during the intro, then stays peeking
  const slide = clamp(getEvent("prof").introAge / 1.2, 0, 1);
  const x = W + 95 - 50 * slide;  // ends at x = W + 45: his feet are off-screen, only head + shoulder peek in
  const gy = GROUND_Y;

  // Dark purple aura behind him (scary!)
  const aura = ctx.createRadialGradient(W, gy - 200, 10, W, gy - 200, 170);
  aura.addColorStop(0, `rgba(60, 0, 80, ${0.45 * slide})`);
  aura.addColorStop(1, "rgba(60, 0, 80, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(W - 200, gy - 380, 200, 380);

  ctx.save();
  ctx.translate(x, gy);
  ctx.rotate(-0.32);               // leaning in a lot to peek around the edge
  ctx.scale(2.0, 2.0);             // much bigger than before
  drawProfFigure();
  ctx.restore();

  drawText("💢", x - 115, gy - 245 + Math.sin(time * 4) * 3, 26, "#ffffff");
}

// The prof himself, standing with his feet at (0, 0). Used in the game and in the event guide.
function drawProfFigure() {
  ctx.lineCap = "round";

  // Prof in a gray suit, white shirt, gray tie and glasses
  const skin = "#d9a77c";
  const suit = "#8b8e93";
  const suitDark = "#6e7176";

  ctx.strokeStyle = "#7d8085"; // gray slacks
  ctx.lineWidth = 10;
  line(ctx, -5, -50, -6, -6);
  line(ctx, 5, -50, 6, -6);
  ctx.fillStyle = "#111"; // black shoes
  ellipse(ctx, -9, -4, 8, 4);
  ellipse(ctx, 8, -4, 8, 4);

  ctx.fillStyle = "#f7f7f7"; // white shirt
  roundRect(ctx, -15, -94, 30, 46, 6);
  ctx.fillStyle = "#1b1b1b"; // black belt
  ctx.fillRect(-5, -51, 10, 3);
  ctx.fillStyle = "#666a70"; // gray tie
  ctx.beginPath();
  ctx.moveTo(0, -92);
  ctx.lineTo(-3, -87);
  ctx.lineTo(-2.5, -58);
  ctx.lineTo(0, -54);
  ctx.lineTo(2.5, -58);
  ctx.lineTo(3, -87);
  ctx.closePath();
  ctx.fill();

  // Open gray suit jacket (two front panels) with darker lapels
  ctx.fillStyle = suit;
  ctx.beginPath();
  ctx.moveTo(-17, -94);
  ctx.lineTo(-5, -94);
  ctx.lineTo(-3, -76);
  ctx.lineTo(-4, -46);
  ctx.lineTo(-17, -46);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(17, -94);
  ctx.lineTo(5, -94);
  ctx.lineTo(3, -76);
  ctx.lineTo(4, -46);
  ctx.lineTo(17, -46);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = suitDark;
  ctx.beginPath();
  ctx.moveTo(-5, -94);
  ctx.lineTo(-11, -88);
  ctx.lineTo(-3, -76);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(5, -94);
  ctx.lineTo(11, -88);
  ctx.lineTo(3, -76);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e1b84a"; // small gold pin on the lapel
  circle(ctx, -9, -84, 1.6);

  // Sleeves + hands
  ctx.strokeStyle = suit;
  ctx.lineWidth = 8;
  line(ctx, -17, -89, -21, -60);
  line(ctx, 17, -89, 15, -60);
  ctx.fillStyle = skin;
  circle(ctx, -21, -57, 3.5);
  circle(ctx, 15, -57, 3.5);

  // Neck and head
  ctx.fillRect(-4, -100, 8, 7);
  circle(ctx, -1, -107, 12);
  ctx.fillStyle = "#151515"; // short neat black hair
  ellipse(ctx, -1, -116, 12.5, 5.5);
  ctx.beginPath();
  ctx.arc(-1, -109, 12.5, Math.PI * 1.08, Math.PI * 1.92);
  ctx.fill();

  // Dark shadow over the upper face (scary lighting)
  ctx.fillStyle = "rgba(40, 0, 50, 0.35)";
  ctx.beginPath();
  ctx.arc(-1, -107, 12, Math.PI, Math.PI * 2);
  ctx.fill();

  // Glaring eyes: white with tiny pupils looking left at the player
  ctx.fillStyle = "#ffffff";
  circle(ctx, -7, -107, 2.6);
  circle(ctx, 2, -107, 2.6);
  ctx.fillStyle = "#000";
  circle(ctx, -8, -107, 1);
  circle(ctx, 1, -107, 1);

  // Glasses with a cold shine
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(-7, -107, 3.8, 0, Math.PI * 2);
  ctx.moveTo(5.8, -107);
  ctx.arc(2, -107, 3.8, 0, Math.PI * 2);
  ctx.stroke();
  line(ctx, -3.2, -107, -1.8, -107);
  ctx.strokeStyle = "rgba(200, 230, 255, 0.9)";
  ctx.lineWidth = 1;
  line(ctx, -9, -109, -7, -110.5);
  line(ctx, 0, -109, 2, -110.5);

  // Angry eyebrows slanting down toward the nose
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2.2;
  line(ctx, -11, -114, -4, -111);
  line(ctx, 6, -114, -1, -111);

  // Frown
  ctx.strokeStyle = "#5a1f14";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(-2.5, -97, 4, 1.15 * Math.PI, 1.85 * Math.PI);
  ctx.stroke();
}

// Big slow-motion instruction banner (Nakatingin si Prof, Naku Baha).
// It stays until the player taps the screen.
function drawEventIntro(time) {
  if (!inEventIntro()) return;
  const info = EVENTS[waitingEvent().type];
  ctx.fillStyle = "rgba(20, 15, 40, 0.8)";
  ctx.fillRect(0, 180, W, 140);
  drawText(info.title, W / 2, 222, 32, info.color);
  drawText(info.instructions[0], W / 2, 250, 17, "#ffffff");
  drawText(info.instructions[1], W / 2, 274, 17, "#ffffff");
  ctx.globalAlpha = 0.6 + Math.sin(time * 5) * 0.4; // blinking message
  const waiting = waitingEvent();
  const secs = EVENTS[waiting.type].introSeconds;
  const hint = secs ? `Starting in ${Math.max(1, Math.ceil(secs - waiting.introAge))}...` : START_HINT;
  drawText(hint, W / 2, 306, 15, "#ffd166");
  ctx.globalAlpha = 1;
}

// Naku Baha: muddy flood water that rises to the player's waist, with waves
function drawFlood(time) {
  if (!isEvent("baha")) return;
  const flood = getEvent("baha");
  const rise = clamp(flood.introAge / 1.5, 0, 1);                              // rises at the start
  const drain = flood.waiting ? 1 : clamp(flood.timeLeft / 1.2, 0, 1); // drains at the end
  const level = H - (H - WAIST_Y) * Math.min(rise, drain);

  // Water body with a wavy surface
  ctx.fillStyle = "rgba(120, 95, 60, 0.78)";
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 10) {
    ctx.lineTo(x, level + Math.sin(x * 0.05 + time * 3) * 4);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // Light ripples on top
  ctx.strokeStyle = "rgba(220, 235, 245, 0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 10) {
    const y = level + Math.sin(x * 0.05 + time * 3) * 4;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // A floating tsinelas drifting by
  const fx = ((time * 30) % (W + 80)) - 40;
  ctx.fillStyle = "#2a9df4";
  ellipse(ctx, fx, level + Math.sin(time * 3 + fx * 0.05) * 4 + 2, 12, 4);

  // Reminder floating on the water once the event has started
  if (!flood.waiting && level <= WAIST_Y + 2) {
    ctx.globalAlpha = 0.75 + Math.sin(time * 4) * 0.25;
    drawText("🚫 Can't kick in the flood!", W / 2, level + 34, 15, "#ffffff");
    ctx.globalAlpha = 1;
  }
}

// Small name tag BELOW the player's feet showing the current rank
function drawRankTag() {
  const rank = currentRank();
  const y = GROUND_Y + 24;
  ctx.font = 'bold 12px "Trebuchet MS", "Segoe UI", sans-serif';
  const w = ctx.measureText(rank.name).width + 16;
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  roundRect(ctx, player.x - w / 2, y - 13, w, 18, 9);
  ctx.strokeStyle = rank.color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = rank.color;
  ctx.textAlign = "center";
  ctx.fillText(rank.name, player.x, y);
}

// Pulsing outline around the player + "Tap me!" during Nakatingin si Prof
function drawTapMeHint(time) {
  const pulse = 0.6 + Math.sin(time * 6) * 0.3;
  ctx.strokeStyle = `rgba(201, 179, 255, ${pulse})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(player.x - PLAYER_TAP_HALF_W, GROUND_Y - PLAYER_TAP_H, PLAYER_TAP_HALF_W * 2, PLAYER_TAP_H + 10);
  ctx.setLineDash([]);
  drawText("Tap me!", player.x, GROUND_Y - PLAYER_TAP_H - 10, 18, "#c9b3ff");
}

// Golden ring around the sipa while the Uno shield is ready
function drawShield(time) {
  if (!hasShield()) return;
  ctx.strokeStyle = `rgba(255, 209, 102, ${0.6 + Math.sin(time * 5) * 0.3})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sipa.x, sipa.y, sipa.r * 1.3, 0, Math.PI * 2);
  ctx.stroke();
}

function draw(time) {
  ctx.save();
  if (shake > 0) {
    ctx.translate(randomRange(-6, 6) * shake, randomRange(-6, 6) * shake);
  }

  // Ang Init "dizzy" effect: the whole screen slowly tilts, drifts and zooms like you're
  // dizzy from the heat. It only moves the drawing (translate/rotate/scale), which is very
  // cheap, so the game stays smooth. k fades it in and out so it never starts suddenly.
  if (isEvent("tagInit")) {
    const k = eventFade("tagInit");
    // Fast heat shake: two sine waves of different speeds are added together so the
    // shaking feels jittery instead of a smooth swing.
    // Numbers INSIDE sin = speed (bigger = faster), numbers OUTSIDE = how far it moves.
    const shakeX = Math.sin(time * 9) * 4 + Math.sin(time * 23) * 2;
    const shakeY = Math.sin(time * 11) * 2.5 + Math.sin(time * 27) * 1.5;
    ctx.translate(W / 2 + shakeX * k, H / 2 + shakeY * k);
    ctx.rotate((Math.sin(time * 7) * 0.014 + Math.sin(time * 19) * 0.006) * k);
    const zoom = 1 + 0.05 * k; // zoomed in a bit so no edges show while shaking
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
  }
  bgTime = time;
  drawBackground();
  drawSceneTints(time);
  // Draw the player bigger: move to the player's feet, then scale up
  ctx.save();
  ctx.translate(player.x, GROUND_Y);
  ctx.scale(PLAYER_SCALE, PLAYER_SCALE);
  const outfit = state !== STATE.MENU && state !== STATE.SELECT && currentRank().name === "Graduate" ? "toga" : null;
  drawCharacter(ctx, selectedChar, 0, 0, player.kick, time, outfit);
  ctx.restore();

  if (state === STATE.MENU || state === STATE.SELECT) {
    // Gentle floating sipa behind the menu
    sipa.x = W / 2;
    sipa.y = 300 + Math.sin(time * 2) * 20;
  }
  if (isEvent("prof")) drawProf(time);
  drawPowerUps(time);
  drawObstacles(time);
  drawSipa(time);
  drawShield(time);
  for (const v of vehicles) {
    if (v.kind === "aspin") drawAspin(v, time);
    else if (v.kind === "trike") drawTricycle(v);
    else drawJeepney(v);
  }
  for (const v of vehicles) drawHonk(v, time);
  drawFlood(time);
  drawScreenEffects(time);
  if (isEvent("prof") && state === STATE.PLAYING) drawTapMeHint(time);
  if (state === STATE.PLAYING) drawEventIntro(time);

  if (state !== STATE.MENU && state !== STATE.SELECT) {
    drawRankTag();
    drawConfetti();
    drawHUD();
    drawFloaters();
    drawBalita(time);
  }
  ctx.restore();
}

// ----- 12b. "Mga Ganap!" guide (home screen): shows all the random events -----
// Each event gets a card with a small animated preview drawn with the SAME drawing
// functions as the game. drawOn() lets those functions draw on a small canvas for a moment.
const PREVIEW_W = 120;
const PREVIEW_H = 90;

function drawOn(g, drawFn) {
  const main = ctx;
  ctx = g;
  try {
    drawFn();
  } finally {
    ctx = main; // always switch back to the game canvas
  }
}

function previewSky(top, bottom) {
  const sky = ctx.createLinearGradient(0, 0, 0, PREVIEW_H);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
}

// x position that loops across the preview, for things flying by
const loopX = (time, speed, offset) => ((time * speed + offset) % (PREVIEW_W + 60)) - 30;

const EVENT_GUIDE = [
  {
    key: "walangPasok",
    text: "Dark storm with heavy rain, lightning and strong wind. Triple points (x3)! A flood always comes after.",
    preview(time) {
      previewSky("#1b2238", "#2c3a5a");
      ctx.fillStyle = "#3d4a66";
      circle(ctx, 30, 22, 14); circle(ctx, 48, 16, 16); circle(ctx, 66, 22, 13);
      ctx.strokeStyle = "rgba(190, 215, 255, 0.8)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 22; i++) {
        const x = (i * 17 + time * 40) % PREVIEW_W;
        const y = (i * 29 + time * 160) % PREVIEW_H;
        line(ctx, x, y, x + 3, y + 9);
      }
      if (time % 3 < 0.15) { // lightning flash
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
      }
    },
  },
  {
    key: "baha",
    text: "The flood rises to your waist. You CAN'T kick the sipa while it's in the water. The game slows down for 3 seconds first so you can read.",
    preview(time) {
      previewSky("#6ec3ee", "#dff3ff");
      ctx.fillStyle = "rgba(120, 95, 60, 0.9)";
      ctx.beginPath();
      ctx.moveTo(0, PREVIEW_H);
      for (let x = 0; x <= PREVIEW_W; x += 6) ctx.lineTo(x, 52 + Math.sin(x * 0.12 + time * 3) * 3);
      ctx.lineTo(PREVIEW_W, PREVIEW_H);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#2a9df4"; // floating tsinelas
      ellipse(ctx, loopX(time, 18, 0), 54 + Math.sin(time * 3) * 2, 9, 3);
      drawText("🚫", 92, 78, 16, "#ffffff");
    },
  },
  {
    key: "examWeek",
    text: "Everything moves FASTER. The screen edges flash red.",
    preview(time) {
      previewSky("#fff3e0", "#ffe0b2");
      ctx.save();
      ctx.translate(60, 46);
      ctx.rotate(-0.08);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-26, -32, 52, 64);
      ctx.strokeStyle = "#b8b8b8";
      ctx.strokeRect(-26, -32, 52, 64);
      ctx.fillStyle = "#c1121f";
      ctx.font = "bold 12px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("EXAM", 0, -16);
      ctx.strokeStyle = "#9bb3d1";
      for (let y = -6; y <= 24; y += 7) line(ctx, -18, y, 18, y);
      ctx.restore();
      ctx.strokeStyle = `rgba(255, 70, 70, ${0.5 + Math.sin(time * 8) * 0.3})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, PREVIEW_W, PREVIEW_H);
    },
  },
  {
    key: "handouts",
    text: "Paper planes and handouts fly across and bump the sipa sideways.",
    preview(time) {
      previewSky("#6ec3ee", "#dff3ff");
      drawObstacle({ kind: "plane", x: loopX(time, 50, 0), y: 30, vx: 1, age: time, spin: 0 }, time);
      drawObstacle({ kind: "paper", x: loopX(time, 35, 90), y: 62 + Math.sin(time * 3) * 5, vx: 1, age: time, spin: 2 }, time);
    },
  },
  {
    key: "maya",
    text: "Small flocks of maya birds fly across and bump the sipa.",
    preview(time) {
      previewSky("#6ec3ee", "#dff3ff");
      for (let i = 0; i < 3; i++) {
        drawObstacle({
          kind: "maya", x: loopX(time, 45, i * 28), y: 30 + i * 18 + Math.sin(time * 6 + i) * 4,
          vx: 1, age: time + i,
        }, time);
      }
    },
  },
  {
    key: "tagInit",
    text: "Blazing sun, heat waves and a shaky, dizzy screen. +1 bonus point on every kick.",
    preview(time) {
      ctx.save();
      ctx.translate(Math.sin(time * 9) * 2 + Math.sin(time * 23) * 1, Math.sin(time * 11) * 1.5);
      previewSky("#ffe9b0", "#fff6dc");
      ctx.fillStyle = "rgba(255, 200, 80, 0.4)";
      circle(ctx, 80, 30, 26);
      ctx.fillStyle = "#ffd166";
      circle(ctx, 80, 30, 16);
      ctx.strokeStyle = "rgba(255, 140, 60, 0.6)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        for (let y = PREVIEW_H; y > 45; y -= 4) {
          const x = 15 + i * 28 + Math.sin(y * 0.2 + time * 6 + i) * 3;
          if (y === PREVIEW_H) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    key: "prof",
    text: "The prof is watching! For 6 seconds you can only kick by tapping your PLAYER. x2 points. Press any key to start.",
    preview(time) {
      previewSky("#3a2350", "#6b4a8a");
      ctx.save();
      ctx.translate(72, 150);
      ctx.scale(1.15, 1.15);
      drawProfFigure();
      ctx.restore();
      drawText("💢", 100, 22 + Math.sin(time * 4) * 2, 16, "#ffffff");
    },
  },
  {
    key: "road",
    title: "JEEPNEYS, TRICYCLES & ASPIN",
    color: "#ffd166",
    text: "Not a Ganap: they pass by all game long. Jeepney and tricycle gusts push a low sipa sideways, and the aspin jumps at it!",
    preview(time) {
      previewSky("#6ec3ee", "#dff3ff");
      ctx.fillStyle = "#5f5f63";
      ctx.fillRect(0, 60, PREVIEW_W, 30);
      // Shrink the big vehicles so they fit in the preview
      const which = Math.floor(time / 3) % 3; // 0 = jeepney, 1 = tricycle, 2 = aspin
      const x = loopX(time, 70, 0) * 3;
      ctx.save();
      if (which === 2) {
        ctx.translate(0, PREVIEW_H - 8);
        ctx.scale(0.6, 0.6);
        ctx.translate(0, -(GROUND_Y + 40));
        drawAspin({ x: x * 0.55, vx: 1, jumpT: -1 }, time);
      } else {
        ctx.translate(0, PREVIEW_H - 2);
        ctx.scale(0.33, 0.33);
        ctx.translate(0, -(H - 4));
        if (which === 1) drawTricycle({ x, vx: 1 });
        else drawJeepney({ x, vx: 1 });
      }
      ctx.restore();
    },
  },
];

// The Power-ups guide: same idea as Mga Ganap, one card per power-up
function previewPowerUp(type, time) {
  drawPowerUpItem({ type, x: 60, y: 38, r: 20 }, time);
}
const POWERUP_GUIDE = [
  {
    key: "kape",
    text: "Slow motion for 3 seconds, so you have more time to kick.",
    preview(time) {
      previewSky("#f6e7d8", "#e9cfb4");
      ctx.strokeStyle = "rgba(111, 78, 55, 0.6)"; // rising steam
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let y = 20; y > 0; y -= 2) ctx.lineTo(50 + i * 10 + Math.sin(y * 0.4 + time * 4 + i) * 3, y);
        ctx.stroke();
      }
      previewPowerUp("kape", time);
    },
  },
  {
    key: "allowance",
    text: "Double points (x2) for 5 seconds.",
    preview(time) {
      previewSky("#dff7e8", "#b9ecd0");
      previewPowerUp("allowance", time);
      drawText("x2", 96, 44 + Math.sin(time * 6) * 3, 18, "#2a9d55");
    },
  },
  {
    key: "uno",
    text: "A shield for 20 seconds. If the sipa touches the ground, it bounces back up once.",
    preview(time) {
      previewSky("#f7e1e4", "#ecc3c9");
      ctx.strokeStyle = `rgba(255, 209, 102, ${0.6 + Math.sin(time * 5) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(60, 38, 31, 0, Math.PI * 2);
      ctx.stroke();
      previewPowerUp("uno", time);
    },
  },
  {
    key: "reviewer",
    text: "The sipa gets BIGGER for 5 seconds, so it's easier to see and kick.",
    preview(time) {
      previewSky("#ddeeff", "#b8d9f7");
      ctx.save();
      const grow = 1 + (Math.sin(time * 3) + 1) * 0.12; // grows and shrinks
      ctx.translate(60, 38);
      ctx.scale(grow, grow);
      ctx.translate(-60, -38);
      previewPowerUp("reviewer", time);
      ctx.restore();
    },
  },
  {
    key: "merienda",
    text: "Clears every Ganap right away. It only falls while a Ganap is happening.",
    preview(time) {
      const stormy = time % 3 < 1.5; // storm, then clear, then storm again
      previewSky(stormy ? "#2c3a5a" : "#6ec3ee", stormy ? "#3d4a66" : "#dff3ff");
      if (stormy) {
        ctx.strokeStyle = "rgba(190, 215, 255, 0.8)";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 16; i++) {
          const x = (i * 17 + time * 40) % PREVIEW_W;
          const y = (i * 29 + time * 160) % PREVIEW_H;
          line(ctx, x, y, x + 3, y + 9);
        }
      }
      previewPowerUp("merienda", time);
    },
  },
];

// Build the guide cards once (HTML), each with its own preview canvas.
// listId = where the cards go; guide = EVENT_GUIDE or POWERUP_GUIDE; source = EVENTS or POWERUPS
function buildGuide(listId, guide, source, listName) {
  const list = document.getElementById(listId);
  for (const item of guide) {
    const info = source[item.key] || {};
    const card = document.createElement("div");
    card.className = "event-card";
    const cv = document.createElement("canvas");
    cv.className = "event-preview";
    cv.dataset.key = item.key;
    cv.dataset.list = listName;
    const textBox = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.title || info.title || `${info.icon} ${info.label}`;
    title.style.color = item.color || (source === POWERUPS ? "#ffd166" : info.color);
    const desc = document.createElement("p");
    desc.textContent = item.text;
    textBox.append(title, desc);
    card.append(cv, textBox);
    list.append(card);
  }
}

// Animates every preview (only while the guide is open)
function drawEventPreviews(time) {
  for (const cv of document.querySelectorAll(".event-preview")) {
    const rect = cv.getBoundingClientRect();
    if (rect.width === 0) continue;
    const dpr = window.devicePixelRatio || 1;
    const wantW = Math.round(rect.width * dpr);
    const wantH = Math.round(rect.height * dpr);
    if (cv.width !== wantW || cv.height !== wantH) {
      cv.width = wantW;
      cv.height = wantH;
    }
    const g = cv.getContext("2d");
    g.setTransform(cv.width / PREVIEW_W, 0, 0, cv.height / PREVIEW_H, 0, 0);
    const guide = cv.dataset.list === "powerups" ? POWERUP_GUIDE : EVENT_GUIDE;
    const item = guide.find((e) => e.key === cv.dataset.key);
    drawOn(g, () => {
      ctx.save();
      item.preview(time);
      ctx.restore();
    });
  }
}

function openEventGuide() {
  getAudio();
  showOverlay("events");
  document.getElementById("eventList").scrollTop = 0;
}

function openPowerUpGuide() {
  getAudio();
  showOverlay("powerups");
  document.getElementById("powerupList").scrollTop = 0;
}

const guideOpen = () =>
  !document.getElementById("events").classList.contains("hidden") ||
  !document.getElementById("powerups").classList.contains("hidden");

// ----- 13. Character select cards -----
// Each card has its own small canvas showing the character doing little kicks
const cardCanvases = Array.from(document.querySelectorAll(".char-canvas"));
const CARD_W = 160;
const CARD_H = 200;

function drawCards(time) {
  for (const cv of cardCanvases) {
    const rect = cv.getBoundingClientRect();
    if (rect.width === 0) continue; // card not visible
    const dpr = window.devicePixelRatio || 1;
    const wantW = Math.round(rect.width * dpr);
    const wantH = Math.round(rect.height * dpr);
    if (cv.width !== wantW || cv.height !== wantH) {
      cv.width = wantW;
      cv.height = wantH;
    }

    const g = cv.getContext("2d");
    g.setTransform(cv.width / CARD_W, 0, 0, cv.height / CARD_H, 0, 0);
    g.clearRect(0, 0, CARD_W, CARD_H);

    const type = cv.dataset.char;
    // The selected character does a little kick every 1.2 seconds
    const kick = type === selectedChar && time % 1.2 < 0.25 ? 0.2 : 0;

    g.save();
    g.translate(CARD_W / 2, CARD_H - 12);
    g.scale(1.35, 1.35);
    drawCharacter(g, type, 0, 0, kick, time);
    g.restore();
  }
}

function updateCardHighlight() {
  document.querySelectorAll(".char-card").forEach((card) => {
    const isSelected = card.dataset.char === selectedChar;
    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-pressed", isSelected);
  });
}

document.querySelectorAll(".char-card").forEach((card) => {
  card.addEventListener("click", () => chooseCharacter(card.dataset.char));
});

// ----- 14. The game loop: runs about 60 times per second -----
function loop(timestamp) {
  // dt = seconds since last frame (capped so a lag spike doesn't break physics)
  const dt = Math.min(0.033, (timestamp - lastTime) / 1000 || 0);
  lastTime = timestamp;
  const time = timestamp / 1000;

  if (state === STATE.PLAYING) update(dt);
  updateScenery(dt);
  draw(time);
  if (state === STATE.SELECT) drawCards(time);
  if (guideOpen()) drawEventPreviews(time);
  updateAudio(dt);

  requestAnimationFrame(loop);
}

// ----- 15. Buttons and keyboard -----
document.getElementById("startBtn").addEventListener("click", openCharacterSelect);
document.getElementById("eventsBtn").addEventListener("click", openEventGuide);
document.getElementById("eventsBackBtn").addEventListener("click", goToMenu);
document.getElementById("powerupsBtn").addEventListener("click", openPowerUpGuide);
document.getElementById("powerupsBackBtn").addEventListener("click", goToMenu);
document.getElementById("goBtn").addEventListener("click", startGame);
document.getElementById("backBtn").addEventListener("click", goToMenu);
// "Play Again" goes back to the home screen (instructions), then Play -> choose player
document.getElementById("retryBtn").addEventListener("click", goToMenu);
document.getElementById("changeCharBtn").addEventListener("click", openCharacterSelect);
document.getElementById("resumeBtn").addEventListener("click", resumeGame);
document.getElementById("quitBtn").addEventListener("click", goToMenu);

document.getElementById("pauseBtn").addEventListener("click", () => {
  if (state === STATE.PLAYING) pauseGame();
  else if (state === STATE.PAUSED) resumeGame();
});

const musicBtn = document.getElementById("musicBtn");
function updateMusicButton() {
  musicBtn.style.opacity = musicOn ? "1" : "0.4";
  musicBtn.setAttribute("aria-label", musicOn ? "Turn music off" : "Turn music on");
}
musicBtn.addEventListener("click", () => {
  getAudio();
  musicOn = !musicOn;
  saveSetting("sipa-music", musicOn);
  updateMusicButton();
});

// Browsers only allow sound after the first click/tap/key, so we start the audio then
document.addEventListener("pointerdown", () => getAudio(), { once: true });
document.addEventListener("keydown", () => getAudio(), { once: true });

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

  // Instructions (Nakatingin si Prof / Naku Baha) are showing: ANY key starts the event
  if (state === STATE.PLAYING && inEventIntro()) {
    event.preventDefault();
    finishEventIntro();
    return;
  }

  if (key === "p" || key === "escape") {
    if (state === STATE.PLAYING) pauseGame();
    else if (state === STATE.PAUSED) resumeGame();
  }

  // Left/right arrows switch characters on the select screen
  if (state === STATE.SELECT && (key === "arrowleft" || key === "arrowright")) {
    chooseCharacter(selectedChar === "boy" ? "girl" : "boy");
  }

  if (key === " " || key === "enter") {
    const gameoverShown = !document.getElementById("gameover").classList.contains("hidden");
    if (guideOpen()) {
      event.preventDefault();
      goToMenu();
    } else if (state === STATE.MENU) {
      event.preventDefault();
      openCharacterSelect();
    } else if (state === STATE.SELECT) {
      event.preventDefault();
      startGame();
    } else if (gameoverShown) {
      event.preventDefault();
      goToMenu(); // same as clicking "Play Again"
    }
  }
});

// Pause automatically if the player switches tabs
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});

// ----- 16. Start everything -----
if (selectedChar !== "boy" && selectedChar !== "girl") selectedChar = "boy";
buildGuide("eventList", EVENT_GUIDE, EVENTS, "events");
buildGuide("powerupList", POWERUP_GUIDE, POWERUPS, "powerups");
resizeCanvas();
resetGame();
updateMuteButton();
updateMusicButton();
updateCardHighlight();
document.getElementById("menuBest").textContent = best;
requestAnimationFrame(loop);