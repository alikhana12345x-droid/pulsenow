"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// Three.js atmosphere for Dragon Tower: a depth-layered ember field rising from
// a furnace glow, pointer parallax, and event bursts fired at the row where the
// action happened — green for a safe egg, gold for a cash-out, red (plus camera
// shake) for a dragon. Props stream in via refs so the WebGL context never
// tears down between renders (same pattern as the Limbo warp).

export type TowerFxKind = "pick" | "win" | "lose";
export type TowerFx = { kind: TowerFxKind; row: number; seq: number } | null;

type Phase = "idle" | "playing" | "lost" | "cashed";

const AMBIENT_N = 380;
const BURST_N = 240; // rolling pool — each event consumes a chunk of it
const ROWS = 9;

// Approximate world-space y of a tower row (row 0 = bottom). The tower fills
// the stage below the multiplier readout, so bursts line up with their row.
function rowY(row: number) {
    return -4.6 + (row / (ROWS - 1)) * 7.0;
}

const FX_COLORS: Record<TowerFxKind, THREE.Color> = {
    pick: new THREE.Color("#34d399"),
    win: new THREE.Color("#f8b322"),
    lose: new THREE.Color("#ff5d73"),
};

export function TowerScene({ phase, fx }: { phase: Phase; fx: TowerFx }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const phaseRef = useRef<Phase>(phase);
    // Events queue up here and are consumed inside the render loop.
    const queueRef = useRef<{ kind: TowerFxKind; row: number }[]>([]);
    const lastSeqRef = useRef(0);

    useEffect(() => { phaseRef.current = phase; }, [phase]);

    useEffect(() => {
        if (fx && fx.seq !== lastSeqRef.current) {
            lastSeqRef.current = fx.seq;
            queueRef.current.push({ kind: fx.kind, row: fx.row });
        }
    }, [fx]);

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

        // ── Furnace glow along the bottom edge ─────────────────────────────
        const glowCv = document.createElement("canvas");
        glowCv.width = 256; glowCv.height = 128;
        const gctx = glowCv.getContext("2d");
        if (gctx) {
            const grad = gctx.createRadialGradient(128, 128, 8, 128, 128, 128);
            grad.addColorStop(0, "rgba(249,115,22,0.55)");
            grad.addColorStop(0.5, "rgba(190,24,93,0.22)");
            grad.addColorStop(1, "rgba(0,0,0,0)");
            gctx.fillStyle = grad;
            gctx.fillRect(0, 0, 256, 128);
        }
        const glowTex = new THREE.CanvasTexture(glowCv);
        const glowMat = new THREE.MeshBasicMaterial({
            map: glowTex, transparent: true, opacity: 0.45,
            blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const glowGeo = new THREE.PlaneGeometry(26, 10);
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.set(0, -6.6, -3);
        scene.add(glow);

        // ── Ambient embers, spread through depth for parallax ──────────────
        const aPos = new Float32Array(AMBIENT_N * 3);
        const aCol = new Float32Array(AMBIENT_N * 3);
        const aVel = new Float32Array(AMBIENT_N);
        const tmpColor = new THREE.Color();
        for (let i = 0; i < AMBIENT_N; i++) {
            aPos[i * 3] = (Math.random() - 0.5) * 20;
            aPos[i * 3 + 1] = (Math.random() - 0.5) * 15;
            aPos[i * 3 + 2] = -(Math.random() * 7);
            aVel[i] = 0.25 + Math.random() * 0.9;
            tmpColor.setHSL(0.06 + Math.random() * 0.05, 0.95, 0.28 + Math.random() * 0.34);
            aCol[i * 3] = tmpColor.r; aCol[i * 3 + 1] = tmpColor.g; aCol[i * 3 + 2] = tmpColor.b;
        }
        const aGeo = new THREE.BufferGeometry();
        aGeo.setAttribute("position", new THREE.BufferAttribute(aPos, 3));
        aGeo.setAttribute("color", new THREE.BufferAttribute(aCol, 3));
        const aMat = new THREE.PointsMaterial({
            size: 0.1, vertexColors: true, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
        });
        scene.add(new THREE.Points(aGeo, aMat));

        // ── Burst pool (color black = invisible under additive blending) ───
        const bPos = new Float32Array(BURST_N * 3);
        const bCol = new Float32Array(BURST_N * 3);
        const bVel = new Float32Array(BURST_N * 3);
        const bLife = new Float32Array(BURST_N);
        const bBase = new Float32Array(BURST_N * 3);
        for (let i = 0; i < BURST_N; i++) bPos[i * 3 + 1] = -999;
        const bGeo = new THREE.BufferGeometry();
        bGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3));
        bGeo.setAttribute("color", new THREE.BufferAttribute(bCol, 3));
        const bMat = new THREE.PointsMaterial({
            size: 0.16, vertexColors: true, transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
        });
        scene.add(new THREE.Points(bGeo, bMat));

        let bCursor = 0;
        const spawnBurst = (kind: TowerFxKind, row: number) => {
            const c = FX_COLORS[kind];
            const oy = rowY(row);
            const count = kind === "pick" ? 34 : 60;
            const speed = kind === "pick" ? 2.4 : 3.6;
            for (let k = 0; k < count; k++) {
                const i = bCursor++ % BURST_N;
                bPos[i * 3] = (Math.random() - 0.5) * 1.4;
                bPos[i * 3 + 1] = oy + (Math.random() - 0.5) * 0.5;
                bPos[i * 3 + 2] = Math.random() * 1.5;
                bVel[i * 3] = (Math.random() - 0.5) * 2 * speed;
                bVel[i * 3 + 1] = (Math.random() * 0.9 + 0.25) * speed * (Math.random() < 0.25 ? -0.4 : 1);
                bVel[i * 3 + 2] = (Math.random() - 0.5) * speed * 0.6;
                bLife[i] = 1;
                bBase[i * 3] = c.r; bBase[i * 3 + 1] = c.g; bBase[i * 3 + 2] = c.b;
            }
        };

        // ── Resize / parallax ───────────────────────────────────────────────
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

        let px = 0, py = 0; // parallax target, -0.5..0.5
        const onPointer = (e: PointerEvent) => {
            px = e.clientX / window.innerWidth - 0.5;
            py = e.clientY / window.innerHeight - 0.5;
        };
        if (!reduceMotion) window.addEventListener("pointermove", onPointer);

        // ── Render loop ─────────────────────────────────────────────────────
        const aAttr = aGeo.getAttribute("position") as THREE.BufferAttribute;
        const bPosAttr = bGeo.getAttribute("position") as THREE.BufferAttribute;
        const bColAttr = bGeo.getAttribute("color") as THREE.BufferAttribute;
        let shake = 0;
        let camX = 0, camY = 0;
        let t = 0;
        let last = performance.now();
        let rafId = 0;

        const tick = (now: number) => {
            rafId = requestAnimationFrame(tick);
            const dt = Math.min((now - last) / 1000, 0.033);
            last = now;
            t += dt;

            // Consume queued events
            for (;;) {
                const e = queueRef.current.shift();
                if (!e) break;
                spawnBurst(e.kind, e.row);
                if (e.kind === "lose" && !reduceMotion) shake = 1;
            }

            const p = phaseRef.current;
            let speedMul = p === "playing" ? 1.5 : p === "lost" ? 0.35 : p === "cashed" ? 1.1 : 1;
            if (reduceMotion) speedMul *= 0.4;

            // Ambient drift upward, recycle at the top
            for (let i = 0; i < AMBIENT_N; i++) {
                let y = aPos[i * 3 + 1] + aVel[i] * speedMul * dt;
                if (y > 8) { y = -8; aPos[i * 3] = (Math.random() - 0.5) * 20; }
                aPos[i * 3 + 1] = y;
            }
            aAttr.needsUpdate = true;

            // Burst particles: fly out, arc down, fade to black
            for (let i = 0; i < BURST_N; i++) {
                if (bLife[i] <= 0) continue;
                bLife[i] -= dt * 1.15;
                const life = Math.max(0, bLife[i]);
                bPos[i * 3] += bVel[i * 3] * dt;
                bPos[i * 3 + 1] += bVel[i * 3 + 1] * dt;
                bPos[i * 3 + 2] += bVel[i * 3 + 2] * dt;
                bVel[i * 3 + 1] -= 2.2 * dt;
                bCol[i * 3] = bBase[i * 3] * life;
                bCol[i * 3 + 1] = bBase[i * 3 + 1] * life;
                bCol[i * 3 + 2] = bBase[i * 3 + 2] * life;
            }
            bPosAttr.needsUpdate = true;
            bColAttr.needsUpdate = true;

            // Furnace breathing
            glowMat.opacity = 0.4 + 0.08 * Math.sin(t * 1.7);

            // Camera: eased parallax + decaying shake
            shake = Math.max(0, shake - dt * 2.2);
            camX += (px * 0.8 - camX) * Math.min(1, dt * 3);
            camY += (-py * 0.5 - camY) * Math.min(1, dt * 3);
            camera.position.x = camX + (Math.random() - 0.5) * 0.35 * shake;
            camera.position.y = camY + (Math.random() - 0.5) * 0.3 * shake;
            camera.lookAt(0, 0, 0);

            renderer.render(scene, camera);
        };
        rafId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(rafId);
            ro.disconnect();
            if (!reduceMotion) window.removeEventListener("pointermove", onPointer);
            aGeo.dispose(); aMat.dispose();
            bGeo.dispose(); bMat.dispose();
            glowGeo.dispose(); glowMat.dispose(); glowTex.dispose();
            renderer.dispose();
        };
    }, []);

    return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
