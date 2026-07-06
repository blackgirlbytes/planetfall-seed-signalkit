import * as THREE from "three";

// Procedural radial texture for the ring, matching the brand-kit splash: one
// faint translucent purple band with a single thin brighter line — quiet and
// flat, not a busy Cassini stack.
function makeRingTexture() {
  const w = 1024, h = 2;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  const d = img.data;

  const FILL = [107, 95, 212];    // brand purple (#6B5FD4), soft fill
  const LINE = [139, 127, 232];   // purple-bright (#8B7FE8), thin edge line

  for (let x = 0; x < w; x++) {
    const u = x / w; // 0 inner .. 1 outer

    // Soft fill that eases in and out across the band.
    const fill = 0.14 * Math.sin(Math.PI * Math.min(1, Math.max(0, u))) ** 0.8;

    // One thin crisp line near the outer edge (the mockup's ellipse stroke).
    const line = 0.4 * Math.exp(-((u - 0.82) ** 2) / (2 * 0.008 ** 2));

    const a = Math.min(1, fill + line);
    const k = line / (fill + line + 1e-6); // blend toward LINE where the line is
    const col = [
      FILL[0] * (1 - k) + LINE[0] * k,
      FILL[1] * (1 - k) + LINE[1] * k,
      FILL[2] * (1 - k) + LINE[2] * k,
    ];

    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
      d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Flat Saturn-style ring. Returns a mesh lying in the planet's equatorial
 * plane — add it to the planetGroup so it shares the axial tilt.
 */
export function makeRing(planetRadius, {
  inner = planetRadius * 1.35,
  outer = planetRadius * 1.95,
} = {}) {
  const geo = new THREE.RingGeometry(inner, outer, 256, 1);

  // Remap UVs so the texture runs radially (u = normalized radius), letting the
  // 1D band texture paint concentric bands instead of RingGeometry's default.
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = v.length();
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  uv.needsUpdate = true;

  const mat = new THREE.MeshBasicMaterial({
    map: makeRingTexture(),
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    opacity: 0.92,
  });

  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2; // lie flat in the equatorial plane
  return ring;
}
