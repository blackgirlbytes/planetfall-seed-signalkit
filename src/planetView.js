import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { generatePlanetTextures, createElevationSampler } from "./planet.js";
import { makeAtmosphere } from "./atmosphere.js";
import { makeRing } from "./ring.js";

const PLANET_RADIUS = 2;
const PLANET_SEED = 42;
const ISLAND_ANGLE = 0.32;      // angular radius of the landing region (radians)

// Bird's-eye view: orbit the planet and click the pinned island to land on it.
export function createPlanetView(renderer, { onIslandClick } = {}) {
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07050f); // soft deep-violet void

  // Image-based lighting so the gold islands have something to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(
    45, window.innerWidth / window.innerHeight, 0.1, 1000
  );
  camera.position.set(0, 1.4, 6.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 3.0;
  controls.maxDistance = 9.0;
  controls.rotateSpeed = 0.5;
  controls.autoRotate = false;

  // ---------- lighting ----------
  const sun = new THREE.DirectionalLight(0xfff4e8, 1.8);
  sun.position.set(5, 2.5, 4);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x6a5a92, 0.25));
  const rim = new THREE.DirectionalLight(0x8a7ab8, 0.6);
  rim.position.set(-5, -1, -4);
  scene.add(rim);

  // ---------- starfield ----------
  scene.add(makeStars());

  // ---------- planet ----------
  const planetGroup = new THREE.Group();
  scene.add(planetGroup);
  planetGroup.rotation.z = 0.42; // Saturn-like axial tilt so the ring reads

  const { colorMap, bumpMap, roughnessMap, metalnessMap, cloudMap } =
    generatePlanetTextures({ seed: PLANET_SEED });

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS, 128, 128),
    new THREE.MeshStandardMaterial({
      map: colorMap,
      bumpMap,
      bumpScale: 0.015,
      roughnessMap,
      roughness: 1.0,
      metalnessMap,
      metalness: 1.0,
      envMapIntensity: 0.3,
    })
  );
  planetGroup.add(planet);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS * 1.012, 96, 96),
    new THREE.MeshStandardMaterial({
      map: cloudMap, transparent: true, depthWrite: false,
      color: 0xf2ecff, opacity: 0.4, roughness: 1.0,
    })
  );
  planetGroup.add(clouds);

  planetGroup.add(makeAtmosphere(PLANET_RADIUS * 1.09, {
    color: new THREE.Color(0xc9a6ff), power: 2.2, intensity: 0.9,
  }));

  planetGroup.add(makeRing(PLANET_RADIUS));

  // ---------- the landable island ----------
  // Find a guaranteed patch of gold land, then anchor a marker on the texel
  // that paints it (geometry UV convention) so the pin sits on visible land.
  const sampler = createElevationSampler({ seed: PLANET_SEED });
  const spot = sampler.findLandSpots({ latLimit: 55, step: 3 })[0]
    || { lat: 20, lon: 40 };
  const islandLocalPos = latLonToSurface(spot.lat, spot.lon, PLANET_RADIUS);
  const islandLocalDir = islandLocalPos.clone().normalize();

  // An invisible anchor on the surface we can read a world position from, and
  // a thin outline ring (NOT a glow) that fades in only on hover.
  const anchor = new THREE.Object3D();
  anchor.position.copy(islandLocalPos);
  anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), islandLocalDir);
  planet.add(anchor); // rides the planet so it tracks rotation

  const ringRadius = PLANET_RADIUS * Math.sin(ISLAND_ANGLE);
  const ringDepth = PLANET_RADIUS * (1 - Math.cos(ISLAND_ANGLE));
  const outline = new THREE.Mesh(
    new THREE.RingGeometry(ringRadius * 0.94, ringRadius, 64),
    new THREE.MeshBasicMaterial({
      color: 0xfff4e8, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthTest: false, depthWrite: false,
    })
  );
  outline.rotation.x = -Math.PI / 2;       // lie flat on the surface
  outline.position.y = -ringDepth;          // drop to the sphere rim
  outline.renderOrder = 5;
  anchor.add(outline);

  // ---------- HTML pin ----------
  const pin = document.getElementById("island-pin");
  const pinClick = () => { if (active) onIslandClick?.(); };
  const pinEnter = () => { hoverPin = true; };
  const pinLeave = () => { hoverPin = false; };

  // ---------- interaction (only while this view is active) ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const tmpWorld = new THREE.Vector3();
  const tmpLocal = new THREE.Vector3();
  let hoverRegion = false; // pointer is over the island on the globe
  let hoverPin = false;    // pointer is over the HTML pin
  let islandFaces = false; // island is on the near side, facing camera
  let pointerDownAt = null;
  let active = false;

  // Is a screen point over the island region of the globe?
  function overIsland(event) {
    if (!islandFaces) return false;
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(planet, false)[0];
    if (!hit) return false;
    // Compare the hit direction (in planet-local space) to the island centre.
    tmpLocal.copy(hit.point);
    planet.worldToLocal(tmpLocal).normalize();
    return tmpLocal.angleTo(islandLocalDir) < ISLAND_ANGLE;
  }

  function onPointerMove(e) {
    const over = overIsland(e);
    if (over !== hoverRegion) {
      hoverRegion = over;
      canvas.style.cursor = over ? "pointer" : "default";
    }
  }
  function onPointerDown(e) { pointerDownAt = { x: e.clientX, y: e.clientY }; }
  function onPointerUp(e) {
    if (!pointerDownAt) return;
    const moved = Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y);
    pointerDownAt = null;
    if (moved > 6) return; // was an orbit drag
    if (overIsland(e)) onIslandClick?.();
  }

  function update(dt, t) {
    planet.rotation.y += dt * 0.02; // gentle drift
    clouds.rotation.y += dt * 0.03;
    controls.update();

    // Track the island in screen space for the pin, and tell if it faces us.
    anchor.getWorldPosition(tmpWorld);
    const camDir = camera.position.clone().normalize();
    islandFaces = tmpWorld.clone().normalize().dot(camDir) > 0.25;

    const hot = (hoverRegion || hoverPin) && islandFaces;
    outline.material.opacity = THREE.MathUtils.lerp(
      outline.material.opacity, hot ? 0.95 : 0, 0.2
    );

    if (active && pin) {
      if (islandFaces) {
        tmpWorld.project(camera);
        const x = (tmpWorld.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-tmpWorld.y * 0.5 + 0.5) * window.innerHeight;
        pin.style.left = `${x}px`;
        pin.style.top = `${y}px`;
        pin.classList.remove("hidden");
        pin.classList.toggle("is-hot", hoverRegion);
      } else {
        pin.classList.add("hidden");
      }
    }
  }

  // Swing the camera so the island sits front-and-centre. Called on enter, and
  // again when the story ends — the planet drifts the whole time the title +
  // story are up, so without this the island has rotated away by the time you
  // arrive in orbit.
  function reframe() {
    scene.updateMatrixWorld(true);
    anchor.getWorldPosition(tmpWorld);
    const dir = tmpWorld.clone().normalize();
    camera.position.copy(dir).multiplyScalar(6.4);
    camera.position.y += 0.7; // tip the island slightly below centre
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function enter() {
    active = true;
    reframe();

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    pin?.addEventListener("click", pinClick);
    pin?.addEventListener("pointerenter", pinEnter);
    pin?.addEventListener("pointerleave", pinLeave);
  }
  function exit() {
    active = false;
    hoverRegion = hoverPin = false;
    canvas.style.cursor = "default";
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    pin?.removeEventListener("click", pinClick);
    pin?.removeEventListener("pointerenter", pinEnter);
    pin?.removeEventListener("pointerleave", pinLeave);
    pin?.classList.add("hidden");
  }
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  return { scene, camera, update, enter, exit, resize, reframe };
}

// ---- helpers ----

function makeStars() {
  const count = 2400;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = 200 + Math.random() * 200;
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = r * s * Math.cos(a);
    positions[i * 3 + 1] = r * u;
    positions[i * 3 + 2] = r * s * Math.sin(a);
    const warm = Math.random();
    tint.setHSL(0.62 + warm * 0.18, 0.35, 0.62 + Math.random() * 0.3);
    colors[i * 3] = tint.r; colors[i * 3 + 1] = tint.g; colors[i * 3 + 2] = tint.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.1, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.9, depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

// Convert a texture (lat, lon) to the matching point on the SphereGeometry,
// using three's UV → vertex convention so the marker sits on the painted land.
function latLonToSurface(latDeg, lonDeg, radius) {
  const u = (lonDeg + 180) / 360;
  const v = (90 - latDeg) / 180;
  const theta = u * Math.PI * 2;
  const phi = v * Math.PI;
  return new THREE.Vector3(
    -radius * Math.cos(theta) * Math.sin(phi),
    radius * Math.cos(phi),
    radius * Math.sin(theta) * Math.sin(phi)
  );
}
