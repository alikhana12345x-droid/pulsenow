"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// A procedural "warp-speed" starfield that sits behind the Limbo multiplier
// readout. Nothing is illustrated — every streak is a short additive line whose
// length and speed are driven live by the round, so the whole space accelerates
// as the multiplier climbs. Distinct from the SkyRise rocket, no art assets.

export type WarpPhase = "idle" | "rolling" | "won" | "lost";

interface Props {
    phase: WarpPhase;
    // Current on-screen multiplier — higher = faster warp.
    multiplier: number;
    accent?: string;
}

const STAR_COUNT = 900;
const FAR = 360;          // how far back stars spawn
const RECYCLE_Z = 8;      // once a streak passes this (behind camera) it wraps

export function LimboWarp({ phase, multiplier, accent = "#f29a0b" }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Live inputs read by the render loop — updated via refs so changing them
    // never tears down / restarts the WebGL context.
    const phaseRef = useRef<WarpPhase>(phase);
    const multRef = useRef(multiplier);
    const flashRef = useRef(0); // 0..1 burst triggered on a win / loss

    useEffect(() => {
        // A fresh result fires a one-shot burst (speed surge + ring pulse).
        if (phase !== phaseRef.current && (phase === "won" || phase === "lost")) {
            flashRef.current = 1;
        }
        phaseRef.current = phase;
    }, [phase]);

    useEffect(() => { multRef.current = multiplier; }, [multiplier]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const reduceMotion =
            typeof window !== "undefined" &&
            !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 500);
        camera.position.set(0, 0, 6);

        const accentColor = new THREE.Color(accent);
        const winColor = new THREE.Color("#5eead4");
        const loseColor = new THREE.Color("#ff5d73");

        // ── Warp streaks ──────────────────────────────────────────────────────
        // One line segment per star: head (bright) → tail (dim) makes a comet.
        const sx = new Float32Array(STAR_COUNT);
        const sy = new Float32Array(STAR_COUNT);
        const sz = new Float32Array(STAR_COUNT);
        const positions = new Float32Array(STAR_COUNT * 2 * 3);
        const colors = new Float32Array(STAR_COUNT * 2 * 3);

        const respawn = (i: number, deep: boolean) => {
            sx[i] = (Math.random() - 0.5) * 80;
            sy[i] = (Math.random() - 0.5) * 56;
            sz[i] = deep ? -(Math.random() * 40 + FAR - 40) : -(Math.random() * FAR + 10);
        };

        for (let i = 0; i < STAR_COUNT; i++) {
            respawn(i, false);
            // ~16% of streaks are gold, the rest cool white-blue.
            let r: number, g: number, b: number;
            if (Math.random() < 0.16) {
                r = accentColor.r; g = accentColor.g; b = accentColor.b;
            } else {
                const w = Math.random();
                r = 0.6 + 0.4 * w; g = 0.72 + 0.28 * w; b = 1.0;
            }
            const h = i * 6, t = i * 6 + 3;
            colors[h] = r;        colors[h + 1] = g;        colors[h + 2] = b;
            colors[t] = r * 0.22; colors[t + 1] = g * 0.22; colors[t + 2] = b * 0.22;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;

        const mat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.92,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const streaks = new THREE.LineSegments(geo, mat);
        scene.add(streaks);

        // ── Target ring: a thin glowing halo that frames the multiplier readout.
        // Kept small (world radius ~1.5) so it stays a halo, not a border, and
        // never clips on narrow / portrait stages.
        const ringGeo = new THREE.RingGeometry(1.5, 1.58, 96);
        const ringMat = new THREE.MeshBasicMaterial({
            color: accentColor,
            transparent: true,
            opacity: 0.32,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.z = 2.2;
        scene.add(ring);

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

        const baseSpeed = () => {
            switch (phaseRef.current) {
                case "rolling": return 70 + Math.min(multRef.current, 60) * 2.5;
                case "won":     return 22;
                case "lost":    return 4;
                default:        return 14; // gentle idle drift
            }
        };

        const clock = new THREE.Clock();
        let speed = 14;
        let rafId = 0;

        const tick = () => {
            rafId = requestAnimationFrame(tick);
            const dt = Math.min(clock.getDelta(), 0.033);

            flashRef.current = Math.max(0, flashRef.current - dt * 1.6);
            const winBurst = phaseRef.current === "won" ? flashRef.current : 0;
            const loseBurst = phaseRef.current === "lost" ? flashRef.current : 0;

            let target = baseSpeed() + winBurst * 120;
            if (reduceMotion) target = Math.min(target, 18);
            speed += (target - speed) * Math.min(1, dt * 4); // ease toward target

            const trail = Math.min(60, Math.max(0.6, speed * 0.09));

            for (let i = 0; i < STAR_COUNT; i++) {
                sz[i] += speed * dt;
                if (sz[i] > RECYCLE_Z) respawn(i, true);
                const h = i * 6, t = i * 6 + 3;
                positions[h]     = sx[i]; positions[h + 1] = sy[i]; positions[h + 2] = sz[i];
                positions[t]     = sx[i]; positions[t + 1] = sy[i]; positions[t + 2] = sz[i] - trail;
            }
            posAttr.needsUpdate = true;

            // Ring: gentle rotate + breathe; recolour + pulse on a result.
            ring.rotation.z += dt * 0.15;
            const breathe = 0.34 + Math.sin(performance.now() * 0.0016) * 0.06;
            if (phaseRef.current === "won") {
                ringMat.color.copy(winColor);
                ringMat.opacity = breathe + winBurst * 0.6;
                ring.scale.setScalar(1 + winBurst * 0.28);
            } else if (phaseRef.current === "lost") {
                ringMat.color.copy(loseColor);
                ringMat.opacity = 0.16 + loseBurst * 0.5;
                ring.scale.setScalar(1 + loseBurst * 0.12);
            } else {
                ringMat.color.copy(accentColor);
                ringMat.opacity = breathe;
                ring.scale.setScalar(1);
            }

            renderer.render(scene, camera);
        };
        tick();

        return () => {
            cancelAnimationFrame(rafId);
            ro.disconnect();
            geo.dispose();
            mat.dispose();
            ringGeo.dispose();
            ringMat.dispose();
            renderer.dispose();
        };
    }, [accent]);

    return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
