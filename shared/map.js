// ============================================================
// shared/map.js — Gerador Procedural Competitivo + A* + LoS
// Mapa otimizado para FPS: salas amplas, corredores largos,
// linhas de tiro, arena central
// ============================================================

export let mapData = [];
export let grid = []; 
export const GRID_SIZE = 40;
export const CELL_SIZE = 2;
export const OFFSET = (GRID_SIZE * CELL_SIZE) / 2; 

// PRNG determinístico (Mulberry32)
function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export function generateMap(seed) {
  const random = mulberry32(seed);
  grid = [];
  mapData = [];

  // Inicializa tudo como parede
  for (let z = 0; z < GRID_SIZE; z++) {
    grid[z] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      grid[z][x] = 1;
    }
  }

  const cx = Math.floor(GRID_SIZE / 2);
  const cz = Math.floor(GRID_SIZE / 2);

  // === 1. Arena Central (8×8) ===
  for (let z = cz - 4; z <= cz + 4; z++) {
    for (let x = cx - 4; x <= cx + 4; x++) {
      if (z >= 0 && z < GRID_SIZE && x >= 0 && x < GRID_SIZE) {
        grid[z][x] = 0;
      }
    }
  }

  // === 2. Salas Estratégicas Espalhadas ===
  const rooms = [];
  let roomAttempts = 0;
  while (rooms.length < 12 && roomAttempts < 80) {
    roomAttempts++;
    const rw = Math.floor(random() * 3) + 3; // 3-5 largura
    const rh = Math.floor(random() * 3) + 3; // 3-5 altura
    const rx = Math.floor(random() * (GRID_SIZE - rw - 4)) + 2;
    const rz = Math.floor(random() * (GRID_SIZE - rh - 4)) + 2;

    // Verifica overlap com outras salas (com margem de 1)
    let overlaps = false;
    for (const room of rooms) {
      if (rx - 1 < room.x + room.w + 1 && rx + rw + 1 > room.x - 1 &&
          rz - 1 < room.z + room.h + 1 && rz + rh + 1 > room.z - 1) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    rooms.push({ x: rx, z: rz, w: rw, h: rh });
    for (let z = rz; z < rz + rh; z++) {
      for (let x = rx; x < rx + rw; x++) {
        grid[z][x] = 0;
      }
    }
  }

  // Adiciona a arena central como "sala" para conexão
  rooms.push({ x: cx - 4, z: cz - 4, w: 9, h: 9 });

  // === 3. Conecta Salas com Corredores Largos (2-3 células) ===
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i];
    const b = rooms[i + 1];
    const aCx = Math.floor(a.x + a.w / 2);
    const aCz = Math.floor(a.z + a.h / 2);
    const bCx = Math.floor(b.x + b.w / 2);
    const bCz = Math.floor(b.z + b.h / 2);

    const corridorWidth = Math.floor(random() * 2) + 2; // 2-3 células de largura
    const half = Math.floor(corridorWidth / 2);

    // Corredor horizontal
    const startX = Math.min(aCx, bCx);
    const endX = Math.max(aCx, bCx);
    for (let x = startX; x <= endX; x++) {
      for (let dz = -half; dz <= half; dz++) {
        const zz = aCz + dz;
        if (zz >= 0 && zz < GRID_SIZE && x >= 0 && x < GRID_SIZE) {
          grid[zz][x] = 0;
        }
      }
    }

    // Corredor vertical
    const startZ = Math.min(aCz, bCz);
    const endZ = Math.max(aCz, bCz);
    for (let z = startZ; z <= endZ; z++) {
      for (let dx = -half; dx <= half; dx++) {
        const xx = bCx + dx;
        if (z >= 0 && z < GRID_SIZE && xx >= 0 && xx < GRID_SIZE) {
          grid[z][xx] = 0;
        }
      }
    }
  }

  // === 4. Corredores extras para criar atalhos e loops ===
  for (let i = 0; i < 4; i++) {
    const a = rooms[Math.floor(random() * rooms.length)];
    const b = rooms[Math.floor(random() * rooms.length)];
    if (a === b) continue;

    const aCx = Math.floor(a.x + a.w / 2);
    const aCz = Math.floor(a.z + a.h / 2);
    const bCx = Math.floor(b.x + b.w / 2);
    const bCz = Math.floor(b.z + b.h / 2);

    // Corredor simples de 2 células
    const startX = Math.min(aCx, bCx);
    const endX = Math.max(aCx, bCx);
    for (let x = startX; x <= endX; x++) {
      for (let dz = 0; dz <= 1; dz++) {
        const zz = aCz + dz;
        if (zz >= 0 && zz < GRID_SIZE && x >= 0 && x < GRID_SIZE) {
          grid[zz][x] = 0;
        }
      }
    }
    const startZ = Math.min(aCz, bCz);
    const endZ = Math.max(aCz, bCz);
    for (let z = startZ; z <= endZ; z++) {
      for (let dx = 0; dx <= 1; dx++) {
        const xx = bCx + dx;
        if (z >= 0 && z < GRID_SIZE && xx >= 0 && xx < GRID_SIZE) {
          grid[z][xx] = 0;
        }
      }
    }
  }

  // === 5. Coberturas dentro das salas grandes (pilares de 1×1) ===
  for (const room of rooms) {
    if (room.w >= 4 && room.h >= 4) {
      const numCovers = Math.floor(random() * 2) + 1;
      for (let c = 0; c < numCovers; c++) {
        const px = room.x + 1 + Math.floor(random() * (room.w - 2));
        const pz = room.z + 1 + Math.floor(random() * (room.h - 2));
        // Não bloqueia o centro exato do spawn
        if (Math.abs(px - cx) > 2 || Math.abs(pz - cz) > 2) {
          grid[pz][px] = 1;
        }
      }
    }
  }

  // === 6. Limpa borda do mapa (1 célula de margem aberta) ===
  // Mantém a borda como parede para contenção

  // === 7. Gera AABBs para paredes ===
  for (let z = 0; z < GRID_SIZE; z++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[z][x] === 1) {
        const minX = (x * CELL_SIZE) - OFFSET;
        const minZ = (z * CELL_SIZE) - OFFSET;
        mapData.push({
          minX: minX,
          maxX: minX + CELL_SIZE,
          minY: 0,
          maxY: 3.5, 
          minZ: minZ,
          maxZ: minZ + CELL_SIZE
        });
      }
    }
  }

  // Muralhas de contenção externas
  const BOUND = OFFSET;
  mapData.push({ minX: -BOUND-2, maxX: BOUND+2, minY: 0, maxY: 8, minZ: -BOUND-2, maxZ: -BOUND });
  mapData.push({ minX: -BOUND-2, maxX: BOUND+2, minY: 0, maxY: 8, minZ: BOUND, maxZ: BOUND+2 });
  mapData.push({ minX: -BOUND-2, maxX: -BOUND, minY: 0, maxY: 8, minZ: -BOUND, maxZ: BOUND });
  mapData.push({ minX: BOUND, maxX: BOUND+2, minY: 0, maxY: 8, minZ: -BOUND, maxZ: BOUND });
}

