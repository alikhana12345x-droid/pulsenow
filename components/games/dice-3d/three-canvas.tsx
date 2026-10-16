"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const PIPS: Record<number, [number, number][]> = {
  1: [[256, 256]],
  2: [[160, 160], [352, 352]],
  3: [[160, 160], [256, 256], [352, 352]],
  4: [[160, 160], [352, 160], [160, 352], [352, 352]],
  5: [[160, 160], [352, 160], [256, 256], [160, 352], [352, 352]],
  6: [[160, 160], [352, 160], [160, 256], [352, 256], [160, 352], [352, 352]],
};

const MAT_FACES = [2, 5, 3, 4, 1, 6];

interface Props {
  face: number;
  rolling: boolean;
  accent?: string;
}

function faceQuat(face: number): THREE.Quaternion {
  const eulers: Record<number, [number, number, number]> = {
    1: [0, 0, 0],
    6: [0, Math.PI, 0],
    2: [0, -Math.PI / 2, 0],
    5: [0, Math.PI / 2, 0],
    3: [-Math.PI / 2, 0, 0],
    4: [Math.PI / 2, 0, 0],
  };

  const [x, y, z] = eulers[face] ?? eulers[1];

  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
}

function makeFaceTexture(face: number): THREE.CanvasTexture {
  const S = 512;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;

  const ctx = cv.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(cv);

  // Premium warm-white background with subtle radial highlight
  const bg = ctx.createRadialGradient(S * 0.38, S * 0.32, S * 0.04, S / 2, S / 2, S * 0.74);
  bg.addColorStop(0, "#ffffff");
  bg.addColorStop(0.55, "#f9f7ff");
  bg.addColorStop(1, "#eae5f8");

  const r = 80;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(S - r, 0);
  ctx.arcTo(S, 0, S, r, r);
  ctx.lineTo(S, S - r);
  ctx.arcTo(S, S, S - r, S, r);
  ctx.lineTo(r, S);
  ctx.arcTo(0, S, 0, S - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.strokeStyle = "rgba(150, 128, 210, 0.30)";
  ctx.lineWidth = 10;
  ctx.stroke();

  // Pips — face 1 is red (classic casino), all others near-black
  const pipColor = face === 1 ? "#b91c1c" : "#1a1232";
  for (const [x, y] of PIPS[face] ?? []) {
    ctx.shadowColor = "rgba(0,0,0,0.30)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = pipColor;
    ctx.beginPath();
    ctx.arc(x, y, 44, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowColor = "transparent";

  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;

  return texture;
}

export function ThreeCanvas({ face, rolling, accent = "#f29a0b" }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rollingRef = useRef(rolling);
  const targetQuatRef = useRef(faceQuat(face));
  const settleStrengthRef = useRef(1);

  useEffect(() => {
    if (rolling && !rollingRef.current) {
      settleStrengthRef.current = 0;
    }

    rollingRef.current = rolling;
  }, [rolling]);

  useEffect(() => {
    targetQuatRef.current = faceQuat(face);
  }, [face]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      38,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    );

    camera.position.set(0, 2.4, 5.9);
    camera.lookAt(0, 0.45, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.78));

    const key = new THREE.DirectionalLight(0xffffff, 1.55);
    key.position.set(4, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 30;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xbfa8ff, 0.5);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.3);
    rim.position.set(0, 3, -5);
    scene.add(rim);

    const accentColor = new THREE.Color(accent);
    const glow = new THREE.PointLight(accentColor, 1.2, 7);
    glow.position.set(0, -0.15, 1.35);
    scene.add(glow);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.15, 64),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.28,
      })
    );

    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.08;
    scene.add(shadow);

    const textures = MAT_FACES.map(makeFaceTexture);

    const materials = textures.map(
      (texture) =>
        new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.2,
          metalness: 0.04,
        })
    );

    const dice = new THREE.Mesh(
      new THREE.BoxGeometry(1.42, 1.42, 1.42),
      materials
    );

    dice.castShadow = true;
    dice.position.set(0, 0.62, 0);
    dice.quaternion.copy(faceQuat(face));
    scene.add(dice);

    const rollAxis = new THREE.Vector3(0.68, 1, 0.42).normalize();
    const fastRollDelta = new THREE.Quaternion().setFromAxisAngle(
      rollAxis,
      0.26
    );

    let animId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const dt = Math.min(clock.getDelta(), 0.033);

      if (rollingRef.current) {
        dice.quaternion.premultiply(fastRollDelta);
        dice.rotation.x += dt * 9;
        dice.rotation.y += dt * 7;
        dice.rotation.z += dt * 5;

        const t = performance.now() * 0.008;
        dice.position.y = 0.62 + Math.sin(t) * 0.12;
        shadow.scale.setScalar(1 + Math.abs(Math.sin(t)) * 0.1);
      } else {
        settleStrengthRef.current = Math.min(
          settleStrengthRef.current + dt * 2.8,
          1
        );

        const settleT = 0.08 + settleStrengthRef.current * 0.16;

        dice.quaternion.slerp(targetQuatRef.current, settleT);
        dice.position.y += (0.62 - dice.position.y) * 0.12;

        shadow.scale.x += (1 - shadow.scale.x) * 0.08;
        shadow.scale.y += (1 - shadow.scale.y) * 0.08;
        shadow.scale.z += (1 - shadow.scale.z) * 0.08;
      }

      renderer.render(scene, camera);
    };

    animate();

    const observer = new ResizeObserver(() => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    observer.observe(mount);

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();

      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());

      dice.geometry.dispose();
      shadow.geometry.dispose();

      const shadowMaterial = shadow.material;
      if (Array.isArray(shadowMaterial)) {
        shadowMaterial.forEach((material) => material.dispose());
      } else {
        shadowMaterial.dispose();
      }

      renderer.dispose();

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [accent, face]);

  return <div ref={mountRef} className="h-full w-full" />;
}