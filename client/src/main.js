import * as THREE from 'three';
import geckos from '@geckos.io/client';
import { Engine } from './engine.js';
import { Input } from './input.js';
import { FeedbackSystem } from './feedback.js';
import { Minimap } from './minimap.js';
import { Progression } from './progression.js';
import { getWeaponByKey, getWeaponById, WEAPONS } from './weapons.js';
import { generateMap, mapData, grid, GRID_SIZE, CELL_SIZE, OFFSET, jumpPads } from '../../shared/map.js';

// Configuração do Jogador Local
const localPlayer = {
  id: null,
  x: 0,
  y: 1, 
  z: 0,
  rY: 0,
  hp: 100,
  weapon: getWeaponById('pistol'),
  ammo: 12,
  ammoStore: {}, // per-weapon remaining ammo, persists across switches
  reloading: false,
  isSprinting: false,
  isSliding: false,
  slideTimer: 0,
  slideCooldown: 0,
  dashCooldown: 0,
  grenadeCooldown: 0,
  fireCooldown: 0,
  isADS: false,
  bloom: 0, // spread acumulado por disparo, recupera parado
  vX: 0,
  vY: 0,
  vZ: 0,
  isGrounded: true,
  totalKills: 0,
  totalDeaths: 0,
  killStreak: 0
};

let matchTimer = 300; // 5 minute rounds

// UI Elements
const uiHp = document.getElementById('ui-hp');
const uiAmmo = document.getElementById('ui-ammo');
const btnEnter = document.getElementById('btn-enter');
const lobby = document.getElementById('lobby');
const hud = document.getElementById('hud');
const deathScreen = document.getElementById('death-screen');
const scopeOverlay = document.getElementById('sniper-scope');
const crosshairEl = document.querySelector('.crosshair');
const hpFill = document.getElementById('hp-fill');

// Atualiza número + barra de vida (cor muda conforme o HP)
function updateHpUI(hp) {
  const v = Math.max(0, Math.min(100, Math.ceil(hp)));
  uiHp.innerText = v;
  if (hpFill) {
    hpFill.style.width = v + '%';
    const color = v > 50 ? '#00ff66' : (v > 20 ? '#ffcc00' : '#ff0033');
    hpFill.style.background = color;
    hpFill.style.boxShadow = `0 0 8px ${color}`;
  }
}

// Game State
let engine;
let channel;
let isConnected = false;
let isPlaying = false;
let lobbyTime = 0;
let lastTime = performance.now();
let serverEntities = {};
let serverMedkits = [];

// Systems
let feedback;
let minimap;
let progression;

// Initialize Engine Immediately for Lobby Background
engine = new Engine(document.getElementById('app'));

function initGameSystems() {
  Input.init();
  feedback = new FeedbackSystem();
  
  const minimapCanvas = document.getElementById('minimap');
  if (minimapCanvas) minimap = new Minimap(minimapCanvas);
  
  progression = new Progression();

  // Seed each weapon with a full magazine
  for (const w of WEAPONS) localPlayer.ammoStore[w.id] = w.magSize;
  localPlayer.ammo = localPlayer.ammoStore[localPlayer.weapon.id];

  engine.setWeaponModel(localPlayer.weapon.id);
  uiAmmo.innerText = localPlayer.ammo;
  
  if (minimap) minimap.setMapData(grid, GRID_SIZE, CELL_SIZE, OFFSET);
}