// ============================================================
// A* Pathfinding
// ============================================================

class Node {
  constructor(x, z, parent, g, h) {
    this.x = x;
    this.z = z;
    this.parent = parent;
    this.g = g; 
    this.h = h; 
    this.f = g + h;
  }
}

export function findPath(startX, startZ, endX, endZ) {
  if (grid.length === 0) return null;

  const sx = Math.floor((startX + OFFSET) / CELL_SIZE);
  const sz = Math.floor((startZ + OFFSET) / CELL_SIZE);
  const ex = Math.floor((endX + OFFSET) / CELL_SIZE);
  const ez = Math.floor((endZ + OFFSET) / CELL_SIZE);

  if (sx < 0 || sx >= GRID_SIZE || sz < 0 || sz >= GRID_SIZE) return null;
  if (ex < 0 || ex >= GRID_SIZE || ez < 0 || ez >= GRID_SIZE) return null;
  if (grid[ez][ex] === 1) return null; 

  const openList = [];
  const closedSet = new Set();

  const startNode = new Node(sx, sz, null, 0, Math.abs(sx - ex) + Math.abs(sz - ez));
  openList.push(startNode);

  const getNeighbors = (node) => {
    const neighbors = [];
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dx, dz] of dirs) {
      const nx = node.x + dx;
      const nz = node.z + dz;
      if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE && grid[nz][nx] === 0) {
        neighbors.push({ x: nx, z: nz });
      }
    }
    return neighbors;
  };

  let iterations = 0;
  const MAX_ITER = 2000;

  while (openList.length > 0 && iterations < MAX_ITER) {
    iterations++;
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift();
    
    if (current.x === ex && current.z === ez) {
      const path = [];
      let curr = current;
      while (curr) {
        path.unshift({
          x: (curr.x * CELL_SIZE) - OFFSET + (CELL_SIZE / 2),
          z: (curr.z * CELL_SIZE) - OFFSET + (CELL_SIZE / 2)
        });
        curr = curr.parent;
      }
      return path; 
    }

    closedSet.add(`${current.x},${current.z}`);

    for (const neighbor of getNeighbors(current)) {
      if (closedSet.has(`${neighbor.x},${neighbor.z}`)) continue;

      const gScore = current.g + 1;
      const hScore = Math.abs(neighbor.x - ex) + Math.abs(neighbor.z - ez);
      
      const existing = openList.find(n => n.x === neighbor.x && n.z === neighbor.z);
      if (!existing) {
        openList.push(new Node(neighbor.x, neighbor.z, current, gScore, hScore));
      } else if (gScore < existing.g) {
        existing.parent = current;
        existing.g = gScore;
        existing.f = existing.g + existing.h;
      }
    }
  }
  return null; 
}

// ============================================================
// Line of Sight (Ray-AABB)
// ============================================================

export function checkLineOfSight(startPos, endPos) {
  if (mapData.length === 0) return true;

  const dir = {
    x: endPos.x - startPos.x,
    y: endPos.y - startPos.y,
    z: endPos.z - startPos.z
  };
  const length = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
  if (length === 0) return true;

  dir.x /= length; 
  dir.y /= length; 
  dir.z /= length;

  for (const aabb of mapData) {
    if (intersectRayAABB(startPos, dir, length, aabb)) {
      return false; 
    }
  }
  return true; 
}

function intersectRayAABB(origin, dir, length, aabb) {
  let tmin = -Infinity;
  let tmax = Infinity;

  const min = [aabb.minX, aabb.minY, aabb.minZ];
  const max = [aabb.maxX, aabb.maxY, aabb.maxZ];
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];

  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < min[i] || o[i] > max[i]) return false;
    } else {
      let t1 = (min[i] - o[i]) / d[i];
      let t2 = (max[i] - o[i]) / d[i];

      if (t1 > t2) { 
        const temp = t1; t1 = t2; t2 = temp; 
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      
      if (tmin > tmax) return false;
    }
  }

  return tmax >= 0 && tmin <= length;
}
