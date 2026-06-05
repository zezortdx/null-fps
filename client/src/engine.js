import * as THREE from 'three';
import { mapData, GRID_SIZE, CELL_SIZE, OFFSET, jumpPads } from '../../shared/map.js';
import { createWeaponModel } from './weapons.js';

export class Engine {
  constructor(canvasContainer) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050505);
    this.scene.fog = new THREE.FogExp2(0x050505, 0.015); // Fog mais suave para visão mais distante

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
    this.medkitGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    this.medkitMat = new THREE.MeshLambertMaterial({ color: 0x00ff66, emissive: 0x002200 });
    
    // Will hold the current weapon model
    this.weaponGroup = new THREE.Group();
    this.weaponBasePos = new THREE.Vector3(0.3, -0.3, -0.5);
    this.weaponGroup.position.copy(this.weaponBasePos);
    this.camera.add(this.weaponGroup);
    this.scene.add(this.camera);
    
    this.recoil = 0;
    this.bobTime = 0;
    
    // Memory Optimization: Pre-instantiate geometries and materials
    this.particleGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    this.particleMatGreen = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
    this.particleMatRed = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    
    this.decalGeo = new THREE.PlaneGeometry(0.2, 0.2);
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, depthWrite: false });

    // Pre-instantiate entity materials
    this.botMat = new THREE.MeshLambertMaterial({ color: 0x220000 });
    this.playerMat = new THREE.MeshLambertMaterial({ color: 0x002211 });
    this.botEdgeMat = new THREE.LineBasicMaterial({ color: 0xff0033 });
    this.playerEdgeMat = new THREE.LineBasicMaterial({ color: 0x00ff66 });
    
    // Shared tracer material
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.8 });

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  createGridTexture(lineColor, bgColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 512);
    
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, 512, 512);
    
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(256, 0); ctx.lineTo(256, 512);
    ctx.moveTo(0, 256); ctx.lineTo(512, 256);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  setGraphicsQuality(level) {
    if (this.qualityLevel === level) return;
    this.qualityLevel = level;
    console.log(`[Engine] Graphics Quality auto-scaled to: ${level}`);

    if (level === 'POTATO') {
      this.renderer.setPixelRatio(0.25);
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
      this.particleCount = 0;
      this.scene.fog.density = 0.08;
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
      this.scene.fog.density = 0.015;
    } else if (level === 'HIGH') {
      const pr = window.devicePixelRatio > 1 ? 1.0 : window.devicePixelRatio;
      this.renderer.setPixelRatio(pr);
      this.renderer.shadowMap.autoUpdate = true;
      this.particleCount = 20;
      this.scene.fog.density = 0.015;
    }
    
    const showEdges = level !== 'POTATO';
    if (this.gridHelper) this.gridHelper.visible = showEdges;
    if (this.mapEdges) this.mapEdges.visible = showEdges;
    
    Object.values(this.entities).forEach(group => {
      if (group.userData.edges) group.userData.edges.visible = showEdges;
    });

    this.scene.traverse((child) => {
      if (child.isMesh && child.material) child.material.needsUpdate = true;
    });
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

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // Mais luz base
    this.scene.add(ambientLight);
    
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x00ff66, 0.4); // Mais clareza geral
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0x00ff66, 0.6);
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

    // Solid dark floor with Grid Texture
    const floorTex = this.createGridTexture('#005522', '#050505');
    floorTex.repeat.set(MAP_SIZE / 2, MAP_SIZE / 2);
    const floorGeo = new THREE.PlaneGeometry(MAP_SIZE * 2, MAP_SIZE * 2);
    const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, color: 0x888888 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Glowing Neon Grid floor
    const gridHelper = new THREE.GridHelper(MAP_SIZE, MAP_SIZE / 2, 0x00ff66, 0x003311);
    gridHelper.position.y = 0.01;
    gridHelper.material.opacity = 0.4;
    gridHelper.material.transparent = true;
    gridHelper.visible = this.qualityLevel !== 'POTATO';
    this.scene.add(gridHelper);
    this.gridHelper = gridHelper;

    if (mapData && mapData.length > 0) {
      // Jump Pads
      const jpGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 16);
      const jpMat = new THREE.MeshBasicMaterial({ color: 0x00aaff });
      
      for (const jp of jumpPads) {
        const mesh = new THREE.Mesh(jpGeo, jpMat);
        mesh.position.set(jp.x, 0.1, jp.z);
        
        // Halo effect
        const haloGeo = new THREE.RingGeometry(0.9, 1.2, 16);
        const haloMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.rotation.x = -Math.PI / 2;
        halo.position.set(jp.x, 0.11, jp.z);
        
        this.scene.add(mesh);
        this.scene.add(halo);
      }

      const wallTex = this.createGridTexture('#00aaff', '#080808');
      const boxGeo = new THREE.BoxGeometry(1, 1, 1);
      const boxMat = new THREE.MeshLambertMaterial({ map: wallTex, color: 0x666666 });

      this.instancedMesh = new THREE.InstancedMesh(boxGeo, boxMat, mapData.length);
      this.instancedMesh.castShadow = true;
      this.instancedMesh.receiveShadow = true;

      const dummy = new THREE.Object3D();
      const allEdgePositions = []; 

      for (let i = 0; i < mapData.length; i++) {
        const aabb = mapData[i];
        const width = aabb.maxX - aabb.minX;
        const height = aabb.maxY - aabb.minY;
        const depth = aabb.maxZ - aabb.minZ;
        
        const cx = aabb.minX + width / 2;
        const cy = aabb.minY + height / 2;
        const cz = aabb.minZ + depth / 2;
        
        dummy.position.set(cx, cy, cz);
        dummy.scale.set(width, height, depth);
        dummy.updateMatrix();
        
        this.instancedMesh.setMatrixAt(i, dummy.matrix);

        const hw = width / 2, hh = height / 2, hd = depth / 2;
        const corners = [
          [cx - hw, cy - hh, cz - hd], [cx + hw, cy - hh, cz - hd], [cx + hw, cy + hh, cz - hd], [cx - hw, cy + hh, cz - hd],
          [cx - hw, cy - hh, cz + hd], [cx + hw, cy - hh, cz + hd], [cx + hw, cy + hh, cz + hd], [cx - hw, cy + hh, cz + hd],
        ];

        const edgeIndices = [
          [0, 1], [1, 2], [2, 3], [3, 0],
          [4, 5], [5, 6], [6, 7], [7, 4],
          [0, 4], [1, 5], [2, 6], [3, 7],
        ];

        for (const [a, b] of edgeIndices) {
          allEdgePositions.push(
            corners[a][0], corners[a][1], corners[a][2],
            corners[b][0], corners[b][1], corners[b][2]
          );
        }
      }
      
      this.scene.add(this.instancedMesh);

      const edgePositions = new Float32Array(allEdgePositions);
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
      // Increase color intensity to trigger Bloom
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.3 });
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
    sprite.scale.set(1.5, 0.4, 1);
    sprite.position.set(0, 1.5, 0);
    
    sprite.userData = { canvas, ctx, texture };
    return sprite;
  }

  updateHPBar(sprite, hp) {
    if (sprite.userData.lastHp === hp) return; // Cache: Don't redraw if HP hasn't changed
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
        
        const mat = serverEnt.isBot ? this.botMat : this.playerMat;
        
        const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.8, 4, 16);
        const body = new THREE.Mesh(bodyGeo, mat);
        body.position.y = 0.75;
        body.castShadow = true;
        body.receiveShadow = true;
        
        const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
        const head = new THREE.Mesh(headGeo, mat);
        head.position.y = 1.7;
        head.castShadow = true;
        head.receiveShadow = true;
        
        group.add(body);
        group.add(head);
        
        // Remove Edges since we have a better model and textures now
        
        const hpBar = this.createHPBar();
        group.add(hpBar);
        group.userData.hpBar = hpBar;
        
        const weaponId = serverEnt.weapon || (serverEnt.isBot ? 'smg' : 'pistol');
        const weaponModel = createWeaponModel(weaponId);
        weaponModel.position.set(0.3, 1.0, -0.6);
        group.add(weaponModel);
        
        group.position.set(serverEnt.x, serverEnt.y, serverEnt.z);
        group.rotation.y = serverEnt.rY;
        
        group.userData.body = body;
        group.userData.head = head;
        group.userData.weaponModel = weaponModel;
        group.userData.mesh = body; // For raycasting
        group.userData.isBot = serverEnt.isBot;
        group.userData.walkCycle = Math.random() * Math.PI * 2;
        
        group.userData.targetPosition = new THREE.Vector3(serverEnt.x, serverEnt.y, serverEnt.z);
        group.userData.targetRotationY = serverEnt.rY;

        this.scene.add(group);
        this.entities[id] = group;
      } else {
        const group = this.entities[id];
        group.userData.targetPosition.set(serverEnt.x, serverEnt.y, serverEnt.z);
        
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
    if (this.qualityLevel === 'POTATO') {
      if (this.medkitMat.isMeshLambertMaterial) {
        this.medkitMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
      }
    }
    
    const currentIds = medkitsList.map(m => m.id);
    
    for (const id in this.medkits) {
      if (!currentIds.includes(parseInt(id))) {
        this.scene.remove(this.medkits[id]);
        delete this.medkits[id];
      }
    }

    for (const mk of medkitsList) {
      if (!this.medkits[mk.id]) {
        const mesh = new THREE.Mesh(this.medkitGeo, this.medkitMat);
        mesh.position.set(mk.x, 0.5, mk.z);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.medkits[mk.id] = mesh;
      }
    }

    for (const id in this.medkits) {
      this.medkits[id].rotation.y += deltaTime * 2;
      this.medkits[id].rotation.x += deltaTime * 1;
    }
  }

  simulateShoot(spreadAmount, pellets = 1, onHit = null) {
    this.recoil = 0.2;

    const start = new THREE.Vector3(0.3, -0.25, -0.9);
    start.applyMatrix4(this.camera.matrixWorld);
    
    // Muzzle Flash
    if (this.qualityLevel !== 'POTATO') {
      const flash = new THREE.PointLight(0xffffaa, 8, 25);
      flash.position.copy(start);
      this.scene.add(flash);
      setTimeout(() => this.scene.remove(flash), 50);
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
      
      const targets = Object.values(this.entities).map(g => g.userData.mesh);
      const intersectsEnt = raycaster.intersectObjects(targets);
      
      const intersectsMap = raycaster.intersectObject(this.instancedMesh);
      
      let hitPoint = start.clone().add(direction.clone().multiplyScalar(50));
      let hitObject = null;
      let hitDistance = Infinity;

      if (intersectsEnt.length > 0) {
        hitObject = intersectsEnt[0];
        hitDistance = hitObject.distance;
      }
      
      if (intersectsMap.length > 0 && intersectsMap[0].distance < hitDistance) {
        hitObject = intersectsMap[0];
        hitDistance = hitObject.distance;
      }

      if (hitObject) {
        hitPoint = hitObject.point;
        
        if (hitObject.object === this.instancedMesh) {
          if (hitObject.face) {
            this.spawnDecal(hitObject.point, hitObject.face.normal);
          }
        } 
        else {
          const mesh = hitObject.object;
          const group = mesh.parent;
          
          const localY = hitObject.point.y - group.position.y;
          const isHeadshot = localY > 0.5;

          const originalColor = mesh.material.color.getHex();
          mesh.material.color.setHex(0xffffff);
          setTimeout(() => {
            if (mesh && mesh.material) {
              mesh.material.color.setHex(originalColor);
            }
          }, 80);
          
          const color = group.userData.isBot ? 0xff0033 : 0x00ff66;
          this.spawnParticles(hitObject.point, color);
          
          let targetId = null;
          for (const id in this.entities) {
            if (this.entities[id] === group) {
              targetId = id;
              break;
            }
          }
          if (targetId && onHit) {
            onHit(targetId, isHeadshot);
          }
        }
      }

      this.spawnTracer(start, hitPoint);
    }
  }

  spawnTracer(start, end) {
    const points = [start, end];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, this.tracerMat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.05 });
  }

  spawnDecal(position, normal) {
    const mesh = new THREE.Mesh(this.decalGeo, this.decalMat);
    
    mesh.position.copy(position).add(normal.clone().multiplyScalar(0.01));
    mesh.lookAt(position.clone().add(normal));
    
    this.scene.add(mesh);
    this.decals.push({ mesh, life: 2.0 });
  }

  spawnParticles(position, colorHex) {
    const mat = colorHex === 0xff0033 ? this.particleMatRed : this.particleMatGreen;
    
    for (let i = 0; i < this.particleCount; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.copy(position);
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        Math.random() * 5 + 2,
        (Math.random() - 0.5) * 10
      );
      
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity, life: 0.4 });
    }
  }

  render(deltaTime, isMoving, shakeOffset, isSprinting, isLobbyMode = false, lobbyTime = 0) {
    for (const id in this.entities) {
      const group = this.entities[id];
      const dist = group.position.distanceTo(group.userData.targetPosition);
      
      group.position.lerp(group.userData.targetPosition, deltaTime * 15);
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, group.userData.targetRotationY, deltaTime * 15);
      
      // Animation Bobbing
      if (dist > 0.05) {
        group.userData.walkCycle += deltaTime * 15;
        group.userData.body.rotation.z = Math.sin(group.userData.walkCycle) * 0.08;
        group.userData.head.position.y = 1.7 + Math.abs(Math.cos(group.userData.walkCycle)) * 0.08;
        if (group.userData.weaponModel) {
          group.userData.weaponModel.position.y = 1.0 + Math.abs(Math.cos(group.userData.walkCycle)) * 0.08;
        }
      } else {
        group.userData.body.rotation.z = THREE.MathUtils.lerp(group.userData.body.rotation.z, 0, deltaTime * 10);
        group.userData.head.position.y = THREE.MathUtils.lerp(group.userData.head.position.y, 1.7, deltaTime * 10);
        if (group.userData.weaponModel) {
          group.userData.weaponModel.position.y = THREE.MathUtils.lerp(group.userData.weaponModel.position.y, 1.0, deltaTime * 10);
        }
      }
      
      if (group.userData.hpBar && !isLobbyMode) {
        group.userData.hpBar.lookAt(this.camera.position);
      } else if (group.userData.hpBar) {
        group.userData.hpBar.visible = false; // Hide HP bars in lobby
      }
    }

    if (isLobbyMode) {
      // Orbit camera slowly around the map center
      const MAP_CENTER = (GRID_SIZE * CELL_SIZE) / 2 - OFFSET;
      const radius = 25;
      this.camera.position.x = MAP_CENTER + Math.sin(lobbyTime * 0.2) * radius;
      this.camera.position.z = MAP_CENTER + Math.cos(lobbyTime * 0.2) * radius;
      this.camera.position.y = 8;
      this.camera.lookAt(MAP_CENTER, 0, MAP_CENTER);
      this.weaponGroup.visible = false;
    } else {
      this.weaponGroup.visible = true;
      if (this.weaponGroup) {
        if (isMoving) {
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
        this.weaponGroup.position.z = this.weaponBasePos.z + this.recoil;
        this.weaponGroup.rotation.x = this.recoil * 0.5;
      }
      
      // Apply shake
      this.camera.position.x += shakeOffset.x;
      this.camera.position.y += shakeOffset.y;
    }

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

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= deltaTime;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.decals.splice(i, 1);
      }
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= deltaTime;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        this.tracers.splice(i, 1);
      }
    }

    // Render direct to canvas (No composer = Huge FPS boost)
    this.renderer.render(this.scene, this.camera);
    
    // Revert shake offset
    if (!isLobbyMode) {
      this.camera.position.x -= shakeOffset.x;
      this.camera.position.y -= shakeOffset.y;
    }
  }
}