// Conectar ao servidor imediatamente para receber o mapa
function connectBackground() {
  channel = geckos({ port: 3000 });

  channel.onConnect(error => {
    if (error) {
      console.error('Connection error:', error);
      return;
    }
    
    isConnected = true;
    
    channel.on('init', data => {
      console.log(`[NULL] Connected! Seed: ${data.seed} | ID: ${data.id}`);
      localPlayer.id = data.id;
      
      generateMap(data.seed);
      engine.setupWorld(); // Generate world meshes now that mapData exists
      engine.localId = data.id;

      // Lobby pronto para jogar
      btnEnter.disabled = false;
      const lbl = document.getElementById('btn-enter-label');
      if (lbl) lbl.innerText = 'INICIAR CONEXÃO';
      const status = document.getElementById('os-status');
      if (status) status.innerHTML = 'SERVER: <b style="color:var(--primary)">ONLINE</b>';

      // Update minimap with map data if already initialized
      if (minimap) minimap.setMapData(grid, GRID_SIZE, CELL_SIZE, OFFSET);
    });

    channel.on('stateUpdate', state => {
      serverEntities = { ...state.players, ...state.bots };
      serverMedkits = state.medkits || [];
      engine.updateEntities(state);
      if (isPlaying) {
        updateScoreboard(serverEntities);

        // Sincronizar stats do player local
        if (state.players[localPlayer.id]) {
          localPlayer.hp = state.players[localPlayer.id].hp;
          updateHpUI(localPlayer.hp);
        }
      }
    });

    channel.on('hitConfirm', data => {
      if (!isPlaying) return;
      feedback.showHitmarker(data.headshot);
      if (data.killed) {
        localPlayer.totalKills++;
        localPlayer.killStreak++;
        progression.registerKill();
        const target = serverEntities[data.targetId];
        if (target) {
          feedback.showKillConfirmation(target.nickname || 'BOT');
        }

        // Kill streak announcements (consecutive kills without dying)
        const streakMsgs = { 3: 'TRIPLE KILL!', 5: 'KILLING SPREE!', 10: 'UNSTOPPABLE!', 20: 'GODLIKE!' };
        if (streakMsgs[localPlayer.killStreak]) {
          showAnnouncement(streakMsgs[localPlayer.killStreak]);
        }
      }
    });

    channel.on('damaged', data => {
      if (!isPlaying) return;
      feedback.triggerDamageFlash();
      feedback.triggerShake(0.05);

      const dx = data.fromX - localPlayer.x;
      const dz = data.fromZ - localPlayer.z;
      const angle = Math.atan2(dx, dz) - localPlayer.rY;
      feedback.showDamageIndicator(angle);
    });

    channel.on('heal', data => {
      if (!isPlaying) return;
      localPlayer.hp = Math.min(100, localPlayer.hp + data.amount);
      updateHpUI(localPlayer.hp);
    });

    channel.on('killfeed', data => {
      if (!isPlaying) return;
      const rank = getPlayerRank(data.attackerKills || 0);
      const feed = document.getElementById('killfeed');
      const p = document.createElement('p');
      p.innerHTML = `<span style="color:${rank.color}; font-weight: bold;">${rank.name}</span> ${data.msg} [${data.weapon}]${data.headshot ? ' (HS)' : ''}`;
      feed.appendChild(p);
      setTimeout(() => {
        if (p.parentNode) feed.removeChild(p);
      }, 4000);
    });

    channel.on('explosion', data => {
      if (!isPlaying) return;
      // Visual flash
      const flashDiv = document.createElement('div');
      flashDiv.className = 'explosion-flash';
      document.body.appendChild(flashDiv);
      setTimeout(() => flashDiv.remove(), 500);
      
      // Camera shake based on distance
      const dist = Math.hypot(localPlayer.x - data.x, localPlayer.z - data.z);
      if (dist < data.radius * 2) {
        feedback.triggerShake(0.3 * (1 - dist / (data.radius * 2)));
      }
    });

    channel.on('playerDied', data => {
      if (!isPlaying) return;
      document.exitPointerLock();
      hud.classList.add('hidden');
      deathScreen.classList.remove('hidden');
      progression.registerDeath();
      localPlayer.totalDeaths++;
      localPlayer.killStreak = 0;
      localPlayer.isADS = false;
      engine.setAim(false, false);
      if (scopeOverlay) scopeOverlay.classList.add('hidden');
      if (crosshairEl) crosshairEl.style.opacity = '1';
      
      // Respawn after 3 seconds instead of reloading page
      setTimeout(() => {
        deathScreen.classList.add('hidden');
        hud.classList.remove('hidden');
        
        // Reset player state
        localPlayer.hp = 100;
        for (const w of WEAPONS) localPlayer.ammoStore[w.id] = w.magSize;
        localPlayer.ammo = localPlayer.ammoStore[localPlayer.weapon.id];
        localPlayer.reloading = false;
        localPlayer.vX = 0;
        localPlayer.vY = 0;
        localPlayer.vZ = 0;
        localPlayer.dashCooldown = 0;
        localPlayer.grenadeCooldown = 0;
        updateHpUI(100);
        uiAmmo.innerText = localPlayer.ammo;
        
        // Request new spawn position from server
        channel.emit('respawn', {});
        
        document.body.requestPointerLock();
      }, 3000);
    });

    channel.on('respawned', data => {
      localPlayer.x = data.x;
      localPlayer.y = data.y;
      localPlayer.z = data.z;
    });
  });
}

