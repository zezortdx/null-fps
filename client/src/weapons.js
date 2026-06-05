import * as THREE from 'three';

// Weapon definitions
export const WEAPONS = [
  { id: 'pistol', name: 'PISTOL', key: 1, damage: 20, fireRate: 0.25, magSize: 12, reloadTime: 1.2, spread: 0, auto: false, recoilAmount: 0.15 },
  { id: 'smg', name: 'SMG', key: 2, damage: 12, fireRate: 0.08, magSize: 30, reloadTime: 1.8, spread: 1.5, auto: true, recoilAmount: 0.08 },
  { id: 'shotgun', name: 'SHOTGUN', key: 3, damage: 8, fireRate: 0.9, magSize: 6, reloadTime: 2.5, spread: 7, auto: false, pellets: 6, recoilAmount: 0.35 },
  { id: 'sniper', name: 'SNIPER', key: 4, damage: 80, fireRate: 1.2, magSize: 5, reloadTime: 2.0, spread: 0, auto: false, recoilAmount: 0.5 },
];

export function getWeaponByKey(keyNumber) {
  return WEAPONS.find(w => w.key === keyNumber) || null;
}

export function getWeaponById(id) {
  return WEAPONS.find(w => w.id === id) || null;
}

const weaponSolidMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
const weaponMetalMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
const weaponNeonMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });

export function createWeaponModel(weaponId) {
  const group = new THREE.Group();

  switch (weaponId) {
    case 'pistol': {
      const gripGeo = new THREE.BoxGeometry(0.06, 0.15, 0.08);
      const grip = new THREE.Mesh(gripGeo, weaponSolidMat);
      grip.position.set(0, -0.05, 0.05);
      grip.rotation.x = 0.2;

      const slideGeo = new THREE.BoxGeometry(0.08, 0.08, 0.3);
      const slide = new THREE.Mesh(slideGeo, weaponMetalMat);
      slide.position.set(0, 0.05, -0.05);

      const barrelGeo = new THREE.BoxGeometry(0.04, 0.04, 0.05);
      const barrel = new THREE.Mesh(barrelGeo, weaponSolidMat);
      barrel.position.set(0, 0.05, -0.22);

      const laserGeo = new THREE.BoxGeometry(0.02, 0.02, 0.08);
      const laser = new THREE.Mesh(laserGeo, weaponNeonMat);
      laser.position.set(0, 0.0, -0.15);

      const sightGeo = new THREE.BoxGeometry(0.02, 0.02, 0.02);
      const sight = new THREE.Mesh(sightGeo, weaponNeonMat);
      sight.position.set(0, 0.1, -0.18);

      group.add(grip, slide, barrel, laser, sight);
      group.position.set(0.2, -0.2, -0.4);
      break;
    }
    case 'smg': {
      const bodyGeo = new THREE.BoxGeometry(0.08, 0.12, 0.35);
      const body = new THREE.Mesh(bodyGeo, weaponSolidMat);

      const gripGeo = new THREE.BoxGeometry(0.05, 0.15, 0.06);
      const grip = new THREE.Mesh(gripGeo, weaponSolidMat);
      grip.position.set(0, -0.1, 0.1);
      grip.rotation.x = 0.1;

      const magGeo = new THREE.BoxGeometry(0.04, 0.2, 0.08);
      const mag = new THREE.Mesh(magGeo, weaponMetalMat);
      mag.position.set(0, -0.15, -0.05);
      mag.rotation.x = -0.1;

      const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8);
      const barrel = new THREE.Mesh(barrelGeo, weaponMetalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, -0.25);

      const sightGeo = new THREE.BoxGeometry(0.04, 0.06, 0.06);
      const sight = new THREE.Mesh(sightGeo, weaponSolidMat);
      sight.position.set(0, 0.08, 0.05);

      const dotGeo = new THREE.PlaneGeometry(0.02, 0.02);
      const dot = new THREE.Mesh(dotGeo, weaponNeonMat);
      dot.position.set(0, 0.09, 0.02);

      const sideStripGeo = new THREE.BoxGeometry(0.09, 0.01, 0.2);
      const sideStrip = new THREE.Mesh(sideStripGeo, weaponNeonMat);
      sideStrip.position.set(0, 0.02, -0.05);

      group.add(body, grip, mag, barrel, sight, dot, sideStrip);
      group.position.set(0.25, -0.2, -0.4);
      break;
    }
    case 'shotgun': {
      const stockGeo = new THREE.BoxGeometry(0.06, 0.15, 0.25);
      const stock = new THREE.Mesh(stockGeo, weaponSolidMat);
      stock.position.set(0, -0.05, 0.2);

      const bodyGeo = new THREE.BoxGeometry(0.08, 0.12, 0.4);
      const body = new THREE.Mesh(bodyGeo, weaponMetalMat);
      body.position.set(0, 0, -0.1);

      const barrelGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 12);
      const barrel = new THREE.Mesh(barrelGeo, weaponSolidMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, -0.4);

      const tubeGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8);
      const tube = new THREE.Mesh(tubeGeo, weaponSolidMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, -0.03, -0.35);

      const pumpGeo = new THREE.BoxGeometry(0.1, 0.08, 0.15);
      const pump = new THREE.Mesh(pumpGeo, weaponSolidMat);
      pump.position.set(0, -0.04, -0.25);

      const glowingRingGeo = new THREE.TorusGeometry(0.035, 0.01, 8, 16);
      const glowingRing = new THREE.Mesh(glowingRingGeo, weaponNeonMat);
      glowingRing.position.set(0, 0.02, -0.6);

      group.add(stock, body, barrel, tube, pump, glowingRing);
      group.position.set(0.3, -0.25, -0.4);
      break;
    }
    case 'sniper': {
      const stockGeo = new THREE.BoxGeometry(0.05, 0.15, 0.3);
      const stock = new THREE.Mesh(stockGeo, weaponSolidMat);
      stock.position.set(0, -0.05, 0.2);

      const bodyGeo = new THREE.BoxGeometry(0.06, 0.1, 0.4);
      const body = new THREE.Mesh(bodyGeo, weaponMetalMat);
      body.position.set(0, 0, -0.15);

      const barrelGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.8, 8);
      const barrel = new THREE.Mesh(barrelGeo, weaponSolidMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0, -0.7);

      const muzzleGeo = new THREE.BoxGeometry(0.04, 0.04, 0.08);
      const muzzle = new THREE.Mesh(muzzleGeo, weaponMetalMat);
      muzzle.position.set(0, 0, -1.1);

      const scopeBaseGeo = new THREE.BoxGeometry(0.04, 0.05, 0.2);
      const scopeBase = new THREE.Mesh(scopeBaseGeo, weaponSolidMat);
      scopeBase.position.set(0, 0.07, -0.1);

      const scopeTubeGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12);
      const scopeTube = new THREE.Mesh(scopeTubeGeo, weaponMetalMat);
      scopeTube.rotation.x = Math.PI / 2;
      scopeTube.position.set(0, 0.12, -0.1);

      const lensGeo = new THREE.PlaneGeometry(0.05, 0.05);
      const lens = new THREE.Mesh(lensGeo, weaponNeonMat);
      lens.position.set(0, 0.12, 0.055);

      const bipodGeo = new THREE.BoxGeometry(0.15, 0.02, 0.02);
      const bipod = new THREE.Mesh(bipodGeo, weaponSolidMat);
      bipod.position.set(0, -0.05, -0.8);

      group.add(stock, body, barrel, muzzle, scopeBase, scopeTube, lens, bipod);
      group.position.set(0.25, -0.2, -0.4);
      break;
    }
  }

  return group;
}
