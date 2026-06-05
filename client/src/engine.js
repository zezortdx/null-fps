import * as THREE from 'three';
import { mapData, GRID_SIZE, CELL_SIZE, OFFSET, jumpPads } from '../../shared/map.js';
import { createWeaponModel } from './weapons.js';

export class Engine {
  constructor(canvasContainer) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020408);
    this.scene.fog = new THREE.FogExp2(0x020408, 0.012);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.rotation.order = 'YXZ'; 

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio > 1 ? 1 : window.devicePixelRatio); 
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(this.renderer.domElement);
    
    this.qualityLevel = 'HIGH';
    this.particleCount = 20;

    this.entities = {}; 
    this.particles = [];
    this.decals = [];
    this.tracers = [];
    
    this.medkits = {};
    
    // Weapon viewmodel
    this.weaponGroup = new THREE.Group();
    this.weaponBasePos = new THREE.Vector3(0.3, -0.3, -0.5);
    // Posição centralizada da arma ao mirar (alinha o ferro/red-dot no centro da tela)
    this.aimTarget = new THREE.Vector3(0, -0.22, -0.42);
    this.aiming = false;
    this.scoped = false;
    this.weaponGroup.position.copy(this.weaponBasePos);
    this.camera.add(this.weaponGroup);
    this.scene.add(this.camera);
    
    this.recoil = 0;
    this.bobTime = 0;
    
    // Pre-instantiate shared geometries and materials
    this.particleGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    this.particleMatGreen = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
    this.particleMatRed = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    
    this.decalGeo = new THREE.PlaneGeometry(0.15, 0.15);
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, depthWrite: false, transparent: true, opacity: 0.8 });

    // Entity materials with original vibrant colors
    this.botBodyMat = new THREE.MeshLambertMaterial({ color: 0xff0033 });
    this.botHeadMat = new THREE.MeshLambertMaterial({ color: 0xaa0022 });
    this.playerBodyMat = new THREE.MeshLambertMaterial({ color: 0x00ff66 });
    this.playerHeadMat = new THREE.MeshLambertMaterial({ color: 0x00aa44 });
    this.visorMatBot = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    this.visorMatPlayer = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
    
    // Shared tracer material
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.8 });

    // Shared entity geometries (created once, reused)
    this.entityBodyGeo = new THREE.CapsuleGeometry(0.3, 0.7, 4, 12);
    this.entityHeadGeo = new THREE.SphereGeometry(0.22, 12, 12);
    this.entityVisorGeo = new THREE.BoxGeometry(0.35, 0.08, 0.06);
    this.entityArmGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  createGridTexture(lineColor, bgColor, detail) {
    const size = detail ? 256 : 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);
    
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
    
    if (detail) {
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(size/2, 0); ctx.lineTo(size/2, size);
      ctx.moveTo(0, size/2); ctx.lineTo(size, size/2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  setGraphicsQuality(level) {
    if (this.qualityLevel === level) return;
    this.qualityLevel = level;
    console.log(`[Engine] Quality: ${level}`);

    if (level === 'POTATO') {
      this.renderer.setPixelRatio(0.25);
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
      this.particleCount = 0;
      this.scene.fog.density = 0.06;
    } else if (level === 'LOW') {
      this.renderer.setPixelRatio(0.5);
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
      this.particleCount = 5;
      this.scene.fog.density = 0.015;
    } else if (level === 'MEDIUM') {
      this.renderer.setPixelRatio(0.75);
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
      this.particleCount = 10;
      this.scene.fog.density = 0.012;
    } else if (level === 'HIGH') {
      const pr = window.devicePixelRatio > 1 ? 1.0 : window.devicePixelRatio;
      this.renderer.setPixelRatio(pr);
      this.renderer.shadowMap.autoUpdate = true;
      this.particleCount = 20;
      this.scene.fog.density = 0.012;
    }
    
    const showEdges = level !== 'POTATO';
    if (this.gridHelper) this.gridHelper.visible = showEdges;
    if (this.mapEdges) this.mapEdges.visible = showEdges;

    this.scene.traverse((child) => {
      if (child.isMesh && child.material) child.material.needsUpdate = true;
    });
  }

  // aiming: traz a arma ao centro (mira de ferro). scoped: esconde a arma (luneta da sniper).
  setAim(aiming, scoped = false) {
    this.aiming = aiming;
    this.scoped = scoped;
  }

  setWeaponModel(weaponId) {
    while(this.weaponGroup.children.length > 0) {
      this.weaponGroup.remove(this.weaponGroup.children[0]);
    }
    const newModel = createWeaponModel(weaponId);
    this.weaponGroup.add(newModel);
  }

  setupWorld() {
    const MAP_SIZE = GRID_SIZE * CELL_SIZE + 8;

    // Skybox dome
    const skyGeo = new THREE.SphereGeometry(200, 16, 16);
    const skyMat = new THREE.MeshBasicMaterial({ 
      color: 0x030810, 
      side: THREE.BackSide 
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(ambientLight);
    
    const hemiLight = new THREE.HemisphereLight(0x224422, 0x002200, 0.4);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0x88ffaa, 0.5);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.scene.add(dirLight);

    // Floor with grid texture
    const floorTex = this.createGridTexture('#003322', '#030805', true);
    floorTex.repeat.set(MAP_SIZE / 2, MAP_SIZE / 2);
    const floorGeo = new THREE.PlaneGeometry(MAP_SIZE * 2, MAP_SIZE * 2);
    const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, color: 0x555555 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Grid overlay
    const gridHelper = new THREE.GridHelper(MAP_SIZE, MAP_SIZE / 2, 0x00ff66, 0x001a0d);
    gridHelper.position.y = 0.01;
    gridHelper.material.opacity = 0.25;
    gridHelper.material.transparent = true;
    gridHelper.visible = this.qualityLevel !== 'POTATO';
    this.scene.add(gridHelper);
    this.gridHelper = gridHelper;

    if (mapData && mapData.length > 0) {
      // Jump Pads
      const jpGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.15, 16);
      const jpMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
      
      for (const jp of jumpPads) {
        const mesh = new THREE.Mesh(jpGeo, jpMat);
        mesh.position.set(jp.x, 0.08, jp.z);
        
        const haloGeo = new THREE.RingGeometry(0.9, 1.3, 16);
        const haloMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.rotation.x = -Math.PI / 2;
        halo.position.set(jp.x, 0.02, jp.z);
        
        this.scene.add(mesh);
        this.scene.add(halo);
      }

      // Walls - back to original colors
      const wallTex = this.createGridTexture('#00ff66', '#001a0d', true);
      const halfWallTex = this.createGridTexture('#00cc55', '#001108', false);
      
      // Separate walls by type
      const fullWalls = [];
      const halfWalls = [];
      
      for (let i = 0; i < mapData.length; i++) {
        const aabb = mapData[i];
        if (aabb.maxY <= 1.5) {
          halfWalls.push(aabb);
        } else {
          fullWalls.push(aabb);
        }
      }

      // Full walls instanced mesh
      if (fullWalls.length > 0) {
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const boxMat = new THREE.MeshLambertMaterial({ map: wallTex, color: 0x556677 });
        const fullMesh = new THREE.InstancedMesh(boxGeo, boxMat, fullWalls.length);
        fullMesh.castShadow = true;
        fullMesh.receiveShadow = true;
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < fullWalls.length; i++) {
          const aabb = fullWalls[i];
          const w = aabb.maxX - aabb.minX, h = aabb.maxY - aabb.minY, d = aabb.maxZ - aabb.minZ;
          dummy.position.set(aabb.minX + w/2, aabb.minY + h/2, aabb.minZ + d/2);
          dummy.scale.set(w, h, d);
          dummy.updateMatrix();
          fullMesh.setMatrixAt(i, dummy.matrix);
        }
        this.scene.add(fullMesh);
        this.instancedMesh = fullMesh;
      }

      // Half walls instanced mesh (different color/material)
      if (halfWalls.length > 0) {
        const hBoxGeo = new THREE.BoxGeometry(1, 1, 1);
        const hBoxMat = new THREE.MeshLambertMaterial({ map: halfWallTex, color: 0x887744 });
        const halfMesh = new THREE.InstancedMesh(hBoxGeo, hBoxMat, halfWalls.length);
        halfMesh.castShadow = true;
        halfMesh.receiveShadow = true;
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < halfWalls.length; i++) {
          const aabb = halfWalls[i];
          const w = aabb.maxX - aabb.minX, h = aabb.maxY - aabb.minY, d = aabb.maxZ - aabb.minZ;
          dummy.position.set(aabb.minX + w/2, aabb.minY + h/2, aabb.minZ + d/2);
          dummy.scale.set(w, h, d);
          dummy.updateMatrix();
          halfMesh.setMatrixAt(i, dummy.matrix);
        }
        this.scene.add(halfMesh);
        this.halfWallMesh = halfMesh;
      }

      // Edge wireframes for all walls
      const allEdgePositions = []; 
      for (let i = 0; i < mapData.length; i++) {
        const aabb = mapData[i];
        const w = aabb.maxX - aabb.minX, h = aabb.maxY - aabb.minY, d = aabb.maxZ - aabb.minZ;
        const cx = aabb.minX + w/2, cy = aabb.minY + h/2, cz = aabb.minZ + d/2;
        const hw = w/2, hh = h/2, hd = d/2;
        const corners = [
          [cx-hw,cy-hh,cz-hd],[cx+hw,cy-hh,cz-hd],[cx+hw,cy+hh,cz-hd],[cx-hw,cy+hh,cz-hd],
          [cx-hw,cy-hh,cz+hd],[cx+hw,cy-hh,cz+hd],[cx+hw,cy+hh,cz+hd],[cx-hw,cy+hh,cz+hd],
        ];
        const edgeIndices = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
        for (const [a,b] of edgeIndices) {
          allEdgePositions.push(corners[a][0],corners[a][1],corners[a][2],corners[b][0],corners[b][1],corners[b][2]);
        }
      }
      
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(allEdgePositions), 3));
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.15 });
      const mergedEdges = new THREE.LineSegments(edgeGeo, edgeMat);
      mergedEdges.visible = this.qualityLevel !== 'POTATO';
      this.scene.add(mergedEdges);
      this.mapEdges = mergedEdges;
    }
  }

  createHPBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 64, 16);
    ctx.fillStyle = '#00ff66';
    ctx.fillRect(2, 2, 60, 12);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.2, 0.3, 1);
    sprite.position.set(0, 2.3, 0);
    sprite.userData = { canvas, ctx, texture };
    return sprite;
  }

  updateHPBar(sprite, hp) {
    if (sprite.userData.lastHp === hp) return;
    sprite.userData.lastHp = hp;
    const ctx = sprite.userData.ctx;
    ctx.clearRect(0, 0, 64, 16);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 64, 16);
    const percent = Math.max(0, Math.min(100, hp)) / 100;
    ctx.fillStyle = percent > 0.5 ? '#00ff66' : (percent > 0.2 ? '#ffcc00' : '#ff0033');
    ctx.fillRect(2, 2, 60 * percent, 12);
    sprite.userData.texture.needsUpdate = true;
  }

  updateEntities(state) {
    const serverEntities = { ...state.players, ...state.bots };
    const currentIds = Object.keys(serverEntities);

    for (const id in this.entities) {
      if (!currentIds.includes(id)) {
        this.scene.remove(this.entities[id]);
        delete this.entities[id];
      }
    }

    for (const id in serverEntities) {
      const serverEnt = serverEntities[id];
      if (this.localId === id) continue;

      if (!this.entities[id]) {
        const group = new THREE.Group();
        const isBot = serverEnt.isBot;
        
        // Body (capsule)
        const body = new THREE.Mesh(this.entityBodyGeo, isBot ? this.botBodyMat : this.playerBodyMat);
        body.position.y = 0.7;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);
        
        // Head (sphere)
        const head = new THREE.Mesh(this.entityHeadGeo, isBot ? this.botHeadMat : this.playerHeadMat);
        head.position.y = 1.55;
        head.castShadow = true;
        group.add(head);
        
        // Eye visor (glowing slit)
        const visor = new THREE.Mesh(this.entityVisorGeo, isBot ? this.visorMatBot : this.visorMatPlayer);
        visor.position.set(0, 1.55, -0.2);
        group.add(visor);

        // Arms
        const leftArm = new THREE.Mesh(this.entityArmGeo, isBot ? this.botBodyMat : this.playerBodyMat);
        leftArm.position.set(-0.38, 0.8, 0);
        group.add(leftArm);

        const rightArm = new THREE.Mesh(this.entityArmGeo, isBot ? this.botBodyMat : this.playerBodyMat);
        rightArm.position.set(0.38, 0.8, 0);
        group.add(rightArm);

        // HP Bar
        const hpBar = this.createHPBar();
        group.add(hpBar);
        group.userData.hpBar = hpBar;
        
        // Weapon model on entity
        const weaponId = serverEnt.weapon || (isBot ? 'smg' : 'pistol');
        const weaponModel = createWeaponModel(weaponId);
        weaponModel.position.set(0.25, 0.85, -0.5);
        weaponModel.scale.set(0.8, 0.8, 0.8);
        group.add(weaponModel);
        
        group.position.set(serverEnt.x, serverEnt.y - 1, serverEnt.z);
        group.rotation.y = serverEnt.rY;
        
        // Store refs for raycasting and animation
        group.userData.body = body;
        group.userData.head = head;
        group.userData.leftArm = leftArm;
        group.userData.rightArm = rightArm;
        group.userData.visor = visor;
        group.userData.weaponModel = weaponModel;
        group.userData.isBot = isBot;
        group.userData.walkCycle = Math.random() * Math.PI * 2;
        
        group.userData.targetPosition = new THREE.Vector3(serverEnt.x, serverEnt.y - 1, serverEnt.z);
        group.userData.targetRotationY = serverEnt.rY;

        this.scene.add(group);
        this.entities[id] = group;
      } else {
        const group = this.entities[id];
        group.userData.targetPosition.set(serverEnt.x, serverEnt.y - 1, serverEnt.z);
        
        let targetR = serverEnt.rY;
        let currentR = group.rotation.y;
        while (targetR - currentR > Math.PI) targetR -= Math.PI * 2;
        while (targetR - currentR < -Math.PI) targetR += Math.PI * 2;
        group.userData.targetRotationY = targetR;

        if (group.userData.hpBar) {
          this.updateHPBar(group.userData.hpBar, serverEnt.hp);
        }
      }
    }
  }

  updateMedkits(medkitsList, deltaTime) {
    const currentIds = medkitsList.map(m => m.id);
    
    for (const id in this.medkits) {
      if (!currentIds.includes(parseInt(id))) {
        this.scene.remove(this.medkits[id]);
        delete this.medkits[id];
      }
    }

    for (const mk of medkitsList) {
      if (!this.medkits[mk.id]) {
        const group = new THREE.Group();
        
        // Cross shape medkit
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.15), mat);
        const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), mat);
        group.add(hBar);
        group.add(vBar);
        
        // Outer glow ring
        const ringGeo = new THREE.TorusGeometry(0.45, 0.03, 8, 16);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.4 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        group.add(ring);
        
        group.position.set(mk.x, 0.8, mk.z);
        this.scene.add(group);
        this.medkits[mk.id] = group;
      }
    }

    for (const id in this.medkits) {
      const g = this.medkits[id];
      g.rotation.y += deltaTime * 2;
      g.position.y = 0.8 + Math.sin(performance.now() * 0.003) * 0.15;
    }
  }

  simulateShoot(spreadAmount, pellets = 1, onHit = null) {
    this.recoil = 0.2;

    // O raycast (tiro real) sai do CENTRO da câmera, alinhado ao crosshair.
    const start = new THREE.Vector3(0, 0, 0);
    start.applyMatrix4(this.camera.matrixWorld);

    // O traçador/flash saem do cano da arma, só para o visual.
    const muzzle = new THREE.Vector3(0.3, -0.25, -0.9);
    muzzle.applyMatrix4(this.camera.matrixWorld);

    // Muzzle Flash
    if (this.qualityLevel !== 'POTATO') {
      const flash = new THREE.PointLight(0xffffaa, 6, 20);
      flash.position.copy(muzzle);
      this.scene.add(flash);
      setTimeout(() => this.scene.remove(flash), 40);
    }
    
    for (let p = 0; p < pellets; p++) {
      const direction = new THREE.Vector3(0, 0, -1);
      
      if (spreadAmount > 0) {
        const spreadRad = spreadAmount * (Math.PI / 180);
        const randX = (Math.random() - 0.5) * spreadRad;
        const randY = (Math.random() - 0.5) * spreadRad;
        const euler = new THREE.Euler(randX, randY, 0, 'YXZ');
        direction.applyEuler(euler);
      }
      
      direction.applyQuaternion(this.camera.quaternion);
      
      const raycaster = new THREE.Raycaster(start, direction);
      
      // Collect ALL hittable meshes (body + head for each entity)
      const targets = [];
      for (const id in this.entities) {
        const g = this.entities[id];
        if (g.userData.body) targets.push(g.userData.body);
        if (g.userData.head) targets.push(g.userData.head);
      }
      
      const intersectsEnt = raycaster.intersectObjects(targets);
      
      // Intersect both wall types
      const mapHits = [];
      if (this.instancedMesh) {
        const h = raycaster.intersectObject(this.instancedMesh);
        if (h.length > 0) mapHits.push(h[0]);
      }
      if (this.halfWallMesh) {
        const h = raycaster.intersectObject(this.halfWallMesh);
        if (h.length > 0) mapHits.push(h[0]);
      }
      
      let hitPoint = start.clone().add(direction.clone().multiplyScalar(50));
      let hitObject = null;
      let hitDistance = Infinity;

      if (intersectsEnt.length > 0) {
        hitObject = intersectsEnt[0];
        hitDistance = hitObject.distance;
      }
      
      for (const mh of mapHits) {
        if (mh.distance < hitDistance) {
          hitObject = mh;
          hitDistance = mh.distance;
        }
      }

      if (hitObject) {
        hitPoint = hitObject.point;
        
        if (hitObject.object === this.instancedMesh || hitObject.object === this.halfWallMesh) {
          if (hitObject.face) {
            this.spawnDecal(hitObject.point, hitObject.face.normal);
          }
        } else {
          const mesh = hitObject.object;
          const group = mesh.parent;
          
          // Headshot = hit the head mesh directly
          const isHeadshot = (mesh === group.userData.head);

          // Hit flash
          const originalColor = mesh.material.color.getHex();
          mesh.material = mesh.material.clone();
          mesh.material.color.setHex(0xffffff);
          setTimeout(() => {
            if (mesh && mesh.material) mesh.material.color.setHex(originalColor);
          }, 80);
          
          const color = group.userData.isBot ? 0xff0033 : 0x00ff66;
          this.spawnParticles(hitObject.point, color);
          
          let targetId = null;
          for (const id in this.entities) {
            if (this.entities[id] === group) { targetId = id; break; }
          }
          if (targetId && onHit) onHit(targetId, isHeadshot, hitObject.distance);
        }
      }

      this.spawnTracer(muzzle, hitPoint);
    }
  }

  spawnTracer(start, end) {
    const points = [start, end];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, this.tracerMat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.06 });
  }

  spawnDecal(position, normal) {
    const mesh = new THREE.Mesh(this.decalGeo, this.decalMat);
    mesh.position.copy(position).add(normal.clone().multiplyScalar(0.01));
    mesh.lookAt(position.clone().add(normal));
    this.scene.add(mesh);
    this.decals.push({ mesh, life: 3.0 });
  }

  spawnParticles(position, colorHex) {
    const mat = colorHex === 0xff0033 ? this.particleMatRed : this.particleMatGreen;
    for (let i = 0; i < this.particleCount; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.copy(position);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 4 + 2,
        (Math.random() - 0.5) * 8
      );
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity, life: 0.5 });
    }
  }

  render(deltaTime, isMoving, shakeOffset, isSprinting, isLobbyMode = false, lobbyTime = 0) {
    // Entity interpolation + walk animation
    for (const id in this.entities) {
      const group = this.entities[id];
      const prevPos = group.position.clone();
      
      group.position.lerp(group.userData.targetPosition, deltaTime * 12);
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, group.userData.targetRotationY, deltaTime * 12);
      
      const moveDist = group.position.distanceTo(prevPos);
      
      // Walk animation
      if (moveDist > 0.001) {
        group.userData.walkCycle += deltaTime * 12;
        const t = group.userData.walkCycle;
        
        // Body sway
        group.userData.body.rotation.z = Math.sin(t) * 0.06;
        
        // Head bob
        group.userData.head.position.y = 1.55 + Math.abs(Math.sin(t)) * 0.05;
        group.userData.visor.position.y = group.userData.head.position.y;
        
        // Arm swing
        group.userData.leftArm.rotation.x = Math.sin(t) * 0.4;
        group.userData.rightArm.rotation.x = -Math.sin(t) * 0.4;
      } else {
        // Idle - smoothly return to default
        const lerpAmt = deltaTime * 8;
        group.userData.body.rotation.z = THREE.MathUtils.lerp(group.userData.body.rotation.z, 0, lerpAmt);
        group.userData.head.position.y = THREE.MathUtils.lerp(group.userData.head.position.y, 1.55, lerpAmt);
        group.userData.visor.position.y = group.userData.head.position.y;
        group.userData.leftArm.rotation.x = THREE.MathUtils.lerp(group.userData.leftArm.rotation.x, 0, lerpAmt);
        group.userData.rightArm.rotation.x = THREE.MathUtils.lerp(group.userData.rightArm.rotation.x, 0, lerpAmt);
      }
      
      if (group.userData.hpBar && !isLobbyMode) {
        group.userData.hpBar.lookAt(this.camera.position);
      } else if (group.userData.hpBar) {
        group.userData.hpBar.visible = false;
      }
    }

    if (isLobbyMode) {
      const MAP_CENTER = (GRID_SIZE * CELL_SIZE) / 2 - OFFSET;
      const radius = 25;
      this.camera.position.x = MAP_CENTER + Math.sin(lobbyTime * 0.15) * radius;
      this.camera.position.z = MAP_CENTER + Math.cos(lobbyTime * 0.15) * radius;
      this.camera.position.y = 10;
      this.camera.lookAt(MAP_CENTER, 2, MAP_CENTER);
      this.weaponGroup.visible = false;
    } else {
      this.weaponGroup.visible = !this.scoped;
      if (this.weaponGroup) {
        if (this.aiming) {
          // Mira ativa: centraliza a arma (mira de ferro / red-dot), sem balanço
          this.weaponGroup.position.x = THREE.MathUtils.lerp(this.weaponGroup.position.x, this.aimTarget.x, deltaTime * 14);
          this.weaponGroup.position.y = THREE.MathUtils.lerp(this.weaponGroup.position.y, this.aimTarget.y, deltaTime * 14);
          this.weaponGroup.rotation.z = THREE.MathUtils.lerp(this.weaponGroup.rotation.z, 0, deltaTime * 14);
        } else if (isMoving) {
          const bobSpeed = isSprinting ? 15 : 10;
          const bobAmount = isSprinting ? 0.04 : 0.02;
          this.bobTime += deltaTime * bobSpeed;

          let targetY = this.weaponBasePos.y + Math.sin(this.bobTime) * bobAmount;
          let targetX = this.weaponBasePos.x + Math.cos(this.bobTime * 0.5) * (bobAmount / 2);

          if (isSprinting) {
            targetY -= 0.1;
            targetX += 0.1;
            this.weaponGroup.rotation.z = THREE.MathUtils.lerp(this.weaponGroup.rotation.z, -0.3, deltaTime * 5);
          } else {
            this.weaponGroup.rotation.z = THREE.MathUtils.lerp(this.weaponGroup.rotation.z, 0, deltaTime * 10);
          }

          this.weaponGroup.position.y = THREE.MathUtils.lerp(this.weaponGroup.position.y, targetY, deltaTime * 10);
          this.weaponGroup.position.x = THREE.MathUtils.lerp(this.weaponGroup.position.x, targetX, deltaTime * 10);
        } else {
          this.weaponGroup.position.y = THREE.MathUtils.lerp(this.weaponGroup.position.y, this.weaponBasePos.y, deltaTime * 10);
          this.weaponGroup.position.x = THREE.MathUtils.lerp(this.weaponGroup.position.x, this.weaponBasePos.x, deltaTime * 10);
          this.weaponGroup.rotation.z = THREE.MathUtils.lerp(this.weaponGroup.rotation.z, 0, deltaTime * 10);
        }

        this.recoil = THREE.MathUtils.lerp(this.recoil, 0, deltaTime * 15);
        const baseZ = this.aiming ? this.aimTarget.z : this.weaponBasePos.z;
        this.weaponGroup.position.z = baseZ + this.recoil;
        this.weaponGroup.rotation.x = this.recoil * 0.5;
      }
      
      this.camera.position.x += shakeOffset.x;
      this.camera.position.y += shakeOffset.y;
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= deltaTime;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      } else {
        p.velocity.y -= 20 * deltaTime;
        p.mesh.position.x += p.velocity.x * deltaTime;
        p.mesh.position.y += p.velocity.y * deltaTime;
        p.mesh.position.z += p.velocity.z * deltaTime;
      }
    }

    // Update decals
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= deltaTime;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.decals.splice(i, 1);
      }
    }

    // Update tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= deltaTime;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        this.tracers.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
    
    if (!isLobbyMode) {
      this.camera.position.x -= shakeOffset.x;
      this.camera.position.y -= shakeOffset.y;
    }
  }
}
