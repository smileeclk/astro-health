// Interactive anatomical illustration built with Three.js.
//
// This module is replaceable (for example by a 2D SVG figure). The rest of the app only uses:
//   const body = createBody(container, { onSelect(systemId) {} });
//   body.setStatuses({ cardio: 'green' | 'yellow' | 'red', ... });
//   body.setSelected(systemId | null);
//   body.dispose();
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';

const COLORS = { green: 0x2ee59d, yellow: 0xffc93c, red: 0xff4d5e, none: 0x7f8fb5 };

export function createBody(container, { onSelect, onSkeletonState } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // throws if WebGL is missing
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.0, 3.2);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.9, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 6;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.8;
  controls.saveState();

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4cc9f0, 0.8);
  rim.position.set(-3, 2, -3);
  scene.add(rim);

  /* ----- translucent body shell ----- */
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xaab4bd, transparent: true, opacity: 0.23, roughness: 0.72, depthWrite: false, side: THREE.FrontSide,
  });
  const shell = new THREE.Group();
  scene.add(shell);

  function shellPart(geo, pos, scale = [1, 1, 1], rotZ = 0) {
    const mesh = new THREE.Mesh(geo, shellMat);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    mesh.rotation.z = rotZ;
    mesh.renderOrder = 2;
    shell.add(mesh);
  }
  const sphere = (r) => new THREE.SphereGeometry(r, 20, 14);
  const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14);

  shellPart(sphere(0.105), [0, 1.65, -0.012], [0.92, 1.16, 1.03]);
  shellPart(sphere(0.08), [0, 1.58, 0.025], [0.94, 0.92, 0.99]);
  shellPart(sphere(0.025), [0, 1.595, 0.104], [0.56, 1.12, 1.30]);          // head
  shellPart(capsule(0.05, 0.06), [0, 1.46, 0]);                     // neck
  shellPart(capsule(0.16, 0.28), [0, 1.21, 0], [1.15, 1, 0.72]);    // chest
  shellPart(sphere(0.17), [0, 0.95, 0], [1.08, 0.72, 0.72]);        // pelvis
  for (const s of [-1, 1]) {
    shellPart(sphere(0.061), [s * 0.218, 1.36, 0], [1, 1.25, 1]);
    shellPart(sphere(0.06), [s * 0.25, 1.24, 0], [0.89, 2.8, 1], s * 0.16);
    shellPart(sphere(0.049), [s * 0.292, 0.965, 0], [0.82, 3.1, 0.86], s * 0.16);  // arm
    shellPart(sphere(0.055), [s * 0.32, 0.77, 0], [0.8, 1.2, 0.6]);            // hand
    shellPart(sphere(0.09), [s * 0.095, 0.72, 0], [0.91, 2.64, 1.08]);
    shellPart(sphere(0.052), [s * 0.096, 0.47, 0.013], [1, 1.38, 1]);
    shellPart(sphere(0.063), [s * 0.096, 0.31, -0.015], [0.89, 2.95, 1.05]);
    shellPart(capsule(0.036, 0.09), [s * 0.096, 0.13, 0]);                      // leg
    shellPart(sphere(0.07), [s * 0.095, 0.04, 0.05], [0.9, 0.55, 1.6]);        // foot
  }



  /* ----- organ systems ----- */
  const systems = {};   // id -> { material, meshes[], status }
  const pickables = []; // meshes that react to taps

  function system(id) {
    const material = new THREE.MeshStandardMaterial({ color: COLORS.none, emissive: COLORS.none, emissiveIntensity: 0.5, roughness: 0.45, transparent: true });
    systems[id] = { material, meshes: [], status: 'none', pulse: true };
    return systems[id];
  }
  function add(sys, id, geo, pos, scale = [1, 1, 1]) {
    const mesh = new THREE.Mesh(geo, sys.material);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    mesh.userData = { system: id, base: mesh.scale.clone() };
    scene.add(mesh);
    sys.meshes.push(mesh);
    pickables.push(mesh);
    return mesh;
  }
  // Invisible, larger tap target for small organs (gloved fingers).
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  function hit(id, r, pos) {
    const mesh = new THREE.Mesh(sphere(r), hitMat);
    mesh.position.set(...pos);
    mesh.userData = { system: id };
    scene.add(mesh);
    pickables.push(mesh);
  }
  function bone(sys, a, b, r = 0.016) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 8), sys.material);
    mesh.position.copy(va).add(vb).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    mesh.userData = { system: 'bones' };
    scene.add(mesh);
    sys.meshes.push(mesh);
    pickables.push(mesh);
  }

  const brain = system('brain');
  add(brain, 'brain', sphere(0.085), [0, 1.655, -0.01], [1, 0.82, 1.12]);

  const eyes = system('eyes');
  for (const s of [-1, 1]) add(eyes, 'eyes', sphere(0.02), [s * 0.045, 1.6, 0.108]);
  hit('eyes', 0.06, [0, 1.6, 0.1]);

  const lungs = system('lungs');
  for (const s of [-1, 1]) add(lungs, 'lungs', sphere(0.07), [s * 0.09, 1.3, 0], [0.72, 1.45, 0.85]);

  const cardio = system('cardio');
  add(cardio, 'cardio', sphere(0.048), [0.025, 1.29, 0.055], [1, 1.15, 0.9]);
  hit('cardio', 0.07, [0.025, 1.29, 0.075]);

  const blood = system('blood');
  add(blood, 'blood', sphere(0.07), [-0.05, 1.09, 0.035], [1.35, 0.7, 0.85]); // liver
  add(blood, 'blood', sphere(0.032), [0.1, 1.09, 0.0]);                        // spleen
  add(blood, 'blood', sphere(0.03), [0.03, 1.03, 0.04], [1.8, 0.6, 0.8]);      // pancreas
  hit('blood', 0.11, [0, 1.07, 0.05]);

  const bones = system('bones');
  const muscleMaterial = new THREE.MeshStandardMaterial({
    color: 0x9c514e, roughness: 0.82, transparent: true, opacity: 0.26, depthWrite: false,
  });
  const muscles = new THREE.Group();
  scene.add(muscles);
  function muscle(a, b, width, depth) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(sphere(1), muscleMaterial);
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.scale.set(width, from.distanceTo(to) / 2, depth);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
    mesh.renderOrder = 1;
    mesh.userData.system = 'bones';
    muscles.add(mesh);
    pickables.push(mesh);
  }
  for (const s of [-1, 1]) {
    muscle([s * 0.18, 1.39, 0.047], [s * 0.242, 1.27, 0.052], 0.038, 0.028); // deltoid
    muscle([s * 0.225, 1.33, 0.037], [s * 0.272, 1.115, 0.038], 0.034, 0.035); // biceps
    muscle([s * 0.224, 1.33, -0.035], [s * 0.272, 1.13, -0.025], 0.032, 0.033); // triceps
    muscle([s * 0.266, 1.08, 0.021], [s * 0.315, 0.846, 0.016], 0.029, 0.028); // forearm
    muscle([s * 0.102, 0.91, 0.038], [s * 0.094, 0.48, 0.034], 0.050, 0.046); // quadriceps
    muscle([s * 0.10, 0.86, -0.035], [s * 0.096, 0.49, -0.027], 0.046, 0.043); // hamstring
    muscle([s * 0.097, 0.456, -0.032], [s * 0.096, 0.13, -0.034], 0.042, 0.039); // calf
  }
  bones.pulse = false; // long thin parts: pulse with glow only, not with size
  bone(bones, [0, 0.93, -0.075], [0, 1.5, -0.075], 0.02);               // spine
  bone(bones, [-0.2, 1.4, -0.02], [0.2, 1.4, -0.02], 0.013);            // collarbones
  bone(bones, [-0.13, 0.93, -0.02], [0.13, 0.93, -0.02], 0.028);        // pelvis
  for (const s of [-1, 1]) {
    bone(bones, [s * 0.235, 1.38, 0], [s * 0.275, 1.1, 0]);             // upper arm
    bone(bones, [s * 0.275, 1.08, 0], [s * 0.315, 0.82, 0], 0.013);     // forearm
    bone(bones, [s * 0.095, 0.9, 0], [s * 0.095, 0.5, 0], 0.02);        // thigh
    bone(bones, [s * 0.095, 0.47, 0], [s * 0.095, 0.08, 0], 0.017);     // shin
  }
  for (const y of [1.2, 1.27, 1.34]) {                                   // ribs
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.007, 6, 28), bones.material);
    rib.position.set(0, y, 0);
    rib.rotation.x = Math.PI / 2;
    rib.scale.set(1.08, 0.68, 1);
    rib.userData = { system: 'bones' };
    scene.add(rib);
    bones.meshes.push(rib);
  }

  // Load the atlas lazily and retain the simplified skeleton if it is unavailable.
  let atlas = null;
  let atlasRequested = false;
  let disposed = false;
  async function loadSkeleton() {
    if (atlasRequested) return;
    atlasRequested = true;
    onSkeletonState?.('loading');
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }, { mergeGeometries }] = await Promise.all([
        import('../vendor/GLTFLoader.js'),
        import('../vendor/meshopt_decoder.module.js'),
        import('../vendor/BufferGeometryUtils.js'),
      ]);
      const { scene: model } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
        .loadAsync(new URL('../assets/models/SkeletalSystem100.glb', import.meta.url).href);
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const height = bounds.max.y - bounds.min.y;
      if (disposed || !Number.isFinite(height) || height <= 0) {
        model.traverse((mesh) => { if (mesh.isMesh) mesh.geometry.dispose(); });
        return;
      }
      const scale = 1.76 / height;
      const parts = [];
      const geometries = new Set();
      const materials = new Set();
      model.traverse((mesh) => {
        if (!mesh.isMesh) return;
        geometries.add(mesh.geometry);
        materials.add(mesh.material);
        const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', source.getAttribute('position'));
        // Convert normalized quantized positions to floats before baking world transforms.
        const position = geometry.getAttribute('position');
        const points = new Float32Array(position.count * 3);
        const point = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) {
          point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
          point.toArray(points, i * 3);
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
        source.dispose();
        parts.push(geometry);
      });
      const geometry = parts.length ? mergeGeometries(parts) : null;
      for (const part of parts) part.dispose();
      for (const source of geometries) source.dispose();
      for (const material of materials) material.dispose();
      if (!geometry) throw new Error('Empty skeletal geometry');
      geometry.translate(-center.x, -bounds.min.y, -center.z);
      geometry.scale(scale, scale, scale);
      geometry.computeVertexNormals();
      atlas = new THREE.Mesh(geometry, bones.material);
      atlas.userData.system = 'bones';
      pickables.push(atlas);
      for (const proxy of bones.meshes) {
        proxy.removeFromParent();
        proxy.geometry.dispose();
        const index = pickables.indexOf(proxy);
        if (index !== -1) pickables.splice(index, 1);
      }
      bones.meshes.length = 0;
      atlas.name = 'SkeletalSystem100';
      scene.add(atlas);
      applyLook();
      onSkeletonState?.('ready');
    } catch (error) {
      atlasRequested = false;
      if (!disposed) onSkeletonState?.('fallback');
      console.warn('Skeletal atlas unavailable; using the simplified skeleton.', error);
    }
  }

  /* ----- interaction ----- */
  let selected = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;

  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 8) return; // it was a drag (rotate), not a tap
    const rect = el.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (hits.length && onSelect) onSelect(hits[0].object.userData.system);
  });

  const boneIvory = new THREE.Color(0xd9cfb8);
  function applyLook() {
    muscleMaterial.opacity = selected === 'bones' ? 0.88 : selected ? 0.12 : 0.26;
    for (const [id, sys] of Object.entries(systems)) {
      const c = COLORS[sys.status] || COLORS.none;
      sys.material.color.setHex(c);
      if (id === 'bones' && atlas) sys.material.color.lerp(boneIvory, sys.status === 'green' ? 0.94 : 0.6);
      sys.material.emissive.setHex(c);
      sys.material.opacity = selected && selected !== id ? 0.3 : 1;
    }
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole figure in view on narrow (portrait) screens.
    camera.fov = camera.aspect < 0.7 ? 42 : 32;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  let raf = 0;
  const clock = new THREE.Clock();
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!container.offsetParent) return; // hidden view: do not render
    const time = clock.getElapsedTime();
    const beat = 0.5 + 0.5 * Math.sin(time * 6);
    for (const [id, sys] of Object.entries(systems)) {
      const red = sys.status === 'red';
      const base = id === 'bones' && atlas ? 0.08 : selected === id ? 0.42 : 0.22;
      sys.material.emissiveIntensity = red ? 0.4 + 0.9 * beat : base;
      if (sys.pulse) {
        const k = red ? 1 + 0.09 * beat : 1;
        for (const mesh of sys.meshes) mesh.scale.copy(mesh.userData.base).multiplyScalar(k);
      }
    }
    controls.update();
    renderer.render(scene, camera);
  }
  frame();

  applyLook();

  return {
    resetView() { controls.reset(); },
    setStatuses(map) {
      for (const id of Object.keys(systems)) systems[id].status = (map && map[id]) || 'none';
      applyLook();
    },
    setSelected(id) {
      selected = id || null;
      if (selected === 'bones' && !atlas) void loadSkeleton();
      applyLook();
    },
    dispose() {
      disposed = true;
      atlas?.traverse((mesh) => { if (mesh.isMesh) mesh.geometry.dispose(); });
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      container.innerHTML = '';
    },
  };
}
