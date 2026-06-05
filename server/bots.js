import { randomUUID } from 'crypto';
import { checkLineOfSight, findPath, grid, GRID_SIZE, CELL_SIZE, OFFSET, mapData } from '../shared/map.js';

export class Bot {
  constructor() {
    this.id = 'bot_' + randomUUID().substring(0, 8);
    this.y = 1; // Altura dos olhos
    this.rY = Math.random() * Math.PI * 2;
    this.hp = 100;
    this.state = 'WANDER'; // WANDER, CHASE, SHOOT, INATIVO
    this.targetId = null;
    this.speed = 0.07;
    this.attackCooldown = 0;
    this.respawnTimer = 0;
    this.losLostTimer = 0;
    this.isBot = true;

    // A* Pathfinding state
    this.path = null;
    this.pathIndex = 0;
    this.pathRecalcTimer = 0;

    // Spawn em célula aberta aleatória
    const spawn = this.getRandomOpenCell();
    this.x = spawn.x;
    this.z = spawn.z;
  }

  getRandomOpenCell() {
    const openCells = [];
    for (let z = 0; z < GRID_SIZE; z++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (grid[z] && grid[z][x] === 0) {
          openCells.push({
            x: (x * CELL_SIZE) - OFFSET + (CELL_SIZE / 2),
            z: (z * CELL_SIZE) - OFFSET + (CELL_SIZE / 2)
          });
        }
      }
    }
    if (openCells.length === 0) return { x: 0, z: 0 };
    return openCells[Math.floor(Math.random() * openCells.length)];
  }

  moveTowards(targetX, targetZ) {
    const dx = targetX - this.x;
    const dz = targetZ - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    if (dist < 0.3) return true; // Chegou no waypoint
    
    this.rY = Math.atan2(dx, dz);
    
    const stepX = (dx / dist) * this.speed;
    const stepZ = (dz / dist) * this.speed;
    
    let nextX = this.x + stepX;
    let nextZ = this.z + stepZ;
    
    // Colisão AABB - impede que bots atravessem paredes
    const pSize = 0.4;
    let blocked = false;
    
    for (const aabb of mapData) {
      if (aabb.maxY <= 0.5) continue; // Ignora obstáculos baixos
      if (
        nextX + pSize > aabb.minX && nextX - pSize < aabb.maxX &&
        nextZ + pSize > aabb.minZ && nextZ - pSize < aabb.maxZ &&
        this.y < aabb.maxY
      ) {
        blocked = true;
        break;
      }
    }
    
    if (!blocked) {
      this.x = nextX;
      this.z = nextZ;
    }
    
    return false;
  }

  followPath() {
    if (!this.path || this.pathIndex >= this.path.length) {
      this.path = null;
      return true; // Path concluído
    }
    
    const waypoint = this.path[this.pathIndex];
    const arrived = this.moveTowards(waypoint.x, waypoint.z);
    
    if (arrived) {
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) {
        this.path = null;
        return true;
      }
    }
    
    return false;
  }

  update(players) {
    // === Gerenciamento de Morte e Respawn ===
    if (this.hp <= 0 && this.state !== 'INATIVO') {
      this.state = 'INATIVO';
      this.respawnTimer = 90; // 3 segundos a 30 TPS
      this.path = null;
    }

    if (this.state === 'INATIVO') {
      this.respawnTimer--;
      if (this.respawnTimer <= 0) {
        this.hp = 100;
        const spawn = this.getRandomOpenCell();
        this.x = spawn.x;
        this.z = spawn.z;
        this.state = 'WANDER';
        this.path = null;
      }
      return;
    }

    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.pathRecalcTimer > 0) this.pathRecalcTimer--;

    // === Detecção de Alvo ===
    const humanPlayers = Object.values(players).filter(p => !p.isBot && p.hp > 0);
    
    let target = null;
    let minDist = Infinity;

    humanPlayers.forEach(p => {
      const dist = Math.sqrt((p.x - this.x) ** 2 + (p.z - this.z) ** 2);
      if (dist < minDist) {
        minDist = dist;
        target = p;
      }
    });

    // Check Line of Sight
    let hasLoS = false;
    const DETECT_RANGE = 30;
    const SHOOT_RANGE = 12;

    if (target && minDist < DETECT_RANGE) {
      hasLoS = checkLineOfSight(
        { x: this.x, y: this.y, z: this.z },
        { x: target.x, y: target.y, z: target.z }
      );
    }

    // === Transição de Estados ===
    if (hasLoS && minDist < SHOOT_RANGE) {
      this.state = 'SHOOT';
      this.losLostTimer = 0;
      this.path = null;
    } else if (target && minDist < DETECT_RANGE) {
      if (hasLoS) {
        this.state = 'CHASE';
        this.losLostTimer = 0;
      } else if (this.state === 'CHASE' || this.state === 'SHOOT') {
        // Perdeu LoS — continua perseguindo via A*
        this.losLostTimer++;
        if (this.losLostTimer > 150) { // 5 segundos sem ver → desiste
          this.state = 'WANDER';
          this.path = null;
        } else {
          this.state = 'CHASE';
        }
      }
    } else {
      if (this.state !== 'WANDER') {
        this.state = 'WANDER';
        this.path = null;
      }
    }

    // === Execução dos Estados ===
    if (this.state === 'SHOOT') {
      if (target) {
        this.rY = Math.atan2(target.x - this.x, target.z - this.z);
        if (this.attackCooldown <= 0) {
          target.hp -= 8; // Dano menor (era 15)
          this.attackCooldown = 60; // Mais lento para atirar (2 segundos)
        }
      }
    } else if (this.state === 'CHASE') {
      if (target) {
        if (hasLoS) {
          // Perseguição direta com visada
          this.moveTowards(target.x, target.z);
        } else {
          // A* Pathfinding — navega pelos corredores
          if (!this.path || this.pathRecalcTimer <= 0) {
            this.path = findPath(this.x, this.z, target.x, target.z);
            this.pathIndex = 1; // Pula o nó atual (posição do bot)
            this.pathRecalcTimer = 30; // Recalcula a cada 1 segundo
          }
          this.followPath();
        }
      }
    } else if (this.state === 'WANDER') {
      if (!this.path) {
        const wanderTarget = this.getRandomOpenCell();
        this.path = findPath(this.x, this.z, wanderTarget.x, wanderTarget.z);
        this.pathIndex = 1;
      }
      
      const done = this.followPath();
      if (done) {
        this.path = null; // Pega novo destino no próximo tick
      }
    }

    // Limita nos limites do mapa
    const BOUND = OFFSET - 1;
    this.x = Math.max(-BOUND, Math.min(BOUND, this.x));
    this.z = Math.max(-BOUND, Math.min(BOUND, this.z));
  }
}

export class BotManager {
  constructor() {
    this.bots = {};
  }

  update(players) {
    const humanCount = Object.keys(players).length;
    const targetEntities = 10; // Mais bots para o mapa competitivo 40x40
    
    if (humanCount < 2) {
      while (humanCount + Object.keys(this.bots).length < targetEntities) {
        const newBot = new Bot();
        this.bots[newBot.id] = newBot;
      }
    } else {
      if (Object.keys(this.bots).length > 0) {
        const botIds = Object.keys(this.bots);
        delete this.bots[botIds[0]];
      }
    }

    for (const botId in this.bots) {
      this.bots[botId].update(players);
    }
  }

  getBotsState() {
    const state = {};
    for (const id in this.bots) {
      const b = this.bots[id];
      if (b.state !== 'INATIVO') {
        state[id] = { id: b.id, x: b.x, y: b.y, z: b.z, rY: b.rY, hp: b.hp, isBot: true };
      }
    }
    return state;
  }
}
