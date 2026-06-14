// ============================================================
// shared/map.js — Gerador Procedural Competitivo + A* + LoS
// Mapa otimizado para FPS: salas amplas, corredores largos,
// linhas de tiro, arena central
// ============================================================

export let mapData = [];
export let grid = []; 
export let jumpPads = [];
export const GRID_SIZE = 60;
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

export function generateMap(seed, mapType = 'CLASSIC') {
  const random = mulberry32(seed);
  grid = [];
  mapData = [];
  
  // MICRO_ARENA forces a smaller grid size dynamically
  const currentGridSize = mapType === 'MICRO_ARENA' ? 30 : GRID_SIZE;
  const currentOffset = (currentGridSize * CELL_SIZE) / 2;

  // Inicializa tudo como parede
  for (let z = 0; z < currentGridSize; z++) {
    grid[z] = [];
    for (let x = 0; x < currentGridSize; x++) {
      grid[z][x] = 1;
    }
  }

  const cx = Math.floor(currentGridSize / 2);
  const cz = Math.floor(currentGridSize / 2);

  if (mapType === 'CLASSIC' || mapType === 'MICRO_ARENA') {
    // === 1. Arena Central ===
    const arenaRadius = mapType === 'MICRO_ARENA' ? 3 : 4;
    for (let z = cz - arenaRadius; z <= cz + arenaRadius; z++) {
      for (let x = cx - arenaRadius; x <= cx + arenaRadius; x++) {
        if (z >= 0 && z < currentGridSize && x >= 0 && x < currentGridSize) {
          grid[z][x] = 0;
        }
      }
    }

    jumpPads = [];
    const jpDist = arenaRadius - 2;
    const jpOffsets = [[-jpDist, -jpDist], [jpDist, -jpDist], [-jpDist, jpDist], [jpDist, jpDist]];
    for (const [dx, dz] of jpOffsets) {
      if (dx === 0 && dz === 0) continue;
      jumpPads.push({
        x: (cx + dx) * CELL_SIZE - currentOffset + (CELL_SIZE / 2),
        z: (cz + dz) * CELL_SIZE - currentOffset + (CELL_SIZE / 2)
      });
    }

    // === 2. Salas Estratégicas ===
    const rooms = [];
    let roomAttempts = 0;
    const maxRooms = mapType === 'MICRO_ARENA' ? 8 : 24;
    while (rooms.length < maxRooms && roomAttempts < 150) {
      roomAttempts++;
      const rw = Math.floor(random() * 3) + 3; 
      const rh = Math.floor(random() * 3) + 3; 
      const rx = Math.floor(random() * (currentGridSize - rw - 4)) + 2;
      const rz = Math.floor(random() * (currentGridSize - rh - 4)) + 2;

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

    rooms.push({ x: cx - arenaRadius, z: cz - arenaRadius, w: arenaRadius*2+1, h: arenaRadius*2+1 });

    // === 3. Conecta Salas ===
    for (let i = 0; i < rooms.length - 1; i++) {
      const a = rooms[i];
      const b = rooms[i + 1];
      const aCx = Math.floor(a.x + a.w / 2);
      const aCz = Math.floor(a.z + a.h / 2);
      const bCx = Math.floor(b.x + b.w / 2);
      const bCz = Math.floor(b.z + b.h / 2);

      const corridorWidth = Math.floor(random() * 2) + 2; 
      const half = Math.floor(corridorWidth / 2);

      const startX = Math.min(aCx, bCx);
      const endX = Math.max(aCx, bCx);
      for (let x = startX; x <= endX; x++) {
        for (let dz = -half; dz <= half; dz++) {
          const zz = aCz + dz;
          if (zz >= 0 && zz < currentGridSize && x >= 0 && x < currentGridSize) grid[zz][x] = 0;
        }
      }

      const startZ = Math.min(aCz, bCz);
      const endZ = Math.max(aCz, bCz);
      for (let z = startZ; z <= endZ; z++) {
        for (let dx = -half; dx <= half; dx++) {
          const xx = bCx + dx;
          if (z >= 0 && z < currentGridSize && xx >= 0 && xx < currentGridSize) grid[z][xx] = 0;
        }
      }
    }

    // === Atalhos ===
    for (let i = 0; i < (mapType === 'MICRO_ARENA' ? 4 : 8); i++) {
      const a = rooms[Math.floor(random() * rooms.length)];
      const b = rooms[Math.floor(random() * rooms.length)];
      if (a === b) continue;

      const aCx = Math.floor(a.x + a.w / 2);
      const aCz = Math.floor(a.z + a.h / 2);
      const bCx = Math.floor(b.x + b.w / 2);
      const bCz = Math.floor(b.z + b.h / 2);

      const startX = Math.min(aCx, bCx);
      const endX = Math.max(aCx, bCx);
      for (let x = startX; x <= endX; x++) {
        for (let dz = 0; dz <= 1; dz++) {
          const zz = aCz + dz;
          if (zz >= 0 && zz < currentGridSize && x >= 0 && x < currentGridSize) grid[zz][x] = 0;
        }
      }
      const startZ = Math.min(aCz, bCz);
      const endZ = Math.max(aCz, bCz);
      for (let z = startZ; z <= endZ; z++) {
        for (let dx = 0; dx <= 1; dx++) {
          const xx = bCx + dx;
          if (z >= 0 && z < currentGridSize && xx >= 0 && xx < currentGridSize) grid[z][xx] = 0;
        }
      }
    }

    // === Coberturas ===
    for (const room of rooms) {
      if (room.w >= 4 && room.h >= 4) {
        const numCovers = Math.floor(random() * 2) + 1;
        for (let c = 0; c < numCovers; c++) {
          const px = room.x + 1 + Math.floor(random() * (room.w - 2));
          const pz = room.z + 1 + Math.floor(random() * (room.h - 2));
          if (Math.abs(px - cx) > 2 || Math.abs(pz - cz) > 2) {
            grid[pz][px] = 2; 
          }
        }
      }
    }

    grid[cz][cx-arenaRadius] = 2;
    grid[cz-1][cx-arenaRadius] = 2;
    grid[cz+1][cx-arenaRadius] = 2;
    grid[cz][cx+arenaRadius] = 2;
    grid[cz-1][cx+arenaRadius] = 2;
    grid[cz+1][cx+arenaRadius] = 2;
  }
  else if (mapType === 'LABYRINTH') {
    // Maze-like dense generation
    jumpPads = [];
    const rooms = [];
    for (let i = 0; i < 40; i++) {
      const rw = Math.floor(random() * 2) + 2;
      const rh = Math.floor(random() * 2) + 2;
      const rx = Math.floor(random() * (currentGridSize - rw - 2)) + 1;
      const rz = Math.floor(random() * (currentGridSize - rh - 2)) + 1;
      rooms.push({x: rx, z: rz, w: rw, h: rh});
      for (let z = rz; z < rz + rh; z++) {
        for (let x = rx; x < rx + rw; x++) {
          grid[z][x] = 0;
        }
      }
    }
    for (let i = 0; i < rooms.length - 1; i++) {
      const a = rooms[i]; const b = rooms[i+1];
      const startX = Math.min(a.x, b.x); const endX = Math.max(a.x, b.x);
      for (let x = startX; x <= endX; x++) if (x >= 0 && x < currentGridSize) grid[a.z][x] = 0;
      const startZ = Math.min(a.z, b.z); const endZ = Math.max(a.z, b.z);
      for (let z = startZ; z <= endZ; z++) if (z >= 0 && z < currentGridSize) grid[z][b.x] = 0;
    }
  }
  else if (mapType === 'SNIPER_ALLEY') {
    // Long parallel corridors
    jumpPads = [];
    // 3 main long corridors
    const lanes = [Math.floor(currentGridSize * 0.2), Math.floor(currentGridSize * 0.5), Math.floor(currentGridSize * 0.8)];
    for (const laneX of lanes) {
      for (let z = 5; z < currentGridSize - 5; z++) {
        grid[z][laneX] = 0; grid[z][laneX+1] = 0; grid[z][laneX+2] = 0;
        // some covers
        if (z % 10 === 0) grid[z][laneX+1] = 2;
      }
      jumpPads.push({
        x: (laneX + 1) * CELL_SIZE - currentOffset + (CELL_SIZE / 2),
        z: Math.floor(currentGridSize / 2) * CELL_SIZE - currentOffset + (CELL_SIZE / 2)
      });
    }
    // 2 cross corridors
    const crosses = [Math.floor(currentGridSize * 0.2), Math.floor(currentGridSize * 0.8)];
    for (const crossZ of crosses) {
      for (let x = 5; x < currentGridSize - 5; x++) {
        grid[crossZ][x] = 0; grid[crossZ+1][x] = 0;
      }
    }
  }

  // === 6. Limpa borda do mapa (1 célula de margem aberta) ===
  // Mantém a borda como parede para contenção

  // === 7. Gera AABBs para paredes ===
  for (let z = 0; z < currentGridSize; z++) {
    for (let x = 0; x < currentGridSize; x++) {
      if (grid[z][x] === 1 || grid[z][x] === 2) {
        const minX = (x * CELL_SIZE) - currentOffset;
        const minZ = (z * CELL_SIZE) - currentOffset;
        const maxY = grid[z][x] === 2 ? 1.2 : 3.5;
        mapData.push({
          minX: minX,
          maxX: minX + CELL_SIZE,
          minY: 0,
          maxY: maxY, 
          minZ: minZ,
          maxZ: minZ + CELL_SIZE
        });
      }
    }
  }

  // Muralhas de contenção externas
  const BOUND = currentOffset;
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

  const currentGridSize = grid.length;
  const currentOffset = (currentGridSize * CELL_SIZE) / 2;

  const sx = Math.floor((startX + currentOffset) / CELL_SIZE);
  const sz = Math.floor((startZ + currentOffset) / CELL_SIZE);
  const ex = Math.floor((endX + currentOffset) / CELL_SIZE);
  const ez = Math.floor((endZ + currentOffset) / CELL_SIZE);

  if (sx < 0 || sx >= currentGridSize || sz < 0 || sz >= currentGridSize) return null;
  if (ex < 0 || ex >= currentGridSize || ez < 0 || ez >= currentGridSize) return null;
  if (grid[ez] && grid[ez][ex] !== 0) return null; 

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
      if (nx >= 0 && nx < grid.length && nz >= 0 && nz < grid.length && grid[nz][nx] === 0) {
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
          x: (curr.x * CELL_SIZE) - (grid.length * CELL_SIZE / 2) + (CELL_SIZE / 2),
          z: (curr.z * CELL_SIZE) - (grid.length * CELL_SIZE / 2) + (CELL_SIZE / 2)
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
