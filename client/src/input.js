export const Input = {
  keys: {
    w: false,
    a: false,
    s: false,
    d: false,
    shift: false,
    control: false,
    tab: false,
    ' ': false, // Space
    q: false,
    e: false,
    1: false,
    2: false,
    3: false,
    4: false
  },
  movementX: 0,
  movementY: 0,
  justPressed: {},
  
  init() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'tab') e.preventDefault(); // Prevent focus change

      if (this.keys.hasOwnProperty(key)) {
        if (!this.keys[key]) {
          this.justPressed[key] = true;
        }
        this.keys[key] = true;
      } else if (e.key === 'Shift') {
        this.keys.shift = true;
      } else if (e.key === 'Control') {
        this.keys.control = true;
      } else if (e.key === ' ') {
        if (!this.keys[' ']) this.justPressed[' '] = true;
        this.keys[' '] = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (this.keys.hasOwnProperty(key)) {
        this.keys[key] = false;
        this.justPressed[key] = false;
      } else if (e.key === 'Shift') {
        this.keys.shift = false;
      } else if (e.key === 'Control') {
        this.keys.control = false;
      } else if (e.key === ' ') {
        this.keys[' '] = false;
        this.justPressed[' '] = false;
      }
    });
    
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.movementX += e.movementX || 0;
        this.movementY += e.movementY || 0;
      }
    });
  },

  isJustPressed(key) {
    if (this.justPressed[key]) {
      this.justPressed[key] = false;
      return true;
    }
    return false;
  },

  resetMouseMovement() {
    this.movementX = 0;
    this.movementY = 0;
  }
};
