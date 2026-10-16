"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// Three.js atmosphere for Andar Bahar: a royal card table under a spotlight —
// golden dust motes drifting through the light, giant translucent card suits
// (♠ ♥ ♦ ♣) floating in depth, plus event bursts: a small gold flick as each
// card is dealt, a gold shower on a win, a red flare on a loss. Props stream
// via refs so the WebGL context never restarts (same pattern as the other
// game scenes).

export type AbFxKind = "deal" | "win" | "lose";
export type AbFx = { kind: AbFxKind; seq: number } | null;
type Phase = "idle" | "dealing" | "won" | "lost";

const MOTES_N = 240;
const BURST_N = 200;

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

function makeGlyphTexture(glyph: string) {
    const cv = document.createElement("canvas");
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext("2d");
    if (ctx) {
        ctx.font = "900 100px Georgia, 'Times New Roman', serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff"; // tinted per-mesh via material.color
        ctx.fillText(glyph, 64, 70);
    }
    return new THREE.CanvasTexture(cv);
}

const FX_COLORS: Record<AbFxKind, THREE.Color> = {
    deal: new THREE.Color("#f8b322"),
    win: new THREE.Color("#f8b322"),
    lose: new THREE.Color("#ff5d73"),
};

export function ABScene({ phase, fx }: { phase: Phase; fx: AbFx }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const phaseRef = useRef<Phase>(phase);
    const queueRef = useRef<AbFxKind[]>([]);
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

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
        camera.position.set(0, 0, 10);

        // ── Floating card suits, deep in the scene ──────────────────────────
        const suitGlyphs = ["♠", "♥", "♦", "♣"];
        const suitTextures = suitGlyphs.map(makeGlyphTexture);
        const suitMeshes: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; spin: number; bob: number; baseY: number; drift: number }[] = [];
        const suitGeo = new THREE.PlaneGeometry(1, 1);
        for (let i = 0; i < 12; i++) {
            const gi = i % 4;
            const red = gi === 1 || gi === 2; // hearts / diamonds
            const mat = new THREE.MeshBasicMaterial({
                map: suitTextures[gi],
                transparent: true,
                opacity: 0.10 + (i % 3) * 0.03,
                color: red ? new THREE.Color("#ff8098") : new THREE.Color("#8ef0c8"),
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });
            const mesh = new THREE.Mesh(suitGeo, mat);
            const scale = 1.2 + (i % 5) * 0.45;
            mesh.scale.setScalar(scale);
            mesh.position.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 10, -2 - Math.random() * 5);
            mesh.rotation.z = Math.random() * Math.PI;
            scene.add(mesh);
            suitMeshes.push({
                mesh, mat,
                spin: (Math.random() - 0.5) * 0.22,
                bob: Math.random() * Math.PI * 2,
                baseY: mesh.position.y,
                drift: (Math.random() - 0.5) * 0.25,
            });
        }

        // ── Golden table dust ────────────────────────────────────────────────
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
            vel[i] = 0.12 + Math.random() * 0.3;
            sway[i] = Math.random() * Math.PI * 2;
            const roll = Math.random();
            if (roll < 0.5) tmp.set("#f8b322");
            else if (roll < 0.75) tmp.set("#ffe9b8");
            else tmp.set("#7ee0b8");
            col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
        }
        const moteGeo = new THREE.BufferGeometry();
        moteGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        moteGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        const moteMat = new THREE.PointsMaterial({
            size: 0.11, map: dotTex, vertexColors: true, transparent: true, opacity: 0.5,
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
        const spawnBurst = (kind: AbFxKind) => {
            const c = FX_COLORS[kind];
            // Deal flicks sparkle at the joker (top-centre); results burst mid-table.
            const oy = kind === "deal" ? 3.1 : 0.3;
            const count = kind === "deal" ? 6 : kind === "win" ? 48 : 30;
            const speed = kind === "deal" ? 1.5 : kind === "win" ? 3.6 : 2.8;
            for (let k = 0; k < count; k++) {
                const i = bCursor++ % BURST_N;
                bPos[i * 3] = (Math.random() - 0.5) * 1.2;
                bPos[i * 3 + 1] = oy + (Math.random() - 0.5) * 0.4;
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
            let speedMul = p === "dealing" ? 1.7 : p === "won" ? 1.3 : 1;
            if (reduceMotion) speedMul = 0.4;

            // Dust drifts up through the spotlight
            for (let i = 0; i < MOTES_N; i++) {
                let y = pos[i * 3 + 1] + vel[i] * speedMul * dt;
                if (y > 7.5) { y = -7.5; pos[i * 3] = (Math.random() - 0.5) * 20; }
                pos[i * 3 + 1] = y;
                pos[i * 3] += Math.sin(t * 0.5 + sway[i]) * 0.003;
            }
            motePosAttr.needsUpdate = true;

            // Suits rotate and bob lazily
            for (const s of suitMeshes) {
                s.mesh.rotation.z += s.spin * dt;
                s.mesh.position.y = s.baseY + Math.sin(t * 0.3 + s.bob) * 0.5;
                s.mesh.position.x += s.drift * dt;
                if (s.mesh.position.x > 10) s.mesh.position.x = -10;
                if (s.mesh.position.x < -10) s.mesh.position.x = 10;
            }

            // Burst particles: fly, arc, fade
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
            moteGeo.dispose(); moteMat.dispose();
            bGeo.dispose(); bMat.dispose();
            suitGeo.dispose();
            suitMeshes.forEach((s) => s.mat.dispose());
            suitTextures.forEach((tex) => tex.dispose());
            dotTex.dispose();
            renderer.dispose();
        };
    }, []);

    return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
