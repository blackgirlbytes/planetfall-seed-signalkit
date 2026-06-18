// Shared Three.js disposal helpers.
//
// scene.remove() / group.remove() only DETACH an object from the graph — they do
// NOT free the GPU resources (geometry buffers, material programs, textures) it
// holds. Over a long session those leak: every retried run spawns fresh falling
// props, slates, ice blocks, sparks and generated canvas textures, and the old
// ones pile up in VRAM. disposeObject3D() walks an object and everything under it
// and releases those resources for good.
//
// IMPORTANT: only call this on TRANSIENT objects you are permanently removing.
// Resources reused across many live instances (e.g. a shared CanvasTexture mapped
// onto every signal-spire beam) must NOT be disposed while other objects still
// reference them — pass them in opts.keep so they are skipped.

// Every texture slot a Material may carry. We dispose whichever ones exist.
const TEXTURE_KEYS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "emissiveMap",
  "aoMap",
  "alphaMap",
  "bumpMap",
  "displacementMap",
  "lightMap",
  "envMap",
  "gradientMap",
  "specularMap",
];

function disposeTexture(tex, keep) {
  if (!tex || keep.has(tex)) return;
  if (typeof tex.dispose === "function") tex.dispose();
}

function disposeMaterial(material, keep) {
  if (!material || keep.has(material)) return;
  // Free every texture map this material references (incl. any CanvasTexture).
  for (const key of TEXTURE_KEYS) {
    disposeTexture(material[key], keep);
  }
  if (typeof material.dispose === "function") material.dispose();
}

function disposeMaterials(material, keep) {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const m of material) disposeMaterial(m, keep);
  } else {
    disposeMaterial(material, keep);
  }
}

// Traverse `root` and ALL descendants, disposing geometry, material(s) (handling
// material arrays), and every texture map on each material. Anything present in
// opts.keep (a Set of geometries / materials / textures) is left untouched.
export function disposeObject3D(root, opts = {}) {
  if (!root) return;
  const keep = opts.keep instanceof Set ? opts.keep : new Set();

  root.traverse((obj) => {
    if (obj.geometry && !keep.has(obj.geometry)) {
      if (typeof obj.geometry.dispose === "function") obj.geometry.dispose();
    }
    if (obj.material) {
      disposeMaterials(obj.material, keep);
    }
  });
}
