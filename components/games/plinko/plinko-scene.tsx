"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// Three.js backdrop for Plinko: slow "gravity rain" of glittering motes falling
// through drifting violet nebula clouds — the whole scene is about downward
// pull, echoing the game. Pointer parallax adds depth; the rain intensifies
// while a ball is dropping. Props stream via refs so the WebGL context never
// restarts (same pattern as the Limbo warp / Dragon Tower scenes).

const MOTES_N = 420;

// Soft round sprite for the motes — without a map, THREE points render as hard
// squares that read as visual noise against the board's pegs.
function makeDotTexture() {
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64;
    const ctx = cv.getContext("2d");
    if (ctx) {
        const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.4, "rgba(255,255,255,0.5)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(cv);
}

function makeNebulaTexture(rgb: string) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 256;
    const ctx = cv.getContext("2d");
    if (ctx) {
        const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
        g.addColorStop(0, `rgba(${rgb},0.55)`);
        g.addColorStop(0.55, `rgba(${rgb},0.18)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
    }
    return new THREE.CanvasTexture(cv);
}

export function PlinkoScene({ active }: { active: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const activeRef = useRef(active);
    useEffect(() => { activeRef.current = active; }, [active]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const reduceMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
        camera.position.set(0, 0, 10);

        // ── Nebula clouds (two soft planes drifting at different depths) ────
        const texA = makeNebulaTexture("139,92,246");
        const texB = makeNebulaTexture("56,120,220");
        const cloudMatA = new THREE.MeshBasicMaterial({ map: texA, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
        const cloudMatB = new THREE.MeshBasicMaterial({ map: texB, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
        const cloudGeoA = new THREE.PlaneGeometry(26, 16);
        const cloudGeoB = new THREE.PlaneGeometry(18, 11);
        const cloudA = new THREE.Mesh(cloudGeoA, cloudMatA);
        const cloudB = new THREE.Mesh(cloudGeoB, cloudMatB);
        cloudA.position.set(-2, 1.5, -6);
        cloudB.position.set(3, -2, -4);
        scene.add(cloudA, cloudB);

        // ── Falling motes with depth ─────────────────────────────────────────
        const pos = new Float32Array(MOTES_N * 3);
        const col = new Float32Array(MOTES_N * 3);
        const baseX = new Float32Array(MOTES_N);
        const vel = new Float32Array(MOTES_N);
        const phase = new Float32Array(MOTES_N);
        const tmp = new THREE.Color();
        for (let i = 0; i < MOTES_N; i++) {
            baseX[i] = (Math.random() - 0.5) * 22;
            pos[i * 3] = baseX[i];
            pos[i * 3 + 1] = (Math.random() - 0.5) * 16;
            pos[i * 3 + 2] = -(Math.random() * 7);
            vel[i] = 0.25 + Math.random() * 0.65;
            phase[i] = Math.random() * Math.PI * 2;
            const roll = Math.random();
            if (roll < 0.12) tmp.set("#f8b322");            // gold flecks
            else if (roll < 0.34) tmp.set("#dbe6ff");       // ice white
            else tmp.setHSL(0.72, 0.65, 0.55 + Math.random() * 0.2); // violet
            col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        const dotTex = makeDotTexture();
        const mat = new THREE.PointsMaterial({
            size: 0.13, map: dotTex, vertexColors: true, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
        });
        scene.add(new THREE.Points(geo, mat));
        const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;

        // ── Resize / parallax ────────────────────────────────────────────────
        const resize = () => {
            const w = canvas.clientWidth || 1;
            const h = canvas.clientHeight || 1;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);

        let px = 0, py = 0;
        const onPointer = (e: PointerEvent) => {
            px = e.clientX / window.innerWidth - 0.5;
            py = e.clientY / window.innerHeight - 0.5;
        };
        if (!reduceMotion) window.addEventListener("pointermove", onPointer);

        let speed = 1;
        let camX = 0, camY = 0;
        let t = 0;
        let last = performance.now();
        let rafId = 0;

        const tick = (now: number) => {
            rafId = requestAnimationFrame(tick);
            const dt = Math.min((now - last) / 1000, 0.033);
            last = now;
            t += dt;

            let target = activeRef.current ? 2.4 : 1;
            if (reduceMotion) target = 0.5;
            speed += (target - speed) * Math.min(1, dt * 2.5);

            for (let i = 0; i < MOTES_N; i++) {
                let y = pos[i * 3 + 1] - vel[i] * speed * dt;
                if (y < -8.5) { y = 8.5; baseX[i] = (Math.random() - 0.5) * 22; }
                pos[i * 3 + 1] = y;
                pos[i * 3] = baseX[i] + Math.sin(t * 0.6 + phase[i]) * 0.35;
            }
            posAttr.needsUpdate = true;

            // Nebula drift
            cloudA.position.x = -2 + Math.sin(t * 0.05) * 1.4;
            cloudA.rotation.z = t * 0.008;
            cloudB.position.x = 3 + Math.sin(t * 0.04 + 2) * 1.1;
            cloudB.rotation.z = -t * 0.006;

            camX += (px * 0.8 - camX) * Math.min(1, dt * 3);
            camY += (-py * 0.5 - camY) * Math.min(1, dt * 3);
            camera.position.x = camX;
            camera.position.y = camY;
            camera.lookAt(0, 0, 0);

            renderer.render(scene, camera);
        };
        rafId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(rafId);
            ro.disconnect();
            if (!reduceMotion) window.removeEventListener("pointermove", onPointer);
            geo.dispose(); mat.dispose(); dotTex.dispose();
            cloudGeoA.dispose(); cloudGeoB.dispose();
            cloudMatA.dispose(); cloudMatB.dispose();
            texA.dispose(); texB.dispose();
            renderer.dispose();
        };
    }, []);

    return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
