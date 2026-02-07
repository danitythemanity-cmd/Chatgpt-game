const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("highScore");
const shieldEl = document.getElementById("shield");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayMessage = document.getElementById("overlayMessage");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const soundToggle = document.getElementById("soundToggle");

const state = {
  running: false,
  lastTime: 0,
  score: 0,
  highScore: Number(localStorage.getItem("nebulaHighScore")) || 0,
  shield: 3,
  combo: 1,
  comboTimer: 0,
  shake: 0,
};

const keys = new Set();
let pointerActive = false;
let pointerPos = { x: 0, y: 0 };

const player = {
  x: 0,
  y: 0,
  radius: 18,
  speed: 320,
  glow: 0,
};

const asteroids = [];
const orbs = [];
const particles = [];
const stars = Array.from({ length: 90 }, () => ({
  x: Math.random(),
  y: Math.random(),
  size: Math.random() * 1.5 + 0.3,
  speed: Math.random() * 0.25 + 0.05,
}));

let spawnTimer = 0;
let orbTimer = 0;
let audioContext = null;
let soundEnabled = true;

const touchButtons = document.querySelectorAll(".mobile-controls button");
const touchState = { up: false, down: false, left: false, right: false };

touchButtons.forEach((button) => {
  const direction = button.dataset.dir;
  const setState = (value) => {
    touchState[direction] = value;
  };
  button.addEventListener("pointerdown", () => setState(true));
  button.addEventListener("pointerup", () => setState(false));
  button.addEventListener("pointerleave", () => setState(false));
});

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function resetGame() {
  state.score = 0;
  state.shield = 3;
  state.combo = 1;
  state.comboTimer = 0;
  state.shake = 0;
  player.x = canvas.getBoundingClientRect().width * 0.2;
  player.y = canvas.getBoundingClientRect().height * 0.5;
  asteroids.length = 0;
  orbs.length = 0;
  particles.length = 0;
  spawnTimer = 0;
  orbTimer = 0;
  updateHud();
}

function startGame() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  resetGame();
  overlay.classList.remove("active");
  state.running = true;
  state.lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function endGame() {
  state.running = false;
  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem("nebulaHighScore", String(state.highScore));
  }
  overlayTitle.textContent = "Run Complete";
  overlayMessage.textContent = `Score ${Math.floor(state.score)} · High ${Math.floor(
    state.highScore
  )}`;
  overlay.classList.add("active");
}

function updateHud() {
  scoreEl.textContent = Math.floor(state.score);
  highScoreEl.textContent = Math.floor(state.highScore);
  shieldEl.textContent = state.shield;
}

function playTone({ frequency = 440, duration = 0.15, type = "sine", volume = 0.2 }) {
  if (!audioContext || !soundEnabled) {
    return;
  }
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = type;
  gain.gain.value = volume;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.stop(audioContext.currentTime + duration);
}

function spawnAsteroid(width, height) {
  const size = Math.random() * 28 + 18;
  asteroids.push({
    x: width + size,
    y: Math.random() * (height - size * 2) + size,
    radius: size,
    speed: Math.random() * 140 + 180,
    spin: Math.random() * 2 - 1,
    angle: Math.random() * Math.PI * 2,
  });
}

function spawnOrb(width, height) {
  const radius = Math.random() * 10 + 10;
  orbs.push({
    x: width + radius,
    y: Math.random() * (height - radius * 2) + radius,
    radius,
    speed: Math.random() * 80 + 140,
    pulse: Math.random() * Math.PI * 2,
  });
}

function addParticles(x, y, color) {
  for (let i = 0; i < 12; i += 1) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 160,
      vy: (Math.random() - 0.5) * 160,
      life: Math.random() * 0.6 + 0.4,
      color,
    });
  }
}

function updatePlayer(delta, width, height) {
  let inputX = 0;
  let inputY = 0;

  if (keys.has("ArrowUp") || keys.has("w") || touchState.up) inputY -= 1;
  if (keys.has("ArrowDown") || keys.has("s") || touchState.down) inputY += 1;
  if (keys.has("ArrowLeft") || keys.has("a") || touchState.left) inputX -= 1;
  if (keys.has("ArrowRight") || keys.has("d") || touchState.right) inputX += 1;

  if (pointerActive) {
    const dx = pointerPos.x - player.x;
    const dy = pointerPos.y - player.y;
    player.x += dx * Math.min(delta * 2.5, 1);
    player.y += dy * Math.min(delta * 2.5, 1);
  } else {
    const length = Math.hypot(inputX, inputY) || 1;
    player.x += (inputX / length) * player.speed * delta;
    player.y += (inputY / length) * player.speed * delta;
  }

  player.x = Math.max(player.radius, Math.min(width - player.radius, player.x));
  player.y = Math.max(player.radius, Math.min(height - player.radius, player.y));
  player.glow = Math.min(player.glow + delta * 2, 1);
}

