import geckos from '@geckos.io/server';
import { BotManager } from './bots.js';
import { generateMap, mapData, grid, GRID_SIZE, CELL_SIZE, OFFSET } from '../shared/map.js';

const io = geckos();

// Gera seed procedural e constrói o mapa no servidor
const MAP_SEED = Date.now() ^ (Math.random() * 0xFFFFFFFF >>> 0);
generateMap(MAP_SEED);
console.log(`[NULL] Mapa gerado | Seed: ${MAP_SEED} | AABBs: ${mapData.length}`);

io.listen(3000);
console.log('[NULL] Servidor UDP rodando na porta 3000');

const players = {};
const channels = {};
const botManager = new BotManager();

io.onConnection(channel => {
  console.log(`[+] Jogador conectado: ${channel.id}`);
  
  channels[channel.id] = channel;

  // Envia seed + ID para o cliente
  channel.emit('init', { seed: MAP_SEED, id: channel.id }, { reliable: true });

  // Inicializa o estado do player
  players[channel.id] = {
    id: channel.id,
    x: 0,
    y: 1,
    z: 0,
    rY: 0,
    hp: 100,
    kills: 0,
    deaths: 0,
    isBot: false,
    nickname: 'Operador_' + channel.id.substring(0, 4),
    dead: false,
    weapon: 'pistol'
  };

  channel.onDisconnect(() => {
    console.log(`[-] Jogador desconectado: ${channel.id}`);
    delete players[channel.id];
    delete channels[channel.id];
  });

  // Recebe os inputs de movimentação do cliente
  channel.on('input', data => {
    if (players[channel.id]) {
      if (data.x !== undefined) players[channel.id].x = data.x;
      if (data.y !== undefined) players[channel.id].y = data.y;
      if (data.z !== undefined) players[channel.id].z = data.z;
      if (data.rY !== undefined) players[channel.id].rY = data.rY;
      if (data.weapon) players[channel.id].weapon = data.weapon;
      if (data.nickname) players[channel.id].nickname = data.nickname;
    }
  });

  channel.on('shoot', data => {
    io.room().emit('playerShot', { id: channel.id, weapon: data.weapon || 'pistol' });
  });

  channel.on('ping', data => {
    channel.emit('pong', data);
  });

  // Dano agora variável — o cliente envia qual arma usou e o dano
  channel.on('damage', data => {
    const attacker = players[channel.id];
    if (!attacker || attacker.hp <= 0) return;

    const targetId = data.targetId;
    const damage = Math.min(data.damage || 25, 100); // Clamp para prevenir hack
    let target = players[targetId] || botManager.bots[targetId];

    if (target && target.hp > 0 && target.state !== 'INATIVO') {
      target.hp -= damage;
      
      // Notifica o atacante que o hit conectou (para hitmarker)
      channel.emit('hitConfirm', { 
        targetId, 
        damage, 
        headshot: data.headshot || false,
        killed: target.hp <= 0 
      });

      if (target.hp <= 0) {
        attacker.kills++;
        
        let targetName = target.isBot ? 'BOT' : target.nickname;
        let attackerName = attacker.nickname;
        
        if (!target.isBot) {
          target.deaths++;
          target.dead = true;
          io.room().emit('killfeed', { 
            msg: `${attackerName} → ${targetName}`,
            weapon: data.weapon || 'pistol',
            headshot: data.headshot || false,
            attackerKills: attacker.kills
          });
          if (channels[targetId]) {
            channels[targetId].emit('playerDied', { killerId: channel.id });
          }
        } else {
          io.room().emit('killfeed', { 
            msg: `${attackerName} → ${targetName}`,
            weapon: data.weapon || 'pistol',
            headshot: data.headshot || false,
            attackerKills: attacker.kills
          });
        }
      } else {
        // Notifica a vítima da direção do dano (para damage indicators)
        if (!target.isBot && channels[targetId]) {
          channels[targetId].emit('damaged', { 
            fromX: attacker.x, 
            fromZ: attacker.z,
            damage 
          });
        }
      }
    }
  });
});

// Game Loop: 30 Ticks por segundo
const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;

let medkits = [];
let nextMedkitId = 1;

function spawnMedkit() {
  if (medkits.length >= 4) return;
  
  let rx, rz;
  let attempts = 0;
  do {
    rx = Math.floor(Math.random() * GRID_SIZE);
    rz = Math.floor(Math.random() * GRID_SIZE);
    attempts++;
  } while (grid[rz] && grid[rz][rx] !== 0 && attempts < 100);

  if (grid[rz] && grid[rz][rx] === 0) {
    medkits.push({
      id: nextMedkitId++,
      x: rx * CELL_SIZE - OFFSET + (CELL_SIZE / 2),
      z: rz * CELL_SIZE - OFFSET + (CELL_SIZE / 2),
      hp: 50
    });
  }
}

// Initial spawns
setTimeout(() => { spawnMedkit(); spawnMedkit(); spawnMedkit(); }, 2000);

setInterval(() => {
  botManager.update(players);
  
  // Verifica se o bot matou alguém
  for (const id in players) {
    if (players[id].hp <= 0 && !players[id].dead) {
      players[id].dead = true;
      players[id].deaths++;
      io.room().emit('killfeed', { 
        msg: `BOT → ${players[id].nickname}`,
        weapon: 'smg',
        headshot: false,
        attackerKills: 0
      });
      if (channels[id]) {
        channels[id].emit('playerDied', { killerId: 'bot' });
      }
    }
  }

  const botsState = botManager.getBotsState();
  
  // Medkit collision
  for (const id in players) {
    const p = players[id];
    if (p.hp > 0 && p.hp < 100 && !p.dead) {
      for (let i = medkits.length - 1; i >= 0; i--) {
        const mk = medkits[i];
        if (Math.hypot(p.x - mk.x, p.z - mk.z) < 1.5) {
          p.hp = Math.min(100, p.hp + mk.hp);
          medkits.splice(i, 1);
          setTimeout(spawnMedkit, 15000);
          
          if (channels[id]) {
            channels[id].emit('heal', { amount: mk.hp });
          }
        }
      }
    }
  }

  const state = {
    players: players,
    bots: botsState,
    medkits: medkits
  };

  io.room().emit('stateUpdate', state);

}, TICK_MS);
