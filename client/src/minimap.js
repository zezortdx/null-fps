export class Minimap {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.grid = [];
    this.gridSize = 0;
    this.cellSize = 0;
    this.offset = 0;
    this.pixelScale = 4; // Zoom level (pixels per map unit)
    this.viewSize = 150; // Size of minimap in pixels

    this.canvas.width = this.viewSize;
    this.canvas.height = this.viewSize;
  }

  setMapData(grid, gridSize, cellSize, offset) {
    this.grid = grid;
    this.gridSize = gridSize;
    this.cellSize = cellSize;
    this.offset = offset;
  }

  update(localPlayer, entities) {
    if (!this.grid || this.grid.length === 0) return;

    const ctx = this.ctx;
    const size = this.viewSize;
    const center = size / 2;

    // Clear background
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(10, 10, 10, 0.8)';
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    
    // Translate to center so local player is in the middle
    ctx.translate(center, center);
    
    // Rotate map so it aligns with player's forward direction (optional, but requested in standard radar)
    // Wait, let's keep North up for now, it's less disorienting for some. Or rotate it?
    // Let's keep map static and rotate player icon.

    // Scale and translate map relative to player position
    ctx.scale(this.pixelScale, this.pixelScale);
    ctx.translate(-localPlayer.x, -localPlayer.z);

    // Draw Map Grid
    for (let z = 0; z < this.gridSize; z++) {
      for (let x = 0; x < this.gridSize; x++) {
        const worldX = (x * this.cellSize) - this.offset;
        const worldZ = (z * this.cellSize) - this.offset;

        // Culling: only draw if within distance (optimization)
        const distSq = (worldX - localPlayer.x)**2 + (worldZ - localPlayer.z)**2;
        if (distSq > (size / this.pixelScale)**2) continue;

        if (this.grid[z][x] === 1) {
          // Wall
          ctx.fillStyle = '#1a1a1a';
        } else {
          // Open
          ctx.fillStyle = 'rgba(13, 26, 13, 0.5)'; // Dark green
        }
        ctx.fillRect(worldX, worldZ, this.cellSize, this.cellSize);
      }
    }

    // Draw Entities
    for (const id in entities) {
      const ent = entities[id];
      if (ent.hp <= 0) continue;

      ctx.beginPath();
      ctx.arc(ent.x, ent.z, 0.8, 0, Math.PI * 2);
      ctx.fillStyle = ent.isBot ? '#ff0033' : '#00ff66';
      ctx.fill();
    }

    ctx.restore();

    // Draw Local Player at Center
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(localPlayer.rY); // Rotate icon based on player view

    // Draw Triangle
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(3, 3);
    ctx.lineTo(-3, 3);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    
    ctx.restore();

    // Add border
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
  }
}
