export class Progression {
  constructor() {
    this.streakBanner = this.getOrCreateElement('streak-banner', 'streak-banner');
    
    // XP UI
    this.xpContainer = this.getOrCreateElement('xp-container', 'xp-container');
    this.xpContainer.innerHTML = `
      <div id="level-text">LVL 1</div>
      <div id="xp-bar-bg"><div id="xp-bar-fill"></div></div>
      <div id="xp-text">0 / 500</div>
    `;
    this.xpFill = document.getElementById('xp-bar-fill');
    this.xpText = document.getElementById('xp-text');
    this.levelText = document.getElementById('level-text');

    this.kills = 0;
    this.currentStreak = 0;
    this.lastKillTime = 0;
    this.multiKillCount = 0;
    this.xp = 0;

    this.bannerTimer = 0;

    this.setupStyles();
    this.updateXPBar();
  }

  setupStyles() {
    if (document.getElementById('progression-styles')) return;

    const style = document.createElement('style');
    style.id = 'progression-styles';
    style.innerHTML = `
      #streak-banner {
        position: absolute;
        top: 150px;
        left: 50%;
        transform: translateX(-50%) scale(0.5);
        opacity: 0;
        color: white;
        padding: 5px 20px;
        font-family: monospace;
        font-size: 20px;
        font-weight: bold;
        z-index: 55;
        transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        pointer-events: none;
      }
      #streak-banner.show {
        transform: translateX(-50%) scale(1);
        opacity: 1;
      }
      .streak-yellow { background: rgba(255, 204, 0, 0.8); border: 2px solid #ffcc00; text-shadow: 0 0 5px #ffcc00; }
      .streak-orange { background: rgba(255, 102, 0, 0.8); border: 2px solid #ff6600; text-shadow: 0 0 5px #ff6600; }
      .streak-red { background: rgba(255, 0, 51, 0.8); border: 2px solid #ff0033; text-shadow: 0 0 5px #ff0033; }
      .streak-gold { 
        background: rgba(255, 215, 0, 0.8); 
        border: 2px solid #ffd700; 
        text-shadow: 0 0 10px #ffd700; 
        animation: pulseGold 1s infinite alternate;
      }

      @keyframes pulseGold {
        from { box-shadow: 0 0 10px #ffd700; }
        to { box-shadow: 0 0 30px #ffd700; transform: translateX(-50%) scale(1.1); }
      }

      #xp-container {
        position: absolute;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        width: 400px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: monospace;
        font-size: 12px;
        color: #00ff66;
      }
      #level-text { font-weight: bold; }
      #xp-bar-bg {
        flex-grow: 1;
        height: 8px;
        background: rgba(10, 10, 10, 0.8);
        border: 1px solid #00ff66;
        position: relative;
      }
      #xp-bar-fill {
        height: 100%;
        background: #00ff66;
        width: 0%;
        transition: width 0.3s ease-out;
      }
    `;
    document.head.appendChild(style);
  }

  getOrCreateElement(id, className) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = className;
      document.getElementById('hud')?.appendChild(el);
    }
    return el;
  }

  registerKill() {
    this.kills++;
    this.currentStreak++;
    
    const now = performance.now();
    const timeSinceLastKill = (now - this.lastKillTime) / 1000;
    
    if (timeSinceLastKill < 4.0) {
      this.multiKillCount++;
    } else {
      this.multiKillCount = 1;
    }
    this.lastKillTime = now;

    this.addXP(100);

    // Evaluate Streaks
    let bannerText = null;
    let bannerClass = null;

    if (this.currentStreak === 10) {
      bannerText = "GODLIKE!";
      bannerClass = "streak-gold";
    } else if (this.currentStreak === 5) {
      bannerText = "UNSTOPPABLE!";
      bannerClass = "streak-red";
    } else if (this.multiKillCount === 3) {
      bannerText = "MULTI KILL!";
      bannerClass = "streak-orange";
    } else if (this.multiKillCount === 2) {
      bannerText = "DOUBLE KILL!";
      bannerClass = "streak-yellow";
    }

    if (bannerText) {
      this.showBanner(bannerText, bannerClass);
    }
  }

  registerDeath() {
    this.currentStreak = 0;
    this.multiKillCount = 0;
    this.addXP(10);
  }

  addXP(amount) {
    this.xp += amount;
    this.updateXPBar();
  }

  updateXPBar() {
    const level = Math.floor(this.xp / 500) + 1;
    const xpInLevel = this.xp % 500;
    const progress = (xpInLevel / 500) * 100;

    this.levelText.innerText = `LVL ${level}`;
    this.xpText.innerText = `${xpInLevel} / 500`;
    this.xpFill.style.width = `${progress}%`;
  }

  showBanner(text, cssClass) {
    this.streakBanner.innerText = text;
    this.streakBanner.className = `show ${cssClass}`;
    this.bannerTimer = 2.0;
  }

  getStreakCount() {
    return this.currentStreak;
  }

  update(deltaTime) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= deltaTime;
      if (this.bannerTimer <= 0) {
        this.streakBanner.classList.remove('show');
      }
    }
  }
}
