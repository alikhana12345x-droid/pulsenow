"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// Three.js backdrop for Keno: real 3D numbered lottery balls tumbling slowly in
// depth (lit spheres — unique to this game), indigo dust drifting through the
// scene, and event bursts: an indigo flick per drawn number, a teal burst when
// a draw hits one of your picks, gold shower on a win, red flare on a loss.
// Balls tumble faster while the draw is running. Props stream via refs so the
// WebGL context never restarts (same pattern as the other game scenes).

export type KenoFxKind = "reveal" | "hit" | "win" | "lose";
export type KenoFx = { kind: KenoFxKind; seq: number } | null;
type Phase = "idle" | "playing" | "done";

const MOTES_N = 220;
const BURST_N = 200;
const BALL_NUMBERS = [7, 23, 4, 38, 15, 32, 9, 18, 27, 36, 11, 40];
const BALL_COLORS = ["#6366f1", "#3b82f6", "#8b5cf6", "#6366f1", "#f8b322", "#3b82f6", "#8b5cf6", "#6366f1", "#5eead4", "#3b82f6", "#f8b322", "#8b5cf6"];

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

// Lottery-ball texture: coloured shell with a white number patch on the front.
function makeBallTexture(num: number, base: string) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 128;
    const ctx = cv.getContext("2d");
    if (ctx) {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, 256, 128);
        ctx.fillStyle = "#f6f7fb";
        ctx.beginPath();
        ctx.ellipse(128, 64, 36, 32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1c2140";
        ctx.font = "900 38px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(num), 128, 66);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

const FX_COLORS: Record<KenoFxKind, THREE.Color> = {
    reveal: new THREE.Color("#8ea2ff"),
    hit: new THREE.Color("#5eead4"),
    win: new THREE.Color("#f8b322"),
    lose: new THREE.Color("#ff5d73"),
};

export function KenoScene({ phase, fx }: { phase: Phase; fx: KenoFx }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const phaseRef = useRef<Phase>(phase);
    const queueRef = useRef<KenoFxKind[]>([]);
    const lastSeqRef = useRef(0);

    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => {
        if (fx && fx.seq !== lastSeqRef.current) {
            lastSeqRef.current = fx.seq;
            queueRef.current.push(fx.kind);
        }
    }, [fx]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const reduceMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
        camera.position.set(0, 0, 10);

        scene.add(new THREE.AmbientLight(0xffffff, 0.75));
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(4, 6, 6);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x8ea2ff, 0.5);
        fill.position.set(-5, -2, 3);
        scene.add(fill);

        // ── Tumbling numbered lottery balls ─────────────────────────────────
        const ballGeo = new THREE.SphereGeometry(1, 28, 18);
        const ballTextures: THREE.CanvasTexture[] = [];
        const ballMats: THREE.MeshStandardMaterial[] = [];
        const balls: { mesh: THREE.Mesh; spinX: number; spinY: number; bob: number; baseY: number; drift: number }[] = [];
        for (let i = 0; i < BALL_NUMBERS.length; i++) {
            const tex = makeBallTexture(BALL_NUMBERS[i], BALL_COLORS[i]);
            ballTextures.push(tex);
            // Fully opaque + slight emissive lift: translucent balls read as
            // blurry ghosts through the semi-transparent grid tiles.
            const mat = new THREE.MeshStandardMaterial({
                map: tex, roughness: 0.3, metalness: 0.05,
                emissive: new THREE.Color(BALL_COLORS[i]), emissiveIntensity: 0.22,
            });
            ballMats.push(mat);
            const mesh = new THREE.Mesh(ballGeo, mat);
            const r = 0.5 + (i % 4) * 0.16;
            mesh.scale.setScalar(r);
            // Keep balls on the stage flanks, clear of the centred number grid.
            const flank = i % 2 === 0 ? -1 : 1;
            mesh.position.set(
                flank * (5.6 + Math.random() * 3.6),
                (Math.random() - 0.5) * 9,
                -2 - Math.random() * 3.5,
            );
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
            scene.add(mesh);
            balls.push({
                mesh,
                spinX: (Math.random() - 0.5) * 0.5,
                spinY: (Math.random() - 0.5) * 0.7,
                bob: Math.random() * Math.PI * 2,
                baseY: mesh.position.y,
                drift: (Math.random() - 0.5) * 0.25,
            });
        }

        // ── Indigo dust ──────────────────────────────────────────────────────
        const dotTex = makeDotTexture();
        const pos = new Float32Array(MOTES_N * 3);
        const col = new Float32Array(MOTES_N * 3);
        const vel = new Float32Array(MOTES_N);
        const sway = new Float32Array(MOTES_N);
        const tmp = new THREE.Color();
        for (let i = 0; i < MOTES_N; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 20;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
            pos[i * 3 + 2] = -(Math.random() * 6);
            vel[i] = 0.1 + Math.random() * 0.28;
            sway[i] = Math.random() * Math.PI * 2;
            const roll = Math.random();
            if (roll < 0.55) tmp.set("#8ea2ff");
            else if (roll < 0.8) tmp.set("#dbe6ff");
            else tmp.set("#f8b322");
            col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
        }
        const moteGeo = new THREE.BufferGeometry();
        moteGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        moteGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        const moteMat = new THREE.PointsMaterial({
            size: 0.1, map: dotTex, vertexColors: true, transparent: true, opacity: 0.45,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
        });
        scene.add(new THREE.Points(moteGeo, moteMat));
        const motePosAttr = moteGeo.getAttribute("position") as THREE.BufferAttribute;

        // ── Burst pool (black = invisible under additive blending) ──────────
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
            size: 0.16, map: dotTex, vertexColors: true, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
        });
        scene.add(new THREE.Points(bGeo, bMat));
        const bPosAttr = bGeo.getAttribute("position") as THREE.BufferAttribute;
        const bColAttr = bGeo.getAttribute("color") as THREE.BufferAttribute;

        let bCursor = 0;
        const spawnBurst = (kind: KenoFxKind) => {
            const c = FX_COLORS[kind];
            const count = kind === "reveal" ? 5 : kind === "hit" ? 16 : kind === "win" ? 46 : 26;
            const speed = kind === "reveal" ? 1.4 : kind === "hit" ? 2.6 : kind === "win" ? 3.6 : 2.8;
            for (let k = 0; k < count; k++) {
                const i = bCursor++ % BURST_N;
                bPos[i * 3] = (Math.random() - 0.5) * 1.4;
                bPos[i * 3 + 1] = 0.3 + (Math.random() - 0.5) * 0.5;
                bPos[i * 3 + 2] = Math.random() * 1.5;
                bVel[i * 3] = (Math.random() - 0.5) * 2 * speed;
                bVel[i * 3 + 1] = (Math.random() * 0.9 + 0.2) * speed * (Math.random() < 0.3 ? -0.5 : 1);
                bVel[i * 3 + 2] = (Math.random() - 0.5) * speed * 0.5;
                bLife[i] = 1;
                bBase[i * 3] = c.r; bBase[i * 3 + 1] = c.g; bBase[i * 3 + 2] = c.b;
            }
        };

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

        let camX = 0, camY = 0;
        let t = 0;
        let last = performance.now();
        let rafId = 0;

        const tick = (now: number) => {
            rafId = requestAnimationFrame(tick);
            const dt = Math.min((now - last) / 1000, 0.033);
            last = now;
            t += dt;

            for (;;) {
                const kind = queueRef.current.shift();
                if (!kind) break;
                spawnBurst(kind);
            }

            const p = phaseRef.current;
            let speedMul = p === "playing" ? 2.2 : p === "done" ? 1.2 : 1;
            if (reduceMotion) speedMul = 0.4;

            for (const b of balls) {
                b.mesh.rotation.x += b.spinX * speedMul * dt;
                b.mesh.rotation.y += b.spinY * speedMul * dt;
                b.mesh.position.y = b.baseY + Math.sin(t * 0.35 + b.bob) * 0.5;
                // Drift bounces within the ball's flank — never across the grid.
                b.mesh.position.x += b.drift * dt;
                const ax = Math.abs(b.mesh.position.x);
                if (ax > 9.6 || ax < 5.3) b.drift = -b.drift;
            }

            for (let i = 0; i < MOTES_N; i++) {
                let y = pos[i * 3 + 1] + vel[i] * speedMul * dt;
                if (y > 7.5) { y = -7.5; pos[i * 3] = (Math.random() - 0.5) * 20; }
                pos[i * 3 + 1] = y;
                pos[i * 3] += Math.sin(t * 0.5 + sway[i]) * 0.003;
            }
            motePosAttr.needsUpdate = true;

            for (let i = 0; i < BURST_N; i++) {
                if (bLife[i] <= 0) continue;
                bLife[i] -= dt * 1.1;
                const life = Math.max(0, bLife[i]);
                bPos[i * 3] += bVel[i * 3] * dt;
                bPos[i * 3 + 1] += bVel[i * 3 + 1] * dt;
                bPos[i * 3 + 2] += bVel[i * 3 + 2] * dt;
                bVel[i * 3 + 1] -= 2.4 * dt;
                bCol[i * 3] = bBase[i * 3] * life;
                bCol[i * 3 + 1] = bBase[i * 3 + 1] * life;
                bCol[i * 3 + 2] = bBase[i * 3 + 2] * life;
            }
            bPosAttr.needsUpdate = true;
            bColAttr.needsUpdate = true;

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
            ballGeo.dispose();
            ballMats.forEach((m) => m.dispose());
            ballTextures.forEach((tx) => tx.dispose());
            moteGeo.dispose(); moteMat.dispose();
            bGeo.dispose(); bMat.dispose();
            dotTex.dispose();
            renderer.dispose();
        };
    }, []);

    return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
