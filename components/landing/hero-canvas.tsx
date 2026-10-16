"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function HeroCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    const isMobile = w < 640;

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x090714, 0.036);

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
    camera.position.set(0, 0.3, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x090714);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    // ── Stars ─────────────────────────────────────────────────────────────────
    const starCount = isMobile ? 700 : 1400;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3]     = (Math.random() - 0.5) * 60;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 60;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xd4c8ff, size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0.75 })
    );
    scene.add(stars);

    // ── Lights ────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x1e0b4a, 1.6));

    const centerLight = new THREE.PointLight(0xf29a0b, 4.5, 28);
    centerLight.position.set(0, 1, 5);
    scene.add(centerLight);

    const leftLight = new THREE.PointLight(0x7c3aed, 3.5, 20);
    leftLight.position.set(-7, 3, 4);
    scene.add(leftLight);

    const rightLight = new THREE.PointLight(0x0ea5e9, 2.5, 16);
    rightLight.position.set(7, -2, 4);
    scene.add(rightLight);

    const halo = (color: number, x: number, y: number, z: number, r: number) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 12, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.055, side: THREE.BackSide })
      );
      m.position.set(x, y, z);
      scene.add(m);
    };

    // ── Object spread (tighter on mobile) ────────────────────────────────────
    const spread = isMobile ? 2.0 : 3.4;

    // ── DICE (left) — Dice 3D game ───────────────────────────────────────────
    const diceG = new THREE.Group();
    diceG.position.set(-spread, 0.1, 0);
    scene.add(diceG);

    const boxGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    diceG.add(new THREE.Mesh(
      boxGeo,
      new THREE.MeshStandardMaterial({
        color: 0x7c3aed, emissive: 0x4c1d95, emissiveIntensity: 0.7,
        metalness: 0.15, roughness: 0.55,
      })
    ));
    diceG.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(boxGeo),
      new THREE.LineBasicMaterial({ color: 0xc4b5fd })
    ));
    halo(0x7c3aed, -spread, 0.1, 0, 2.0);

    // ── COIN (center) — Coin Flip game ───────────────────────────────────────
    const coinG = new THREE.Group();
    coinG.position.set(0, -0.4, 0.8);
    scene.add(coinG);

    const coinGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.13, 48);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 0.55,
      metalness: 0.92, roughness: 0.08,
    });
    const coinMesh = new THREE.Mesh(coinGeo, coinMat);
    coinMesh.rotation.x = 0.18;
    coinG.add(coinMesh);

    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.026, 8, 64),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.45,
        transparent: true, opacity: 0.65,
      })
    );
    ringMesh.rotation.x = 0.18;
    coinG.add(ringMesh);
    halo(0xf59e0b, 0, -0.4, 0.8, 2.1);

    // ── SKYRISE ROCKET (right) — Skyrise crash game ──────────────────────────
    const rocketG = new THREE.Group();
    rocketG.position.set(spread, 0.2, 0);
    scene.add(rocketG);

    const rMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.65,
      metalness: 0.35, roughness: 0.3,
    });
    const noseMesh = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.9, 8), rMat);
    noseMesh.position.y = 0.72;
    rocketG.add(noseMesh);

    const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.9, 8), rMat);
    bodyMesh.position.y = -0.04;
    rocketG.add(bodyMesh);

    const exhaustMat = new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.85 });
    const exhaustMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), exhaustMat);
    exhaustMesh.position.y = -0.56;
    exhaustMesh.scale.y = 0.5;
    rocketG.add(exhaustMesh);
    halo(0x38bdf8, spread, 0.2, 0, 2.0);

    // ── Mouse / touch parallax ────────────────────────────────────────────────
    let tx = 0, ty = 0;
    const onMove = (cx: number, cy: number) => {
      tx =  (cx / window.innerWidth  - 0.5) * 1.4;
      ty =  (cy / window.innerHeight - 0.5) * 0.9;
    };
    const onMouse = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => onMove(e.touches[0].clientX, e.touches[0].clientY);
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("touchmove", onTouch, { passive: true });

    // ── Animation ─────────────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();

      stars.rotation.y = t * 0.012;
      stars.rotation.x = t * 0.006;

      diceG.rotation.x = t * 0.44;
      diceG.rotation.y = t * 0.62;
      diceG.position.y = 0.1 + Math.sin(t * 0.75) * 0.22;

      coinMesh.rotation.y = t * 1.5;
      ringMesh.rotation.z = -t * 0.48;
      coinG.position.y = -0.4 + Math.sin(t * 0.9 + 1.2) * 0.18;

      rocketG.position.y = 0.2 + Math.sin(t * 1.15 + 2.4) * 0.24;
      exhaustMesh.scale.setScalar(0.85 + Math.sin(t * 9) * 0.28);
      exhaustMat.opacity = 0.65 + Math.sin(t * 7) * 0.25;

      centerLight.intensity = 4 + Math.sin(t * 1.6) * 0.9;

      camera.position.x += (tx          - camera.position.x) * 0.028;
      camera.position.y += (-ty + 0.3   - camera.position.y) * 0.028;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    tick();

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      const nw = mount.clientWidth;
      const nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" />;
}
