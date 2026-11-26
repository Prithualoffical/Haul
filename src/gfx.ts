import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { onSettingsChange, settings } from './settings';

/** Low quality (phones, ?lowfx, or the Quality setting) disables shadows and post-processing. */
export const lowfx = new URLSearchParams(location.search).has('lowfx') || settings.quality === 'low';

export const renderer = new THREE.WebGLRenderer({ antialias: lowfx, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowfx ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
if (!lowfx) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020304);
scene.fog = new THREE.FogExp2(0x020304, 0.048);

export const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 80);
camera.rotation.order = 'YXZ';
scene.add(camera);
export const ambient = new THREE.AmbientLight(0x9098b0, 0.4);
scene.add(ambient);

/** Apply a location's fog + fill light. */
export function applyAtmosphere(fog: number, density: number, amb: number, ambI: number): void {
  const f = scene.fog as THREE.FogExp2;
  f.color.setHex(fog);
  f.density = density;
  (scene.background as THREE.Color).setHex(fog);
  ambient.color.setHex(amb);
  ambient.intensity = ambI;
}

/** The flashlight: a shadow-casting spot attached to the camera. */
export const flash = new THREE.SpotLight(0xfff1d6, 55, 0, 0.52, 0.5, 1.4);
flash.position.set(0.15, -0.1, 0);
if (!lowfx) {
  flash.castShadow = true;
  flash.shadow.mapSize.set(1024, 1024);
  flash.shadow.camera.near = 0.3;
  flash.shadow.camera.far = 30;
  flash.shadow.bias = -0.0004;
  flash.shadow.radius = 3;
}
camera.add(flash);
camera.add(flash.target);
flash.target.position.set(0, 0, -1);

/* ---- post processing: bloom + film grain / vignette / chromatic aberration that grows with danger ---- */
const GrainVignette = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, time: { value: 0 }, danger: { value: 0 } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float danger; varying vec2 vUv;
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5; float d = dot(c, c);
      vec2 off = c * d * (0.02 + 0.05 * danger);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col += (rnd(vUv * vec2(1920.0, 1080.0) + time) - 0.5) * 0.07;
      float vig = smoothstep(0.85, 0.25, length(c) * (1.0 + 0.5 * danger));
      col *= mix(0.3, 1.0, vig);
      col.r += danger * 0.1 * (1.0 - vig);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

let composer: EffectComposer | null = null;
let grain: ShaderPass | null = null;
let bloom: UnrealBloomPass | null = null;
if (!lowfx) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.6, 0.85);
  composer.addPass(bloom);
  grain = new ShaderPass(GrainVignette);
  composer.addPass(grain);
  composer.addPass(new OutputPass());
}

onSettingsChange(() => { camera.fov = settings.fov; camera.updateProjectionMatrix(); });

/** Flashlight upgrade level widens the beam and brightens it. */
export function setFlashLevel(level: number): void {
  flash.angle = 0.52 + 0.04 * level;
  flash.userData['base'] = 55 + 12 * level;
}
flash.userData['base'] = 55;

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  composer?.setSize(innerWidth, innerHeight);
});

/* ---- drifting dust, catches the eye in the flashlight beam ---- */
const DUST = 260;
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST * 3; i++) dustPos[i] = (Math.random() - 0.5) * 20;
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  color: 0xbbb8aa, size: 0.035, transparent: true, opacity: 0.35, depthWrite: false,
}));
dust.frustumCulled = false;
scene.add(dust);

export function updateDust(dt: number, t: number): void {
  const p = camera.position;
  const pos = dustGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < DUST; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    y += Math.sin(t * 0.3 + i) * 0.02 * dt * 10;
    x += 0.05 * dt;
    if (x - p.x > 10) x -= 20; else if (x - p.x < -10) x += 20;
    if (z - p.z > 10) z -= 20; else if (z - p.z < -10) z += 20;
    if (y < 0.1) y += 3.3; else if (y > 3.4) y -= 3.3;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
}

export function render(dt: number, t: number, danger: number): void {
  if (composer && grain) {
    grain.uniforms['time'].value = t % 100;
    grain.uniforms['danger'].value = danger;
    if (bloom) bloom.strength = 0.45 + danger * 0.25;
    composer.render(dt);
  } else {
    renderer.render(scene, camera);
  }
}
