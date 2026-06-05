export class FeedbackSystem {
  constructor() {
    this.hitmarker = this.getOrCreateElement('hitmarker', 'hitmarker-container');
    this.damageVignette = this.getOrCreateElement('damage-vignette', 'damage-vignette');
    this.killBanner = this.getOrCreateElement('kill-banner', 'kill-banner');
    this.damageIndicatorsContainer = this.getOrCreateElement('damage-indicators-container', 'damage-indicators-container');

    this.hitmarkerTimer = 0;
    this.vignetteTimer = 0;
    this.killBannerTimer = 0;

    this.shake = { x: 0, y: 0 };
    this.shakeIntensity = 0;

    this.setupStyles();
  }

  setupStyles() {
    // Only add styles if not already present
    if (document.getElementById('feedback-styles')) return;

    const style = document.createElement('style');
    style.id = 'feedback-styles';
    style.innerHTML = `
      #hitmarker-container {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 50;
        opacity: 0;
        transition: opacity 0.05s;
      }
      .hitmarker-line {
        position: absolute;
        background-color: white;
        width: 16px;
        height: 2px;
        top: 50%;
        left: 50%;
        transform-origin: center;
      }
      .hitmarker-line.headshot {
        background-color: #ff0033;
        width: 24px;
        box-shadow: 0 0 5px #ff0033;
      }
      .hitmarker-line:nth-child(1) { transform: translate(-50%, -50%) rotate(45deg); }
      .hitmarker-line:nth-child(2) { transform: translate(-50%, -50%) rotate(-45deg); }
      
      #damage-vignette {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none;
        z-index: 40;
        opacity: 0;
        box-shadow: inset 0 0 150px rgba(255, 0, 51, 0.8);
        transition: opacity 0.1s;
      }

      #kill-banner {
        position: absolute;
        top: -100px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(255, 0, 51, 0.8);
        color: white;
        padding: 10px 40px;
        font-family: monospace;
        font-size: 24px;
        font-weight: bold;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
        border: 2px solid #ff0033;
        z-index: 60;
        transition: top 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        clip-path: polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0% 50%);
      }

      #damage-indicators-container {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none;
        z-index: 45;
        overflow: hidden;
      }

      .damage-indicator {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        border-left: 20px solid transparent;
        border-right: 20px solid transparent;
        border-bottom: 40px solid rgba(255, 0, 51, 0.8);
        transform-origin: 50% 200px; /* Offset to push it to the edge */
        margin-top: -200px;
        margin-left: -20px;
        opacity: 1;
        transition: opacity 1s linear;
      }
    `;
    document.head.appendChild(style);

    // Setup hitmarker lines
    this.hitmarker.innerHTML = '<div class="hitmarker-line"></div><div class="hitmarker-line"></div>';
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

  showHitmarker(isHeadshot) {
    this.hitmarker.style.opacity = '1';
    this.hitmarkerTimer = 0.15; // seconds
    
    const lines = this.hitmarker.querySelectorAll('.hitmarker-line');
    lines.forEach(line => {
      if (isHeadshot) {
        line.classList.add('headshot');
      } else {
        line.classList.remove('headshot');
      }
    });
  }

  showDamageIndicator(fromAngle) {
    const indicator = document.createElement('div');
    indicator.className = 'damage-indicator';
    
    // Convert angle to CSS rotation (0 is top)
    const rotation = (fromAngle * 180 / Math.PI) + 180;
    indicator.style.transform = `rotate(${rotation}deg)`;
    
    this.damageIndicatorsContainer.appendChild(indicator);

    // Force reflow
    void indicator.offsetWidth;

    // Fade out
    setTimeout(() => {
      indicator.style.opacity = '0';
    }, 50); // Start fade almost immediately

    // Remove after fade
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 1050);
  }

  showKillConfirmation(victimName) {
    this.killBanner.innerText = `ELIMINADO: ${victimName}`;
    this.killBanner.style.top = '100px';
    this.killBannerTimer = 2.0;
  }

  triggerDamageFlash() {
    this.damageVignette.style.opacity = '1';
    this.vignetteTimer = 0.3;
  }

  getShakeOffset() {
    return this.shake;
  }

  triggerShake(intensity) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  update(deltaTime) {
    // Hitmarker
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= deltaTime;
      if (this.hitmarkerTimer <= 0) {
        this.hitmarker.style.opacity = '0';
      }
    }

    // Vignette
    if (this.vignetteTimer > 0) {
      this.vignetteTimer -= deltaTime;
      this.damageVignette.style.opacity = (this.vignetteTimer / 0.3).toString();
    }

    // Kill Banner
    if (this.killBannerTimer > 0) {
      this.killBannerTimer -= deltaTime;
      if (this.killBannerTimer <= 0) {
        this.killBanner.style.top = '-100px';
      }
    }

    // Shake
    if (this.shakeIntensity > 0) {
      this.shake.x = (Math.random() - 0.5) * this.shakeIntensity;
      this.shake.y = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= 0.9; // decay
      if (this.shakeIntensity < 0.001) this.shakeIntensity = 0;
    } else {
      this.shake.x = 0;
      this.shake.y = 0;
    }
  }
}
