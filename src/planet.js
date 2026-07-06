import * as THREE from "three";
import { makeNoise3D, makeFbm } from "./noise.js";

// ---- small color helpers (work in 0..255 int rgb) ----
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) {
  return [
    lerp(c1[0], c2[0], t),
    lerp(c1[1], c2[1], t),
    lerp(c1[2], c2[2], t),
  ];
}

// A smooth brand-purple orb, per the brand-kit splash: the whole surface stays
// in the purple family and land reads as a slightly brighter tonal patch, not a
// contrasting continent. The landing island is marked by the pin + teal hover
// outline, so it doesn't need its own loud color.
// [height, rgb].
const LAND_STOPS = [
  [0.00, [83, 74, 183]],   // shore — purple-dim (#534AB7)
  [1.00, [104, 93, 206]],  // gentle highland, barely brighter than the sea
];

function rampLand(t) {
  for (let i = 0; i < LAND_STOPS.length - 1; i++) {
    const [h0, c0] = LAND_STOPS[i];
    const [h1, c1] = LAND_STOPS[i + 1];
    if (t <= h1) {
      const k = (t - h0) / (h1 - h0 || 1);
      return mix(c0, c1, Math.max(0, Math.min(1, k)));
    }
  }
  return LAND_STOPS[LAND_STOPS.length - 1][1];
}

const DEEP = [26, 27, 62];        // deep navy-purple (--color-surface-raised)
const SHALLOW = [83, 74, 183];    // purple-dim shallows (--color-purple-dim)
const SNOW = [240, 238, 248];     // frost (--color-text-primary)

// Shared landform constants so the texture bake and the elevation sampler below
// agree on exactly where land is.
const CONTINENT_FREQ = 1.5; // continent scale (lower = larger, calmer landforms)
const DEFAULT_SEA_LEVEL = 0.64;

/**
 * Build a sampler that returns the planet's surface elevation (0..1) for a
 * lat/lon, using the *same* fbm field and frequency as the baked texture — so a
 * hotspot placed where `isLand` is true lands on visible gold, not the sea.
 */
export function createElevationSampler({ seed = 7 } = {}) {
  const noise = makeNoise3D(seed);
  const fbm = makeFbm(noise, { octaves: 4, lacunarity: 2.0, gain: 0.45 });

  function elevationAt(latDeg, lonDeg) {
    const lat = (latDeg * Math.PI) / 180;
    const lon = (lonDeg * Math.PI) / 180;
    const cosLat = Math.cos(lat);
    const sx = cosLat * Math.cos(lon);
    const sy = Math.sin(lat);
    const sz = cosLat * Math.sin(lon);
    const h = fbm(sx * CONTINENT_FREQ, sy * CONTINENT_FREQ, sz * CONTINENT_FREQ);
    return h * 0.5 + 0.5;
  }

  return {
    elevationAt,
    isLand(latDeg, lonDeg, seaLevel = DEFAULT_SEA_LEVEL) {
      return elevationAt(latDeg, lonDeg) >= seaLevel;
    },
    /**
     * Scan a coarse lat/lon grid (avoiding the icy poles) and return land spots
     * sorted by elevation, highest first — a good pick for an island that reads
     * clearly above the sea.
     */
    findLandSpots({ seaLevel = DEFAULT_SEA_LEVEL, latLimit = 60, step = 4 } = {}) {
      const spots = [];
      for (let lat = -latLimit; lat <= latLimit; lat += step) {
        for (let lon = -180; lon < 180; lon += step) {
          const h = elevationAt(lat, lon);
          if (h >= seaLevel) spots.push({ lat, lon, h });
        }
      }
      spots.sort((a, b) => b.h - a.h);
      return spots;
    },
  };
}

/**
 * Bake equirectangular color / bump / roughness maps for the planet, plus a
 * separate cloud alpha map. Heavy-ish loop (~2M px) — run behind the loader.
 */
