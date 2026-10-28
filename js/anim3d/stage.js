// Sala de museo: fondo negro, un foco cálido alto que esculpe el músculo, un
// relleno frío y tenue y una luz de contra. Suelo que solo recibe la sombra.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { rad } from './poses.js';

export function createStage(el, { controls: withControls = true, preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.2;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  let controls = null;
  if (withControls) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 1.2;
    controls.maxDistance = 7;
    controls.maxPolarAngle = rad(88);
  }

  scene.add(new THREE.HemisphereLight(0xfff1e0, 0x1a1512, 0.25));
  const key = new THREE.SpotLight(0xffe6c8, 95, 14, rad(30), 0.55, 2);
  key.position.set(1.4, 4.6, 2.9);
  key.target.position.set(0, 0.9, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 8;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xe6dccf, 0.18);
  fill.position.set(-2.5, 1.2, 2.0);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xfff0dc, 0.9);
  rim.position.set(-1.6, 3.0, -3.4);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 96), new THREE.ShadowMaterial({ opacity: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const CAMS = { side: [0, 1.0, 3.6], front: [3.6, 1.0, 0], three: [2.5, 1.35, 2.6], back: [-2.6, 1.4, 2.4] };
  const BASE_Y = 0.84;
  const target = new THREE.Vector3(0, BASE_Y, 0);
  // `view` encuadra lo que no cabe en el plano normal: en un press la barra
  // bloquea a casi 2,5 m con los discos, y sin subir y alejar la cámara se
  // salía por arriba. { y: altura del centro, dist: factor de distancia }.
  function setCam(name, view = {}) {
    target.y = view.y ?? BASE_Y;
    const [x, y, z] = CAMS[name], k = view.dist ?? 1;
    camera.position.set(x * k, target.y + (y - BASE_Y) * k, z * k);
    camera.lookAt(target);
    if (controls) { controls.target.copy(target); controls.update(); }
  }

  function resize(w = el.clientWidth, h = el.clientHeight) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, camera, controls, setCam, resize };
}
