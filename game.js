(() => {
  const canvas = document.querySelector("#game-canvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.querySelector("#screen-overlay");
  const startButton = document.querySelector("#start-button");
  const scoreDisplay = document.querySelector("#score");
  const bestDisplay = document.querySelector("#best-score");
  const speedDisplay = document.querySelector("#speed");
  const stateDisplay = document.querySelector("#run-state");
  const pauseIndicator = document.querySelector("#pause-indicator");
  const cameraModeButton = document.querySelector("#camera-mode");
  const cameraHint = document.querySelector("#camera-hint");
  const vehicleSwitchButton = document.querySelector("#vehicle-switch");
  const vehicleLabel = document.querySelector("#vehicle-label");
  const soundToggle = document.querySelector("#sound-toggle");
  const soundLabel = document.querySelector("#sound-label");
  const specialAbilityButton = document.querySelector("#special-ability");
  const abilityName = document.querySelector("#ability-name");
  const abilityCooldown = document.querySelector("#ability-cooldown");
  const abilityIcon = document.querySelector("#ability-icon");
  const vehiclePicker = document.querySelector("#vehicle-picker");
  const sedanOption = document.querySelector("#choose-sedan");
  const scooterOption = document.querySelector("#choose-scooter");
  const pakaranOption = document.querySelector("#choose-pakaran");
  const title = document.querySelector("#overlay-title");
  const copy = document.querySelector("#overlay-copy");
  const kicker = document.querySelector("#overlay-kicker");
  const buttonLabel = document.querySelector("#button-label");
  const overlayHint = document.querySelector("#overlay-hint");

  const LANES = 3;
  const VEHICLES = ["sedan", "scooter", "pakaran"];
  const colors = ["#ff5a78", "#f7b84a", "#b58cff", "#49d8cb", "#f07a42"];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let renderScale = 1;
  let state = "ready";
  let score = 0;
  let best = readBest();
  let elapsed = 0;
  let spawnTimer = 0;
  let roadOffset = 0;
  let lastTime = 0;
  let playerLane = 1;
  let playerX = 0;
  let cameraMode = "chase";
  let cameraAngle = 0;
  let cameraPitch = 0;
  let cameraDragX = null;
  let cameraDragY = null;
  let cameraPointerId = null;
  let steeringPointer = null;
  let playerVehicle = "sedan";
  let abilityCooldownRemaining = 0;
  let jumpProgress = null;
  let pickerOpen = false;
  let resumeAfterPicker = false;
  let pickerSelection = "sedan";
  let traffic = [];
  let pizzas = [];
  let particles = [];
  let previousPad = { left: false, right: false, start: false, pause: false };
  let audioContext = null;
  let masterGain = null;
  let engineGain = null;
  let engineFilter = null;
  let engineOscillators = [];
  let engineNoiseGain = null;
  let engineNoiseSource = null;
  let audioEnabled = true;
  let audioUpdateTimer = 0;
  let audioWarningShown = false;

  function readBest() {
    try {
      return Number(localStorage.getItem("neon-rush-best")) || 0;
    } catch (error) {
      console.warn("Could not read the saved high score.", error);
      return 0;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem("neon-rush-best", String(value));
    } catch (error) {
      console.warn("Could not save the high score.", error);
    }
  }

  function initializeAudio() {
    if (!audioEnabled) return false;
    if (!audioContext) {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) {
        if (!audioWarningShown) console.warn("Web Audio is not available; game sounds are disabled.");
        audioWarningShown = true;
        audioEnabled = false;
        updateSoundButton();
        return false;
      }

      audioContext = new AudioContextConstructor();
      masterGain = audioContext.createGain();
      masterGain.gain.value = .22;
      masterGain.connect(audioContext.destination);

      engineFilter = audioContext.createBiquadFilter();
      engineFilter.type = "lowpass";
      engineFilter.frequency.value = 420;
      engineGain = audioContext.createGain();
      engineGain.gain.value = 0;
      engineFilter.connect(engineGain);
      engineGain.connect(masterGain);

      const lowEngine = audioContext.createOscillator();
      lowEngine.type = "sawtooth";
      lowEngine.frequency.value = 48;
      lowEngine.connect(engineFilter);
      lowEngine.start();
      const engineHarmonic = audioContext.createOscillator();
      engineHarmonic.type = "triangle";
      engineHarmonic.frequency.value = 96;
      engineHarmonic.connect(engineFilter);
      engineHarmonic.start();
      engineOscillators = [lowEngine, engineHarmonic];

      const buffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
      const noise = buffer.getChannelData(0);
      for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 2 - 1) * .16;
      engineNoiseSource = audioContext.createBufferSource();
      engineNoiseSource.buffer = buffer;
      engineNoiseSource.loop = true;
      const noiseFilter = audioContext.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.value = 170;
      engineNoiseGain = audioContext.createGain();
      engineNoiseGain.gain.value = 0;
      engineNoiseSource.connect(noiseFilter);
      noiseFilter.connect(engineNoiseGain);
      engineNoiseGain.connect(masterGain);
      engineNoiseSource.start();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(error => console.warn("Could not resume game audio.", error));
    }
    masterGain.gain.setTargetAtTime(.22, audioContext.currentTime, .04);
    syncEngineAudio();
    return true;
  }

  function syncEngineAudio() {
    if (!audioContext || !engineGain || !engineNoiseGain || !audioEnabled) return;
    const now = audioContext.currentTime;
    const running = state === "running";
    const baseFrequency = playerVehicle === "scooter" ? 92 : playerVehicle === "pakaran" ? 53 : 47;
    const rev = 1 + Math.min(elapsed / 90, .32);
    const frequency = baseFrequency * rev;
    engineOscillators[0].frequency.setTargetAtTime(frequency, now, .12);
    engineOscillators[1].frequency.setTargetAtTime(frequency * (playerVehicle === "scooter" ? 2.03 : 2), now, .12);
    engineFilter.frequency.setTargetAtTime(playerVehicle === "scooter" ? 780 : 540, now, .18);
    engineGain.gain.setTargetAtTime(running ? (playerVehicle === "scooter" ? .2 : .15) : 0, now, running ? .2 : .12);
    engineNoiseGain.gain.setTargetAtTime(running ? (playerVehicle === "scooter" ? .035 : .055) : 0, now, .2);
  }

  function playSoundEffect(kind) {
    if (!initializeAudio()) return;
    const now = audioContext.currentTime;
    const effectGain = audioContext.createGain();
    effectGain.gain.setValueAtTime(.0001, now);
    effectGain.connect(masterGain);

    if (kind === "crash" || kind === "pizza" || kind === "jump") {
      const duration = kind === "crash" ? .42 : kind === "pizza" ? .28 : .62;
      const buffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * duration), audioContext.sampleRate);
      const noise = buffer.getChannelData(0);
      for (let i = 0; i < noise.length; i++) {
        const fade = 1 - i / noise.length;
        noise[i] = (Math.random() * 2 - 1) * fade * (kind === "crash" ? 1 : .55);
      }
      const noiseSource = audioContext.createBufferSource();
      noiseSource.buffer = buffer;
      const filter = audioContext.createBiquadFilter();
      filter.type = kind === "pizza" ? "bandpass" : "lowpass";
      filter.frequency.setValueAtTime(kind === "pizza" ? 1500 : kind === "crash" ? 850 : 520, now);
      filter.frequency.exponentialRampToValueAtTime(kind === "pizza" ? 350 : 180, now + duration);
      const noiseGain = audioContext.createGain();
      noiseGain.gain.setValueAtTime(kind === "crash" ? .7 : .36, now);
      noiseGain.gain.exponentialRampToValueAtTime(.001, now + duration);
      noiseSource.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(effectGain);
      noiseSource.start(now);
      noiseSource.stop(now + duration);
    }

    if (kind === "crash" || kind === "jump" || kind === "pizza") {
      const tone = audioContext.createOscillator();
      tone.type = kind === "pizza" ? "triangle" : "sine";
      const startFrequency = kind === "crash" ? 105 : kind === "jump" ? 145 : 680;
      const endFrequency = kind === "crash" ? 42 : kind === "jump" ? 310 : 1080;
      const duration = kind === "crash" ? .38 : kind === "jump" ? .55 : .2;
      tone.frequency.setValueAtTime(startFrequency, now);
      tone.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
      const toneGain = audioContext.createGain();
      toneGain.gain.setValueAtTime(kind === "crash" ? .72 : .34, now);
      toneGain.gain.exponentialRampToValueAtTime(.001, now + duration);
      tone.connect(toneGain);
      toneGain.connect(effectGain);
      tone.start(now);
      tone.stop(now + duration);
    }

    const effectDuration = kind === "crash" ? .44 : kind === "jump" ? .64 : .3;
    effectGain.gain.setTargetAtTime(.75, now, .012);
    effectGain.gain.setTargetAtTime(.0001, now + effectDuration, .06);
    window.setTimeout(() => effectGain.disconnect(), Math.ceil((effectDuration + .3) * 1000));
  }

  function updateSoundButton() {
    soundToggle.setAttribute("aria-pressed", String(audioEnabled));
    soundToggle.setAttribute("aria-label", audioEnabled ? "Turn sound off" : "Turn sound on");
    soundToggle.title = audioEnabled ? "Turn sound off" : "Turn sound on";
    soundLabel.textContent = audioEnabled ? "SOUND ON" : "SOUND OFF";
  }

  function toggleSound() {
    audioEnabled = !audioEnabled;
    updateSoundButton();
    if (audioEnabled) {
      initializeAudio();
    } else if (audioContext && masterGain) {
      masterGain.gain.setTargetAtTime(0, audioContext.currentTime, .04);
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1);
    renderScale = dpr * .58;
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(width * renderScale));
    canvas.height = Math.max(1, Math.round(height * renderScale));
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    playerX = laneX(playerLane);
    render();
  }

  function roadMetrics() {
    const roadWidth = Math.min(width * 0.7, 450);
    const yaw = cameraMode === "orbit" ? cameraAngle : 0;
    return {
      width: roadWidth,
      laneWidth: roadWidth / LANES,
      bottomCenter: width / 2 + Math.sin(yaw) * width * .12,
      horizonCenter: width / 2 + Math.sin(yaw) * width * .18,
      yaw
    };
  }

  function roadScale(progress) {
    return .26 + .74 * progress;
  }

  function roadCenter(progress, road = roadMetrics()) {
    return road.horizonCenter + (road.bottomCenter - road.horizonCenter) * progress;
  }

  function laneX(lane, progress = 1) {
    const road = roadMetrics();
    return roadCenter(progress, road) + (lane - 1) * road.laneWidth * roadScale(progress) * Math.cos(road.yaw);
  }

  function progressForY(y) {
    const horizon = height * (.32 - cameraPitch * .12);
    return Math.max(0, Math.min(1, (y - horizon) / (height - horizon)));
  }

  function formatScore(value) {
    return String(Math.floor(value)).padStart(5, "0");
  }

  function updateHud() {
    scoreDisplay.textContent = formatScore(score);
    bestDisplay.textContent = formatScore(best);
    speedDisplay.textContent = state === "running" ? String(Math.round(180 + Math.min(score / 20, 120))) : "0";
    stateDisplay.textContent = state === "running" ? "LIVE" : state === "paused" ? "PAUSED" : state === "over" ? "CRASHED" : "READY";
    updateAbilityHud();
  }

  function startGame() {
    score = 0;
    elapsed = 0;
    spawnTimer = 0.5;
    playerLane = 1;
    playerX = laneX(playerLane);
    traffic = [];
    pizzas = [];
    particles = [];
    abilityCooldownRemaining = 0;
    jumpProgress = null;
    state = "running";
    overlay.classList.add("is-hidden");
    pauseIndicator.hidden = true;
    initializeAudio();
    updateHud();
  }

  function endGame() {
    state = "over";
    jumpProgress = null;
    pizzas = [];
    playSoundEffect("crash");
    syncEngineAudio();
    if (score > best) {
      best = score;
      saveBest(best);
      kicker.textContent = "NEW PERSONAL BEST";
    } else {
      kicker.textContent = "RUN COMPLETE";
    }
    title.textContent = "A little too close.";
    copy.textContent = `You made it ${Math.floor(score)} metres. Ready for another run?`;
    buttonLabel.textContent = "Race again";
    overlayHint.textContent = "PRESS ENTER OR A TO RESTART";
    overlay.classList.remove("is-hidden");
    pauseIndicator.hidden = true;
    updateHud();
  }

  function pauseGame() {
    if (state === "running") {
      state = "paused";
      pauseIndicator.hidden = false;
      syncEngineAudio();
    } else if (state === "paused") {
      state = "running";
      pauseIndicator.hidden = true;
      lastTime = performance.now();
      initializeAudio();
    }
    updateHud();
  }

  function changeLane(direction) {
    if (state !== "running") return;
    playerLane = Math.max(0, Math.min(LANES - 1, playerLane + direction));
  }

  function roundedRect(x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#26333b");
    sky.addColorStop(.47, "#626362");
    sky.addColorStop(1, "#38403e");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const horizon = height * .32;
    const glow = ctx.createRadialGradient(width / 2, horizon, 4, width / 2, horizon, width * .44);
    glow.addColorStop(0, "rgba(204, 184, 145, .14)");
    glow.addColorStop(1, "rgba(204, 184, 145, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height * .7);

    ctx.fillStyle = "#20292d";
    const buildingUnit = Math.max(18, width / 28);
    for (let i = 0; i < Math.ceil(width / buildingUnit); i++) {
      const x = i * buildingUnit;
      const seed = (i * 37 + 19) % 53;
      const buildingHeight = 24 + seed * 1.65;
      ctx.fillRect(x, horizon - buildingHeight, buildingUnit - 2, buildingHeight);
      if (i % 3 === 0) {
        ctx.fillStyle = "rgba(195, 175, 129, .2)";
        ctx.fillRect(x + 5, horizon - buildingHeight + 10, 2, 3);
        ctx.fillStyle = "#0b1722";
      }
    }
  }

  function drawRoad() {
    const road = roadMetrics();
    const top = height * (.32 - cameraPitch * .12);
    const bottomCenter = road.bottomCenter;
    const topCenter = road.horizonCenter;
    const topWidth = road.width * .26;
    const bottomLeft = bottomCenter - road.width / 2;
    const bottomRight = bottomCenter + road.width / 2;
    ctx.fillStyle = "#26352e";
    ctx.fillRect(0, top, width, height - top);
    ctx.fillStyle = "rgba(110, 117, 78, .32)";
    for (let i = 0; i < 15; i++) {
      const progress = ((i / 15 + roadOffset / 600) % 1);
      const y = top + progress * (height - top);
      const scale = roadScale(progress);
      const center = roadCenter(progress, road);
      for (const side of [-1, 1]) {
        const x = center + side * road.width * scale * (.57 + (i % 3) * .06);
        ctx.fillRect(x, y, 2 + scale * 5, 1 + scale * 2);
      }
    }

    for (let i = 0; i < 8; i++) {
      const progress = ((i / 8 + roadOffset / 760) % 1);
      const y = top + progress * (height - top);
      const scale = roadScale(progress);
      const center = roadCenter(progress, road);
      const side = i % 2 ? 1 : -1;
      const x = center + side * road.width * scale * (.72 + (i % 3) * .08);
      const trunkHeight = 5 + scale * 24;
      const trunkWidth = 2 + scale * 4;
      ctx.fillStyle = "#272a25";
      ctx.fillRect(x - trunkWidth / 2, y - trunkHeight * .42, trunkWidth, trunkHeight * .42);
      ctx.fillStyle = i % 2 ? "#526346" : "#394d40";
      ctx.beginPath();
      ctx.moveTo(x, y - trunkHeight);
      ctx.lineTo(x - trunkWidth * 1.8, y - trunkHeight * .25);
      ctx.lineTo(x + trunkWidth * 1.8, y - trunkHeight * .25);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#202c35";
    ctx.beginPath();
    ctx.moveTo(topCenter - topWidth / 2, top);
    ctx.lineTo(topCenter + topWidth / 2, top);
    ctx.lineTo(bottomRight, height);
    ctx.lineTo(bottomLeft, height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(56, 232, 226, .15)";
    ctx.beginPath();
    ctx.moveTo(topCenter - topWidth / 2 - 3, top);
    ctx.lineTo(topCenter - topWidth / 2, top);
    ctx.lineTo(bottomLeft, height);
    ctx.lineTo(bottomLeft - 7, height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(193, 159, 126, .55)";
    ctx.beginPath();
    ctx.moveTo(topCenter - topWidth / 2, top);
    ctx.lineTo(topCenter - topWidth / 2 + 2, top);
    ctx.lineTo(bottomLeft + 2, height);
    ctx.lineTo(bottomLeft, height);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(topCenter + topWidth / 2 - 2, top);
    ctx.lineTo(topCenter + topWidth / 2, top);
    ctx.lineTo(bottomRight, height);
    ctx.lineTo(bottomRight - 2, height);
    ctx.closePath();
    ctx.fill();

    for (let lane = 1; lane < LANES; lane++) {
      ctx.fillStyle = "rgba(218, 231, 236, .48)";
      for (let i = 0; i < 12; i++) {
        const progress = ((i / 12 + roadOffset / 430) % 1);
        const y = top + progress * (height - top);
        const scale = roadScale(progress);
        const x = roadCenter(progress, road) + (lane - 1.5) * road.laneWidth * scale;
        const dashHeight = 2 + scale * 16;
        const dashWidth = 1 + scale * 2;
        ctx.fillRect(x - dashWidth / 2, y, dashWidth, dashHeight);
      }
    }

    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 10; i++) {
        const progress = ((i / 10 + roadOffset / 540) % 1);
        const y = top + progress * (height - top);
        const scale = roadScale(progress);
        const center = roadCenter(progress, road);
        const edge = center + side * road.width * scale / 2;
        const postHeight = 3 + scale * 19;
        const postWidth = 2 + scale * 5;
        ctx.fillStyle = i % 2 ? "#9a6f5f" : "#9b9b84";
        ctx.beginPath();
        ctx.moveTo(edge - postWidth / 2, y);
        ctx.lineTo(edge + postWidth / 2, y);
        ctx.lineTo(edge + postWidth / 2, y - postHeight);
        ctx.lineTo(edge - postWidth / 2, y - postHeight);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawLowPolyCar(x, y, carWidth, carHeight, color, isPlayer, viewYaw = 0) {
    const left = x - carWidth / 2;
    const sideView = Math.abs(Math.sin(viewYaw));
    const frontView = Math.cos(viewYaw) < 0;
    const body = isPlayer ? "#596c70" : color;
    const lowerBody = isPlayer ? "#35464a" : "#653c43";
    const glass = "#1c2a30";
    ctx.save();
    if (isPlayer) {
      ctx.shadowColor = "rgba(185, 210, 212, .22)";
      ctx.shadowBlur = 7;
    }

    ctx.fillStyle = "rgba(0, 0, 0, .48)";
    ctx.beginPath();
    ctx.moveTo(left + carWidth * .13, y + carHeight * .45);
    ctx.lineTo(left + carWidth * .87, y + carHeight * .45);
    ctx.lineTo(left + carWidth, y + carHeight * .95);
    ctx.lineTo(left, y + carHeight * .95);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    if (sideView > .62) {
      const direction = Math.sign(Math.sin(viewYaw));
      const sideLength = carHeight * 1.48;
      const sideHeight = carHeight * .58;
      const sideLeft = x - sideLength / 2;
      const sideTop = y + carHeight * .22;
      const flip = direction < 0;
      const point = t => sideLeft + (flip ? 1 - t : t) * sideLength;

      ctx.fillStyle = "#080b0e";
      for (const t of [.22, .76]) {
        ctx.beginPath();
        ctx.ellipse(point(t), sideTop + sideHeight * .79, sideLength * .075, sideHeight * .22, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = lowerBody;
      ctx.beginPath();
      ctx.moveTo(point(.04), sideTop + sideHeight * .6);
      ctx.lineTo(point(.13), sideTop + sideHeight * .42);
      ctx.lineTo(point(.28), sideTop + sideHeight * .38);
      ctx.lineTo(point(.39), sideTop + sideHeight * .08);
      ctx.lineTo(point(.68), sideTop + sideHeight * .08);
      ctx.lineTo(point(.78), sideTop + sideHeight * .4);
      ctx.lineTo(point(.96), sideTop + sideHeight * .48);
      ctx.lineTo(point(1), sideTop + sideHeight * .66);
      ctx.lineTo(point(.94), sideTop + sideHeight * .77);
      ctx.lineTo(point(.09), sideTop + sideHeight * .77);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(point(.31), sideTop + sideHeight * .37);
      ctx.lineTo(point(.41), sideTop + sideHeight * .14);
      ctx.lineTo(point(.65), sideTop + sideHeight * .14);
      ctx.lineTo(point(.75), sideTop + sideHeight * .38);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.moveTo(point(.42), sideTop + sideHeight * .34);
      ctx.lineTo(point(.46), sideTop + sideHeight * .19);
      ctx.lineTo(point(.55), sideTop + sideHeight * .19);
      ctx.lineTo(point(.55), sideTop + sideHeight * .34);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(point(.58), sideTop + sideHeight * .19);
      ctx.lineTo(point(.64), sideTop + sideHeight * .19);
      ctx.lineTo(point(.71), sideTop + sideHeight * .36);
      ctx.lineTo(point(.58), sideTop + sideHeight * .34);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = frontView ? "#d8d1b4" : "#a34349";
      ctx.fillRect(point(frontView ? .94 : .06) - 2, sideTop + sideHeight * .53, 4, sideHeight * .12);
      ctx.fillStyle = "#727c7e";
      ctx.fillRect(sideLeft + sideLength * .38, sideTop + sideHeight * .59, sideLength * .17, Math.max(2, sideHeight * .035));
      ctx.restore();
      return;
    }

    const wheel = Math.max(3, carWidth * .12);
    ctx.fillStyle = "#080b0e";
    ctx.fillRect(left - wheel * .2, y + carHeight * .48, wheel, carHeight * .31);
    ctx.fillRect(left + carWidth - wheel * .8, y + carHeight * .48, wheel, carHeight * .31);

    if (sideView > .12) {
      const direction = Math.sign(Math.sin(viewYaw));
      const anchor = direction > 0 ? left + carWidth * .8 : left + carWidth * .2;
      const outer = anchor + direction * carWidth * .42 * sideView;
      ctx.fillStyle = lowerBody;
      ctx.beginPath();
      ctx.moveTo(anchor, y + carHeight * .32);
      ctx.lineTo(outer, y + carHeight * .4);
      ctx.lineTo(outer, y + carHeight * .78);
      ctx.lineTo(anchor, y + carHeight * .9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.moveTo(anchor + direction * carWidth * .04, y + carHeight * .4);
      ctx.lineTo(outer - direction * carWidth * .04, y + carHeight * .45);
      ctx.lineTo(outer - direction * carWidth * .04, y + carHeight * .54);
      ctx.lineTo(anchor + direction * carWidth * .04, y + carHeight * .52);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = lowerBody;
    ctx.beginPath();
    ctx.moveTo(left + carWidth * .16, y + carHeight * .3);
    ctx.lineTo(left + carWidth * .84, y + carHeight * .3);
    ctx.lineTo(left + carWidth * .95, y + carHeight * .72);
    ctx.lineTo(left + carWidth * .89, y + carHeight * .91);
    ctx.lineTo(left + carWidth * .11, y + carHeight * .91);
    ctx.lineTo(left + carWidth * .05, y + carHeight * .72);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(left + carWidth * .13, y + carHeight * .63);
    ctx.lineTo(left + carWidth * .19, y + carHeight * .35);
    ctx.lineTo(left + carWidth * .31, y + carHeight * .08);
    ctx.lineTo(left + carWidth * .69, y + carHeight * .08);
    ctx.lineTo(left + carWidth * .81, y + carHeight * .35);
    ctx.lineTo(left + carWidth * .87, y + carHeight * .63);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = glass;
    ctx.beginPath();
    if (frontView) {
      ctx.moveTo(left + carWidth * .22, y + carHeight * .35);
      ctx.lineTo(left + carWidth * .31, y + carHeight * .14);
      ctx.lineTo(left + carWidth * .69, y + carHeight * .14);
      ctx.lineTo(left + carWidth * .78, y + carHeight * .35);
    } else {
      ctx.moveTo(left + carWidth * .19, y + carHeight * .59);
      ctx.lineTo(left + carWidth * .25, y + carHeight * .38);
      ctx.lineTo(left + carWidth * .75, y + carHeight * .38);
      ctx.lineTo(left + carWidth * .81, y + carHeight * .59);
    }
    ctx.closePath();
    ctx.fill();

    if (frontView) {
      ctx.fillStyle = "#a9b5b4";
      ctx.fillRect(left + carWidth * .3, y + carHeight * .73, carWidth * .4, Math.max(2, carHeight * .04));
      ctx.fillStyle = "#d8d1b4";
      ctx.fillRect(left + carWidth * .1, y + carHeight * .67, carWidth * .2, Math.max(2, carHeight * .07));
      ctx.fillRect(left + carWidth * .7, y + carHeight * .67, carWidth * .2, Math.max(2, carHeight * .07));
    } else {
      ctx.fillStyle = "#a34349";
      ctx.fillRect(left + carWidth * .1, y + carHeight * .67, carWidth * .2, Math.max(2, carHeight * .09));
      ctx.fillRect(left + carWidth * .7, y + carHeight * .67, carWidth * .2, Math.max(2, carHeight * .09));
      ctx.fillStyle = "#727c7e";
      ctx.fillRect(left + carWidth * .29, y + carHeight * .82, carWidth * .42, Math.max(2, carHeight * .04));
    }
    ctx.restore();
  }

  function drawScooter(x, y, vehicleWidth, vehicleHeight, viewYaw = 0) {
    const sideView = Math.abs(Math.sin(viewYaw));
    const frontView = Math.cos(viewYaw) < 0;
    const sideLength = vehicleHeight * 1.48;
    const sideTop = y + vehicleHeight * .15;
    const sideHeight = vehicleHeight * .67;
    const sideLeft = x - sideLength / 2;
    const flip = Math.sin(viewYaw) < 0;
    const point = t => sideLeft + (flip ? 1 - t : t) * sideLength;
    const wheelRadius = Math.max(5, vehicleWidth * .105);

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, .48)";
    ctx.beginPath();
    ctx.ellipse(x, y + vehicleHeight * .91, vehicleWidth * .48, vehicleHeight * .07, 0, 0, Math.PI * 2);
    ctx.fill();

    if (sideView > .62) {
      ctx.fillStyle = "#101517";
      for (const t of [.22, .78]) {
        ctx.beginPath();
        ctx.ellipse(point(t), sideTop + sideHeight * .82, wheelRadius, wheelRadius * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = "#92999a";
      ctx.lineWidth = Math.max(2, vehicleWidth * .035);
      ctx.beginPath();
      ctx.moveTo(point(.22), sideTop + sideHeight * .78);
      ctx.lineTo(point(.4), sideTop + sideHeight * .57);
      ctx.lineTo(point(.73), sideTop + sideHeight * .77);
      ctx.lineTo(point(.78), sideTop + sideHeight * .82);
      ctx.stroke();

      ctx.fillStyle = "#637377";
      ctx.beginPath();
      ctx.moveTo(point(.32), sideTop + sideHeight * .54);
      ctx.lineTo(point(.42), sideTop + sideHeight * .44);
      ctx.lineTo(point(.68), sideTop + sideHeight * .45);
      ctx.lineTo(point(.79), sideTop + sideHeight * .57);
      ctx.lineTo(point(.75), sideTop + sideHeight * .69);
      ctx.lineTo(point(.48), sideTop + sideHeight * .7);
      ctx.lineTo(point(.38), sideTop + sideHeight * .65);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#25292a";
      ctx.beginPath();
      ctx.moveTo(point(.27), sideTop + sideHeight * .48);
      ctx.lineTo(point(.58), sideTop + sideHeight * .46);
      ctx.lineTo(point(.61), sideTop + sideHeight * .4);
      ctx.lineTo(point(.42), sideTop + sideHeight * .39);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#a9b5b4";
      ctx.fillRect(point(.72) - 2, sideTop + sideHeight * .45, 4, sideHeight * .17);
      ctx.fillStyle = "#a34349";
      ctx.fillRect(point(frontView ? .2 : .8) - 2, sideTop + sideHeight * .61, 4, sideHeight * .1);

      drawRider(x + (flip ? -1 : 1) * vehicleWidth * .06, sideTop, vehicleWidth, sideHeight, true);
    } else {
      const rear = !frontView;
      const bodyX = x - vehicleWidth * .35;
      const bodyY = y + vehicleHeight * .52;
      const bodyW = vehicleWidth * .7;
      const bodyH = vehicleHeight * .38;

      ctx.fillStyle = "#101517";
      ctx.beginPath();
      ctx.ellipse(x, y + vehicleHeight * .81, vehicleWidth * .13, vehicleHeight * .075, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#637377";
      ctx.beginPath();
      ctx.moveTo(bodyX + bodyW * .15, bodyY + bodyH * .25);
      ctx.lineTo(bodyX + bodyW * .85, bodyY + bodyH * .25);
      ctx.lineTo(bodyX + bodyW, bodyY + bodyH * .85);
      ctx.lineTo(bodyX + bodyW * .78, bodyY + bodyH);
      ctx.lineTo(bodyX + bodyW * .22, bodyY + bodyH);
      ctx.lineTo(bodyX, bodyY + bodyH * .85);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#303638";
      ctx.fillRect(x - vehicleWidth * .21, y + vehicleHeight * .72, vehicleWidth * .42, Math.max(3, vehicleHeight * .04));
      ctx.fillStyle = rear ? "#a34349" : "#c2bfae";
      ctx.fillRect(x - vehicleWidth * .2, y + vehicleHeight * .85, vehicleWidth * .4, Math.max(3, vehicleHeight * .06));
      ctx.fillStyle = "#aaa89d";
      ctx.fillRect(x - vehicleWidth * .1, y + vehicleHeight * .92, vehicleWidth * .2, Math.max(2, vehicleHeight * .025));

      drawRider(x, y + vehicleHeight * .12, vehicleWidth, vehicleHeight * .62, false);
    }

    ctx.restore();
  }

  function drawPakaranCar(x, y, carWidth, carHeight, viewYaw = 0) {
    const sideView = Math.abs(Math.sin(viewYaw));
    const facingFront = Math.cos(viewYaw) < 0;
    const left = x - carWidth / 2;
    const body = "#89908a";
    const shadowBody = "#535b58";
    const glass = "#25343a";

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, .52)";
    ctx.beginPath();
    ctx.moveTo(left + carWidth * .1, y + carHeight * .42);
    ctx.lineTo(left + carWidth * .9, y + carHeight * .42);
    ctx.lineTo(left + carWidth, y + carHeight * .91);
    ctx.lineTo(left, y + carHeight * .91);
    ctx.closePath();
    ctx.fill();

    if (sideView > .62) {
      const direction = Math.sign(Math.sin(viewYaw));
      const length = carHeight * 1.65;
      const top = y + carHeight * .2;
      const sideHeight = carHeight * .6;
      const sideLeft = x - length / 2;
      const point = t => sideLeft + (direction < 0 ? 1 - t : t) * length;

      ctx.fillStyle = "#101517";
      for (const t of [.2, .78]) {
        ctx.beginPath();
        ctx.ellipse(point(t), top + sideHeight * .82, carWidth * .1, carHeight * .055, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = shadowBody;
      ctx.beginPath();
      ctx.moveTo(point(.04), top + sideHeight * .55);
      ctx.lineTo(point(.11), top + sideHeight * .32);
      ctx.lineTo(point(.26), top + sideHeight * .28);
      ctx.lineTo(point(.36), top + sideHeight * .05);
      ctx.lineTo(point(.73), top + sideHeight * .05);
      ctx.lineTo(point(.82), top + sideHeight * .31);
      ctx.lineTo(point(.96), top + sideHeight * .44);
      ctx.lineTo(point(1), top + sideHeight * .72);
      ctx.lineTo(point(.9), top + sideHeight * .82);
      ctx.lineTo(point(.08), top + sideHeight * .82);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(point(.12), top + sideHeight * .53);
      ctx.lineTo(point(.19), top + sideHeight * .35);
      ctx.lineTo(point(.34), top + sideHeight * .33);
      ctx.lineTo(point(.4), top + sideHeight * .11);
      ctx.lineTo(point(.69), top + sideHeight * .11);
      ctx.lineTo(point(.77), top + sideHeight * .38);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.moveTo(point(.42), top + sideHeight * .3);
      ctx.lineTo(point(.45), top + sideHeight * .15);
      ctx.lineTo(point(.55), top + sideHeight * .15);
      ctx.lineTo(point(.55), top + sideHeight * .3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(point(.58), top + sideHeight * .15);
      ctx.lineTo(point(.67), top + sideHeight * .15);
      ctx.lineTo(point(.73), top + sideHeight * .32);
      ctx.lineTo(point(.58), top + sideHeight * .3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#a34349";
      ctx.fillRect(point(facingFront ? .95 : .04) - 2, top + sideHeight * .52, 4, sideHeight * .11);
      ctx.restore();
      return;
    }

    const roofTop = y + carHeight * .07;
    const glassTop = y + carHeight * .24;
    const glassBottom = y + carHeight * .49;

    ctx.fillStyle = "#101517";
    ctx.fillRect(left + carWidth * .11, y + carHeight * .54, carWidth * .14, carHeight * .3);
    ctx.fillRect(left + carWidth * .75, y + carHeight * .54, carWidth * .14, carHeight * .3);
    ctx.fillStyle = shadowBody;
    ctx.beginPath();
    ctx.moveTo(left + carWidth * .13, y + carHeight * .22);
    ctx.lineTo(left + carWidth * .87, y + carHeight * .22);
    ctx.lineTo(left + carWidth * .97, y + carHeight * .73);
    ctx.lineTo(left + carWidth * .9, y + carHeight * .9);
    ctx.lineTo(left + carWidth * .1, y + carHeight * .9);
    ctx.lineTo(left + carWidth * .03, y + carHeight * .73);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(left + carWidth * .16, y + carHeight * .57);
    ctx.lineTo(left + carWidth * .2, y + carHeight * .32);
    ctx.lineTo(left + carWidth * .28, roofTop);
    ctx.lineTo(left + carWidth * .72, roofTop);
    ctx.lineTo(left + carWidth * .8, y + carHeight * .32);
    ctx.lineTo(left + carWidth * .84, y + carHeight * .57);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(left + carWidth * .26, glassBottom);
    ctx.lineTo(left + carWidth * .3, y + carHeight * .32);
    ctx.lineTo(left + carWidth * .36, y + carHeight * .13);
    ctx.lineTo(left + carWidth * .64, y + carHeight * .13);
    ctx.lineTo(left + carWidth * .7, y + carHeight * .32);
    ctx.lineTo(left + carWidth * .74, glassBottom);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#f2ead0";
    ctx.font = `600 ${Math.max(6, Math.min(9, carWidth * .085))}px "DM Mono", Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#172126";
    ctx.lineWidth = 1.5;
    ctx.strokeText("Heaven's Pg", x, y + carHeight * .4, carWidth * .68);
    ctx.fillText("Heaven's Pg", x, y + carHeight * .4, carWidth * .68);

    ctx.fillStyle = facingFront ? "#d2cbb4" : "#a34349";
    ctx.fillRect(left + carWidth * .1, y + carHeight * .68, carWidth * .18, carHeight * .1);
    ctx.fillRect(left + carWidth * .72, y + carHeight * .68, carWidth * .18, carHeight * .1);
    ctx.fillStyle = "#747a77";
    ctx.fillRect(left + carWidth * .36, y + carHeight * .8, carWidth * .28, Math.max(2, carHeight * .04));
    ctx.restore();
  }

  function drawRider(x, y, vehicleWidth, vehicleHeight, sideView) {
    const scale = vehicleWidth;
    const torsoWidth = scale * (sideView ? .29 : .44);
    const torsoHeight = vehicleHeight * .38;
    const torsoTop = y + vehicleHeight * .13;

    ctx.fillStyle = "#12171a";
    ctx.beginPath();
    ctx.ellipse(x, torsoTop + torsoHeight * 1.3, torsoWidth * .62, vehicleHeight * .045, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#244b68";
    ctx.beginPath();
    ctx.moveTo(x - torsoWidth / 2, torsoTop + torsoHeight * .25);
    ctx.lineTo(x - torsoWidth * .34, torsoTop);
    ctx.lineTo(x + torsoWidth * .34, torsoTop);
    ctx.lineTo(x + torsoWidth / 2, torsoTop + torsoHeight * .72);
    ctx.lineTo(x + torsoWidth * .31, torsoTop + torsoHeight);
    ctx.lineTo(x - torsoWidth * .31, torsoTop + torsoHeight);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#a44845";
    ctx.fillRect(x - torsoWidth * .45, torsoTop + torsoHeight * .44, torsoWidth * .9, torsoHeight * .13);
    ctx.fillStyle = "#d5b398";
    ctx.beginPath();
    ctx.ellipse(x, torsoTop - vehicleHeight * .035, torsoWidth * .27, vehicleHeight * .075, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#353a3c";
    ctx.beginPath();
    ctx.arc(x, torsoTop - vehicleHeight * .055, torsoWidth * .32, Math.PI, Math.PI * 2);
    ctx.lineTo(x + torsoWidth * .3, torsoTop - vehicleHeight * .025);
    ctx.lineTo(x - torsoWidth * .3, torsoTop - vehicleHeight * .025);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#d5b398";
    ctx.lineWidth = Math.max(2, scale * .045);
    ctx.beginPath();
    ctx.moveTo(x - torsoWidth * .42, torsoTop + torsoHeight * .2);
    ctx.lineTo(x - torsoWidth * .7, torsoTop + torsoHeight * .53);
    ctx.lineTo(x + torsoWidth * .56, torsoTop + torsoHeight * .72);
    ctx.moveTo(x + torsoWidth * .42, torsoTop + torsoHeight * .2);
    ctx.lineTo(x + torsoWidth * .68, torsoTop + torsoHeight * .53);
    ctx.lineTo(x + torsoWidth * .56, torsoTop + torsoHeight * .72);
    ctx.stroke();
  }

  function updateVehiclePicker() {
    sedanOption.setAttribute("aria-pressed", String(pickerSelection === "sedan"));
    scooterOption.setAttribute("aria-pressed", String(pickerSelection === "scooter"));
    pakaranOption.setAttribute("aria-pressed", String(pickerSelection === "pakaran"));
  }

  function setVehicle(vehicle) {
    playerVehicle = vehicle;
    if (vehicle !== "pakaran") jumpProgress = null;
    pickerSelection = vehicle;
    const vehicleNames = {
      sedan: "SEDAN",
      scooter: "TVS JUPITER · NITHIN",
      pakaran: "PAKARAN"
    };
    vehicleLabel.textContent = vehicleNames[playerVehicle];
    vehicleSwitchButton.setAttribute("aria-label", "Choose vehicle");
    vehicleSwitchButton.title = `${vehicleNames[playerVehicle]} (press E to choose)`;
    updateVehiclePicker();
    syncEngineAudio();
    updateAbilityHud();
  }

  function updateAbilityHud() {
    if (!specialAbilityButton) return;
    const hasAbility = playerVehicle === "scooter" || playerVehicle === "pakaran";
    const isPizza = playerVehicle === "scooter";
    specialAbilityButton.hidden = !hasAbility;
    if (!hasAbility) return;
    abilityName.textContent = isPizza ? "PIZZA SHOT" : "360 JUMP";
    abilityIcon.textContent = isPizza ? "✦" : "↻";
    const coolingDown = abilityCooldownRemaining > 0;
    abilityCooldown.textContent = coolingDown ? `${Math.ceil(abilityCooldownRemaining)}s` : "READY";
    specialAbilityButton.disabled = state !== "running" || coolingDown;
    specialAbilityButton.setAttribute("aria-label", `${isPizza ? "Pizza shot" : "360 jump"}${coolingDown ? `, ${Math.ceil(abilityCooldownRemaining)} seconds cooldown` : ""}`);
  }

  function movePickerSelection(direction) {
    const currentIndex = VEHICLES.indexOf(pickerSelection);
    pickerSelection = VEHICLES[(currentIndex + direction + VEHICLES.length) % VEHICLES.length];
    updateVehiclePicker();
    const option = pickerSelection === "scooter" ? scooterOption : pickerSelection === "pakaran" ? pakaranOption : sedanOption;
    option.focus();
  }

  function openVehiclePicker() {
    if (pickerOpen) return;
    pickerOpen = true;
    resumeAfterPicker = state === "running";
    if (resumeAfterPicker) {
      state = "paused";
      pauseIndicator.hidden = true;
      syncEngineAudio();
      updateHud();
    }
    pickerSelection = playerVehicle;
    updateVehiclePicker();
    vehiclePicker.hidden = false;
    vehicleSwitchButton.setAttribute("aria-expanded", "true");
    const activeOption = playerVehicle === "scooter" ? scooterOption : playerVehicle === "pakaran" ? pakaranOption : sedanOption;
    activeOption.focus();
  }

  function closeVehiclePicker() {
    if (!pickerOpen) return;
    pickerOpen = false;
    vehiclePicker.hidden = true;
    vehicleSwitchButton.setAttribute("aria-expanded", "false");
    if (resumeAfterPicker && state === "paused") {
      state = "running";
      lastTime = performance.now();
      initializeAudio();
    }
    resumeAfterPicker = false;
    updateHud();
    vehicleSwitchButton.focus();
  }

  function chooseVehicle(vehicle) {
    setVehicle(vehicle);
    closeVehiclePicker();
  }

  function toggleVehiclePicker() {
    if (pickerOpen) {
      closeVehiclePicker();
    } else {
      openVehiclePicker();
    }
  }

  function spawnTraffic() {
    const availableLanes = elapsed < 2 ? [0, 1, 2].filter(lane => lane !== playerLane) : [0, 1, 2];
    const openLanes = availableLanes.filter(lane => !traffic.some(car => car.lane === lane && car.y < height * .47));
    if (!openLanes.length) return;
    const lane = openLanes[Math.floor(Math.random() * openLanes.length)];
    traffic.push({ lane, y: height * (.32 - cameraPitch * .12), color: colors[Math.floor(Math.random() * colors.length)], width: Math.max(24, roadMetrics().laneWidth * .68), height: Math.max(38, height * .14) });
  }

  function makeCrashParticles(x, y) {
    particles = Array.from({ length: 22 }, () => ({
      x, y,
      vx: (Math.random() - .5) * 260,
      vy: (Math.random() - .7) * 250,
      life: .45 + Math.random() * .5,
      color: Math.random() > .5 ? "#38e8e2" : "#ff6681"
    }));
  }

  function activateAbility() {
    if (state !== "running" || abilityCooldownRemaining > 0) return;
    const playerY = height * (.72 + cameraPitch * .025);
    if (playerVehicle === "scooter") {
      pizzas.push({ lane: playerLane, y: playerY - height * .08, speed: Math.max(430, height * 1.2) });
      playSoundEffect("pizza");
    } else if (playerVehicle === "pakaran") {
      jumpProgress = 0;
      playSoundEffect("jump");
      const target = traffic
        .filter(car => car.lane === playerLane && car.y < playerY && car.y > playerY - height * .58)
        .sort((a, b) => b.y - a.y)[0];
      if (target) {
        traffic = traffic.filter(car => car !== target);
        makeCrashParticles(laneX(target.lane, progressForY(target.y)), target.y);
        playSoundEffect("crash");
      }
    } else {
      return;
    }
    abilityCooldownRemaining = 40;
    updateHud();
  }

  function update(dt) {
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 360 * dt;
      particle.life -= dt;
    }
    particles = particles.filter(particle => particle.life > 0);
    if (state !== "running") return;
    audioUpdateTimer -= dt;
    if (audioUpdateTimer <= 0) {
      syncEngineAudio();
      audioUpdateTimer = .15;
    }
    abilityCooldownRemaining = Math.max(0, abilityCooldownRemaining - dt);
    if (jumpProgress !== null) {
      jumpProgress += dt / 1.15;
      if (jumpProgress >= 1) jumpProgress = null;
    }
    elapsed += dt;
    score += dt * (48 + Math.min(elapsed * 1.4, 80));
    const speed = 190 + Math.min(elapsed * 12, 210);
    roadOffset = (roadOffset + speed * dt) % 53;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTraffic();
      spawnTimer = Math.max(.46, .95 - elapsed * .012) + Math.random() * .32;
    }

    const targetX = laneX(playerLane);
    playerX += (targetX - playerX) * Math.min(1, dt * 13);
    const playerY = height * (.72 + cameraPitch * .025);
    const carHeight = Math.max(68, height * .2);

    for (const car of traffic) {
      car.y += speed * dt;
    }
    for (const pizza of pizzas) {
      pizza.y -= pizza.speed * dt;
      const hitIndex = traffic.findIndex(car => {
        if (car.lane !== pizza.lane) return false;
        const progress = progressForY(car.y);
        const trafficHeight = car.height * (.28 + progress * .72);
        return pizza.y >= car.y - trafficHeight * .55 && pizza.y <= car.y + trafficHeight * .45;
      });
      if (hitIndex !== -1) {
        const [hitCar] = traffic.splice(hitIndex, 1);
        makeCrashParticles(laneX(hitCar.lane, progressForY(hitCar.y)), hitCar.y);
        playSoundEffect("crash");
        pizza.hit = true;
      }
    }
    pizzas = pizzas.filter(pizza => !pizza.hit && pizza.y > height * .28);
    for (const car of traffic) {
      const progress = progressForY(car.y);
      const trafficHeight = car.height * (.28 + progress * .72);
      const sameLane = car.lane === playerLane;
      if (jumpProgress === null && sameLane && car.y + trafficHeight > playerY + carHeight * .25 && car.y < playerY + carHeight * .72) {
        makeCrashParticles(playerX, playerY);
        endGame();
        break;
      }
    }
    traffic = traffic.filter(car => car.y < height + car.height);
    updateHud();
  }

  function render() {
    if (!width || !height) return;
    drawBackground();
    drawRoad();
    for (const car of traffic) {
      const progress = progressForY(car.y);
      const scale = roadScale(progress);
      const yaw = roadMetrics().yaw;
      drawLowPolyCar(
        laneX(car.lane, progress),
        car.y - car.height * scale * .55,
        car.width * scale * (.55 + Math.abs(Math.sin(yaw)) * .45),
        car.height * scale,
        car.color,
        false,
        yaw
      );
    }
    for (const pizza of pizzas) {
      const progress = progressForY(pizza.y);
      const x = laneX(pizza.lane, progress);
      const size = 5 + progress * 9;
      ctx.save();
      ctx.translate(x, pizza.y);
      ctx.fillStyle = "#d9a24e";
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4d28a";
      ctx.beginPath();
      ctx.arc(0, 0, size * .72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b84d42";
      for (const [px, py] of [[-.28, -.2], [.24, -.25], [.12, .3]]) {
        ctx.beginPath();
        ctx.arc(px * size, py * size, size * .12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (state !== "over") {
      const playerWidth = Math.max(48, roadMetrics().laneWidth * .78);
      const yaw = roadMetrics().yaw;
      const projectedWidth = playerWidth * (Math.abs(Math.cos(yaw)) * .7 + Math.abs(Math.sin(yaw)) * 1.05);
      const basePlayerY = height * (.72 + cameraPitch * .025);
      const playerHeight = Math.max(68, height * .2);
      if (playerVehicle === "scooter") {
        drawScooter(playerX, basePlayerY, projectedWidth, playerHeight, yaw);
      } else if (playerVehicle === "pakaran") {
        if (jumpProgress === null) {
          drawPakaranCar(playerX, basePlayerY, projectedWidth, playerHeight, yaw);
        } else {
          const jumpHeight = Math.sin(jumpProgress * Math.PI) * height * .2;
          ctx.save();
          ctx.translate(playerX, basePlayerY - jumpHeight);
          ctx.scale(1, Math.cos(jumpProgress * Math.PI * 2));
          drawPakaranCar(0, -playerHeight / 2, projectedWidth, playerHeight, yaw);
          ctx.restore();
        }
      } else {
        drawLowPolyCar(playerX, basePlayerY, projectedWidth, playerHeight, "#596c70", true, yaw);
      }
    }
    for (const particle of particles) {
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, 4, 4);
    }
    ctx.globalAlpha = 1;
    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * .25, width / 2, height / 2, height * .75);
    vignette.addColorStop(.6, "rgba(2, 8, 14, 0)");
    vignette.addColorStop(1, "rgba(2, 8, 14, .55)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000 || 0, .05);
    lastTime = now;
    pollGamepad(dt);
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function pollGamepad(dt) {
    if (!navigator.getGamepads) return;
    const pad = Array.from(navigator.getGamepads()).find(Boolean);
    if (!pad) return;
    const left = pad.buttons[14]?.pressed;
    const right = pad.buttons[15]?.pressed;
    const start = pad.buttons[0]?.pressed;
    const pause = pad.buttons[9]?.pressed;
    const cameraLeft = pad.buttons[4]?.pressed;
    const cameraRight = pad.buttons[5]?.pressed;
    const changeVehicle = pad.buttons[3]?.pressed;
    const back = pad.buttons[1]?.pressed;
    const ability = pad.buttons[2]?.pressed;
    const steerX = pad.axes[0] || 0;
    const cameraX = pad.axes[2] || 0;
    const cameraY = pad.axes[3] || 0;

    if (pickerOpen) {
      if ((left && !previousPad.left) || (right && !previousPad.right)) {
        movePickerSelection(right && !previousPad.right ? 1 : -1);
      }
      if (start && !previousPad.start) chooseVehicle(pickerSelection);
      if (back && !previousPad.back) closeVehiclePicker();
      previousPad = { left, right, start, pause, cameraLeft, cameraRight, changeVehicle, back, ability };
      return;
    }

    if (left && !previousPad.left) changeLane(-1);
    if (right && !previousPad.right) changeLane(1);
    if (start && !previousPad.start) {
      if (state === "ready" || state === "over") startGame();
    }
    if (pause && !previousPad.pause) pauseGame();
    if (changeVehicle && !previousPad.changeVehicle) openVehiclePicker();
    if (ability && !previousPad.ability) activateAbility();
    if (cameraLeft && !previousPad.cameraLeft) rotateCamera(-.18);
    if (cameraRight && !previousPad.cameraRight) rotateCamera(.18);
    const stickDirection = Math.abs(steerX) > .55 ? Math.sign(steerX) : 0;
    if (stickDirection && stickDirection !== previousPad.stickDirection) {
      changeLane(stickDirection);
    }
    if (cameraMode === "orbit" && (Math.abs(cameraX) > .18 || Math.abs(cameraY) > .18)) {
      cameraAngle = Math.max(-1.25, Math.min(1.25, cameraAngle + cameraX * dt * 2.5));
      cameraPitch = Math.max(-.55, Math.min(.7, cameraPitch + cameraY * dt * 1.4));
    }
    previousPad = { left, right, start, pause, cameraLeft, cameraRight, changeVehicle, back, ability, stickDirection };
  }

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "enter"].includes(key)) event.preventDefault();
    if (pickerOpen) {
      if (key === "escape" || key === "e") {
        closeVehiclePicker();
      } else if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
        movePickerSelection(key === "arrowleft" || key === "arrowup" ? -1 : 1);
      } else if (key === "enter" || key === " ") {
        chooseVehicle(pickerSelection);
      }
      return;
    }
    if (key === "arrowleft" || key === "a") changeLane(-1);
    if (key === "arrowright" || key === "d") changeLane(1);
    if (key === "q") rotateCamera(-.16);
    if (key === "e") openVehiclePicker();
    if (key === " " && !event.repeat) activateAbility();
    if (key === "c") resetCamera();
    if (key === "enter" && (state === "ready" || state === "over")) startGame();
    if (key === "p" || key === "escape") {
      if (state === "running" || state === "paused") pauseGame();
    }
  }

  function onCanvasSteeringPointerDown(event) {
    if (state !== "running" || cameraMode === "orbit" || !event.isPrimary) return;
    steeringPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  }

  function onCanvasSteeringPointerUp(event) {
    if (!steeringPointer || event.pointerId !== steeringPointer.id) return;
    const start = steeringPointer;
    steeringPointer = null;
    if (state !== "running" || cameraMode === "orbit") return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const swipeThreshold = Math.max(24, Math.min(64, width * .07));
    if (Math.abs(deltaX) >= swipeThreshold && Math.abs(deltaX) > Math.abs(deltaY)) {
      changeLane(deltaX < 0 ? -1 : 1);
    } else if (Math.abs(deltaX) < 12 && Math.abs(deltaY) < 18) {
      const rect = canvas.getBoundingClientRect();
      changeLane(event.clientX < rect.left + rect.width / 2 ? -1 : 1);
    }
  }

  function onCanvasSteeringPointerCancel(event) {
    if (steeringPointer && event.pointerId === steeringPointer.id) steeringPointer = null;
  }

  function updateCameraControls() {
    const orbiting = cameraMode === "orbit";
    cameraModeButton.textContent = orbiting ? "ORBIT CAM" : "CHASE CAM";
    cameraModeButton.setAttribute("aria-label", orbiting ? "Switch to chase camera" : "Switch to orbit camera");
    cameraHint.textContent = orbiting ? "DRAG · RIGHT STICK" : "ORBIT CAM · DRAG / RIGHT STICK";
  }

  function rotateCamera(amount) {
    cameraMode = "orbit";
    cameraAngle = Math.max(-1.25, Math.min(1.25, cameraAngle + amount));
    updateCameraControls();
  }

  function resetCamera() {
    cameraMode = "chase";
    cameraAngle = 0;
    cameraPitch = 0;
    updateCameraControls();
  }

  function onCameraPointerDown(event) {
    if (cameraMode !== "orbit") return;
    cameraDragX = event.clientX;
    cameraDragY = event.clientY;
    cameraPointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
  }

  function onCameraPointerMove(event) {
    if (cameraDragX === null || event.pointerId !== cameraPointerId) return;
    const deltaX = event.clientX - cameraDragX;
    const deltaY = event.clientY - cameraDragY;
    cameraDragX = event.clientX;
    cameraDragY = event.clientY;
    cameraAngle = Math.max(-1.25, Math.min(1.25, cameraAngle + deltaX / Math.max(width, 1) * 2.5));
    cameraPitch = Math.max(-.55, Math.min(.7, cameraPitch + deltaY / Math.max(height, 1) * 1.8));
  }

  function onCameraPointerUp(event) {
    if (event.pointerId !== cameraPointerId) return;
    cameraDragX = null;
    cameraDragY = null;
    cameraPointerId = null;
  }

  startButton.addEventListener("click", startGame);
  soundToggle.addEventListener("click", toggleSound);
  specialAbilityButton.addEventListener("click", activateAbility);
  vehicleSwitchButton.addEventListener("click", toggleVehiclePicker);
  sedanOption.addEventListener("click", () => chooseVehicle("sedan"));
  scooterOption.addEventListener("click", () => chooseVehicle("scooter"));
  pakaranOption.addEventListener("click", () => chooseVehicle("pakaran"));
  cameraModeButton.addEventListener("click", () => {
    cameraMode = cameraMode === "chase" ? "orbit" : "chase";
    if (cameraMode === "chase") {
      cameraAngle = 0;
      cameraPitch = 0;
    }
    updateCameraControls();
  });
  document.querySelector("#camera-left").addEventListener("click", () => rotateCamera(-.18));
  document.querySelector("#camera-right").addEventListener("click", () => rotateCamera(.18));
  document.querySelector("#camera-reset").addEventListener("click", resetCamera);
  window.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("pointerdown", onCanvasSteeringPointerDown);
  canvas.addEventListener("pointerdown", onCameraPointerDown);
  canvas.addEventListener("pointermove", onCameraPointerMove);
  canvas.addEventListener("pointerup", onCanvasSteeringPointerUp);
  canvas.addEventListener("pointercancel", onCanvasSteeringPointerCancel);
  canvas.addEventListener("pointerup", onCameraPointerUp);
  canvas.addEventListener("pointercancel", onCameraPointerUp);
  window.addEventListener("resize", resize);
  window.addEventListener("blur", () => {
    if (state === "running") pauseGame();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "running") pauseGame();
  });

  resize();
  updateCameraControls();
  updateSoundButton();
  updateHud();
  requestAnimationFrame(frame);
})();
