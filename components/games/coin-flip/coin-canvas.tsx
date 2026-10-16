"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Side = "heads" | "tails";

interface Props {
    result: Side | null;
    flipping: boolean;
    size?: number;
}

function makeCoinTexture(side: Side) {
    const s = 512;
    const cv = document.createElement("canvas");
    cv.width = s;
    cv.height = s;
    const ctx = cv.getContext("2d")!;

    const g = ctx.createRadialGradient(170, 120, 20, 256, 256, 250);
    g.addColorStop(0, "#fff7d6");
    g.addColorStop(0.42, "#f29a0b");
    g.addColorStop(1, "#6b4304");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(256, 256, 238, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#5a3a04";
    ctx.lineWidth = 26;
    ctx.stroke();

    ctx.setLineDash([14, 14]);
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(256, 256, 180, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#3d2403";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = "900 118px Inter, system-ui";
    ctx.fillText(side === "heads" ? "♛" : "★", 256, 235);

    ctx.font = "900 34px JetBrains Mono, monospace";
    ctx.letterSpacing = "5px";
    ctx.fillText(side.toUpperCase(), 256, 355);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

export function CoinThreeCanvas({ result, flipping, size = 260 }: Props) {
    const mountRef = useRef<HTMLDivElement>(null);
    const flippingRef = useRef(flipping);
    const resultRef = useRef<Side | null>(result);

    useEffect(() => {
        flippingRef.current = flipping;
    }, [flipping]);

    useEffect(() => {
        resultRef.current = result;
    }, [result]);

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(
            35,
            mount.clientWidth / mount.clientHeight,
            0.1,
            100
        );
        camera.position.set(0, 0.6, 9);
        camera.lookAt(0, 0, 0);

        scene.add(new THREE.AmbientLight(0xffffff, 0.75));

        const key = new THREE.DirectionalLight(0xffffff, 1.6);
        key.position.set(3, 5, 4);
        scene.add(key);

        const rim = new THREE.DirectionalLight(0xf29a0b, 1.1);
        rim.position.set(-3, 1, 3);
        scene.add(rim);

        const headsTex = makeCoinTexture("heads");
        headsTex.rotation = Math.PI / 2;
        headsTex.center.set(0.5, 0.5);

        const tailsTex = makeCoinTexture("tails");
        tailsTex.rotation = -Math.PI / 2;
        tailsTex.center.set(0.5, 0.5);

        const geometry = new THREE.CylinderGeometry(1.45, 1.45, 0.22, 96, 1, false);

        const edgeMat = new THREE.MeshStandardMaterial({
            color: "#c98208",
            metalness: 0.7,
            roughness: 0.22,
        });

        const headsMat = new THREE.MeshStandardMaterial({
            map: headsTex,
            metalness: 0.42,
            roughness: 0.2,
        });

        const tailsMat = new THREE.MeshStandardMaterial({
            map: tailsTex,
            metalness: 0.42,
            roughness: 0.2,
        });

        const coin = new THREE.Mesh(geometry, [edgeMat, headsMat, tailsMat]);
        coin.rotation.x = Math.PI / 2;
        scene.add(coin);

        const shadow = new THREE.Mesh(
            new THREE.CircleGeometry(1.7, 64),
            new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.28,
            })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = -1.55;
        scene.add(shadow);

        let anim = 0;
        const clock = new THREE.Clock();
        let settle = 1;

        const animate = () => {
            anim = requestAnimationFrame(animate);
            const dt = Math.min(clock.getDelta(), 0.033);

            if (flippingRef.current) {
                settle = 0;
                coin.rotation.x += dt * 14;
                coin.rotation.y += dt * 5.5;
                coin.position.y = Math.sin(performance.now() * 0.008) * 0.18;
                shadow.scale.setScalar(1 + Math.abs(Math.sin(performance.now() * 0.008)) * 0.12);
            } else {
                settle = Math.min(settle + dt * 2.8, 1);

                const side = resultRef.current ?? "heads";
                const targetX = side === "heads" ? Math.PI / 2 : -Math.PI / 2;

                coin.rotation.x += (targetX - coin.rotation.x) * (0.08 + settle * 0.1);
                coin.rotation.y += (0 - coin.rotation.y) * 0.08;
                coin.rotation.z += (0 - coin.rotation.z) * 0.08;
                coin.position.y += (0 - coin.position.y) * 0.1;
                shadow.scale.x += (1 - shadow.scale.x) * 0.08;
                shadow.scale.y += (1 - shadow.scale.y) * 0.08;
            }

            renderer.render(scene, camera);
        };

        animate();

        const observer = new ResizeObserver(() => {
            const w = mount.clientWidth;
            const h = mount.clientHeight;
            if (w === 0 || h === 0) return;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        });
        observer.observe(mount);

        return () => {
            cancelAnimationFrame(anim);
            observer.disconnect();
            headsTex.dispose();
            tailsTex.dispose();
            geometry.dispose();
            edgeMat.dispose();
            headsMat.dispose();
            tailsMat.dispose();
            renderer.dispose();
            mount.removeChild(renderer.domElement);
        };
    }, []);

    return <div ref={mountRef} className="h-full w-full" />;
}