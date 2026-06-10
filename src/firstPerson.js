import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

// First-person walker: PointerLockControls for mouse-look + keyboard movement
// that hugs the terrain. Click the canvas to look around; Escape releases the mouse.

export function createFirstPerson(camera, domElement, {
  heightAt,
  radius = 80,        // keep the walker on the island, not out at sea
  eyeHeight = 2.4,
  speed = 22,         // world units / second
} = {}) {
  const controls = new PointerLockControls(camera, domElement);

  const keys = { f: false, b: false, l: false, r: false };
  function onKey(down) {
    return (e) => {
      switch (e.code) {
        case "KeyW": case "ArrowUp": keys.f = down; break;
        case "KeyS": case "ArrowDown": keys.b = down; break;
        case "KeyA": case "ArrowLeft": keys.l = down; break;
        case "KeyD": case "ArrowRight": keys.r = down; break;
        default: return;
      }
      // Don't let arrow keys scroll the page while walking.
      if (down) e.preventDefault();
    };
  }
  const onKeyDown = onKey(true);
  const onKeyUp = onKey(false);

  // Place the walker on the ground at a given (x, z).
  function groundAt(x, z) {
    camera.position.set(x, heightAt(x, z) + eyeHeight, z);
  }

  // The bird's-eye map lets you keep walking without pointer lock.
  let alwaysMove = false;

  function update(dt) {
    if (controls.isLocked || alwaysMove) {
      const d = speed * dt;
      // Forward/back and strafe are horizontal; height is re-applied below.
      if (keys.f) controls.moveForward(d);
      if (keys.b) controls.moveForward(-d);
      if (keys.r) controls.moveRight(d);
      if (keys.l) controls.moveRight(-d);

      // Clamp to the island so you can't walk off into the sea.
      const p = camera.position;
      const dist = Math.hypot(p.x, p.z);
      if (dist > radius) {
        const s = radius / dist;
        p.x *= s; p.z *= s;
      }
    }
    // Always glue the eye to the terrain (even while standing still after a
    // teleport/reset), so the ground never clips through the camera.
    camera.position.y = heightAt(camera.position.x, camera.position.z) + eyeHeight;
  }

  function attach() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }
  function detach() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    keys.f = keys.b = keys.l = keys.r = false;
  }

  return {
    controls,
    update,
    groundAt,
    attach,
    detach,
    lock: () => controls.lock(),
    unlock: () => controls.unlock(),
    get isLocked() { return controls.isLocked; },
    setAlwaysMove(v) { alwaysMove = v; },
  };
}
