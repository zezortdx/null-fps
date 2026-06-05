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

export function createWeaponModel(weaponId) {
  const group = new THREE.Group();
  const solidMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const neonMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });

  switch (weaponId) {
    case 'pistol': {
      const bodyGeo = new THREE.BoxGeometry(0.08, 0.12, 0.3);
      const body = new THREE.Mesh(bodyGeo, solidMat);
      
      const barrelGeo = new THREE.BoxGeometry(0.06, 0.06, 0.2);
      const barrel = new THREE.Mesh(barrelGeo, solidMat);
      barrel.position.set(0, 0.03, -0.25);

      const sightGeo = new THREE.BoxGeometry(0.02, 0.02, 0.05);
      const sight = new THREE.Mesh(sightGeo, neonMat);
      sight.position.set(0, 0.07, -0.15);

      group.add(body, barrel, sight);
      group.position.set(0.3, -0.2, -0.4);
      break;
    }
    case 'smg': {
      const bodyGeo = new THREE.BoxGeometry(0.1, 0.15, 0.4);
      const body = new THREE.Mesh(bodyGeo, solidMat);

      const barrelGeo = new THREE.BoxGeometry(0.04, 0.04, 0.3);
      const barrel = new THREE.Mesh(barrelGeo, solidMat);
      barrel.position.set(0, 0.02, -0.35);

      const magGeo = new THREE.BoxGeometry(0.06, 0.2, 0.1);
      const mag = new THREE.Mesh(magGeo, solidMat);
      mag.position.set(0, -0.15, -0.1);

      const stripGeo = new THREE.BoxGeometry(0.11, 0.02, 0.3);
      const strip = new THREE.Mesh(stripGeo, neonMat);
      strip.position.set(0, 0.05, 0);

      group.add(body, barrel, mag, strip);
      group.position.set(0.3, -0.25, -0.5);
      break;
    }
    case 'shotgun': {
      const bodyGeo = new THREE.BoxGeometry(0.12, 0.18, 0.5);
      const body = new THREE.Mesh(bodyGeo, solidMat);

      const barrelGeo = new THREE.BoxGeometry(0.08, 0.08, 0.6);
      const barrel = new THREE.Mesh(barrelGeo, solidMat);
      barrel.position.set(0, 0.05, -0.55);

      const pumpGeo = new THREE.BoxGeometry(0.1, 0.1, 0.2);
      const pump = new THREE.Mesh(pumpGeo, solidMat);
      pump.position.set(0, -0.05, -0.4);

      const neonRingGeo = new THREE.BoxGeometry(0.09, 0.09, 0.05);
      const neonRing = new THREE.Mesh(neonRingGeo, neonMat);
      neonRing.position.set(0, 0.05, -0.8);

      group.add(body, barrel, pump, neonRing);
      group.position.set(0.35, -0.3, -0.6);
      break;
    }
    case 'sniper': {
      const bodyGeo = new THREE.BoxGeometry(0.08, 0.15, 0.6);
      const body = new THREE.Mesh(bodyGeo, solidMat);

      const barrelGeo = new THREE.BoxGeometry(0.03, 0.03, 1.2);
      const barrel = new THREE.Mesh(barrelGeo, solidMat);
      barrel.position.set(0, 0.02, -0.9);

      const scopeGeo = new THREE.BoxGeometry(0.05, 0.05, 0.4);
      const scope = new THREE.Mesh(scopeGeo, solidMat);
      scope.position.set(0, 0.15, -0.1);

      const scopeNeonGeo = new THREE.BoxGeometry(0.06, 0.06, 0.02);
      const scopeNeon = new THREE.Mesh(scopeNeonGeo, neonMat);
      scopeNeon.position.set(0, 0.15, -0.3);

      group.add(body, barrel, scope, scopeNeon);
      group.position.set(0.3, -0.25, -0.6);
      break;
    }
  }

  return group;
}