function updateEntities(delta, width, height) {
  spawnTimer -= delta;
  orbTimer -= delta;

  if (spawnTimer <= 0) {
    spawnAsteroid(width, height);
    spawnTimer = Math.random() * 0.8 + 0.5;
  }

  if (orbTimer <= 0) {
    spawnOrb(width, height);
    orbTimer = Math.random() * 1.6 + 1.1;
  }

  asteroids.forEach((asteroid) => {
    asteroid.x -= asteroid.speed * delta;
    asteroid.angle += asteroid.spin * delta;
  });

  orbs.forEach((orb) => {
    orb.x -= orb.speed * delta;
    orb.pulse += delta * 4;
  });

  particles.forEach((particle) => {
    particle.life -= delta;
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
  });

  for (let i = asteroids.length - 1; i >= 0; i -= 1) {
    if (asteroids[i].x < -asteroids[i].radius * 2) {
      asteroids.splice(i, 1);
    }
  }

  for (let i = orbs.length - 1; i >= 0; i -= 1) {
    if (orbs[i].x < -orbs[i].radius * 2) {
      orbs.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    if (particles[i].life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function detectCollisions() {
  orbs.forEach((orb, index) => {
    const distance = Math.hypot(orb.x - player.x, orb.y - player.y);
    if (distance < orb.radius + player.radius) {
      orbs.splice(index, 1);
      state.score += 120 * state.combo;
      state.combo = Math.min(state.combo + 0.2, 4);
      state.comboTimer = 1.4;
      playTone({ frequency: 620, duration: 0.12, type: "triangle", volume: 0.2 });
      addParticles(orb.x, orb.y, "rgba(89, 240, 255, 0.9)");
    }
  });

  asteroids.forEach((asteroid, index) => {
    const distance = Math.hypot(asteroid.x - player.x, asteroid.y - player.y);
    if (distance < asteroid.radius + player.radius - 4) {
      asteroids.splice(index, 1);
      state.shield -= 1;
      state.shake = 0.4;
      state.combo = 1;
      playTone({ frequency: 180, duration: 0.2, type: "sawtooth", volume: 0.3 });
      addParticles(player.x, player.y, "rgba(255, 107, 107, 0.9)");
      if (state.shield <= 0) {
        endGame();
      }
    }
  });
}

function updateScore(delta) {
  if (!state.running) {
    return;
  }
  state.score += delta * 28;
  if (state.comboTimer > 0) {
    state.comboTimer -= delta;
  } else {
    state.combo = Math.max(1, state.combo - delta * 0.8);
  }
  updateHud();
}

function drawBackground(width, height) {
  ctx.fillStyle = "#05060d";
  ctx.fillRect(0, 0, width, height);

  stars.forEach((star) => {
    star.y += star.speed;
    if (star.y > 1) star.y = 0;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + star.size / 3})`;
    ctx.beginPath();
    ctx.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
    ctx.fill();
  });

  const gradient = ctx.createRadialGradient(player.x, player.y, 10, player.x, player.y, 220);
  gradient.addColorStop(0, "rgba(89, 240, 255, 0.25)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = "rgba(89, 240, 255, 0.8)";
  ctx.beginPath();
  ctx.arc(0, 0, player.radius + player.glow * 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(-player.radius * 0.9, -player.radius * 0.5);
  ctx.lineTo(player.radius * 1.1, 0);
  ctx.lineTo(-player.radius * 0.9, player.radius * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAsteroids() {
  asteroids.forEach((asteroid) => {
    ctx.save();
    ctx.translate(asteroid.x, asteroid.y);
    ctx.rotate(asteroid.angle);
    ctx.fillStyle = "#4b587f";
    ctx.beginPath();
    ctx.arc(0, 0, asteroid.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  });
}

function drawOrbs() {
  orbs.forEach((orb) => {
    const pulse = Math.sin(orb.pulse) * 0.3 + 0.7;
    ctx.beginPath();
    ctx.fillStyle = `rgba(63, 255, 168, ${0.6 + pulse * 0.4})`;
    ctx.arc(orb.x, orb.y, orb.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawParticles() {
  particles.forEach((particle) => {
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = Math.max(particle.life, 0);
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function drawCombo(width) {
  if (state.combo <= 1.05) {
    return;
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = "600 16px Inter, sans-serif";
  ctx.fillText(`Combo x${state.combo.toFixed(1)}`, width - 140, 30);
}

function gameLoop(timestamp) {
  if (!state.running) return;
  const delta = Math.min((timestamp - state.lastTime) / 1000, 0.033);
  state.lastTime = timestamp;

  const { width, height } = canvas.getBoundingClientRect();
  resizeCanvas();

  if (state.shake > 0) {
    state.shake -= delta;
    const intensity = state.shake * 8;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
    drawBackground(width, height);
    updatePlayer(delta, width, height);
    updateEntities(delta, width, height);
    detectCollisions();
    drawOrbs();
    drawAsteroids();
    drawPlayer();
    drawParticles();
    drawCombo(width);
    ctx.restore();
  } else {
    drawBackground(width, height);
    updatePlayer(delta, width, height);
    updateEntities(delta, width, height);
    detectCollisions();
    drawOrbs();
    drawAsteroids();
    drawPlayer();
    drawParticles();
    drawCombo(width);
  }

  updateScore(delta);
  requestAnimationFrame(gameLoop);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  soundToggle.textContent = soundEnabled ? "🔊 Sound: On" : "🔇 Sound: Off";
  soundToggle.setAttribute("aria-pressed", String(soundEnabled));
  playTone({ frequency: soundEnabled ? 520 : 220, duration: 0.1, type: "square", volume: 0.2 });
}

window.addEventListener("keydown", (event) => {
  keys.add(event.key);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});

canvas.addEventListener("pointerdown", (event) => {
  pointerActive = true;
  const rect = canvas.getBoundingClientRect();
  pointerPos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointerActive) return;
  const rect = canvas.getBoundingClientRect();
  pointerPos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
});

window.addEventListener("pointerup", () => {
  pointerActive = false;
});

window.addEventListener("resize", () => {
  resizeCanvas();
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);

soundToggle.addEventListener("click", toggleSound);

highScoreEl.textContent = Math.floor(state.highScore);
resizeCanvas();
resetGame();
