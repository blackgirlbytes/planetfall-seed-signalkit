import * as THREE from "three";

// Radial-gradient sprite used as the attention halo under each debris item.
function makeHaloTexture(color = "#6fe3ff") {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.25, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const HALO_TEX = { value: null };
function haloTexture() {
  if (!HALO_TEX.value) HALO_TEX.value = makeHaloTexture();
  return HALO_TEX.value;
}

// ---- tiny model builders for each kind of debris ----
function buildHelmet() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.3, roughness: 0.15 })
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.015, 12, 24),
    new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.6, roughness: 0.4 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.03;
  g.add(glass, ring);
  return g;
}

function buildLogbook() {
  const g = new THREE.Group();
  const book = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.02, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.8 })
  );
  const page = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 0.005, 0.095),
    new THREE.MeshStandardMaterial({ color: 0xe8e0cf, roughness: 0.9 })
  );
  page.position.y = 0.012;
  page.rotation.y = 0.3;
  g.add(book, page);
  return g;
}

function buildPanel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.015, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.5, roughness: 0.4 })
  );
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.09, 0.05),
    new THREE.MeshStandardMaterial({
      color: 0x0c2030, emissive: 0x123a4a, emissiveIntensity: 0.8, roughness: 0.3,
    })
  );
  screen.rotation.x = -Math.PI / 2;
  screen.position.y = 0.009;
  g.add(body, screen);
  return g;
}

function buildBeacon() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.035, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0x44484f, metalness: 0.7, roughness: 0.35 })
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffb86b, emissive: 0xffb86b, emissiveIntensity: 1.4,
    })
  );
  light.position.y = 0.07;
  g.add(base, light);
  g.userData.pulse = light;
  return g;
}

// Exported so the island view can reuse the same little props on the ground.
export const BUILDERS = {
  helmet: buildHelmet,
  logbook: buildLogbook,
  panel: buildPanel,
  beacon: buildBeacon,
};

// Catalog of fragments scattered on the planet. Each seeds a future
// context-recovery challenge mapped to a real `entire` command.
export const FRAGMENTS = [
  {
    kind: "helmet",
    lat: 28, lon: -52,
    title: "Abandoned EVA Helmet",
    body: "The visor is fogged from the inside. Its tiny logger still loops one phrase: a recap that started but never finished. Whoever wore this was trying to remember something — fast.",
    hint: "entire recap",
  },
  {
    kind: "logbook",
    lat: -14, lon: 122,
    title: "Torn Logbook Page",
    body: "Coordinates, half-erased by rain. Beneath the smudged ink a single checkpoint marker bleeds through — as if someone wanted a way back to this exact moment.",
    hint: "entire checkpoint",
  },
  {
    kind: "panel",
    lat: 52, lon: 18,
    title: "Cracked Nav Panel",
    body: "Diagnostics flatlined mid-write. The activity trail scrolls up the shattered glass and then simply… stops. The last legible line is a timestamp from the night of the crash.",
    hint: "entire activity",
  },
  {
    kind: "beacon",
    lat: -40, lon: -120,
    title: "Signal Beacon",
    body: "Still pulsing, somehow. It's been broadcasting the same dispatch into the dark for days — a summary of work no one is left to read.",
    hint: "entire dispatch",
  },
];

// Convert lat/lon (degrees) to a point on a sphere of the given radius.
function latLonToVec3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Build debris anchors on the planet surface. Returns the group (to add to the
 * planet so they rotate together) and the list of pickable meshes for
 * raycasting, each carrying its fragment data in userData.
 */
export function createDebris(planetRadius) {
  const group = new THREE.Group();
  const pickables = [];

  for (const frag of FRAGMENTS) {
    const pos = latLonToVec3(frag.lat, frag.lon, planetRadius);
    const anchor = new THREE.Group();
    anchor.position.copy(pos);
    // Orient so local +Y points away from the planet centre.
    anchor.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      pos.clone().normalize()
    );

    const model = BUILDERS[frag.kind]();
    model.position.y = 0.02;

    // Halo to make it findable; doubles as the click target (big & flat).
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({
        map: haloTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.9,
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.005;

    anchor.add(halo, model);
    anchor.userData = { fragment: frag, halo, model, baseScale: 1 };
    group.add(anchor);
    pickables.push(anchor);
  }

  return { group, pickables };
}