btnEnter.addEventListener('click', () => {
  if (!isConnected) return; // Wait until connected
  
  const nickname = document.getElementById('nickname').value || 'Operador';
  lobby.classList.add('hidden');
  hud.classList.remove('hidden');
  
  initGameSystems();
  
  // Set initial position based on server (which assigned it)
  if (serverEntities[localPlayer.id]) {
    localPlayer.x = serverEntities[localPlayer.id].x;
    localPlayer.z = serverEntities[localPlayer.id].z;
  }
  
  channel.emit('input', { nickname }); 
  
  updateInventoryHUD(localPlayer.weapon.id);
  
  isPlaying = true;
  document.body.requestPointerLock();
});

function updateInventoryHUD(weaponId) {
  for (let i = 1; i <= 4; i++) {
    const slot = document.getElementById(`slot-${i}`);
    if (slot) slot.classList.remove('active');
  }
  const w = getWeaponById(weaponId);
  if (w) {
    const activeSlot = document.getElementById(`slot-${w.key}`);
    if (activeSlot) activeSlot.classList.add('active');
  }
}

function showAnnouncement(text) {
  const el = document.createElement('div');
  el.className = 'glitch announcement';
  el.setAttribute('data-text', text);
  el.innerText = text;
  document.getElementById('hud').appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function handleInputAndMovement(deltaTime) {
  if (localPlayer.hp <= 0 || !isPlaying) return;

  if (Input.keys.tab) {
    document.getElementById('scoreboard-overlay').classList.remove('hidden');
  } else {
    document.getElementById('scoreboard-overlay').classList.add('hidden');
  }

  for (let i = 1; i <= 4; i++) {
    if (Input.isJustPressed(i.toString())) {
      const w = getWeaponByKey(i);
      if (w && w.id !== localPlayer.weapon.id && !localPlayer.reloading) {
        localPlayer.ammoStore[localPlayer.weapon.id] = localPlayer.ammo; // save current
        localPlayer.weapon = w;
        localPlayer.ammo = localPlayer.ammoStore[w.id] ?? w.magSize; // restore
        engine.setWeaponModel(w.id);
        uiAmmo.innerText = localPlayer.ammo;
        updateInventoryHUD(w.id);
        channel.emit('input', { weapon: w.id });
      }
    }
  }

  // Scale look speed with zoom so aiming stays precise while scoped
  const rotSpeed = 0.002 * (engine.camera.fov / 75);
  localPlayer.rY -= Input.movementX * rotSpeed;
  engine.camera.rotation.x -= Input.movementY * rotSpeed;
  engine.camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, engine.camera.rotation.x));
  
  Input.resetMouseMovement();

  if (Input.isJustPressed(' ') && localPlayer.isGrounded) {
    localPlayer.vY = 12; // Pulo
    localPlayer.isGrounded = false;
  }

  let dirX = 0;
  let dirZ = 0;
  
  if (Input.keys.w) dirZ -= 1;
  if (Input.keys.s) dirZ += 1;
  if (Input.keys.a) dirX -= 1;
  if (Input.keys.d) dirX += 1;

  const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
  if (length > 0) {
    dirX /= length;
    dirZ /= length;
  }

  // Dash UI update
  const uiDash = document.getElementById('ui-dash');
  if (localPlayer.dashCooldown > 0) {
    localPlayer.dashCooldown -= deltaTime;
    if (uiDash) {
      uiDash.innerText = localPlayer.dashCooldown.toFixed(1) + 's';
      uiDash.style.color = '#ff0033';
    }
  } else if (uiDash && uiDash.innerText !== 'RDY') {
    uiDash.innerText = 'RDY';
    uiDash.style.color = '#00ff66';
  }

  // Dash Mechanic (Q or E)
  if (localPlayer.dashCooldown <= 0 && localPlayer.isGrounded) {
    let dashed = false;
    let dashDirX = 0;
    if (Input.isJustPressed('q')) {
      dashDirX = -1; dashed = true;
    } else if (Input.isJustPressed('e')) {
      dashDirX = 1; dashed = true;
    }

    if (dashed) {
      localPlayer.dashCooldown = 3.0; // 3 seconds cooldown
      const right = new THREE.Vector3(Math.cos(localPlayer.rY), 0, -Math.sin(localPlayer.rY));
      const boost = new THREE.Vector3().addScaledVector(right, dashDirX).normalize().multiplyScalar(40);
      localPlayer.vX = boost.x;
      localPlayer.vZ = boost.z;
    }
  }

  // Grenade (G key)
  if (localPlayer.grenadeCooldown > 0) {
    localPlayer.grenadeCooldown -= deltaTime;
  }
  if (Input.isJustPressed('g') && localPlayer.grenadeCooldown <= 0) {
    localPlayer.grenadeCooldown = 8.0;
    channel.emit('grenade', {
      x: localPlayer.x,
      y: localPlayer.y,
      z: localPlayer.z,
      rY: localPlayer.rY
    });
  }

  // Controls overlay (F1)
  const controlsOverlay = document.getElementById('controls-overlay');
  if (controlsOverlay) {
    if (Input.isJustPressed('f1')) {
      controlsOverlay.classList.toggle('hidden');
    }
  }

  // Camera Tilt (Roll) baseado no Strafe
  const targetTilt = dirX * -0.04;
  engine.camera.rotation.z = THREE.MathUtils.lerp(engine.camera.rotation.z, targetTilt, deltaTime * 10);

  localPlayer.isSprinting = false;
  let maxSpeed = 12;
  let accel = 60;
  let friction = 10;
  
  if (localPlayer.slideCooldown > 0) localPlayer.slideCooldown -= deltaTime;
  if (localPlayer.slideTimer > 0) {
    localPlayer.slideTimer -= deltaTime;
    localPlayer.isSliding = true;
    maxSpeed = 22;
    accel = 10; 
    friction = 2; // Desliza mais longe
  } else {
    localPlayer.isSliding = false;
    
    if (Input.keys.shift && dirZ < 0 && localPlayer.isGrounded) {
      localPlayer.isSprinting = true;
      maxSpeed = 18;
      
      if (Input.keys.control && localPlayer.slideCooldown <= 0) {
        localPlayer.slideTimer = 0.5;
        localPlayer.slideCooldown = 1.5;
        
        // Impulso do slide
        const right = new THREE.Vector3(Math.cos(localPlayer.rY), 0, -Math.sin(localPlayer.rY));
        const forward = new THREE.Vector3(Math.sin(localPlayer.rY), 0, Math.cos(localPlayer.rY));
        const boost = new THREE.Vector3().addScaledVector(right, dirX).addScaledVector(forward, dirZ).normalize().multiplyScalar(25);
        localPlayer.vX = boost.x;
        localPlayer.vZ = boost.z;
      }
    }
  }

  const right = new THREE.Vector3(Math.cos(localPlayer.rY), 0, -Math.sin(localPlayer.rY));
  const forward = new THREE.Vector3(Math.sin(localPlayer.rY), 0, Math.cos(localPlayer.rY));
  
  const targetDir = new THREE.Vector3()
    .addScaledVector(right, dirX)
    .addScaledVector(forward, dirZ);

  if (!localPlayer.isGrounded) {
    accel *= 0.2; // Menos controle no ar
  }

  if (targetDir.lengthSq() > 0) {
    localPlayer.vX += targetDir.x * accel * deltaTime;
    localPlayer.vZ += targetDir.z * accel * deltaTime;
  } else if (localPlayer.isGrounded) {
    localPlayer.vX -= localPlayer.vX * friction * deltaTime;
    localPlayer.vZ -= localPlayer.vZ * friction * deltaTime;
  }

  // Limita a velocidade máxima horizontal
  const currentSpeed = Math.sqrt(localPlayer.vX * localPlayer.vX + localPlayer.vZ * localPlayer.vZ);
  if (currentSpeed > maxSpeed && !localPlayer.isSliding) {
    localPlayer.vX = (localPlayer.vX / currentSpeed) * maxSpeed;
    localPlayer.vZ = (localPlayer.vZ / currentSpeed) * maxSpeed;
  }

  // --- Colisão com verticalidade ---
  const EYE = 1.0;   // altura do olho acima dos pés
  const STEP = 0.6;  // degrau máximo que sobe automaticamente
  const pSize = 0.4;
  const feet = localPlayer.y - EYE;

  // Movimento horizontal: só bloqueia caixas altas demais para subir (degrau)
  const moveVectorX = localPlayer.vX * deltaTime;
  const moveVectorZ = localPlayer.vZ * deltaTime;
  let nextX = localPlayer.x + moveVectorX;
  let nextZ = localPlayer.z + moveVectorZ;

  let colX = false;
  let colZ = false;

  for (const aabb of mapData) {
    if (aabb.maxY <= feet + STEP) continue; // dá pra subir/pisar em cima → não é parede
    if (nextX + pSize > aabb.minX && nextX - pSize < aabb.maxX &&
        localPlayer.z + pSize > aabb.minZ && localPlayer.z - pSize < aabb.maxZ) {
      colX = true;
    }
    if (localPlayer.x + pSize > aabb.minX && localPlayer.x - pSize < aabb.maxX &&
        nextZ + pSize > aabb.minZ && nextZ - pSize < aabb.maxZ) {
      colZ = true;
    }
  }

  if (!colX) localPlayer.x = nextX; else localPlayer.vX = 0;
  if (!colZ) localPlayer.z = nextZ; else localPlayer.vZ = 0;

  // Gravidade
  localPlayer.vY -= 30 * deltaTime;
  localPlayer.y += localPlayer.vY * deltaTime;

  // Altura do chão sob o jogador: topo da caixa mais alta pisável, ou o piso (0)
  let ground = 0;
  const newFeet = localPlayer.y - EYE;
  for (const aabb of mapData) {
    if (localPlayer.x + pSize > aabb.minX && localPlayer.x - pSize < aabb.maxX &&
        localPlayer.z + pSize > aabb.minZ && localPlayer.z - pSize < aabb.maxZ) {
      if (aabb.maxY > ground && aabb.maxY <= newFeet + STEP) ground = aabb.maxY;
    }
  }

  if (newFeet <= ground) {
    localPlayer.y = ground + EYE;
    localPlayer.vY = 0;
    localPlayer.isGrounded = true;

    // Jump Pad só funciona no piso térreo
    if (ground === 0) {
      for (const jp of jumpPads) {
        if (Math.abs(localPlayer.x - jp.x) < 1.0 && Math.abs(localPlayer.z - jp.z) < 1.0) {
          localPlayer.vY = 35; // Boing!
          localPlayer.isGrounded = false;
          break;
        }
      }
    }
  } else {
    localPlayer.isGrounded = false;
  }

  // Aim-down-sights FOV zoom (disabled while sprinting/sliding)
  const canADS = localPlayer.isADS && !localPlayer.isSprinting && !localPlayer.isSliding;
  const targetFov = canADS ? localPlayer.weapon.zoomFov : 75;
  if (Math.abs(engine.camera.fov - targetFov) > 0.1) {
    engine.camera.fov = THREE.MathUtils.lerp(engine.camera.fov, targetFov, deltaTime * 12);
    engine.camera.updateProjectionMatrix();
  }

  // Ativa a mira: sniper usa luneta (esconde a arma), demais usam mira de ferro centralizada
  const scoping = canADS && localPlayer.weapon.id === 'sniper';
  engine.setAim(canADS, scoping);
  if (scopeOverlay) scopeOverlay.classList.toggle('hidden', !scoping);
  if (crosshairEl) crosshairEl.style.opacity = (canADS && !scoping) ? '0.35' : (scoping ? '0' : '1');

  let camOffset = localPlayer.isSliding ? -0.5 : 0;
  engine.camera.position.set(localPlayer.x, localPlayer.y + camOffset, localPlayer.z);
  engine.camera.rotation.y = localPlayer.rY;
  
  channel.emit('input', { 
    x: localPlayer.x, 
    y: localPlayer.y, 
    z: localPlayer.z, 
    rY: localPlayer.rY 
  });
}

