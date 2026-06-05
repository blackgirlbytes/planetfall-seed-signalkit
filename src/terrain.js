import * as THREE from "three";
import { makeNoise3D, makeFbm } from "./noise.js";

// A walkable island: a displaced plane with a radial falloff so the land rises
// out of a lavender sea and tapers back into it at the edges. Palette matches
// the planet — gold highlands, pale-gold shore, lavender shallows.

// Colors as 0..1 rgb triples (vertex colors are linear-ish; kept soft).
const C_DEEP = [0.27, 0.21, 0.46];    // lavender lowland near water
const C_SHORE = [0.78, 0.66, 0.42];   // pale gold sand
const C_GOLD = [0.86, 0.66, 0.27];    // gold midland
const C_PEAK = [0.96, 0.86, 0.62];    // bright gold / cream highland

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function ramp(t) {
  if (t < 0.18) return mix(C_DEEP, C_SHORE, t / 0.18);
  if (t < 0.5) return mix(C_SHORE, C_GOLD, (t - 0.18) / 0.32);
  return mix(C_GOLD, C_PEAK, Math.min(1, (t - 0.5) / 0.5));
}

/**
 * Build the island terrain.
 *
 * @param {object} opts
 * @param {number} opts.size     world units across (square)
 * @param {number} opts.segments grid resolution
 * @param {number} opts.maxHeight peak elevation in world units
 * @param {number} opts.seed
 * @returns {{ mesh, water, size, maxHeight, heightAt(x,z), radius }}
 */
export function createTerrain({
  size = 200,
  segments = 220,
  maxHeight = 26,
  seed = 1337,
} = {}) {
  const noise = makeNoise3D(seed);
  const fbm = makeFbm(noise, { octaves: 5, lacunarity: 2.1, gain: 0.5 });

  const half = size / 2;
  const seaLevel = 0; // world-space y of the surrounding water plane

  // Raw elevation field in world units for a given world (x,z). Combines fbm
  // detail with a smooth radial island mask (1 at centre → 0 past the radius).
  const islandRadius = half * 0.86;
  function rawHeight(x, z) {
    const d = Math.hypot(x, z) / islandRadius;
    // Smooth falloff: flat-ish plateau in the middle, sinks below sea at edge.
    const mask = THREE.MathUtils.clamp(1 - d * d, 0, 1);
    const n = fbm(x * 0.015, 0, z * 0.015) * 0.5 + 0.5; // 0..1, gentle hills
    const ridges = fbm(x * 0.05 + 100, 5, z * 0.05 - 100) * 0.5 + 0.5; // finer
    const e = (n * 0.7 + ridges * 0.3) * mask;
    // Push the shoreline down so the centre clearly stands above the water.
    return (e - 0.18) * maxHeight;
  }

  // Bake the grid once into a Float32 height table for fast bilinear queries.
  const n = segments + 1;
  const step = size / segments;
  const table = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + i * step;
      const z = -half + j * step;
      table[j * n + i] = rawHeight(x, z);
    }
  }

  // Bilinear height lookup in world space, clamped to the grid.
  function heightAt(x, z) {
    const fx = THREE.MathUtils.clamp((x + half) / step, 0, segments);
    const fz = THREE.MathUtils.clamp((z + half) / step, 0, segments);
    const i0 = Math.floor(fx), j0 = Math.floor(fz);
    const i1 = Math.min(i0 + 1, segments), j1 = Math.min(j0 + 1, segments);
    const tx = fx - i0, tz = fz - j0;
    const h00 = table[j0 * n + i0], h10 = table[j0 * n + i1];
    const h01 = table[j1 * n + i0], h11 = table[j1 * n + i1];
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }

  // ---- mesh ----
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2); // lay flat on the XZ plane, +Y up
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v);
    const z = pos.getZ(v);
    const y = table[
      Math.round((z + half) / step) * n + Math.round((x + half) / step)
    ];
    pos.setY(v, y);
    // Color by height above sea; underwater fringe stays lavender.
    const t = THREE.MathUtils.clamp(y / maxHeight + 0.18, 0, 1);
    const c = ramp(t);
    colors[v * 3] = c[0]; colors[v * 3 + 1] = c[1]; colors[v * 3 + 2] = c[2];
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.15, // a faint sheen so it still feels related to the gold world
      flatShading: false,
    })
  );
  mesh.receiveShadow = true;

  // ---- surrounding water ----
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 4, size * 4),
    new THREE.MeshStandardMaterial({
      color: 0x4a3a86,        // lavender sea, matching the planet's DEEP tone
      transparent: true,
      opacity: 0.86,
      roughness: 0.25,
      metalness: 0.0,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = seaLevel;

  return { mesh, water, size, maxHeight, heightAt, radius: islandRadius, seaLevel };
}
