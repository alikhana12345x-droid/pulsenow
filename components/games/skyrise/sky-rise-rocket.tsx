"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type RocketState = {
  x: number;     // SVG pixel X of curve tip
  y: number;     // SVG pixel Y of curve tip
  angle: number; // tangent angle in SVG degrees
  active: boolean;
};

function addMesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  px = 0, py = 0, pz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(px, py, pz);
  parent.add(mesh);
  return mesh;
}

export function SkyRiseRocket({
  stateRef,
}: {
  stateRef: React.RefObject<RocketState>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Renderer ───────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    let W = canvas.clientWidth || 720;
    let H = canvas.clientHeight || 420;
    renderer.setSize(W, H, false);

    const scene = new THREE.Scene();

    // Orthographic camera: 1 THREE unit = 1 CSS pixel, origin at canvas centre
    const camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, 500);
    camera.position.z = 200;

    // ── Lighting ───────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff0e0, 0.9);
    sun.position.set(4, 6, 5);
    scene.add(sun);
    const flameLight = new THREE.PointLight(0xff8820, 5, 150);
    scene.add(flameLight);

    // ── Materials ──────────────────────────────────────────────────────────────
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xebe5d8, emissive: 0x160c02, shininess: 90 });
    const accentMat = new THREE.MeshPhongMaterial({ color: 0xf2a83e, emissive: 0x7a3d00, shininess: 115 });
    const darkMat = new THREE.MeshPhongMaterial({ color: 0x2a2520, emissive: 0x060402, shininess: 55 });
    const glassMat = new THREE.MeshPhongMaterial({
      color: 0x55aaff, emissive: 0x003388,
      transparent: true, opacity: 0.85, shininess: 230,
    });

    // ── Rocket group ───────────────────────────────────────────────────────────
    const rkt = new THREE.Group();
    scene.add(rkt);

    // Fuselage
    addMesh(rkt, new THREE.CylinderGeometry(5.5, 5.5, 22, 16), bodyMat, 0, 0, 0);
    // Nose cone
    addMesh(rkt, new THREE.ConeGeometry(5.5, 15, 16), accentMat, 0, 18.5, 0);
    // Porthole window
    addMesh(rkt, new THREE.SphereGeometry(3, 14, 14), glassMat, 0, 7, 5);
    // Nozzle bell
    addMesh(rkt, new THREE.CylinderGeometry(3.5, 6, 8, 16), darkMat, 0, -15, 0);
    // Three fins
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const fin = addMesh(rkt, new THREE.BoxGeometry(9, 11, 1.5), accentMat);
      fin.position.set(Math.cos(a) * 4, -13, Math.sin(a) * 4);
      fin.rotation.y = a;
    }

    // ── Exhaust particle system ────────────────────────────────────────────────
    const N = 150;
    const ePos = new Float32Array(N * 3);
    const eCol = new Float32Array(N * 3);
    const eAge = new Float32Array(N).fill(1); // 0 = newborn, 1 = dead
    const eVx = new Float32Array(N);
    const eVy = new Float32Array(N);

    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute("position", new THREE.BufferAttribute(ePos, 3));
    eGeo.setAttribute("color", new THREE.BufferAttribute(eCol, 3));
    const eMat = new THREE.PointsMaterial({
      size: 7,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      sizeAttenuation: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const exhaustPoints = new THREE.Points(eGeo, eMat);
    scene.add(exhaustPoints);

    // ── Resize observer ────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      W = canvas.clientWidth || 1;
      H = canvas.clientHeight || 1;
      renderer.setSize(W, H, false);
      camera.left = -W / 2; camera.right = W / 2;
      camera.top = H / 2; camera.bottom = -H / 2;
      camera.updateProjectionMatrix();
    });
    ro.observe(canvas);

    // ── Animation loop ─────────────────────────────────────────────────────────
    let rafId = 0;

    const tick = () => {
      rafId = requestAnimationFrame(tick);

      const s = stateRef.current;
      rkt.visible = !!s?.active;
      exhaustPoints.visible = !!s?.active;

      if (!s?.active) {
        renderer.render(scene, camera);
        return;
      }

      // Screen pixel (top-left origin) → Three.js world (centre origin, Y up)
      const wx = s.x - W / 2;
      const wy = H / 2 - s.y;

      // SVG angle → Three.js rotation around Z
      // SVG angle=0 means going right (+X), Three.js cylinder +Y = up
      const rad = -(s.angle * Math.PI / 180) - Math.PI / 2;

      rkt.position.set(wx, wy, 0);
      rkt.rotation.z = rad;

      // Nozzle world position (local -Y bottom of rocket)
      const nLocal = new THREE.Vector3(0, -23, 0).applyEuler(rkt.rotation);
      const nx = wx + nLocal.x;
      const ny = wy + nLocal.y;

      flameLight.position.set(nx, ny, 25);

      // Exhaust direction: opposite of travel direction
      const exX = -Math.sin(rad);
      const exY = -Math.cos(rad);

      // Exhaust cone scales with rocket angle — tighter near launch, fuller in arc
      const angleFactor = Math.abs(Math.sin(rad - (-Math.PI / 2)));
      const spawnSpread = 2 + angleFactor * 1.5;   // 2–3.5 (was flat 5)
      const spawnSpeed  = 1.8 + Math.random() * 2.4; // 1.8–4.2 (was 2.6–6)

      for (let i = 0; i < N; i++) {
        if (eAge[i] < 1 || Math.random() > 0.22) continue;
        eAge[i] = 0;
        ePos[i * 3]     = nx + (Math.random() - 0.5) * spawnSpread;
        ePos[i * 3 + 1] = ny + (Math.random() - 0.5) * spawnSpread;
        ePos[i * 3 + 2] = (Math.random() - 0.5) * 2;
        const speed  = spawnSpeed + Math.random() * 2;
        const spread = (Math.random() - 0.5) * 1.1;
        eVx[i] = exX * speed + exY * spread;
        eVy[i] = exY * speed - exX * spread;
      }

      // Update existing particles
      for (let i = 0; i < N; i++) {
        if (eAge[i] >= 1) {
          eCol[i * 3] = eCol[i * 3 + 1] = eCol[i * 3 + 2] = 0;
          continue;
        }
        eAge[i] += 0.028;
        ePos[i * 3]     += eVx[i];
        ePos[i * 3 + 1] += eVy[i];
        eVx[i] *= 0.955;
        eVy[i] *= 0.955;

        // Colour gradient: white-yellow → amber → orange-red → gone
        const t = eAge[i];
        if (t < 0.25) {
          eCol[i * 3] = 1; eCol[i * 3 + 1] = 1;           eCol[i * 3 + 2] = 0.55;
        } else if (t < 0.55) {
          const f = (t - 0.25) / 0.3;
          eCol[i * 3] = 1; eCol[i * 3 + 1] = 0.9 - f * 0.85; eCol[i * 3 + 2] = 0;
        } else {
          const f = (t - 0.55) / 0.45;
          eCol[i * 3] = Math.max(0, 1 - f * 0.8);
          eCol[i * 3 + 1] = 0; eCol[i * 3 + 2] = 0;
        }
      }

      eGeo.attributes.position.needsUpdate = true;
      eGeo.attributes.color.needsUpdate = true;

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else (obj.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
    };
  }, [stateRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full pointer-events-none"
    />
  );
}
