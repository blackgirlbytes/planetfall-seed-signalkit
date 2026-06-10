import * as THREE from "three";

// Bird's-eye toggle for the island levels (press M): a fixed camera high
// above the island, north up, plus a gold player marker (arrow = facing).
// The status beams stay visible from above, so the map doubles as a status
// board. The level keeps running — the clock doesn't care where you look.

const CAM_HEIGHT = 205;   // high enough that the whole island fits the frame

export function createOverhead(scene, terrain, playerCamera) {
  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 2000
  );
  camera.position.set(0, CAM_HEIGHT, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);

  // You-are-here marker: an arrowhead that points where you're facing,
  // inside a soft ring so it reads at map scale.
  const marker = new THREE.Group();
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(2.0, 5.5, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false })
  );
  arrow.rotation.x = Math.PI / 2;          // cone +Y → +Z (points "forward")
  arrow.position.y = 0.5;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.6, 4.4, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, fog: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  marker.add(arrow, ring);
  marker.visible = false;
  scene.add(marker);

  let on = false;
  const dir = new THREE.Vector3();

  function update(t) {
    if (!on) return;
    const px = playerCamera.position.x;
    const pz = playerCamera.position.z;
    marker.position.set(px, terrain.heightAt(px, pz) + 4, pz);
    playerCamera.getWorldDirection(dir);
    marker.rotation.y = Math.atan2(dir.x, dir.z);
    ring.scale.setScalar(1 + Math.sin(t * 3) * 0.12);  // gentle pulse
  }
  function set(v) {
    on = v;
    marker.visible = v;
  }
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  return { camera, update, set, resize, get on() { return on; } };
}
