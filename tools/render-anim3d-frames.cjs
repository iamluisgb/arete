#!/usr/bin/env node
// Genera las ilustraciones pequeñas (listas y pantalla de la serie) de los
// ejercicios con animación 3D, con el mismo motor y las mismas poses que la
// animación. Cuatro imágenes por ejercicio (arriba, mitad, abajo, mitad): la
// secuencia va y vuelve como una repetición.
//
// Uso: con un servidor en la raíz del repo (python3 -m http.server 8765),
//   PW=/ruta/a/playwright-core CHROME=/usr/bin/google-chrome node tools/render-anim3d-frames.cjs [ids…]
// Escribe assets/anim3d/frames/<id>-<n>.webp.

const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW || 'playwright-core');
const OUT = path.join(__dirname, '..', 'assets', 'anim3d', 'frames');
const BASE = process.env.BASE || 'http://localhost:8765';
const SIZE = 336;                                  // 2× la ilustración grande (168 px)
// Acabado y fondo: bronce sobre transparente se lee en las listas claras; el
// mármol necesita fondo oscuro. OUT_SUFFIX permite generar variantes de prueba.
const FINISH = process.env.FINISH || 'bronze';
const BG = process.env.BG || '';                   // '' = transparente, o un color '#0d0b0a'
const SUFFIX = process.env.OUT_SUFFIX || '';

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => { console.error(e); process.exit(1); });
  await p.goto(`${BASE}/demo-3d/review.html?skip`);
  const only = process.argv.slice(2);
  const out = await p.evaluate(async ([SIZE, only, FINISH, BG]) => {
    const THREE = await import('three');
    const { createFigure } = await import('/js/anim3d/figure.js');
    const { createProps } = await import('/js/anim3d/props.js');
    const { createStage } = await import('/js/anim3d/stage.js');
    const { EXERCISES } = await import('/js/anim3d/exercises.js');
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-9999px;width:${SIZE}px;height:${SIZE}px`;
    document.body.appendChild(host);
    const stage = createStage(host, { controls: false, preserve: true });
    stage.renderer.setPixelRatio(1);
    stage.renderer.setSize(SIZE, SIZE, false);
    if (BG) stage.renderer.setClearColor(new THREE.Color(BG), 1); else stage.renderer.setClearColor(0x000000, 0);
    // Sin la sombra del suelo: a 34-52 px es una mancha alargada que ensucia.
    stage.scene.traverse(o => { if (o.isMesh && o.material?.isShadowMaterial) o.visible = false; });
    const props = createProps(stage.scene);
    const figure = await createFigure(stage.scene, '/assets/anim3d/');
    figure.setFinish(FINISH);
    props.setFinish(FINISH);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    // Tres cuartos para todos (de lado, los discos tapan la figura), salvo los
    // que se leen de frente (sumo).
    const DIRS = { side: [0.55, 0.22, 0.8], front: [1, 0.15, 0.15], three: [0.7, 0.25, 0.72] };
    const S = [0, 0.5, 1, 0.5];
    const res = {}, cut = [];
    for (const ex of EXERCISES) {
      if (only.length && !only.includes(ex.id)) continue;
      // Encuadre: todo lo que se mueve (huesos y carga) a lo largo de la repetición.
      const dir = new THREE.Vector3(...DIRS[ex.cam]).normalize();
      cam.position.copy(dir.clone().multiplyScalar(6).add(new THREE.Vector3(0, 0.9, 0)));
      cam.lookAt(0, 0.9, 0);
      cam.updateMatrixWorld();
      const box = new THREE.Box3();
      const add = v => box.expandByPoint(v.clone().applyMatrix4(cam.matrixWorldInverse));
      for (let i = 0; i <= 10; i++) {
        const pose = ex.pose(i / 10);
        figure.apply(pose);
        figure.model.traverse(o => {
          if (!o.isBone) return;
          const w = o.getWorldPosition(new THREE.Vector3());
          add(w);
          // Dedos y talón: la piel del pie sale unos 6 cm de sus huesos.
          if (/^(ball|foot)/.test(o.name)) for (const d of [[0.06, 0, 0], [-0.06, 0, 0], [0, 0.06, 0], [0, -0.06, 0], [0, 0, 0.06], [0, 0, -0.06]]) add(w.clone().add(new THREE.Vector3(...d)));
        });
        // La cabeza: el último hueso está en la base del cráneo; la coronilla con
        // los rizos queda ~22 cm más allá, en la dirección del cuello.
        const head = figure.bones.Head.getWorldPosition(new THREE.Vector3());
        const up = head.clone().sub(figure.bones.neck_01.getWorldPosition(new THREE.Vector3())).normalize();
        for (const r of [0.24, 0.16]) add(head.clone().addScaledVector(up, r));
        for (const pr of pose.props) {
          if (pr.kind === 'barbell') {
            // Los discos, no solo el centro de la barra.
            for (const z of [-0.76, 0.76]) for (const [dx, dy] of [[0.225, 0], [-0.225, 0], [0, 0.225], [0, -0.225]]) add(pr.pos.clone().add(new THREE.Vector3(dx, dy, z)));
          } else {
            const c = pr.handle.clone().addScaledVector(pr.down, 0.168);
            for (const d of [[0.1, 0, 0], [-0.1, 0, 0], [0, 0.1, 0], [0, -0.1, 0], [0, 0, 0.1], [0, 0, -0.1]]) add(c.clone().add(new THREE.Vector3(...d)));
            add(pr.handle.clone().addScaledVector(pr.down, -0.02));
          }
        }
      }
      box.min.y = Math.min(box.min.y, new THREE.Vector3(0, 0, 0).applyMatrix4(cam.matrixWorldInverse).y);
      const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2;
      // La cabeza y la piel salen del esqueleto unos 12 cm: margen.
      const half = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) / 2 + 0.06;
      Object.assign(cam, { left: cx - half, right: cx + half, top: cy + half, bottom: cy - half });
      cam.updateProjectionMatrix();
      res[ex.id] = S.map(s => {
        const pose = ex.pose(s);
        figure.apply(pose);
        props.place(pose.props);
        props.update(cam);
        stage.renderer.render(stage.scene, cam);
        // Nada puede tocar el borde: si toca, algo está cortado.
        const c2 = document.createElement('canvas'); c2.width = c2.height = SIZE;
        const g = c2.getContext('2d'); g.drawImage(stage.renderer.domElement, 0, 0);
        const px = g.getImageData(0, 0, SIZE, SIZE).data;
        const a = (x, y) => (BG ? Math.abs(px[(y * SIZE + x) * 4] - px[0]) > 8 : px[(y * SIZE + x) * 4 + 3] > 10);
        let edge = 0;
        for (let k = 0; k < SIZE; k++) edge += a(k, 0) + a(k, SIZE - 1) + a(0, k) + a(SIZE - 1, k);
        if (edge) cut.push(`${ex.id} s=${s}: ${edge} px en el borde`);
        return stage.renderer.domElement.toDataURL('image/webp', 0.86);
      });
    }
    return { res, cut };
  }, [SIZE, only, FINISH, BG]);
  if (out.cut.length) { console.error('Imágenes cortadas:\n  ' + out.cut.join('\n  ')); process.exitCode = 1; }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [id, frames] of Object.entries(out.res)) {
    frames.forEach((d, i) => fs.writeFileSync(path.join(OUT, `${id}${SUFFIX}-${i}.webp`), Buffer.from(d.split(',')[1], 'base64')));
    console.log(id, frames.length);
  }
  await b.close();
})();