export function generatePlanetTextures({
  seed = 7,
  width = 2048,
  height = 1024,
  seaLevel = DEFAULT_SEA_LEVEL, // high → mostly ocean, just a few islands
} = {}) {
  const noise = makeNoise3D(seed);
  // Few octaves + gentle gain → large, smooth landforms (no busy speckle).
  const fbm = makeFbm(noise, { octaves: 4, lacunarity: 2.0, gain: 0.45 });
  // Second low-freq field for soft color variation in the sea.
  const noise2 = makeNoise3D(seed * 131 + 17);
  const fbm2 = makeFbm(noise2, { octaves: 3, lacunarity: 2.2, gain: 0.5 });

  const color = document.createElement("canvas");
  const bump = document.createElement("canvas");
  const rough = document.createElement("canvas");
  const metal = document.createElement("canvas");
  for (const c of [color, bump, rough, metal]) { c.width = width; c.height = height; }

  const cImg = color.getContext("2d").createImageData(width, height);
  const bImg = bump.getContext("2d").createImageData(width, height);
  const rImg = rough.getContext("2d").createImageData(width, height);
  const mImg = metal.getContext("2d").createImageData(width, height);
  const cD = cImg.data, bD = bImg.data, rD = rImg.data, mD = mImg.data;

  // Precompute per-column longitude sin/cos.
  const cosLon = new Float32Array(width);
  const sinLon = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const lon = (x / width) * Math.PI * 2 - Math.PI;
    cosLon[x] = Math.cos(lon);
    sinLon[x] = Math.sin(lon);
  }

  const freq = CONTINENT_FREQ; // continent scale (lower = larger, calmer landforms)

  for (let y = 0; y < height; y++) {
    const lat = Math.PI / 2 - (y / height) * Math.PI;
    const cosLat = Math.cos(lat);
    const sy = Math.sin(lat);
    const latAbs = Math.abs(lat) / (Math.PI / 2); // 0 eq -> 1 pole

    for (let x = 0; x < width; x++) {
      const sx = cosLat * cosLon[x];
      const sz = cosLat * sinLon[x];

      // Smooth base elevation in 0..1 — no sharpening, so coasts stay soft.
      let h = fbm(sx * freq, sy * freq, sz * freq);
      h = h * 0.5 + 0.5;

      // Gentle low-freq variation to keep the sea from looking flat.
      const tide = fbm2(sx * 1.6 + 11, sy * 1.6, sz * 1.6 - 7) * 0.5 + 0.5;

      // Soft polar frost; very subtle so the orb stays a smooth purple.
      const iceEdge = 0.82;
      const ice = Math.max(0, (latAbs - iceEdge) / (1 - iceEdge)) * 0.35;

      let r, g, b, elev, roughness, metalness;

      if (h < seaLevel) {
        // Purple sea, gently depth-graded; low contrast so the orb stays smooth.
        const depth = h / seaLevel; // 0 deep .. 1 coast
        const col = mix(DEEP, SHALLOW, Math.pow(depth, 1.2) * (0.92 + tide * 0.12));
        r = col[0]; g = col[1]; b = col[2];
        elev = 0.45;
        roughness = 0.8; // uniform matte → no shifting specular patches
        metalness = 0.0; // water is not metal
      } else {
        // Land: a soft, slightly brighter purple patch — matte, in-family with
        // the sea so the orb reads as one smooth brand-purple sphere.
        const t = (h - seaLevel) / (1 - seaLevel); // 0 coast .. 1 peak
        let col = rampLand(t);
        const coast = Math.min(1, t / 0.18); // wide fade → soft tonal coastline
        col = mix([SHALLOW[0], SHALLOW[1], SHALLOW[2]], col, coast);
        r = col[0]; g = col[1]; b = col[2];
        elev = 0.5 + t * 0.2;
        roughness = 0.8; // flat and matte, no glints
        metalness = 0.0;
      }

      // Soft frost haze near the poles (matte, non-metallic).
      if (ice > 0) {
        const k = Math.min(1, ice);
        r = lerp(r, SNOW[0], k);
        g = lerp(g, SNOW[1], k);
        b = lerp(b, SNOW[2], k);
        roughness = lerp(roughness, 0.55, k);
        metalness = lerp(metalness, 0.0, k);
      }

      const i = (y * width + x) * 4;
      cD[i] = r; cD[i + 1] = g; cD[i + 2] = b; cD[i + 3] = 255;

      const bv = elev * 255;
      bD[i] = bv; bD[i + 1] = bv; bD[i + 2] = bv; bD[i + 3] = 255;

      const mv = metalness * 255;
      mD[i] = mv; mD[i + 1] = mv; mD[i + 2] = mv; mD[i + 3] = 255;

      const rv = roughness * 255;
      rD[i] = rv; rD[i + 1] = rv; rD[i + 2] = rv; rD[i + 3] = 255;
    }
  }

  color.getContext("2d").putImageData(cImg, 0, 0);
  bump.getContext("2d").putImageData(bImg, 0, 0);
  rough.getContext("2d").putImageData(rImg, 0, 0);
  metal.getContext("2d").putImageData(mImg, 0, 0);

  // ---- clouds: lower-res, wispy alpha from a separate fbm field ----
  const cw = 1024, ch = 512;
  const cloud = document.createElement("canvas");
  cloud.width = cw; cloud.height = ch;
  const clImg = cloud.getContext("2d").createImageData(cw, ch);
  const clD = clImg.data;
  const cn = makeNoise3D(seed * 977 + 3);
  const cfbm = makeFbm(cn, { octaves: 5, lacunarity: 2.4, gain: 0.55 });
  for (let y = 0; y < ch; y++) {
    const lat = Math.PI / 2 - (y / ch) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < cw; x++) {
      const lon = (x / cw) * Math.PI * 2 - Math.PI;
      const px = cl * Math.cos(lon), pz = cl * Math.sin(lon);
      let v = cfbm(px * 2.4, sl * 2.4, pz * 2.4) * 0.5 + 0.5;
      // Threshold into wisps.
      v = Math.max(0, (v - 0.52) / 0.48);
      v = Math.pow(v, 1.3);
      const i = (y * cw + x) * 4;
      clD[i] = 255; clD[i + 1] = 255; clD[i + 2] = 255;
      clD[i + 3] = Math.min(255, v * 255);
    }
  }
  cloud.getContext("2d").putImageData(clImg, 0, 0);

  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  };

  return {
    colorMap: tex(color, true),
    bumpMap: tex(bump, false),
    roughnessMap: tex(rough, false),
    metalnessMap: tex(metal, false),
    cloudMap: tex(cloud, true),
  };
}
