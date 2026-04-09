
    // ─── CANVAS SETUP ──────────────────────────────────────────────
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const W = 480, H = 720;

    // ─── RESPONSIVE SCALING ───────────────────────────────────────
    let canvasScale = 1;

    function resizeGame() {
      const windowW = window.innerWidth;
      const windowH = window.innerHeight;
      const aspectRatio = W / H;
      let displayW, displayH;
      if (windowW / windowH < aspectRatio) {
        displayW = windowW;
        displayH = windowW / aspectRatio;
      } else {
        displayH = windowH;
        displayW = windowH * aspectRatio;
      }
      const wrapper = document.getElementById('gameWrapper');
      wrapper.style.width = displayW + 'px';
      wrapper.style.height = displayH + 'px';
      canvasScale = displayW / W;
    }

    function screenToCanvas(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / canvasScale,
        y: (clientY - rect.top) / canvasScale
      };
    }

    window.addEventListener('resize', resizeGame);
    document.addEventListener('fullscreenchange', () => setTimeout(resizeGame, 100));
    resizeGame();

    // ─── GAME STATE ────────────────────────────────────────────────
    let gameRunning = false;
    let isPaused = false;

    function togglePause() {
      if (!gameRunning) return;
      isPaused = !isPaused;

      const pauseOverlay = document.getElementById('pauseOverlay');
      if (isPaused) {
        pauseOverlay.style.display = 'flex';
        if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
      } else {
        pauseOverlay.style.display = 'none';
        lastFrameTime = performance.now();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      }
    }

    let score = 0;
    let kills = 0;
    let wave = 1;
    let frameCount = 0;
    let globalLaserTimer = 400;
    let animId = null;

    // ─── INPUT ─────────────────────────────────────────────────────
    const keys = {};
    let touchDX = 0, touchDY = 0, touchActive = false;
    let touchId = null, touchLastX = 0, touchLastY = 0;
    let joystickBaseX = 0, joystickBaseY = 0, joystickKnobX = 0, joystickKnobY = 0;
    let joystickVisible = false;

    document.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && e.preventDefault(); if (e.code === 'Escape') togglePause(); });
    document.addEventListener('keyup', e => { keys[e.code] = false; });

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      if (touchId === null) {
        const t = e.changedTouches[0];
        touchId = t.identifier;
        const pos = screenToCanvas(t.clientX, t.clientY);
        touchLastX = pos.x;
        touchLastY = pos.y;
        touchActive = true;
        touchDX = 0; touchDY = 0;
        joystickBaseX = pos.x;
        joystickBaseY = pos.y;
        joystickKnobX = pos.x;
        joystickKnobY = pos.y;
        joystickVisible = true;
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === touchId) {
          const pos = screenToCanvas(t.clientX, t.clientY);
          touchDX += pos.x - touchLastX;
          touchDY += pos.y - touchLastY;
          touchLastX = pos.x;
          touchLastY = pos.y;
          joystickKnobX = pos.x;
          joystickKnobY = pos.y;
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === touchId) {
          touchId = null; touchActive = false;
          touchDX = 0; touchDY = 0;
          joystickVisible = false;
        }
      }
    });

    canvas.addEventListener('touchcancel', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === touchId) {
          touchId = null; touchActive = false;
          touchDX = 0; touchDY = 0;
          joystickVisible = false;
        }
      }
    });

    // ─── SCROLLING BACKGROUND ──────────────────────────────────────
    const stars = [];
    for (let i = 0; i < 80; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5 + 0.3, speed: Math.random() * 1.5 + 0.5, alpha: Math.random() * 0.7 + 0.3 });
    }

    // Ground scroll layers (clouds/terrain)
    const groundLayers = [
      { y: 0, speed: 0.4, alpha: 0.12, color: '#4a7a50' },
      { y: -H, speed: 0.4, alpha: 0.12, color: '#4a7a50' },
      { y: 0, speed: 0.7, alpha: 0.07, color: '#6aaa70' },
      { y: -H, speed: 0.7, alpha: 0.07, color: '#6aaa70' },
    ];

    function makeTerrainCanvas(color) {
      const tc = document.createElement('canvas');
      tc.width = W; tc.height = H;
      const tx = tc.getContext('2d');
      tx.fillStyle = color;
      // Random patches
      for (let i = 0; i < 30; i++) {
        tx.globalAlpha = Math.random() * 0.6 + 0.1;
        const rx = Math.random() * W, ry = Math.random() * H;
        const rw = Math.random() * 120 + 40, rh = Math.random() * 80 + 30;
        tx.beginPath();
        tx.ellipse(rx, ry, rw / 2, rh / 2, Math.random() * Math.PI, 0, Math.PI * 2);
        tx.fill();
      }
      return tc;
    }
    const terrainCanvases = [makeTerrainCanvas('#3d6644'), makeTerrainCanvas('#5a8c60')];

    // ─── PARTICLES ─────────────────────────────────────────────────
    const particles = [];

    function spawnExplosion(x, y, count = 18, big = false) {
      const colors = ['#ff6020', '#ffcc00', '#ff3000', '#ffffff', '#ff9040'];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * (big ? 5 : 3) + 1;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: Math.random() * (big ? 6 : 4) + 1,
          life: 1,
          decay: Math.random() * 0.04 + 0.02,
          color: colors[Math.floor(Math.random() * colors.length)],
          type: 'spark'
        });
      }
      // smoke
      for (let i = 0; i < (big ? 10 : 5); i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 1.5;
        particles.push({
          x: x + (Math.random() - 0.5) * 20,
          y: y + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.5,
          r: Math.random() * (big ? 20 : 12) + 8,
          life: 1,
          decay: Math.random() * 0.02 + 0.01,
          color: '#222',
          type: 'smoke'
        });
      }
    }

    function spawnHitEffect(x, y) {
      for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        particles.push({
          x, y,
          vx: Math.cos(angle) * 3,
          vy: Math.sin(angle) * 3,
          r: 2, life: 1, decay: 0.1,
          color: '#ffffff',
          type: 'spark'
        });
      }
    }

    function updateParticles() {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.05;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
      }
    }

    function drawParticles() {
      for (const p of particles) {
        ctx.globalAlpha = p.life * (p.type === 'smoke' ? 0.35 : 0.9);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ─── BULLETS ───────────────────────────────────────────────────
    const playerBullets = [];
    const enemyBullets = [];
    const enemyLasers = [];

    function distToSegment(px, py, x1, y1, x2, y2) {
      const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
      if (l2 === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
      let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
      t = Math.max(0, Math.min(1, t));
      const projX = x1 + t * (x2 - x1);
      const projY = y1 + t * (y2 - y1);
      return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    }

    function spawnEnemyLaser(x, y, tx, ty, width = 24) {
      const dx = tx - x, dy = ty - y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ex = x + (dx / len) * 2000;
      const ey = y + (dy / len) * 2000;
      enemyLasers.push({ x, y, ex, ey, warningTimer: 72, fireTimer: 20, width });
      playSfx('laserCharge');
    }

    function spawnPlayerBullet(x, y, vx = 0, vy = -24, type = 'normal') {
      playerBullets.push({ x, y, vx, vy, w: 4, h: 14, type });
    }

    function spawnEnemyBullet(x, y, vx, vy, type = 'normal') {
      enemyBullets.push({ x, y, vx, vy, r: type === 'big' ? 6 : 4, type });
    }

    function updateBullets() {
      for (let i = playerBullets.length - 1; i >= 0; i--) {
        const b = playerBullets[i];
        if (b.type === 'rocket') b.vy *= 1.08;
        b.x += b.vx; b.y += b.vy;
        if (b.y < -40 || b.x < -20 || b.x > W + 20) playerBullets.splice(i, 1);
      }
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx; b.y += b.vy;
        if (b.y > H + 20 || b.x < -20 || b.x > W + 20 || b.y < -20) enemyBullets.splice(i, 1);
      }
      for (let i = enemyLasers.length - 1; i >= 0; i--) {
        const L = enemyLasers[i];
        if (L.warningTimer > 0) {
          L.warningTimer--;
          if (L.warningTimer === 0) playSfx('laserFire');
        } else if (L.fireTimer > 0) {
          L.fireTimer--;
          if (player.invincible <= 0) {
            const dist = distToSegment(player.x, player.y, L.x, L.y, L.ex, L.ey);
            if (dist < (L.width * 0.6)) {
              player.shields = 0; player.shield = false;
              player.hp = 0;
              triggerGameOver();
            }
          }
        } else {
          enemyLasers.splice(i, 1);
        }
      }
    }

    function drawPlayerBullets() {
      for (const b of playerBullets) {
        if (b.type === 'rocket') {
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.shadowColor = '#ff2222'; ctx.shadowBlur = 12;
          ctx.fillStyle = '#ff2222';
          ctx.beginPath();
          ctx.roundRect(-4, -12, 8, 24, 4);
          ctx.fill();
          ctx.fillStyle = '#ffaa00';
          ctx.beginPath();
          ctx.arc(0, 12 + Math.random() * 6, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.shadowColor = '#00ffc8';
          ctx.shadowBlur = 10;
          const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.4, '#00ffc8');
          grad.addColorStop(1, 'rgba(0,255,200,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(b.x - b.w / 2, b.y - b.h, b.w, b.h, 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }

    function drawPlayerLaser() {
      if (!gameRunning || player.gunLevel !== 4) return;
      const startY = player.y - player.h / 2;
      const endY = player.laserTargetY || 0;
      ctx.save();
      const flutter = Math.random() * 4 - 2;
      const w = 12 + flutter;
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur = 15 + Math.random() * 10;
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(player.x - w / 2, endY, w, startY - endY);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(player.x - (w - 6) / 2, endY, w - 6, startY - endY);
      ctx.restore();
    }

    function drawEnemyBullets() {
      for (const b of enemyBullets) {
        ctx.shadowColor = b.type === 'big' ? '#ff4060' : '#ff8020';
        ctx.shadowBlur = 8;
        ctx.fillStyle = b.type === 'big' ? '#ff2040' : '#ffaa40';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        // inner bright core
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    function drawEnemyLasers() {
      for (const L of enemyLasers) {
        if (L.warningTimer > 0) {
          ctx.save();
          ctx.globalAlpha = 0.3 + 0.3 * Math.sin(L.warningTimer * 0.5);
          ctx.strokeStyle = '#ff0033';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(L.x, L.y);
          ctx.lineTo(L.ex, L.ey);
          ctx.stroke();
          if (L.width >= 50) {
            ctx.fillStyle = '#ff0033';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚠', L.x, 30);
          }
          ctx.restore();
        } else if (L.fireTimer > 0) {
          ctx.save();
          ctx.shadowColor = '#ff2040';
          ctx.shadowBlur = L.width * 0.6;
          ctx.strokeStyle = '#ff2040';
          ctx.lineWidth = L.width * (L.fireTimer / 20);
          ctx.beginPath();
          ctx.moveTo(L.x, L.y);
          ctx.lineTo(L.ex, L.ey);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = (L.width * 0.4) * (L.fireTimer / 20);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // ─── PLAYER ────────────────────────────────────────────────────
    const player = {
      x: W / 2, y: H - 100,
      w: 36, h: 44,
      speed: 9,
      hp: 6, maxHp: 6,
      shootTimer: 0, shootInterval: 14,
      invincible: 0,
      thrustAnim: 0,
      trail: [],
      gunLevel: 1,
      baseGunLevel: 1,
      gunTimer: 0,
      shield: false,      // is shield active?
      shieldAnim: 0,      // for pulse animation
      shields: 0,         // number of shield layers (max = maxHp)
    };

    function resetPlayer() {
      player.x = W / 2; player.y = H - 100;
      player.hp = 6; player.maxHp = 6;
      player.shootTimer = 0;
      player.invincible = 0;
      player.trail = [];
      player.gunLevel = 1;
      player.baseGunLevel = 1;
      player.gunTimer = 0;
      player.shield = false;
      player.shieldAnim = 0;
      player.shields = 0;
      updateGunUI();
    }

    function updatePlayer() {
      if (!gameRunning) return;
      // Movement
      let dx = 0, dy = 0;
      if (keys['ArrowLeft'] || keys['KeyA']) dx -= 1;
      if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
      if (keys['ArrowUp'] || keys['KeyW']) dy -= 1;
      if (keys['ArrowDown'] || keys['KeyS']) dy += 1;

      // Normalize diagonal for keyboard
      if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

      player.x += dx * player.speed;
      player.y += dy * player.speed;

      // Touch: direct 1:1 finger-follow movement
      if (touchActive) {
        player.x += touchDX;
        player.y += touchDY;
        touchDX = 0;
        touchDY = 0;
      }

      player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));
      player.y = Math.max(player.h / 2, Math.min(H - player.h / 2, player.y));

      // Trail
      player.trail.push({ x: player.x, y: player.y + player.h / 2, life: 1 });
      if (player.trail.length > 12) player.trail.shift();
      for (const t of player.trail) t.life -= 0.08;

      // Auto shoot
      player.shootTimer--;
      if (player.shootTimer <= 0) {
        player.shootTimer = player.shootInterval;
        firePlayerGuns();
      }

      player.thrustAnim++;
      if (player.invincible > 0) player.invincible--;

      // Gun timer countdown
      if (player.gunTimer > 0) {
        player.gunTimer--;
        if (player.gunTimer === 0) {
          player.gunLevel = player.baseGunLevel || 1;
          player.shootInterval = GUNS[player.gunLevel].interval;
          showWaveAnnounce('GUN EXPIRED!');
          playSfx('gunExpire');
        }
        updateGunUI();
      }
    }

    // ─── GUN DEFINITIONS ──────────────────────────────────────────
    const GUNS = {
      1: { name: 'SINGLE SHOT', color: '#00ffc8', dropRate: 0, interval: 14 },
      2: { name: 'TWIN SHOT', color: '#88ff44', dropRate: 0.35, interval: 13 },
      3: { name: 'SPREAD SHOT', color: '#ffcc00', dropRate: 0.03, interval: 13 },
      4: { name: 'LASER', color: '#ff8800', dropRate: 0.10, interval: 10 },
      5: { name: 'STORM SHOT', color: '#ff44cc', dropRate: 0.05, interval: 9 },
      6: { name: 'ROCKET SALVO', color: '#ff2222', dropRate: 0.03, interval: 30 },
    };
    const GUN_DURATION = 15 * 60; // 15 seconds in frames

    function firePlayerGuns() {
      const gl = player.gunLevel;
      if (gl === 6) {
        playSfx('rocketShoot');
      } else if (gl === 4) {
        playSfx('laserShoot');
      } else {
        if (frameCount % 6 === 0) playSfx('shoot');
      }
      const x = player.x, y = player.y - player.h / 2;
      if (gl === 1) {
        spawnPlayerBullet(x, y, 0, -24);
      } else if (gl === 2) {
        spawnPlayerBullet(x - 10, y, 0, -24);
        spawnPlayerBullet(x + 10, y, 0, -24);
      } else if (gl === 3) {
        spawnPlayerBullet(x, y, 0, -24);
        spawnPlayerBullet(x - 10, y, -2.5, -23.8);
        spawnPlayerBullet(x + 10, y, 2.5, -23.8);
      } else if (gl === 4) {
        // Continuous beam handles own collision natively
      } else if (gl === 5) {
        spawnPlayerBullet(x, y, 0, -24);
        spawnPlayerBullet(x - 12, y, -2.5, -23.8);
        spawnPlayerBullet(x + 12, y, 2.5, -23.8);
        spawnPlayerBullet(x - 22, y, -5.0, -23.5);
        spawnPlayerBullet(x + 22, y, 5.0, -23.5);
      } else if (gl === 6) {
        spawnPlayerBullet(x - 14, y, 0, -5, 'rocket');
        spawnPlayerBullet(x + 14, y, 0, -5, 'rocket');
      }
    }

    function updateGunUI() {
      const g = GUNS[player.gunLevel];
      const isBase = player.gunTimer === 0;
      const maxTimer = player.gunLevel === 4 ? 600 : GUN_DURATION;
      const pct = isBase ? 100 : (player.gunTimer / maxTimer * 100);
      const secs = isBase ? '—' : Math.ceil(player.gunTimer / 60) + 's';
      document.getElementById('gunNameLabel').textContent = '✦ ' + g.name;
      document.getElementById('gunNameLabel').style.color = g.color;
      document.getElementById('gunTimerText').textContent = isBase ? 'BASE GUN' : secs;
      document.getElementById('gunTimerFill').style.width = pct + '%';
      document.getElementById('gunTimerFill').style.background = g.color;
      // Flash warning when < 5s
      const warn = !isBase && player.gunTimer < 300;
      document.getElementById('gunTimerFill').style.opacity = warn && Math.floor(frameCount / 8) % 2 === 0 ? '0.4' : '1';
    }

    // ─── SOUND EFFECTS ────────────────────────────────────────────
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function playSfx(type) {
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const g = audioCtx.createGain();
      g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;

      if (type === 'shoot') {
        const o = audioCtx.createOscillator();
        o.connect(g); g.gain.setValueAtTime(0.08, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        o.frequency.setValueAtTime(880, now); o.frequency.exponentialRampToValueAtTime(440, now + 0.08);
        o.type = 'square'; o.start(now); o.stop(now + 0.08);

      } else if (type === 'rocketShoot') {
        const o = audioCtx.createOscillator();
        const noise = audioCtx.createBufferSource();
        const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        noise.buffer = buf;
        noise.connect(g);
        o.connect(g);
        g.gain.setValueAtTime(0.15, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        o.frequency.setValueAtTime(150, now); o.frequency.exponentialRampToValueAtTime(40, now + 0.2);
        o.type = 'sawtooth';
        o.start(now); o.stop(now + 0.2);
        noise.start(now);

      } else if (type === 'laserShoot') {
        const o = audioCtx.createOscillator();
        o.connect(g); g.gain.setValueAtTime(0.05, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        o.frequency.setValueAtTime(1200, now); o.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        o.type = 'sawtooth'; o.start(now); o.stop(now + 0.1);

      } else if (type === 'enemyShoot') {
        const o = audioCtx.createOscillator();
        o.connect(g); g.gain.setValueAtTime(0.02, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        o.frequency.setValueAtTime(400, now); o.frequency.exponentialRampToValueAtTime(200, now + 0.08);
        o.type = 'sawtooth'; o.start(now); o.stop(now + 0.08);

      } else if (type === 'laserFire') {
        const o = audioCtx.createOscillator();
        const o2 = audioCtx.createOscillator();
        o.connect(g); o2.connect(g);
        g.gain.setValueAtTime(0.15, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        o.frequency.setValueAtTime(80, now); o.frequency.linearRampToValueAtTime(30, now + 0.5);
        o2.frequency.setValueAtTime(600, now); o2.frequency.exponentialRampToValueAtTime(150, now + 0.5);
        o.type = 'sawtooth'; o2.type = 'square';
        o.start(now); o.stop(now + 0.5);
        o2.start(now); o2.stop(now + 0.5);

      } else if (type === 'laserCharge') {
        const o = audioCtx.createOscillator();
        o.connect(g); g.gain.setValueAtTime(0.01, now);
        g.gain.linearRampToValueAtTime(0.1, now + 1.2);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
        o.frequency.setValueAtTime(100, now); o.frequency.exponentialRampToValueAtTime(600, now + 1.2);
        o.type = 'sawtooth'; o.start(now); o.stop(now + 1.25);

      } else if (type === 'enemyHit') {
        const o = audioCtx.createOscillator();
        o.connect(g); g.gain.setValueAtTime(0.1, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        o.frequency.setValueAtTime(300, now); o.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        o.type = 'sawtooth'; o.start(now); o.stop(now + 0.1);

      } else if (type === 'enemyDie') {
        // Explosion crunch
        const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.3, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.5);
        const src = audioCtx.createBufferSource();
        src.buffer = buf; src.connect(g);
        g.gain.setValueAtTime(0.3, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        src.start(now);

      } else if (type === 'playerHit') {
        const o = audioCtx.createOscillator();
        o.connect(g); g.gain.setValueAtTime(0.25, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        o.frequency.setValueAtTime(200, now); o.frequency.exponentialRampToValueAtTime(60, now + 0.4);
        o.type = 'sawtooth'; o.start(now); o.stop(now + 0.4);

      } else if (type === 'invinciblePickup') {
        [330, 440, 550, 660, 880].forEach((f, i) => {
          const o = audioCtx.createOscillator(), g2 = audioCtx.createGain();
          o.connect(g2); g2.connect(audioCtx.destination);
          const t = now + i * 0.06;
          g2.gain.setValueAtTime(0.18, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          o.frequency.value = f; o.type = 'triangle';
          o.start(t); o.stop(t + 0.18);
        });

      } else if (type === 'shieldPickup') {
        [300, 500, 700].forEach((f, i) => {
          const o = audioCtx.createOscillator(), g2 = audioCtx.createGain();
          o.connect(g2); g2.connect(audioCtx.destination);
          const t = now + i * 0.08;
          g2.gain.setValueAtTime(0.18, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
          o.frequency.value = f; o.type = 'sine';
          o.start(t); o.stop(t + 0.2);
        });

      } else if (type === 'shieldBreak') {
        const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.25, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 0.8);
        const src = audioCtx.createBufferSource();
        const flt = audioCtx.createBiquadFilter();
        flt.type = 'bandpass'; flt.frequency.value = 2000;
        src.buffer = buf; src.connect(flt); flt.connect(g);
        g.gain.setValueAtTime(0.3, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        src.start(now);

      } else if (type === 'gunPickup') {
        // Rising arpeggio
        [523, 659, 784, 1047].forEach((f, i) => {
          const o = audioCtx.createOscillator(), g2 = audioCtx.createGain();
          o.connect(g2); g2.connect(audioCtx.destination);
          const t = now + i * 0.07;
          g2.gain.setValueAtTime(0.15, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          o.frequency.value = f; o.type = 'triangle';
          o.start(t); o.stop(t + 0.15);
        });

      } else if (type === 'gunExpire') {
        // Descending tones
        [600, 400, 200].forEach((f, i) => {
          const o = audioCtx.createOscillator(), g2 = audioCtx.createGain();
          o.connect(g2); g2.connect(audioCtx.destination);
          const t = now + i * 0.1;
          g2.gain.setValueAtTime(0.15, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          o.frequency.value = f; o.type = 'square';
          o.start(t); o.stop(t + 0.15);
        });

      } else if (type === 'heartPickup') {
        [440, 880].forEach((f, i) => {
          const o = audioCtx.createOscillator(), g2 = audioCtx.createGain();
          o.connect(g2); g2.connect(audioCtx.destination);
          const t = now + i * 0.1;
          g2.gain.setValueAtTime(0.2, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
          o.frequency.value = f; o.type = 'sine';
          o.start(t); o.stop(t + 0.2);
        });

      } else if (type === 'bossAlarm') {
        const o = audioCtx.createOscillator();
        o.connect(g); g.gain.setValueAtTime(0.2, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        o.frequency.setValueAtTime(150, now); o.frequency.setValueAtTime(200, now + 0.15);
        o.frequency.setValueAtTime(150, now + 0.3); o.frequency.setValueAtTime(200, now + 0.45);
        o.type = 'sawtooth'; o.start(now); o.stop(now + 0.6);

      } else if (type === 'gameOver') {
        [400, 300, 200, 100].forEach((f, i) => {
          const o = audioCtx.createOscillator(), g2 = audioCtx.createGain();
          o.connect(g2); g2.connect(audioCtx.destination);
          const t = now + i * 0.18;
          g2.gain.setValueAtTime(0.2, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          o.frequency.value = f; o.type = 'sawtooth';
          o.start(t); o.stop(t + 0.3);
        });
      }
    }

    // ─── BACKGROUND MUSIC ─────────────────────────────────────────
    let musicNodes = [];
    let currentMusicMode = 'regular';
    let musicPlaying = false;

    function startMusic(mode = 'regular') {
      if (musicPlaying && currentMusicMode === mode) return;
      if (musicPlaying) stopMusic(); // Hard cut
      
      currentMusicMode = mode;
      musicPlaying = true;
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const masterGain = audioCtx.createGain();
      masterGain.gain.value = mode.startsWith('boss') ? 0.22 : 0.18; // push the boss volume up slightly
      masterGain.connect(audioCtx.destination);
      musicNodes.push(masterGain);

      // BPM & timing
      const BPM = mode.startsWith('boss') ? 145 : 105;
      const beat = 60 / BPM;
      const bar = beat * 4;

      // ── Bass line ──
      let bassNotes = [41.20, 41.20, 41.20, 0, 32.70, 32.70, 32.70, 0];
      if (mode === 'boss') bassNotes = [41.20, 41.20, 49.00, 41.20, 41.20, 41.20, 55.00, 41.20]; // Frantic alternating galloping
      else if (mode === 'boss2') bassNotes = [36.71, 36.71, 0, 41.20, 49.00, 49.00, 0, 36.71]; // heavy syncopation
      else if (mode === 'boss3') bassNotes = [32.70, 49.00, 32.70, 0, 32.70, 49.00, 32.70, 55.00]; // dark drone 

      function scheduleBass(startTime) {
        if (!musicPlaying) return;
        bassNotes.forEach((freq, i) => {
          if (freq === 0) return;
          const t = startTime + (mode.startsWith('boss') ? i * beat * 0.25 : i * beat * 0.5); // Boss plays 16th notes
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.connect(g); g.connect(masterGain);
          o.type = mode.startsWith('boss') ? 'square' : 'sawtooth';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.6, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + (mode.startsWith('boss') ? beat * 0.3 : beat * 0.5));
          o.start(t); o.stop(t + (mode.startsWith('boss') ? beat * 0.3 : beat * 0.5));
          musicNodes.push(o, g);
        });
        const next = startTime + (mode.startsWith('boss') ? beat * 2 : bar);
        setTimeout(() => scheduleBass(next), (next - audioCtx.currentTime - 0.1) * 1000);
      }

      // ── Melody ──
      let melodyNotes = [0, 329.63, 0, 0, 0, 392.00, 0, 0, 0, 329.63, 0, 0, 0, 261.63, 0, 0];
      if (mode === 'boss') melodyNotes = [0, 493.88, 0, 466.16, 0, 440.00, 0, 415.30]; // descending chromatic siren pattern
      else if (mode === 'boss2') melodyNotes = [0, 587.33, 0, 659.25, 0, 0, 587.33, 659.25]; // jumpy
      else if (mode === 'boss3') melodyNotes = [523.25, 0, 659.25, 0, 783.99, 0, 659.25, 0]; // ominous arpeggio
      
      function scheduleMelody(startTime) {
        if (!musicPlaying) return;
        melodyNotes.forEach((freq, i) => {
          if (freq === 0) return;
          const t = startTime + i * beat * 0.5;
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.connect(g); g.connect(masterGain);
          o.type = mode.startsWith('boss') ? 'sawtooth' : 'square';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(mode.startsWith('boss') ? 0.4 : 0.3, t + 0.05);
          g.gain.exponentialRampToValueAtTime(0.001, t + (mode.startsWith('boss') ? beat * 2 : beat * 0.8));
          o.start(t); o.stop(t + (mode.startsWith('boss') ? beat * 2 : beat));
          musicNodes.push(o, g);
        });
        const next = startTime + (mode.startsWith('boss') ? bar : bar * 2);
        setTimeout(() => scheduleMelody(next), (next - audioCtx.currentTime - 0.1) * 1000);
      }

      // ── Arp / counter-melody ──
      let arpNotes = [164.81, 196.00, 246.94, 329.63, 246.94, 196.00];
      if (mode === 'boss') arpNotes = [440, 523.2, 587.3, 659.3, 587.3, 523.2, 440, 392]; // fast soaring arpeggio
      else if (mode === 'boss2') arpNotes = [587.3, 698.46, 880, 1046.5, 880, 698.46, 587.3, 523.25]; 
      else if (mode === 'boss3') arpNotes = [392, 493.88, 587.33, 783.99, 587.33, 493.88, 392, 329.63]; 

      function scheduleArp(startTime) {
        if (!musicPlaying) return;
        arpNotes.forEach((freq, i) => {
          const t = startTime + (mode.startsWith('boss') ? i * beat * 0.25 : (i % 6) * beat * 0.333);
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.connect(g); g.connect(masterGain);
          o.type = mode.startsWith('boss') ? 'sawtooth' : 'sine';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.25, t + 0.05);
          g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.25);
          o.start(t); o.stop(t + beat * 0.25);
          musicNodes.push(o, g);
        });
        const next = startTime + (mode.startsWith('boss') ? beat * 2 : bar);
        setTimeout(() => scheduleArp(next), (next - audioCtx.currentTime - 0.1) * 1000);
      }

      // ── Kick drum ──
      function scheduleKick(startTime) {
        if (!musicPlaying) return;
        let kickOffsets = [0, beat * 1.5, beat * 2, beat * 3.5];
        if (mode === 'boss') kickOffsets = [0, beat * 0.5, beat * 1.5, beat * 2, beat * 2.5, beat * 3.5]; // Double-kick madness
        else if (mode === 'boss2') kickOffsets = [0, beat * 1.0, beat * 1.5, beat * 2.5, beat * 3.0, beat * 3.5];
        else if (mode === 'boss3') kickOffsets = [0, beat * 0.75, beat * 1.5, beat * 2.25, beat * 3.0, beat * 3.75]; // triplet feel

        kickOffsets.forEach(offset => {
          const t = startTime + offset;
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.connect(g); g.connect(masterGain);
          o.type = 'sine';
          o.frequency.setValueAtTime(mode.startsWith('boss') ? 140 : 100, t);
          o.frequency.exponentialRampToValueAtTime(0.001, t + 0.4);
          g.gain.setValueAtTime(1.0, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
          o.start(t); o.stop(t + 0.4);
          musicNodes.push(o, g);
        });
        const next = startTime + bar;
        setTimeout(() => scheduleKick(next), (next - audioCtx.currentTime - 0.1) * 1000);
      }

      // ── Hi-hat ──
      function scheduleHat(startTime) {
        if (!musicPlaying) return;
        const count = mode.startsWith('boss') ? 16 : 8; // 16th notes for boss
        for (let i = 0; i < count; i++) {
          const t = startTime + (mode.startsWith('boss') ? i * beat * 0.25 : i * beat * 0.5 + (i % 2 === 1 ? 0.05 : 0));
          const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
          const data = buf.getChannelData(0);
          for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1);
          const src = audioCtx.createBufferSource();
          const g = audioCtx.createGain();
          const filter = audioCtx.createBiquadFilter();
          filter.type = 'highpass'; filter.frequency.value = mode.startsWith('boss') ? 4000 : 6000; // dirtier for boss
          src.buffer = buf;
          src.connect(filter); filter.connect(g); g.connect(masterGain);
          g.gain.setValueAtTime(mode.startsWith('boss') ? 0.2 : 0.15, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          src.start(t);
          musicNodes.push(src, g, filter);
        }
        const next = startTime + bar;
        setTimeout(() => scheduleHat(next), (next - audioCtx.currentTime - 0.1) * 1000);
      }

      const start = audioCtx.currentTime + 0.1;
      scheduleBass(start);
      scheduleMelody(start);
      scheduleArp(start + bar);
      scheduleKick(start);
      scheduleHat(start);
    }

    function stopMusic() {
      musicPlaying = false;
      musicNodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) { } });
      musicNodes = [];
    }
    const gunDrops = [];

    function tryDropGun(x, y) {
      // Don't drop if player has an active gun with > 3s remaining (180 frames)
      if (player.gunTimer >= 180) return;
      const rolls = [
        { level: 6, rate: 0.03 },
        { level: 5, rate: 0.03 },
        { level: 4, rate: 0.06 },
        { level: 3, rate: 0.03 },
        { level: 2, rate: 0.15 },
      ].filter(r => r.level > (player.baseGunLevel || 1));
      for (const r of rolls) {
        if (Math.random() < r.rate) {
          gunDrops.push({ x, y, vy: 1.2, level: r.level, life: 1.0 });
          break;
        }
      }
    }

    function updateGunDrops() {
      for (let i = gunDrops.length - 1; i >= 0; i--) {
        const d = gunDrops[i];
        d.y += d.vy;
        d.life -= 0.00111; // fade over ~15s
        if (d.life <= 0 || d.y > H + 20) { gunDrops.splice(i, 1); continue; }
        // Collect
        if (Math.abs(d.x - player.x) < 22 && Math.abs(d.y - player.y) < 22) {
          player.gunLevel = d.level;
          player.gunTimer = d.level === 4 ? 600 : GUN_DURATION;
          player.shootInterval = GUNS[d.level].interval;
          updateGunUI();
          playSfx('gunPickup');
          showWaveAnnounce('✦ ' + GUNS[d.level].name + ' !');
          // Clear ALL other gun drops on screen
          gunDrops.length = 0;
          return;
        }
      }
    }

    function drawGunDrops() {
      for (const d of gunDrops) {
        const g = GUNS[d.level];
        const icons = ['', '▲', '▲▲', '❋', '⚡', '★', '🚀'];
        ctx.save();
        ctx.globalAlpha = d.life;
        ctx.translate(d.x, d.y);
        ctx.shadowColor = g.color; ctx.shadowBlur = 14;
        // Background pill
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
        // Border
        ctx.strokeStyle = g.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
        // Icon
        ctx.shadowBlur = 0;
        ctx.fillStyle = g.color;
        ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(icons[d.level], 0, 1);
        // Level pip
        ctx.font = 'bold 7px sans-serif';
        ctx.fillStyle = '#000';
        ctx.fillText(d.level, 8, -8);
        ctx.restore();
      }
    }

    // ─── SHIELD DROP SYSTEM ───────────────────────────────────────
    const shieldDrops = [];

    function tryDropShield(x, y) {
      if (Math.random() < 0.10) {
        shieldDrops.push({ x, y, vy: 1.0, life: 1.0 });
      }
    }

    function updateShieldDrops() {
      for (let i = shieldDrops.length - 1; i >= 0; i--) {
        const s = shieldDrops[i];
        s.y += s.vy;
        s.life -= 0.00111; // ~15s fade
        if (s.life <= 0 || s.y > H + 20) { shieldDrops.splice(i, 1); continue; }
        if (Math.abs(s.x - player.x) < 22 && Math.abs(s.y - player.y) < 22) {
          if (player.shields < player.maxHp) {
            player.shields++;
            player.shield = player.shields > 0;
          }
          updateHealthUI();
          playSfx('shieldPickup');
          showWaveAnnounce('🛡 SHIELD ACTIVE!');
          shieldDrops.splice(i, 1);
        }
      }
    }

    function drawShieldDrops() {
      for (const s of shieldDrops) {
        ctx.save();
        ctx.globalAlpha = s.life;
        ctx.translate(s.x, s.y);
        ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 14;
        ctx.fillStyle = 'rgba(0,10,30,0.75)';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#44aaff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#44aaff';
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🛡', 0, 1);
        ctx.restore();
      }
    }

    function drawShield() {
      if (player.shields <= 0) return;
      player.shieldAnim++;
      const pulse = 0.5 + 0.5 * Math.sin(player.shieldAnim * 0.1);
      const intensity = player.shields / player.maxHp;
      ctx.save();
      ctx.globalAlpha = 0.25 + pulse * 0.2 + intensity * 0.15;
      ctx.strokeStyle = '#44aaff';
      ctx.shadowColor = '#44aaff';
      ctx.shadowBlur = 14 + pulse * 8 + intensity * 10;
      ctx.lineWidth = 1.5 + intensity * 1.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 30 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.06 + pulse * 0.05 + intensity * 0.06;
      ctx.fillStyle = '#44aaff';
      ctx.beginPath();
      ctx.arc(player.x, player.y, 30 + pulse * 3, 0, Math.PI * 2);
      ctx.fill();
      // Shield count badge
      if (player.shields > 1) {
        ctx.globalAlpha = 0.9;
        ctx.shadowBlur = 6;
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#44aaff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('×' + player.shields, player.x + 26, player.y - 26);
      }
      ctx.restore();
    }

    // ─── BOSS RANDOM GUN DROP ─────────────────────────────────────
    function onBossHit(e) {
      // 3% chance to drop a gun when a boss is hit (only if no active gun)
      if (player.gunTimer === 0 && Math.random() < 0.03) {
        let level = Math.floor(Math.random() * 4) + 2;
        if (level <= (player.baseGunLevel || 1)) {
          level = (player.baseGunLevel || 1) + 1;
        }
        gunDrops.push({ x: e.x + (Math.random() - 0.5) * 40, y: e.y, vy: 1.2, level, life: 1.0 });
      }
      // 3% chance to drop a heart when a boss is hit
      if (Math.random() < 0.03) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 1.2 + Math.random() * 1.0;
        heartPacks.push({ x: e.x, y: e.y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, r: 12, bob: Math.random() * Math.PI * 2, life: 1.0 });
      }
    }

    function drawPlayer() {
      if (player.invincible > 0 && Math.floor(player.invincible / 4) % 2 === 1) return;

      // Thrust flame
      const fSize = 10 + Math.sin(player.thrustAnim * 0.3) * 4;
      const fg = ctx.createRadialGradient(player.x, player.y + player.h / 2, 0, player.x, player.y + player.h / 2, fSize * 2);
      fg.addColorStop(0, 'rgba(100,200,255,1)');
      fg.addColorStop(0.3, 'rgba(0,150,255,0.8)');
      fg.addColorStop(1, 'rgba(0,80,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.ellipse(player.x, player.y + player.h / 2 + fSize / 2, fSize * 0.5, fSize, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.save();
      ctx.translate(player.x, player.y);

      // Shadow/glow
      ctx.shadowColor = '#00ffc8';
      ctx.shadowBlur = 16;

      // Main fuselage
      ctx.fillStyle = '#c0c8d8';
      ctx.beginPath();
      ctx.moveTo(0, -player.h / 2);
      ctx.lineTo(8, -player.h / 4);
      ctx.lineTo(10, player.h / 4);
      ctx.lineTo(0, player.h / 2);
      ctx.lineTo(-10, player.h / 4);
      ctx.lineTo(-8, -player.h / 4);
      ctx.closePath();
      ctx.fill();

      // Wings
      ctx.fillStyle = '#8090a8';
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(-player.w / 2, player.h / 4);
      ctx.lineTo(-player.w / 2 + 4, player.h / 2 - 6);
      ctx.lineTo(-6, player.h / 4 - 4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(player.w / 2, player.h / 4);
      ctx.lineTo(player.w / 2 - 4, player.h / 2 - 6);
      ctx.lineTo(6, player.h / 4 - 4);
      ctx.closePath();
      ctx.fill();

      // Star markings
      ctx.fillStyle = '#cc2040';
      ctx.beginPath(); ctx.arc(-player.w / 2 + 8, player.h / 4 - 4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(player.w / 2 - 8, player.h / 4 - 4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('★', -player.w / 2 + 8, player.h / 4 - 4);
      ctx.fillText('★', player.w / 2 - 8, player.h / 4 - 4);

      // Cockpit
      const cg = ctx.createLinearGradient(-4, -player.h / 2 + 4, 4, -player.h / 2 + 18);
      cg.addColorStop(0, '#88ccff');
      cg.addColorStop(1, '#2255aa');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(0, -player.h / 2 + 12, 5, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // ─── ENEMIES ───────────────────────────────────────────────────
    const enemies = [];

    function spawnEnemy(type, x, y, pattern) {
      const e = {
        type, x, y, pattern, phase: 0, timer: 0, shootTimer: 0, dead: false,
        burstCount: 0, burstMax: 0, burstCooldown: 0
      };
      // ── Regular enemies ──
      if (type === 'small') { e.hp = 1; e.maxHp = 1; e.w = 28; e.h = 28; e.speed = 2.6 + wave * 0.12; e.score = 100; e.shootInterval = 14; e.burstMax = 2; e.burstCooldown = 140; }
      if (type === 'medium') { e.hp = 3; e.maxHp = 3; e.w = 36; e.h = 36; e.speed = 2.0 + wave * 0.09; e.score = 250; e.shootInterval = 14; e.burstMax = 3; e.burstCooldown = 130; }
      if (type === 'speeder') { e.hp = 2; e.maxHp = 2; e.w = 24; e.h = 30; e.speed = 7.5 + wave * 0.22; e.score = 180; e.shootInterval = 14; e.burstMax = 3; e.burstCooldown = 150; }
      if (type === 'tank') { e.hp = 8; e.maxHp = 8; e.w = 44; e.h = 44; e.speed = 1.5 + wave * 0.08; e.score = 400; e.shootInterval = 16; e.burstMax = 4; e.burstCooldown = 130; }
      if (type === 'sniper') { e.hp = 2; e.maxHp = 2; e.w = 28; e.h = 38; e.speed = 1.5 + wave * 0.08; e.score = 300; e.shootInterval = 12; e.burstMax = 2; e.burstCooldown = 160; }
      // ── Boss enemies ──
      // Cooldowns slashed and bursts increased for high-aggression
      if (type === 'boss') { e.hp = 40 + wave * 20; e.maxHp = 40 + wave * 20; e.w = 90; e.h = 70; e.speed = 2.6; e.score = 2000; e.shootInterval = 14; e.burstMax = 8; e.burstCooldown = 75; }
      if (type === 'boss2') { e.hp = 60 + wave * 25; e.maxHp = 60 + wave * 25; e.w = 100; e.h = 80; e.speed = 3.2; e.score = 3000; e.shootInterval = 10; e.burstMax = 10; e.burstCooldown = 65; }
      if (type === 'boss3') { e.hp = 80 + wave * 30; e.maxHp = 80 + wave * 30; e.w = 110; e.h = 90; e.speed = 3.8; e.speed2 = 5.5; e.score = 5000; e.shootInterval = 8; e.burstMax = 12; e.burstCooldown = 55; }
      enemies.push(e);
    }

    function spawnWave() {
      const bossWave = wave % 5 === 0;
      if (bossWave) {
        const bossType = wave % 15 === 0 ? 'boss3' : (wave % 10 === 0 ? 'boss2' : 'boss');
        spawnEnemy(bossType, W / 2, -100, 'boss');
        showWaveAnnounce('⚠ BOSS WAVE ' + wave + ' ⚠');
      } else {
        showWaveAnnounce('WAVE ' + wave);
        const MAX_ENEMIES = 25;
        let spawned = 0;

        // Small — scales up to 10
        const smallCount = Math.min(4 + wave * 2, 10);
        for (let i = 0; i < smallCount && spawned < MAX_ENEMIES; i++) {
          const x = 40 + (i % 6) * 65 + Math.random() * 20;
          const y = -60 - Math.floor(i / 6) * 50;
          spawnEnemy('small', x, y, i % 2 === 0 ? 'zigzag' : 'straight');
          spawned++;
        }
        // Medium from wave 2 — scales up to 6
        if (wave >= 2) {
          const medCount = Math.min(1 + wave, 5);
          for (let i = 0; i < medCount && spawned < MAX_ENEMIES; i++) {
            spawnEnemy('medium', 80 + i * 90 + Math.random() * 30, -140 - i * 45, 'hover');
            spawned++;
          }
        }
        // Speeder from wave 3 — scales up to 5
        if (wave >= 3) {
          const spdCount = Math.min(wave - 1, 4);
          for (let i = 0; i < spdCount && spawned < MAX_ENEMIES; i++) {
            spawnEnemy('speeder', 50 + i * 120 + Math.random() * 30, -60 - i * 30, 'straight');
            spawned++;
          }
        }
        // Tank from wave 4 — scales up to 4
        if (wave >= 4) {
          const tankCount = Math.min(wave - 2, 3);
          for (let i = 0; i < tankCount && spawned < MAX_ENEMIES; i++) {
            spawnEnemy('tank', 100 + i * 150 + Math.random() * 20, -120 - i * 40, 'hover');
            spawned++;
          }
        }
        // Sniper from wave 5 — scales up to 3
        if (wave >= 5) {
          const snpCount = Math.min(wave - 3, 3);
          for (let i = 0; i < snpCount && spawned < MAX_ENEMIES; i++) {
            spawnEnemy('sniper', 70 + i * 160 + Math.random() * 30, -100 - i * 50, 'snipe');
            spawned++;
          }
        }
      }
    }

    const ENEMY_COLORS = {
      small: { body: '#8b8420', wing: '#6b6410', cockpit: '#40c040' },
      medium: { body: '#6b7820', wing: '#4b5810', cockpit: '#80c840' },
      speeder: { body: '#882020', wing: '#661010', cockpit: '#ff6040' },
      tank: { body: '#404880', wing: '#282c60', cockpit: '#60a0ff' },
      sniper: { body: '#606020', wing: '#404010', cockpit: '#ffee40' },
      boss: { body: '#5a6820', wing: '#3a4810', cockpit: '#c0d040' },
      boss2: { body: '#803020', wing: '#601010', cockpit: '#ff8040' },
      boss3: { body: '#502060', wing: '#380040', cockpit: '#cc44ff' },
    };

    function drawEnemy(e) {
      ctx.save();
      ctx.translate(e.x, e.y);
      const c = ENEMY_COLORS[e.type] || ENEMY_COLORS.small;
      const isBoss = e.type.startsWith('boss');
      const s = e.type === 'boss3' ? 1.2 : (e.type === 'boss2' ? 1.1 : (isBoss ? 1 : (e.type === 'tank' ? 1 : (e.type === 'medium' ? 0.9 : 0.7))));
      ctx.scale(s, s);

      const flashHit = e.hitFlash > 0;
      if (flashHit) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 20; }

      const hw = isBoss ? (e.type === 'boss3' ? 80 : e.type === 'boss2' ? 74 : 70) : (e.type === 'tank' ? 46 : e.type === 'medium' ? 42 : 34);
      const hh = isBoss ? (e.type === 'boss3' ? 70 : e.type === 'boss2' ? 60 : 50) : (e.type === 'tank' ? 44 : e.type === 'medium' ? 38 : 28);

      // ── Speeder: sleek narrow shape ──
      if (e.type === 'speeder') {
        ctx.fillStyle = flashHit ? '#fff' : c.wing;
        ctx.beginPath(); ctx.moveTo(-18, 8); ctx.lineTo(-28, 22); ctx.lineTo(-14, 18); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(18, 8); ctx.lineTo(28, 22); ctx.lineTo(14, 18); ctx.closePath(); ctx.fill();
        ctx.fillStyle = flashHit ? '#fff' : c.body;
        ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(6, -4); ctx.lineTo(6, 14); ctx.lineTo(0, 18); ctx.lineTo(-6, 14); ctx.lineTo(-6, -4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = flashHit ? '#fff' : c.cockpit;
        ctx.beginPath(); ctx.ellipse(0, -10, 3, 7, 0, 0, Math.PI * 2); ctx.fill();
        // Afterburner glow
        if (!flashHit) {
          ctx.shadowColor = '#ff6040'; ctx.shadowBlur = 12;
          ctx.fillStyle = 'rgba(255,80,20,0.6)';
          ctx.beginPath(); ctx.ellipse(0, 20, 4, 8, 0, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }

        // ── Tank: wide armored shape ──
      } else if (e.type === 'tank') {
        ctx.fillStyle = flashHit ? '#fff' : c.wing;
        ctx.beginPath(); ctx.moveTo(-hw / 2, 4); ctx.lineTo(-hw / 2 - 10, 20); ctx.lineTo(-hw / 2, hh / 2); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(hw / 2, 4); ctx.lineTo(hw / 2 + 10, 20); ctx.lineTo(hw / 2, hh / 2); ctx.lineTo(10, 12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = flashHit ? '#fff' : c.body;
        ctx.beginPath(); ctx.moveTo(0, -hh / 2); ctx.lineTo(14, -hh / 4); ctx.lineTo(16, hh / 4); ctx.lineTo(0, hh / 2); ctx.lineTo(-16, hh / 4); ctx.lineTo(-14, -hh / 4); ctx.closePath(); ctx.fill();
        // Armor plates
        ctx.fillStyle = flashHit ? '#fff' : '#303868';
        ctx.fillRect(-10, -hh / 2 + 4, 20, 10);
        ctx.fillRect(-12, 0, 24, 8);
        ctx.fillStyle = flashHit ? '#fff' : c.cockpit;
        ctx.beginPath(); ctx.ellipse(0, -hh / 2 + 12, 5, 7, 0, 0, Math.PI * 2); ctx.fill();

        // ── Sniper: long narrow fuselage ──
      } else if (e.type === 'sniper') {
        ctx.fillStyle = flashHit ? '#fff' : c.wing;
        ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-22, 12); ctx.lineTo(-16, hh / 2 - 4); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(8, 2); ctx.lineTo(22, 12); ctx.lineTo(16, hh / 2 - 4); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = flashHit ? '#fff' : c.body;
        ctx.beginPath(); ctx.moveTo(0, -hh / 2); ctx.lineTo(5, -hh / 3); ctx.lineTo(7, hh / 4); ctx.lineTo(0, hh / 2); ctx.lineTo(-7, hh / 4); ctx.lineTo(-5, -hh / 3); ctx.closePath(); ctx.fill();
        // Sniper barrel
        ctx.fillStyle = flashHit ? '#fff' : '#303010';
        ctx.fillRect(-2, -hh / 2 - 10, 4, 12);
        ctx.fillStyle = flashHit ? '#fff' : c.cockpit;
        ctx.beginPath(); ctx.ellipse(0, -hh / 2 + 10, 4, 6, 0, 0, Math.PI * 2); ctx.fill();

        // ── Boss2: wider aggressive shape ──
      } else if (e.type === 'boss2') {
        ctx.fillStyle = flashHit ? '#fff' : c.wing;
        ctx.beginPath(); ctx.moveTo(-hw / 2, -10); ctx.lineTo(-hw / 2 - 16, 32); ctx.lineTo(-hw / 2 + 6, hh / 2 + 10); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(hw / 2, -10); ctx.lineTo(hw / 2 + 16, 32); ctx.lineTo(hw / 2 - 6, hh / 2 + 10); ctx.lineTo(10, 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = flashHit ? '#fff' : c.body;
        ctx.beginPath(); ctx.moveTo(0, -hh / 2); ctx.lineTo(14, -hh / 4); ctx.lineTo(16, hh / 4); ctx.lineTo(0, hh / 2); ctx.lineTo(-16, hh / 4); ctx.lineTo(-14, -hh / 4); ctx.closePath(); ctx.fill();

        ctx.fillStyle = flashHit ? '#fff' : '#111';
        ctx.beginPath(); ctx.moveTo(-42, 12); ctx.lineTo(-50, 40); ctx.lineTo(-24, 30); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(42, 12); ctx.lineTo(50, 40); ctx.lineTo(24, 30); ctx.closePath(); ctx.fill();

        // Menacing double glowing eyes
        if (!flashHit) { ctx.shadowColor = '#ff2020'; ctx.shadowBlur = 15; }
        ctx.fillStyle = flashHit ? '#fff' : '#ff1010';
        ctx.beginPath(); ctx.ellipse(-6, -hh / 2 + 12, 4, 8, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(6, -hh / 2 + 12, 4, 8, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;

        // Huge forward spikes
        ctx.fillStyle = flashHit ? '#fff' : '#200505';
        ctx.beginPath(); ctx.moveTo(-8, -hh / 2); ctx.lineTo(-4, -hh / 2 - 20); ctx.lineTo(-2, -hh / 2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(8, -hh / 2); ctx.lineTo(4, -hh / 2 - 20); ctx.lineTo(2, -hh / 2); ctx.closePath(); ctx.fill();

        // ── Boss3: massive purple dreadnought ──
      } else if (e.type === 'boss3') {
        ctx.fillStyle = flashHit ? '#fff' : c.wing;
        ctx.beginPath(); ctx.moveTo(-hw / 2, 0); ctx.lineTo(-hw / 2 - 26, 40); ctx.lineTo(-hw / 2 + 16, hh / 2 + 10); ctx.lineTo(-16, 18); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(hw / 2, 0); ctx.lineTo(hw / 2 + 26, 40); ctx.lineTo(hw / 2 - 16, hh / 2 + 10); ctx.lineTo(16, 18); ctx.closePath(); ctx.fill();

        ctx.fillStyle = flashHit ? '#fff' : '#220033';
        ctx.beginPath(); ctx.moveTo(-hw / 2 + 6, 20); ctx.lineTo(-hw / 2 - 4, 55); ctx.lineTo(-20, 36); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(hw / 2 - 6, 20); ctx.lineTo(hw / 2 + 4, 55); ctx.lineTo(20, 36); ctx.closePath(); ctx.fill();

        ctx.fillStyle = flashHit ? '#fff' : c.body;
        ctx.beginPath(); ctx.moveTo(0, -hh / 2 - 10); ctx.lineTo(24, -hh / 4); ctx.lineTo(20, hh / 4 + 10); ctx.lineTo(0, hh / 2 + 8); ctx.lineTo(-20, hh / 4 + 10); ctx.lineTo(-24, -hh / 4); ctx.closePath(); ctx.fill();

        // Huge dark turrets emitting red energy
        ctx.fillStyle = flashHit ? '#fff' : '#111';
        ctx.beginPath(); ctx.rect(-50, 10, 16, 36); ctx.fill();
        ctx.beginPath(); ctx.rect(34, 10, 16, 36); ctx.fill();
        ctx.fillRect(-24, -20, 14, 28);
        ctx.fillRect(10, -20, 14, 28);

        // Menacing Hellfire Energy core
        if (!flashHit) { ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 30; }
        ctx.fillStyle = flashHit ? '#fff' : '#ff0000';
        ctx.beginPath(); ctx.arc(0, 4, 12 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = flashHit ? '#fff' : '#ffcc00';
        ctx.beginPath(); ctx.arc(0, 4, 6 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;

        // Demonic V-eye slit layout instead of a cockpit
        if (!flashHit) { ctx.shadowColor = '#ff0033'; ctx.shadowBlur = 15; }
        ctx.fillStyle = flashHit ? '#fff' : '#ff0033';
        ctx.beginPath(); ctx.moveTo(-16, -hh / 2 + 10); ctx.lineTo(16, -hh / 2 + 10); ctx.lineTo(0, -hh / 2 + 20); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;

        // ── Default (small, medium, boss) ──
      } else {
        ctx.fillStyle = flashHit ? '#fff' : c.wing;
        ctx.beginPath(); ctx.moveTo(-hw / 2, 10); ctx.lineTo(-hw / 2 - 8, 26); ctx.lineTo(-hw / 2 + 4, hh / 2); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(hw / 2, 10); ctx.lineTo(hw / 2 + 8, 26); ctx.lineTo(hw / 2 - 4, hh / 2); ctx.lineTo(8, 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = flashHit ? '#fff' : c.body;
        ctx.beginPath(); ctx.moveTo(0, -hh / 2); ctx.lineTo(10, -hh / 4); ctx.lineTo(12, hh / 4); ctx.lineTo(0, hh / 2); ctx.lineTo(-12, hh / 4); ctx.lineTo(-10, -hh / 4); ctx.closePath(); ctx.fill();

        if (e.type === 'boss') {
          if (!flashHit) { ctx.shadowColor = '#ff0033'; ctx.shadowBlur = 15; }
          ctx.fillStyle = flashHit ? '#fff' : '#ff0033';
          ctx.beginPath(); ctx.moveTo(-12, -hh / 2 + 8); ctx.lineTo(12, -hh / 2 + 8); ctx.lineTo(8, -hh / 2 + 12); ctx.lineTo(-8, -hh / 2 + 12); ctx.closePath(); ctx.fill();
          ctx.shadowBlur = 0;

          ctx.fillStyle = flashHit ? '#fff' : '#111';
          ctx.beginPath(); ctx.moveTo(-36, 16); ctx.lineTo(-46, 36); ctx.lineTo(-22, 26); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(36, 16); ctx.lineTo(46, 36); ctx.lineTo(22, 26); ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = flashHit ? '#fff' : c.cockpit;
          ctx.beginPath(); ctx.ellipse(0, -hh / 2 + 10, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Boss HP bar above sprite
      if (isBoss) {
        const barW = 90, barH = 7;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-barW / 2, -hh / 2 - 18, barW, barH);
        ctx.fillStyle = `hsl(${(e.hp / e.maxHp) * 120},100%,50%)`;
        ctx.fillRect(-barW / 2, -hh / 2 - 18, barW * (e.hp / e.maxHp), barH);
      }

      ctx.shadowBlur = 0;
      ctx.restore();

      // Small HP bars for tank/medium when damaged
      if ((e.type === 'tank' || e.type === 'medium') && e.hp < e.maxHp) {
        const bw = 38;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - bw / 2, e.y - e.h / 2 - 9, bw, 5);
        ctx.fillStyle = '#40ff40'; ctx.fillRect(e.x - bw / 2, e.y - e.h / 2 - 9, bw * (e.hp / e.maxHp), 5);
      }
    }

    function updateEnemies() {
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.dead) { enemies.splice(i, 1); continue; }
        e.timer++;
        if (e.hitFlash > 0) e.hitFlash--;

        // Movement patterns
        if (e.type === 'small') {
          // Glide down to upper half then drift side to side like other shooters
          if (e.y < 160) { e.y += e.speed; }
          else { e.x += Math.sin(e.timer * 0.05) * 2; }
          e.x = Math.max(e.w / 2, Math.min(W - e.w / 2, e.x));
          e.y = Math.max(40, Math.min(240, e.y));
        } else if (e.type === 'medium') {
          if (e.y < 120) { e.y += e.speed; }
          else { e.x += Math.sin(e.timer * 0.03) * 1.2; }
          e.x = Math.max(e.w / 2, Math.min(W - e.w / 2, e.x));
          e.y = Math.max(60, Math.min(200, e.y));
        } else if (e.type === 'speeder') {
          if (e.y < 200) { e.y += e.speed; e.x += Math.sin(e.timer * 0.08) * 1.5; }
          else { e.x += Math.sin(e.timer * 0.06) * 3; }
          e.x = Math.max(e.w / 2, Math.min(W - e.w / 2, e.x));
          e.y = Math.max(40, Math.min(260, e.y));
        } else if (e.type === 'tank') {
          if (e.y < 160) { e.y += e.speed; }
          else { e.x += Math.sin(e.timer * 0.02) * 0.8; }
          e.x = Math.max(e.w / 2, Math.min(W - e.w / 2, e.x));
          e.y = Math.max(60, Math.min(220, e.y));
        } else if (e.type === 'sniper') {
          if (e.y < 100) { e.y += e.speed; }
          else { e.x += Math.sin(e.timer * 0.015) * 0.8; }
          e.x = Math.max(e.w / 2, Math.min(W - e.w / 2, e.x));
          e.y = Math.max(40, Math.min(160, e.y));
        } else if (e.type === 'boss') {
          if (e.y < 120) { e.y += e.speed; }
          else {
            const p = Math.floor(e.timer / 180) % 3;
            if (p === 0) e.x += Math.sin(e.timer * 0.025) * 2;
            else if (p === 1) { e.x += Math.sin(e.timer * 0.04) * 2.5; e.y += Math.sin(e.timer * 0.02) * 0.8; }
            else { e.x = W / 2 + Math.cos(e.timer * 0.03) * 140; }
            e.x = Math.max(e.w / 2, Math.min(W - e.w / 2, e.x));
            e.y = Math.max(80, Math.min(250, e.y));
            document.getElementById('bossHpFill').style.width = (e.hp / e.maxHp * 100) + '%';
          }
        } else if (e.type === 'boss2') {
          if (e.y < 130) { e.y += e.speed; }
          else {
            // Figure-8 pattern
            e.x = W / 2 + Math.cos(e.timer * 0.02) * 160;
            e.y = 140 + Math.sin(e.timer * 0.04) * 60;
            e.x = Math.max(e.w / 2, Math.min(W - e.w / 2, e.x));
            document.getElementById('bossHpFill').style.width = (e.hp / e.maxHp * 100) + '%';
          }
        } else if (e.type === 'boss3') {
          if (e.y < 150) { e.y += e.speed; }
          else {
            // Aggressive charge phases
            const p = Math.floor(e.timer / 150) % 4;
            if (p === 0) { e.x += Math.sin(e.timer * 0.03) * 3; }
            else if (p === 1) { e.x = W / 2 + Math.cos(e.timer * 0.05) * 180; e.y = 150 + Math.sin(e.timer * 0.03) * 80; }
            else if (p === 2) { // Charge at player
              const dx = player.x - e.x, dy = player.y - e.y;
              const d = Math.sqrt(dx * dx + dy * dy);
              e.x += (dx / d) * e.speed2 * 0.6; e.y += (dy / d) * e.speed2 * 0.3;
            } else { e.x += Math.sin(e.timer * 0.06) * 4; }
            e.x = Math.max(e.w / 2, Math.min(W - e.w / 2, e.x));
            e.y = Math.max(80, Math.min(300, e.y));
            document.getElementById('bossHpFill').style.width = (e.hp / e.maxHp * 100) + '%';
          }
        }

        // Remove if off-screen (small only — others handled above)
        if (e.type === 'small' && e.y > H + 40) { enemies.splice(i, 1); continue; }

        // Enemy shooting — burst then long pause
        e.shootTimer++;
        if (e.burstCount > 0) {
          // Mid-burst: fire at shootInterval pace
          if (e.shootTimer >= e.shootInterval) {
            e.shootTimer = 0;
            e.burstCount--;
            shootEnemy(e);
          }
        } else {
          // Waiting for next burst
          if (e.shootTimer >= e.burstCooldown) {
            e.shootTimer = 0;
            e.burstCount = e.burstMax;
            e.laserBurst = (e.type.startsWith('boss') && Math.random() < 0.45);
          }
        }
      }
    }

    function shootEnemy(e) {
      const dx = player.x - e.x, dy = player.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / dist, ny = dy / dist;

      if (e.laserBurst) {
        spawnEnemyLaser(e.x, e.y, player.x, player.y);
        e.burstCount = 0;
        return;
      }

      playSfx('enemyShoot');

      if (e.type === 'small') {
        spawnEnemyBullet(e.x, e.y, nx * 4.0, ny * 4.0, 'normal');

      } else if (e.type === 'medium') {
        spawnEnemyBullet(e.x, e.y, nx * 4.0 - 0.8, ny * 4.0, 'normal');
        spawnEnemyBullet(e.x, e.y, nx * 4.0 + 0.8, ny * 4.0, 'normal');

      } else if (e.type === 'speeder') {
        spawnEnemyBullet(e.x, e.y, nx * 5.5, ny * 5.5, 'normal');

      } else if (e.type === 'tank') {
        for (let a = -1; a <= 1; a++) {
          const ang = Math.atan2(ny, nx) + a * 0.28;
          spawnEnemyBullet(e.x, e.y, Math.cos(ang) * 4.0, Math.sin(ang) * 4.0, 'big');
        }

      } else if (e.type === 'sniper') {
        spawnEnemyBullet(e.x, e.y, nx * 9.0, ny * 9.0, 'normal');

      } else if (e.type === 'boss') {
        const p = Math.floor(e.timer / 180) % 3;
        if (p === 0) {
          for (let a = -2; a <= 2; a++) { // 5-way spread
            const ang = Math.atan2(ny, nx) + a * 0.2;
            spawnEnemyBullet(e.x, e.y, Math.cos(ang) * 4.5, Math.sin(ang) * 4.5, 'normal');
          }
        } else if (p === 1) {
          for (let a = 0; a < 6; a++) { // 6-way burst
            const ang = (a / 6) * Math.PI * 2 + e.timer * 0.04;
            spawnEnemyBullet(e.x, e.y, Math.cos(ang) * 4.0, Math.sin(ang) * 4.0, 'normal');
          }
        } else {
          spawnEnemyBullet(e.x, e.y, nx * 6.5, ny * 6.5, 'big');
        }

      } else if (e.type === 'boss2') {
        const p = Math.floor(e.timer / 150) % 3;
        if (p === 0) {
          for (let a = 0; a < 6; a++) { // 6-way fast spin
            const ang = (a / 6) * Math.PI * 2 + e.timer * 0.035;
            spawnEnemyBullet(e.x, e.y, Math.cos(ang) * 5.0, Math.sin(ang) * 5.0, 'normal');
          }
        } else if (p === 1) {
          for (let a = -2; a <= 2; a += 2) { // 3 heavy lasers intersecting
            const ang = Math.atan2(ny, nx) + a * 0.15;
            spawnEnemyBullet(e.x, e.y, Math.cos(ang) * 6.5, Math.sin(ang) * 6.5, 'normal');
          }
        } else {
          for (let a = -2; a <= 2; a++) { // 5 big bullets instead of 3
            const ang = Math.atan2(ny, nx) + a * 0.20;
            spawnEnemyBullet(e.x, e.y, Math.cos(ang) * 4.5, Math.sin(ang) * 4.5, 'big');
          }
        }

      } else if (e.type === 'boss3') {
        const p = Math.floor(e.timer / 120) % 4;
        if (p === 0) {
          for (let a = 0; a < 10; a++) { // 10-way massive spiral
            const ang = (a / 10) * Math.PI * 2 + e.timer * 0.03;
            spawnEnemyBullet(e.x, e.y, Math.cos(ang) * 5.5, Math.sin(ang) * 5.5, 'normal');
          }
        } else if (p === 1) {
          const offsets = [[-46, 22], [30, 22], [-22, 4], [10, 4]];
          for (const [ox, oy] of offsets) {
            spawnEnemyBullet(e.x + ox, e.y + oy, nx * 6.5, ny * 6.5, 'big');
          }
        } else if (p === 2) {
          for (let a = 0; a < 6; a++) { // Double the spin rays
            const ang = (a / 6) * Math.PI * 2 + e.timer * 0.05;
            spawnEnemyBullet(e.x, e.y, Math.cos(ang) * 6.0, Math.sin(ang) * 6.0, 'normal');
            spawnEnemyBullet(e.x, e.y, Math.cos(ang + Math.PI) * 6.0, Math.sin(ang + Math.PI) * 6.0, 'normal');
          }
        } else {
          for (let a = -3; a <= 3; a++) { // 7-way thick shotgun
            const ang = Math.atan2(ny, nx) + a * 0.18;
            spawnEnemyBullet(e.x, e.y, Math.cos(ang) * 5.0, Math.sin(ang) * 5.0, a === 0 ? 'big' : 'normal');
          }
        }
      }
    }

    // ─── COLLISION ─────────────────────────────────────────────────
    function collide() {
      // Player Continuous Laser (Level 4) vs enemies
      player.laserTargetY = 0;
      if (player.gunLevel === 4) {
        let closestHitY = 0;
        let hitEnemy = null;
        for (const e of enemies) {
          if (e.y < player.y && Math.abs(e.x - player.x) < e.w / 2 + 10) {
            const hitY = e.y + e.h / 2;
            if (hitY > closestHitY) {
              closestHitY = hitY;
              hitEnemy = e;
            }
          }
        }
        player.laserTargetY = closestHitY;
        if (hitEnemy) {
          hitEnemy.hp -= 0.6;
          hitEnemy.hitFlash = 2;
          if (Math.random() < 0.3) spawnHitEffect(player.x + (Math.random() * 8 - 4), closestHitY);
          if (hitEnemy.type.startsWith('boss') && hitEnemy.hp > 0 && Math.random() < 0.04) onBossHit(hitEnemy);
        }
      }

      // Player bullets vs enemies
      for (let bi = playerBullets.length - 1; bi >= 0; bi--) {
        const b = playerBullets[bi];
        for (let ei = enemies.length - 1; ei >= 0; ei--) {
          const e = enemies[ei];
          if (Math.abs(b.x - e.x) < e.w / 2 && Math.abs(b.y - e.y) < e.h / 2) {
            playerBullets.splice(bi, 1);
            if (b.type === 'rocket') {
              spawnExplosion(b.x, b.y, 60, false);
              playSfx('enemyDie');
              for (const oe of enemies) {
                if (Math.abs(oe.x - b.x) < 80 && Math.abs(oe.y - b.y) < 80) {
                  oe.hp -= 5.0;
                  oe.hitFlash = 6;
                  if (oe.type.startsWith('boss') && oe.hp > 0) onBossHit(oe);
                }
              }
            } else {
              e.hp--;
              e.hitFlash = 6;
              spawnHitEffect(b.x, b.y);
              if (e.type.startsWith('boss') && e.hp > 0) onBossHit(e);
              playSfx('enemyHit');
            }
            break;
          }
        }
      }

      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const e = enemies[ei];
        if (e.hp <= 0) {
          score += e.score;
          kills++;
          document.getElementById('scoreDisplay').textContent = score;
          document.getElementById('killDisplay').textContent = kills;
          spawnExplosion(e.x, e.y, e.type.startsWith('boss') ? 50 : (e.type === 'medium' ? 28 : 14), !e.type.startsWith('small'));
          tryDropHeartPack(e.x, e.y);
          tryDropGun(e.x, e.y);
          tryDropShield(e.x, e.y);
          tryDropInvinciblePack(e.x, e.y);
          playSfx('enemyDie');
          if (e.type.startsWith('boss')) {
            document.getElementById('bossHpBar').style.display = 'none';
            if (e.type === 'boss' && (player.baseGunLevel || 1) < 2) {
              player.baseGunLevel = 2;
              showWaveAnnounce('TWIN SHOT\nPERMANENTLY UNLOCKED!');
              playSfx('gunPickup');
              if (player.gunTimer <= 0 || player.gunLevel < 2) {
                player.gunLevel = 2;
                player.shootInterval = GUNS[2].interval;
                player.gunTimer = 0;
              }
            } else if (e.type === 'boss2' && (player.baseGunLevel || 1) < 3) {
              player.baseGunLevel = 3;
              showWaveAnnounce('SPREAD SHOT\nPERMANENTLY UNLOCKED!');
              playSfx('gunPickup');
              if (player.gunTimer <= 0 || player.gunLevel < 3) {
                player.gunLevel = 3;
                player.shootInterval = GUNS[3].interval;
                player.gunTimer = 0;
              }
            }
          }
          enemies.splice(ei, 1);
        }
      }

      // Enemy bullets vs player
      if (player.invincible > 0) return;
      for (let bi = enemyBullets.length - 1; bi >= 0; bi--) {
        const b = enemyBullets[bi];
        const pr = 16;
        const dmg = b.type === 'big' ? 2 : 1; // Red bullets deal 2 damage
        if (Math.abs(b.x - player.x) < pr && Math.abs(b.y - player.y) < pr) {
          enemyBullets.splice(bi, 1);
          if (player.shields > 0) {
            player.shields = Math.max(0, player.shields - dmg);
            player.shield = player.shields > 0;
            player.invincible = 30;
            playSfx('shieldBreak');
            spawnExplosion(player.x, player.y, 8);
            updateHealthUI();
          } else {
            player.hp = Math.max(0, player.hp - dmg);
            player.invincible = 45;
            spawnExplosion(player.x, player.y, 10);
            updateHealthUI();
            playSfx('playerHit');
            if (player.hp <= 0) triggerGameOver();
          }
          break;
        }
      }

      // Enemy body vs player
      for (const e of enemies) {
        if (player.invincible > 0) break;
        if (Math.abs(e.x - player.x) < (e.w / 2 + 14) && Math.abs(e.y - player.y) < (e.h / 2 + 14)) {
          if (player.shields > 0) {
            player.shields--;
            player.shield = player.shields > 0;
            player.invincible = 30;
            playSfx('shieldBreak');
            spawnExplosion(player.x, player.y, 8);
            updateHealthUI();
          } else {
            player.hp--;
            player.invincible = 60;
            spawnExplosion(player.x, player.y, 10);
            updateHealthUI();
            if (player.hp <= 0) { triggerGameOver(); break; }
          }
        }
      }
    }

    // ─── HUD ───────────────────────────────────────────────────────
    function updateHealthUI() {
      const bar = document.getElementById('healthBar');
      bar.innerHTML = '';
      for (let i = 0; i < player.maxHp; i++) {
        const s = document.createElement('span');
        if (i < player.shields) {
          // This heart is covered by a shield
          s.className = 'heart';
          s.textContent = '🛡';
          s.style.filter = 'drop-shadow(0 0 4px #44aaff)';
        } else {
          s.className = 'heart' + (i < player.hp ? '' : ' empty');
          s.textContent = '♥';
        }
        bar.appendChild(s);
      }
    }

    function showBossHpBar() {
      document.getElementById('bossHpBar').style.display = 'flex';
      document.getElementById('bossHpFill').style.width = '100%';
    }

    // ─── HEART PACKS ───────────────────────────────────────────────
    const heartPacks = [];

    function tryDropHeartPack(x, y) {
      if (Math.random() < 0.05) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 1.2 + Math.random() * 1.2;
        heartPacks.push({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          r: 12,
          bob: Math.random() * Math.PI * 2,
          life: 1.0,
        });
      }
    }

    function updateHeartPacks() {
      for (let i = heartPacks.length - 1; i >= 0; i--) {
        const h = heartPacks[i];
        h.bob += 0.06;
        h.x += h.vx;
        h.y += h.vy;
        h.life -= 0.000833; // fade over 1200 frames (~20s at 60fps)

        // Remove if fully faded
        if (h.life <= 0) { heartPacks.splice(i, 1); continue; }

        // Bounce off all walls
        if (h.x - h.r < 0) { h.x = h.r; h.vx = Math.abs(h.vx); }
        if (h.x + h.r > W) { h.x = W - h.r; h.vx = -Math.abs(h.vx); }
        if (h.y - h.r < 0) { h.y = h.r; h.vy = Math.abs(h.vy); }
        if (h.y + h.r > H) { h.y = H - h.r; h.vy = -Math.abs(h.vy); }

        // Collect
        if (Math.abs(h.x - player.x) < 22 && Math.abs(h.y - player.y) < 22) {
          if (player.hp < player.maxHp) {
            player.hp++;
            updateHealthUI();
          }
          playSfx('heartPickup');
          spawnHeartCollectEffect(h.x, h.y);
          heartPacks.splice(i, 1);
        }
      }
    }

    function spawnHeartCollectEffect(x, y) {
      for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * 3 + 1;
        particles.push({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - 1,
          r: Math.random() * 4 + 2,
          life: 1, decay: 0.05,
          color: '#ff4488',
          type: 'spark'
        });
      }
    }

    function drawHeartPacks() {
      for (const h of heartPacks) {
        const bobY = Math.sin(h.bob) * 3;
        ctx.save();
        ctx.globalAlpha = h.life;
        ctx.translate(h.x, h.y + bobY);

        // Glow ring
        ctx.shadowColor = '#ff4488';
        ctx.shadowBlur = 16;

        // Pill background
        ctx.fillStyle = 'rgba(30, 10, 20, 0.75)';
        ctx.beginPath();
        ctx.arc(0, 0, h.r, 0, Math.PI * 2);
        ctx.fill();

        // Border
        ctx.strokeStyle = '#ff4488';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, h.r, 0, Math.PI * 2);
        ctx.stroke();

        // Heart symbol
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ff4488';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♥', 0, 1);

        ctx.restore();
      }
    }

    // ─── INVINCIBLE PACKS ─────────────────────────────────────────
    const invinciblePacks = [];
    const INVINCIBLE_DURATION = 180; // 3 seconds of invincibility

    function tryDropInvinciblePack(x, y) {
      if (Math.random() < 0.05) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 1.0 + Math.random() * 1.0;
        invinciblePacks.push({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          bob: Math.random() * Math.PI * 2,
          life: 1.0,
        });
      }
    }

    function updateInvinciblePacks() {
      for (let i = invinciblePacks.length - 1; i >= 0; i--) {
        const p = invinciblePacks[i];
        p.bob += 0.06;
        p.x += p.vx; p.y += p.vy;
        p.life -= 0.000833; // fade over 1200 frames (~20s at 60fps)

        if (p.life <= 0) { invinciblePacks.splice(i, 1); continue; }

        // Bounce off all walls
        if (p.x - 12 < 0) { p.x = 12; p.vx = Math.abs(p.vx); }
        if (p.x + 12 > W) { p.x = W - 12; p.vx = -Math.abs(p.vx); }
        if (p.y - 12 < 0) { p.y = 12; p.vy = Math.abs(p.vy); }
        if (p.y + 12 > H) { p.y = H - 12; p.vy = -Math.abs(p.vy); }
        // Collect
        if (Math.abs(p.x - player.x) < 22 && Math.abs(p.y - player.y) < 22) {
          player.invincible = INVINCIBLE_DURATION;
          playSfx('invinciblePickup');
          showWaveAnnounce('⚡ INVINCIBLE!');
          spawnInvincibleEffect(p.x, p.y);
          invinciblePacks.splice(i, 1);
        }
      }
    }

    function spawnInvincibleEffect(x, y) {
      for (let i = 0; i < 14; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * 4 + 1;
        particles.push({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          r: Math.random() * 4 + 2,
          life: 1, decay: 0.04,
          color: '#ffee00',
          type: 'spark'
        });
      }
    }

    function drawInvinciblePacks() {
      for (const p of invinciblePacks) {
        const bobY = Math.sin(p.bob) * 3;
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y + bobY);
        ctx.shadowColor = '#ffee00'; ctx.shadowBlur = 16;
        // Background
        ctx.fillStyle = 'rgba(20,15,0,0.8)';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
        // Border — gold pulsing
        ctx.strokeStyle = '#ffee00'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        // Icon
        ctx.fillStyle = '#ffee00';
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚡', 0, 1);
        ctx.restore();
      }
    }

    // Draw invincible timer bar above player when active
    function drawInvincibleHUD() {
      if (player.invincible <= 0) return;
      const barW = 50, barH = 4;
      const pct = player.invincible / INVINCIBLE_DURATION;
      const bx = player.x - barW / 2, by = player.y - player.h / 2 - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = '#ffee00';
      ctx.shadowColor = '#ffee00'; ctx.shadowBlur = 6;
      ctx.fillRect(bx, by, barW * pct, barH);
      ctx.shadowBlur = 0;
    }
    // ─── VIRTUAL JOYSTICK DRAWING ─────────────────────────────────
    function drawTouchJoystick() {
      if (!joystickVisible || !touchActive) return;
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = '#00ffc8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(joystickBaseX, joystickBaseY, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.moveTo(joystickBaseX, joystickBaseY);
      ctx.lineTo(joystickKnobX, joystickKnobY);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#00ffc8';
      ctx.shadowColor = '#00ffc8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(joystickKnobX, joystickKnobY, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    function showWaveAnnounce(text) {
      const el = document.getElementById('wave-announce');
      el.textContent = text;
      el.style.opacity = '1';
      setTimeout(() => { el.style.opacity = '0'; }, 2000);
    }

    // ─── GAME LOOP ─────────────────────────────────────────────────
    let waveTimer = 0;
    const WAVE_INTERVAL = 420;

    function drawBackground() {
      // Deep sky
      const sg = ctx.createLinearGradient(0, 0, 0, H);
      sg.addColorStop(0, '#0a1a28');
      sg.addColorStop(1, '#152838');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H);

      // Ground layers
      for (let i = 0; i < groundLayers.length; i++) {
        const l = groundLayers[i];
        l.y += l.speed;
        if (l.y >= H) l.y -= H * 2;
        ctx.globalAlpha = l.alpha;
        ctx.drawImage(terrainCanvases[i % 2], 0, l.y, W, H);
        ctx.drawImage(terrainCanvases[i % 2], 0, l.y - H, W, H);
      }
      ctx.globalAlpha = 1;

      // Stars/clouds
      for (const s of stars) {
        s.y += s.speed * 0.3;
        if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
        ctx.globalAlpha = s.alpha * 0.5;
        ctx.fillStyle = '#b0d8ff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const TARGET_FPS = 60;
    const FRAME_DURATION = 1000 / TARGET_FPS;
    let lastFrameTime = 0;
    let bossReinforceTimer = 0;
    const BOSS_REINFORCE_INTERVAL = 300; // send reinforcements every 5 seconds

    function gameLoop(timestamp) {
      if (!gameRunning) return;
      animId = requestAnimationFrame(gameLoop);

      if (isPaused) return;

      const elapsed = timestamp - lastFrameTime;
      if (elapsed < FRAME_DURATION - 2) return; // -2ms tolerance to avoid skipping frames
      lastFrameTime = timestamp;

      frameCount++;

      drawBackground();

      // Wave management — next wave triggers immediately after all enemies are killed
      const activeBoss = enemies.find(e => e.type.startsWith('boss'));
      if (activeBoss) {
        if (currentMusicMode !== activeBoss.type) {
          startMusic(activeBoss.type);
        }
      } else if (!activeBoss && currentMusicMode !== 'regular') {
        startMusic('regular');
      }
      if (enemies.length === 0) {
        bossReinforceTimer = 0;
        waveTimer++;
        if (waveTimer >= 90) {
          waveTimer = 0;
          wave++;
          document.getElementById('waveDisplay').textContent = wave;
          spawnWave();
          if (wave % 5 === 0) { showBossHpBar(); playSfx('bossAlarm'); }
        }
      } else {
        waveTimer = 0;
        // During boss fights, periodically send small reinforcements
        if (hasBoss) {
          bossReinforceTimer++;
          if (bossReinforceTimer >= BOSS_REINFORCE_INTERVAL) {
            bossReinforceTimer = 0;
            const count = 2 + Math.floor(wave / 5); // more reinforcements in later waves
            for (let i = 0; i < Math.min(count, 5); i++) {
              const x = 40 + Math.random() * (W - 80);
              const y = -40 - i * 30;
              spawnEnemy('small', x, y, Math.random() < 0.5 ? 'zigzag' : 'straight');
            }
            showWaveAnnounce('⚡ REINFORCEMENTS!');
          }
        }
      }

      globalLaserTimer--;
      if (globalLaserTimer <= 0 && gameRunning) {
        globalLaserTimer = 500 + Math.random() * 600;
        const lx = player.x + (Math.random() * 80 - 40);
        spawnEnemyLaser(lx, -20, lx, H + 20, 100);
      }

      updatePlayer();
      updateEnemies();
      updateBullets();
      updateParticles();
      updateHeartPacks();
      updateGunDrops();
      updateShieldDrops();
      updateInvinciblePacks();
      collide();

      // Draw order
      drawPlayerBullets();
      drawPlayerLaser();
      drawEnemyBullets();
      drawEnemyLasers();
      for (const e of enemies) drawEnemy(e);
      drawHeartPacks();
      drawGunDrops();
      drawShieldDrops();
      drawInvinciblePacks();
      drawParticles();
      drawShield();
      drawPlayer();
      drawInvincibleHUD();
      drawTouchJoystick();
      updateGunUI();
    }

    // ─── GAME OVER ─────────────────────────────────────────────────
    function triggerGameOver() {
      gameRunning = false;
      document.getElementById('pauseBtnMain').classList.remove('visible');
      stopMusic();
      spawnExplosion(player.x, player.y, 40, true);
      playSfx('gameOver');

      setTimeout(() => {
        const overlay = document.getElementById('overlay');
        overlay.classList.remove('hidden');
        document.getElementById('startBtn').textContent = 'RETRY';
        document.getElementById('menuBtn').style.display = 'inline-block';
        document.getElementById('titleLine1').textContent = 'GAME';
        document.getElementById('titleLine2').textContent = 'OVER';
        document.getElementById('titleSub').textContent = 'MISSION FAILED';
        document.getElementById('finalScore').style.display = 'block';
        document.getElementById('finalScoreLabel').style.display = 'block';
        document.getElementById('finalScore').textContent = score.toLocaleString();
        document.getElementById('finalKills').style.display = 'block';
        document.getElementById('finalKillsLabel').style.display = 'block';
        document.getElementById('finalKills').textContent = kills;
      }, 1200);
    }

    // ─── START GAME ────────────────────────────────────────────────
    function startGame() {
      // Reset
      score = 0; kills = 0; wave = 1; frameCount = 0; waveTimer = 0;
      document.getElementById('scoreDisplay').textContent = '0';
      document.getElementById('killDisplay').textContent = '0';
      document.getElementById('waveDisplay').textContent = '1';
      document.getElementById('bossHpBar').style.display = 'none';

      enemies.length = 0;
      playerBullets.length = 0;
      enemyBullets.length = 0;
      enemyLasers.length = 0;
      globalLaserTimer = 400;
      particles.length = 0;
      heartPacks.length = 0;
      gunDrops.length = 0;
      shieldDrops.length = 0;
      invinciblePacks.length = 0;
      bossReinforceTimer = 0;
      if (audioCtx.state === 'suspended') audioCtx.resume();

      // Reset overlay titles
      document.getElementById('titleLine1').textContent = 'SPACE';
      document.getElementById('titleLine2').textContent = 'JET';
      document.getElementById('titleSub').textContent = 'ARCADE SHOOTER';
      document.getElementById('finalScore').style.display = 'none';
      document.getElementById('finalScoreLabel').style.display = 'none';
      document.getElementById('finalKills').style.display = 'none';
      document.getElementById('finalKillsLabel').style.display = 'none';
      document.getElementById('startBtn').textContent = 'LAUNCH';
      document.getElementById('menuBtn').style.display = 'none';

      resetPlayer();
      updateHealthUI();

      document.getElementById('overlay').classList.add('hidden');

      if (animId) cancelAnimationFrame(animId);
      gameRunning = true;
      lastFrameTime = 0;
      isPaused = false;
      document.getElementById('pauseOverlay').style.display = 'none';
      document.getElementById('pauseBtnMain').classList.add('visible');
      stopMusic();
      startMusic();
      spawnWave();
      animId = requestAnimationFrame(gameLoop);
    }

    // ─── FULLSCREEN SUPPORT ──────────────────────────────────────
    function toggleFullscreen() {
      const el = document.documentElement;
      if (!document.fullscreenElement) {
        (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen).call(el);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
      }
    }

    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window && window.innerWidth < 800);

    function requestMobileFullscreen() {
      if (isMobile && !document.fullscreenElement) {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (req) req.call(el).catch(() => { });
      }
    }

    if (isMobile && screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('portrait').catch(() => { });
    }

    document.getElementById('startBtn').addEventListener('click', () => {
      requestMobileFullscreen();
      startGame();
    });

    // ─── RETURN TO MENU ──────────────────────────────────────────
    function returnToMenu() {
      gameRunning = false;
      document.getElementById('pauseBtnMain').classList.remove('visible');
      if (animId) cancelAnimationFrame(animId);
      stopMusic();
      enemies.length = 0;
      playerBullets.length = 0;
      enemyBullets.length = 0;
      enemyLasers.length = 0;
      particles.length = 0;
      heartPacks.length = 0;
      gunDrops.length = 0;
      shieldDrops.length = 0;
      invinciblePacks.length = 0;

      document.getElementById('titleLine1').textContent = 'SPACE';
      document.getElementById('titleLine2').textContent = 'JET';
      document.getElementById('titleSub').textContent = 'ARCADE SHOOTER';
      document.getElementById('finalScore').style.display = 'none';
      document.getElementById('finalScoreLabel').style.display = 'none';
      document.getElementById('finalKills').style.display = 'none';
      document.getElementById('finalKillsLabel').style.display = 'none';
      document.getElementById('startBtn').textContent = 'LAUNCH';
      document.getElementById('menuBtn').style.display = 'none';
      document.getElementById('bossHpBar').style.display = 'none';
      document.getElementById('overlay').classList.remove('hidden');
    }

    document.getElementById('menuBtn').addEventListener('click', returnToMenu);
  