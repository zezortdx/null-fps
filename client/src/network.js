import geckos from '@geckos.io/client';

export class Network {
  constructor(onConnect, onStateUpdate, onKillfeed, onPing, onPlayerDied, onInit) {
    this.channel = geckos({ port: 3000 });
    this.onConnect = onConnect;
    this.onStateUpdate = onStateUpdate;
    this.onKillfeed = onKillfeed;
    this.onPing = onPing;
    this.onPlayerDied = onPlayerDied;
    this.onInit = onInit;
    this.connected = false;
    this.id = null;

    this.channel.onConnect(error => {
      if (error) {
        console.error('Erro de conexão:', error);
        return;
      }
      this.connected = true;
      console.log('Conectado ao servidor Geckos!');
      
      if (this.onConnect) this.onConnect();
      
      // Ping Loop
      setInterval(() => {
        if (this.connected) this.channel.emit('ping', Date.now(), { reliable: false });
      }, 1000);
    });

    // Recebe seed do mapa do servidor para gerar geometria localmente
    this.channel.on('init', data => {
      console.log('[NULL] Seed recebido do servidor:', data.seed);
      if (this.onInit) this.onInit(data);
    });

    this.channel.on('pong', time => {
      const ping = Date.now() - time;
      if (this.onPing) this.onPing(ping);
    });

    this.channel.on('stateUpdate', state => {
      if (this.onStateUpdate) this.onStateUpdate(state);
    });

    this.channel.on('killfeed', data => {
      if (this.onKillfeed) this.onKillfeed(data.msg);
    });

    this.channel.on('playerDied', () => {
      if (this.onPlayerDied) this.onPlayerDied();
    });
  }

  sendInput(data) {
    if (this.connected) {
      this.channel.emit('input', data, { reliable: false });
    }
  }

  sendShoot() {
    if (this.connected) {
      this.channel.emit('shoot', {}, { reliable: true });
    }
  }

  sendDamage(targetId) {
    if (this.connected) {
      this.channel.emit('damage', { targetId }, { reliable: true });
    }
  }
}
