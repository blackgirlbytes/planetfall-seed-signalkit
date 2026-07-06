import * as THREE from "three";

// Fresnel limb-glow shell rendered on the back faces of a slightly larger
// sphere, additively blended — reads as a thin atmosphere around the planet.
export function makeAtmosphere(radius, {
  color = new THREE.Color(0x6b5fd4),
  power = 3.2,
  intensity = 1.15,
} = {}) {
  const geo = new THREE.SphereGeometry(radius, 96, 96);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: color },
      power: { value: power },
      intensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      uniform vec3 glowColor;
      uniform float power;
      uniform float intensity;
      void main() {
        vec3 viewDir = normalize(-vView);
        float f = pow(1.0 - abs(dot(vNormal, viewDir)), power);
        gl_FragColor = vec4(glowColor, f * intensity);
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}