// Register mousedown ONCE, not every frame
window.addEventListener('mousedown', (e) => {
  if (e.button === 0 && isPlaying && document.pointerLockElement && localPlayer.fireCooldown <= 0 && !localPlayer.reloading && !localPlayer.isSprinting) {
    shoot();
  }
});

// Auto-fire for automatic weapons
let mouseHeld = false;
window.addEventListener('mousedown', (e) => { if (e.button === 0) mouseHeld = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseHeld = false; });

// Aim-down-sights (right mouse): zoom FOV and tighten spread
window.addEventListener('mousedown', (e) => {
  if (e.button === 2 && isPlaying && document.pointerLockElement) localPlayer.isADS = true;
});
window.addEventListener('mouseup', (e) => { if (e.button === 2) localPlayer.isADS = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());

function handleCombat(deltaTime) {
  if (localPlayer.fireCooldown > 0) {
    localPlayer.fireCooldown -= deltaTime;
  }

  // Recupera o bloom (precisão) quando não está atirando
  if (localPlayer.bloom > 0) {
    localPlayer.bloom = Math.max(0, localPlayer.bloom - localPlayer.weapon.bloomRecover * deltaTime);
  }

  // Manual reload (R key)
  if (Input.isJustPressed('r') && !localPlayer.reloading && localPlayer.ammo < localPlayer.weapon.magSize) {
    reload();
  }

  if (localPlayer.isSprinting && !localPlayer.isSliding) return;

  // Auto-fire support for automatic weapons (SMG)
  if (mouseHeld && localPlayer.weapon.auto && isPlaying && document.pointerLockElement && localPlayer.fireCooldown <= 0 && !localPlayer.reloading) {
    shoot();
  }
}

function shoot() {
  const w = localPlayer.weapon;
  
  if (localPlayer.ammo <= 0) {
    reload();
    return;
  }

  localPlayer.ammo--;
  uiAmmo.innerText = localPlayer.ammo;
  localPlayer.fireCooldown = w.fireRate;

  channel.emit('shoot', { weapon: w.id });

  // Spread base + bloom acumulado, reduzido ao mirar (ADS)
  const ads = localPlayer.isADS && !localPlayer.isSprinting;
  let effectiveSpread = w.spread + localPlayer.bloom;
  if (ads) effectiveSpread *= 0.35;

  engine.simulateShoot(effectiveSpread, w.pellets || 1, (targetId, isHeadshot, distance) => {
    // Damage falloff por distância
    let mult = 1;
    if (distance > w.falloffStart) {
      const t = Math.min(1, (distance - w.falloffStart) / (w.falloffEnd - w.falloffStart));
      mult = 1 + t * (w.minMult - 1); // interpola 1 → minMult
    }
    let dmg = w.damage * mult;
    if (isHeadshot) dmg *= 2;

    channel.emit('damage', {
      targetId,
      damage: Math.round(dmg),
      weapon: w.id,
      headshot: isHeadshot
    });
  });

  // Acumula bloom a cada tiro (até o teto)
  localPlayer.bloom = Math.min(w.bloomMax, localPlayer.bloom + w.bloom);

  feedback.triggerShake(w.recoilAmount);
  
  if (localPlayer.ammo <= 0) {
    reload();
  }
}

function reload() {
  if (localPlayer.reloading) return;
  localPlayer.reloading = true;
  uiAmmo.innerText = "REL";
  
  setTimeout(() => {
    localPlayer.ammo = localPlayer.weapon.magSize;
    localPlayer.ammoStore[localPlayer.weapon.id] = localPlayer.ammo;
    uiAmmo.innerText = localPlayer.ammo;
    localPlayer.reloading = false;
  }, localPlayer.weapon.reloadTime * 1000);
}

function getPlayerRank(kills) {
  if (kills >= 50) return { name: '[HACKER]', color: '#ff00ff' };
  if (kills >= 20) return { name: '[OURO]', color: '#ffcc00' };
  if (kills >= 10) return { name: '[PRATA]', color: '#cccccc' };
  if (kills >= 5) return { name: '[BRONZE]', color: '#cd7f32' };
  return { name: '[FERRO]', color: '#888888' };
}

function updateScoreboard(entities) {
  const tbody = document.getElementById('scoreboard-tbody');
  if (!tbody) return;

  let playersArray = Object.values(entities);

  playersArray.sort((a, b) => b.kills - a.kills);

  tbody.innerHTML = '';
  playersArray.forEach((p, idx) => {
    const kills = p.kills || 0;
    const deaths = p.deaths || 0;
    const kd = (kills / Math.max(1, deaths)).toFixed(2);
    const rank = getPlayerRank(kills);
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color: ${rank.color}; font-weight: bold;">${rank.name}</td>
      <td>#${idx + 1}</td>
      <td>${p.nickname || (p.isBot ? 'BOT' : 'Operador')}</td>
      <td>${kills}</td>
      <td>${deaths}</td>
      <td>${kd}</td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Auto-Scaling Graphics System ---
const dtHistory = [];
let dtHistoryIndex = 0;
const DT_HISTORY_SIZE = 60;
let timeBelow45 = 0;
let timeAbove55 = 0;

function updateAutoGraphics(deltaTime) {
  if (deltaTime > 0.1) return; // Ignora travamentos gigantes ou tab minimizada

  if (dtHistory.length < DT_HISTORY_SIZE) {
    dtHistory.push(deltaTime);
  } else {
    dtHistory[dtHistoryIndex] = deltaTime;
    dtHistoryIndex = (dtHistoryIndex + 1) % DT_HISTORY_SIZE;
  }

  if (dtHistory.length === DT_HISTORY_SIZE) {
    let sum = 0;
    for(let i=0; i<DT_HISTORY_SIZE; i++) sum += dtHistory[i];
    const avgDt = sum / DT_HISTORY_SIZE;
    const avgFps = 1 / avgDt;

    if (avgFps < 45) {
      timeBelow45 += deltaTime;
      timeAbove55 = 0;
      if (timeBelow45 > 3.0) { 
        if (engine.qualityLevel === 'HIGH') engine.setGraphicsQuality('MEDIUM');
        else if (engine.qualityLevel === 'MEDIUM') engine.setGraphicsQuality('LOW');
        else if (engine.qualityLevel === 'LOW') engine.setGraphicsQuality('POTATO');
        timeBelow45 = 0; 
      }
    } else if (avgFps >= 55) {
      timeAbove55 += deltaTime;
      timeBelow45 = 0;
      if (timeAbove55 > 10.0) { 
        if (engine.qualityLevel === 'POTATO') engine.setGraphicsQuality('LOW');
        else if (engine.qualityLevel === 'LOW') engine.setGraphicsQuality('MEDIUM');
        else if (engine.qualityLevel === 'MEDIUM') engine.setGraphicsQuality('HIGH');
        timeAbove55 = 0; 
      }
    } else {
      timeBelow45 = 0;
      timeAbove55 = 0;
    }
  }
}

function gameLoop(now) {
  requestAnimationFrame(gameLoop);

  const deltaTime = (now - lastTime) / 1000;
  lastTime = now;

  updateAutoGraphics(deltaTime);

  if (isPlaying) {
    handleInputAndMovement(deltaTime);
    handleCombat(deltaTime);
    
    engine.updateMedkits(serverMedkits, deltaTime);

    if (feedback) feedback.update(deltaTime);
    if (progression) progression.update(deltaTime);
    if (minimap) minimap.update(localPlayer, serverEntities);
    
    // Match timer
    matchTimer -= deltaTime;
    const timerEl = document.getElementById('match-timer');
    if (timerEl) {
      const mins = Math.floor(Math.max(0, matchTimer) / 60);
      const secs = Math.floor(Math.max(0, matchTimer) % 60);
      timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Kill/Death display
    const kdDisplay = document.getElementById('kd-display');
    if (kdDisplay) {
      kdDisplay.innerText = `${localPlayer.totalKills} / ${localPlayer.totalDeaths}`;
    }
  } else {
    lobbyTime += deltaTime;
  }
  
  const isMoving = isPlaying && (Input.keys.w || Input.keys.a || Input.keys.s || Input.keys.d);
  const shakeOffset = feedback ? feedback.getShakeOffset() : {x: 0, y: 0};
  
  engine.render(deltaTime, isMoving, shakeOffset, localPlayer.isSprinting, !isPlaying, lobbyTime);
}

connectBackground();
requestAnimationFrame(gameLoop);
