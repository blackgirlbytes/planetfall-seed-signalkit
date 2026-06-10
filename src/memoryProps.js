import * as THREE from "three";

// Shared props for the memory levels: the findable light beam, the ice block a
// commit freezes a memory into, and the floating `Entire-Checkpoint: <id>`
// trailer sprite. Used by Level 1 (islandView) and Level 2 (archiveView).

export function makeBeamTexture() {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "rgba(255,210,122,0)");
  g.addColorStop(1, "rgba(255,210,122,0.9)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Translucent crystal that encases a memory once it's committed.
export function makeIceBlock() {
  const geo = new THREE.IcosahedronGeometry(3.4, 0);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xbfe9ff,
    metalness: 0,
    roughness: 0.06,
    transmission: 0.5,
    thickness: 2.6,
    ior: 1.3,
    transparent: true,
    opacity: 0.62,
    emissive: 0x0a2230,
    emissiveIntensity: 0.35,
    flatShading: true,
  });
  return new THREE.Mesh(geo, mat);
}

// Floating label above a frozen block — the commit trailer Entire stamps on:
//   "Entire-Checkpoint: <12-char hash>" (dim key + bright hash).
export function makeIdSprite(id) {
  const c = document.createElement("canvas");
  c.width = 768; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.font = "bold 28px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(111,227,255,0.9)";
  ctx.shadowBlur = 14;

  const key = "Entire-Checkpoint: ";
  const keyW = ctx.measureText(key).width;
  const idW = ctx.measureText(id).width;
  let x = (c.width - (keyW + idW)) / 2;       // center the whole trailer
  ctx.textAlign = "left";
  ctx.fillStyle = "#8fc4dc";                    // dim trailer key
  ctx.fillText(key, x, 34);
  ctx.fillStyle = "#dff3ff";                    // bright hash
  ctx.fillText(id, x + keyW, 34);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false,
  }));
  spr.scale.set(30, 2.5, 1);                    // 12:1 canvas → keep text height
  return spr;
}

// Entire checkpoints get a 12-character hex id (e.g. 711044b1fe29).
export function genCheckpointId() {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 12; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}
