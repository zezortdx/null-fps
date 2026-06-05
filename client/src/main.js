import * as THREE from 'three';
import geckos from '@geckos.io/client';
import { Engine } from './engine.js';
import { Input } from './input.js';
import { FeedbackSystem } from './feedback.js';
import { Minimap } from './minimap.js';
import { Progression } from './progression.js';
import { getWeaponByKey, getWeaponById } from './weapons.js';
import { generateMap, mapData, grid, GRID_SIZE, CELL_SIZE, OFFSET } from '../../shared/map.js';

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
  reloading: false,
  isSprinting: false,
  isSliding: false,
  slideTimer: 0,
  slideCooldown: 0,
  fireCooldown: 0,
  vX: 0,
  vY: 0,
  vZ: 0,
  isGrounded: true,
  lastDamageTime: 0
};

// UI Elements
const uiHp = document.getElementById('ui-hp');
const uiAmmo = document.getElementById('ui-ammo');
const btnEnter = document.getElementById('btn-enter');
const lobby = document.getElementById('lobby');
const hud = document.getElementById('hud');
const deathScreen = document.getElementById('death-screen');

// Game State
let engine;
let channel;
let isConnected = false;
let isPlaying = false;
let lobbyTime = 0;
let lastTime = performance.now();
let serverEntities = {};

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
      
      // Update minimap with map data if already initialized
      if (minimap) minimap.setMapData(grid, GRID_SIZE, CELL_SIZE, OFFSET);
    });

    channel.on('stateUpdate', state => {
      serverEntities = { ...state.players, ...state.bots };
      engine.updateEntities(state);
      if (isPlaying) {
        updateScoreboard(serverEntities);

        // Sincronizar stats do player local
        if (state.players[localPlayer.id]) {
          localPlayer.hp = state.players[localPlayer.id].hp;
          uiHp.innerText = localPlayer.hp;
        }
      }
    });

    channel.on('hitConfirm', data => {
      if (!isPlaying) return;
      feedback.showHitmarker(data.headshot);
      if (data.killed) {
        progression.registerKill();
        const target = serverEntities[data.targetId];
        if (target) {
          feedback.showKillConfirmation(target.nickname || 'BOT');
        }
      }
    });

    channel.on('damaged', data => {
      if (!isPlaying) return;
      feedback.triggerDamageFlash();
      feedback.triggerShake(0.05);
      localPlayer.lastDamageTime = performance.now();
      
      const dx = data.fromX - localPlayer.x;
      const dz = data.fromZ - localPlayer.z;
      const angle = Math.atan2(dx, dz) - localPlayer.rY;
      feedback.showDamageIndicator(angle);
    });

    channel.on('killfeed', data => {
      if (!isPlaying) return;
      const feed = document.getElementById('killfeed');
      const p = document.createElement('p');
      p.innerText = `${data.msg} [${data.weapon}]${data.headshot ? ' (HS)' : ''}`;
      feed.appendChild(p);
      setTimeout(() => {
        if (p.parentNode) feed.removeChild(p);
      }, 4000);
    });

    channel.on('playerShot', data => {
      // Sound logic here
    });

    channel.on('playerDied', data => {
      if (!isPlaying) return;
      document.exitPointerLock();
      hud.classList.add('hidden');
      deathScreen.classList.remove('hidden');
      progression.registerDeath();
      setTimeout(() => {
        window.location.reload();
      }, 3000);
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
    if (slot) {
      slot.classList.remove('active');
    }
  }
  const weaponKeyMap = { 'pistol': 1, 'smg': 2, 'shotgun': 3, 'sniper': 4 };
  const key = weaponKeyMap[weaponId];
  if (key) {
    const activeSlot = document.getElementById(`slot-${key}`);
    if (activeSlot) activeSlot.classList.add('active');
  }
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
        localPlayer.weapon = w;
        localPlayer.ammo = w.magSize;
        engine.setWeaponModel(w.id);
        uiAmmo.innerText = localPlayer.ammo;
        updateInventoryHUD(w.id);
        channel.emit('input', { weapon: w.id });
      }
    }
  }

  const rotSpeed = 0.002;
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

  // Aplica Gravidade
  localPlayer.vY -= 30 * deltaTime; // gravidade
  localPlayer.y += localPlayer.vY * deltaTime;
  
  if (localPlayer.y <= 1.0) {
    localPlayer.y = 1.0;
    localPlayer.vY = 0;
    localPlayer.isGrounded = true;
  }

  const moveVectorX = localPlayer.vX * deltaTime;
  const moveVectorZ = localPlayer.vZ * deltaTime;

  const pSize = 0.4;
  let nextX = localPlayer.x + moveVectorX;
  let nextZ = localPlayer.z + moveVectorZ;

  let colX = false;
  let colZ = false;

  for (const aabb of mapData) {
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

function handleCombat(deltaTime) {
  if (localPlayer.fireCooldown > 0) {
    localPlayer.fireCooldown -= deltaTime;
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
  
  engine.simulateShoot(w.spread, w.pellets || 1, (targetId, isHeadshot) => {
    channel.emit('damage', { 
      targetId, 
      damage: isHeadshot ? w.damage * 1.5 : w.damage,
      weapon: w.id,
      headshot: isHeadshot 
    });
  });

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
    uiAmmo.innerText = localPlayer.ammo;
    localPlayer.reloading = false;
  }, localPlayer.weapon.reloadTime * 1000);
}

function updateScoreboard(entities) {
  const tbody = document.getElementById('scoreboard-tbody');
  if (!tbody) return;

  let playersArray = Object.values(entities);

  playersArray.sort((a, b) => b.kills - a.kills);

  tbody.innerHTML = '';
  playersArray.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${idx + 1}</td>
      <td>${p.nickname || (p.isBot ? 'BOT' : 'Operador')}</td>
      <td>${p.kills || 0}</td>
      <td>${p.deaths || 0}</td>
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
        timeBelow45 = 0; 
      }
    } else if (avgFps >= 55) {
      timeAbove55 += deltaTime;
      timeBelow45 = 0;
      if (timeAbove55 > 10.0) { 
        if (engine.qualityLevel === 'LOW') engine.setGraphicsQuality('MEDIUM');
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
    // Passive Healing
    if (localPlayer.hp < 100 && performance.now() - localPlayer.lastDamageTime > 5000) {
      localPlayer.hp = Math.min(100, localPlayer.hp + 5 * deltaTime);
      uiHp.innerText = Math.floor(localPlayer.hp);
    }

    handleInputAndMovement(deltaTime);
    handleCombat(deltaTime);
    
    if (feedback) feedback.update(deltaTime);
    if (progression) progression.update(deltaTime);
    if (minimap) minimap.update(localPlayer, serverEntities);
  } else {
    lobbyTime += deltaTime;
  }
  
  const isMoving = isPlaying && (Input.keys.w || Input.keys.a || Input.keys.s || Input.keys.d);
  const shakeOffset = feedback ? feedback.getShakeOffset() : {x: 0, y: 0};
  
  engine.render(deltaTime, isMoving, shakeOffset, localPlayer.isSprinting, !isPlaying, lobbyTime);
}

// Começa tudo imediatamente ao carregar
connectBackground();
requestAnimationFrame(gameLoop);
