"use client"

import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky, Html, Environment } from "@react-three/drei";
import * as THREE from "three";

const LIGHT_DURATIONS = { green: 6000, yellow: 1500, red: 5000 };

// ─── Third-person camera ──────────────────────────────────────────────────────
function ThirdPersonCamera({ carRef }: { carRef: React.RefObject<THREE.Group | null> }) {
  const { camera } = useThree();
  useFrame(() => {
    if (!carRef.current) return;
    const pos = carRef.current.position;
    const angle = carRef.current.rotation.y;
    const offset = new THREE.Vector3(
      Math.sin(angle) * 8,
      3.5,
      Math.cos(angle) * 8
    );
    camera.position.lerp(pos.clone().add(offset), 0.1);
    camera.lookAt(pos.x, pos.y + 1, pos.z);
  });
  return null;
}

// ─── Car with manual physics ──────────────────────────────────────────────────
interface CarProps {
  carRef: React.RefObject<THREE.Group | null>;
  onCrossStopLine: () => void;
  stoppedRef: React.RefObject<{ crossed: boolean }>;
  onSpeedChange: (s: number) => void;
  paused: boolean;
  onBarrierHit: () => void;
}

function Car({ carRef, onCrossStopLine, stoppedRef, onSpeedChange, paused, onBarrierHit }: CarProps) {
  const physics = useRef({ vx: 0, vz: 0, angle: 0 });

  useFrame((_, delta) => {
    if (!carRef.current || paused) return;
    const p = physics.current;
    const keys = (window as any)._trafficKeys || {};

    const d = Math.min(delta, 0.05); // cap delta to prevent large jumps

    // Steering (only effective when moving)
    const speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    if (speed > 0.2) {
      const steer = ((keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0));
      p.angle += steer * Math.min(speed * 0.4, 1.4) * d;
    }

    const fx = -Math.sin(p.angle);
    const fz = -Math.cos(p.angle);

    if (keys.ArrowUp) {
      p.vx += fx * 18 * d;
      p.vz += fz * 18 * d;
    } else if (keys.ArrowDown) {
      p.vx *= Math.max(0, 1 - 12 * d);
      p.vz *= Math.max(0, 1 - 12 * d);
    } else {
      p.vx *= Math.max(0, 1 - 3 * d);
      p.vz *= Math.max(0, 1 - 3 * d);
    }

    // Max speed cap
    const spd = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    if (spd > 14) { p.vx = p.vx / spd * 14; p.vz = p.vz / spd * 14; }

    const mesh = carRef.current;
    const nx = mesh.position.x + p.vx * d;
    const nz = mesh.position.z + p.vz * d;

    // Barrier collision (x bounds ±4.5)
    if (Math.abs(nx) > 4.5) {
      onBarrierHit();
      p.vx = 0; p.vz = 0;
      return;
    }

    mesh.position.x = nx;
    mesh.position.z = nz;
    mesh.rotation.y = p.angle;

    onSpeedChange(spd);

    if (!stoppedRef.current!.crossed && nz < 0) {
      stoppedRef.current!.crossed = true;
      onCrossStopLine();
    }
  });

  return (
    <group ref={carRef} position={[0, 0.3, 18]}>
      {/* Body */}
      <mesh castShadow>
        <boxGeometry args={[1.8, 0.6, 3]} />
        <meshPhysicalMaterial color="#1f8ef1" metalness={0.6} roughness={0.15} />
      </mesh>
      {/* Cabin */}
      <mesh castShadow position={[0, 0.45, -0.2]}>
        <boxGeometry args={[1.4, 0.5, 1.6]} />
        <meshPhysicalMaterial color="#0d5fa8" metalness={0.4} roughness={0.2} />
      </mesh>
      {/* Wheels */}
      {([[0.95, 1], [-0.95, 1], [0.95, -1], [-0.95, -1]] as [number, number][]).map(([x, z], i) => (
        <mesh key={i} position={[x, -0.22, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.28, 0.28, 0.3, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
    </group>
  );
}

// ─── Traffic light ────────────────────────────────────────────────────────────
function TrafficLight({ position, state }: { position: [number, number, number]; state: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[0.5, 3.2, 0.4]} />
        <meshStandardMaterial color="#202020" />
      </mesh>
      {[
        { y: 2.8, active: state === "red",    on: "#ff0000", off: "#330000" },
        { y: 2.2, active: state === "yellow", on: "#ffbf00", off: "#332900" },
        { y: 1.6, active: state === "green",  on: "#00ff00", off: "#002200" },
      ].map(({ y, active, on, off }) => (
        <mesh key={y} position={[0, y, 0.25]}>
          <sphereGeometry args={[0.25, 16, 12]} />
          <meshStandardMaterial emissive={active ? on : "#000"} color={active ? on : off} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Road ─────────────────────────────────────────────────────────────────────
function Road() {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[12, 220]} />
        <meshStandardMaterial color="#282828" />
      </mesh>
      {/* Lane markings */}
      {Array.from({ length: 30 }).map((_, i) => (
        <mesh key={i} position={[0, 0.01, 90 - i * 6.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.5, 3]} />
          <meshStandardMaterial color="#fff" />
        </mesh>
      ))}
      {/* Stop line */}
      <mesh position={[0, 0.02, 1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 0.2]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
      {/* Kerbs */}
      {([-5.5, 5.5] as number[]).map((x) => (
        <mesh key={x} receiveShadow position={[x, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.8, 220]} />
          <meshStandardMaterial color="#888" />
        </mesh>
      ))}
    </group>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TrafficGame() {
  const carRef = useRef<THREE.Group>(null);
  const stoppedRef = useRef({ crossed: false });

  const [lightState, setLightState] = useState<"green" | "yellow" | "red">("green");
  const lightStartRef = useRef(Date.now());
  const lightDurationRef = useRef(LIGHT_DURATIONS.green);
  const [lightTimeLeft, setLightTimeLeft] = useState(LIGHT_DURATIONS.green);

  const [status, setStatus] = useState<"playing" | "passed" | "failed">("playing");
  const [score, setScore] = useState(0);
  const [showInstructions, setShowInstructions] = useState(true);
  const [speed, setSpeed] = useState(0);
  const [paused, setPaused] = useState(false);

  // ── Light cycle ────────────────────────────────────────────────────────────
  const setLight = (state: "green" | "yellow" | "red") => {
    setLightState(state);
    lightStartRef.current = Date.now();
    lightDurationRef.current = LIGHT_DURATIONS[state];
  };

  useEffect(() => {
    let mounted = true;
    const cycle = async () => {
      while (mounted) {
        setLight("green");
        await new Promise(r => setTimeout(r, LIGHT_DURATIONS.green));
        if (!mounted) break;
        setLight("yellow");
        await new Promise(r => setTimeout(r, LIGHT_DURATIONS.yellow));
        if (!mounted) break;
        setLight("red");
        await new Promise(r => setTimeout(r, LIGHT_DURATIONS.red));
      }
    };
    cycle();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setLightTimeLeft(Math.max(0, lightDurationRef.current - (Date.now() - lightStartRef.current)));
    }, 100);
    return () => clearInterval(iv);
  }, []);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const keys: Record<string, boolean> = {};
    (window as any)._trafficKeys = keys;
    const down = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault(); keys[e.key] = true; setShowInstructions(false);
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault(); setPaused(v => !v);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault(); keys[e.key] = false;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // ── Auto-reset ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "passed" || status === "failed") {
      const t = setTimeout(() => reset(), 4000);
      return () => clearTimeout(t);
    }
  }, [status]);

  // ── Game logic ─────────────────────────────────────────────────────────────
  const onCrossStopLine = () => {
    if (lightState === "red") setStatus("failed");
    else { setScore(s => s + 1); setStatus("passed"); }
  };

  const onBarrierHit = () => {
    if (status === "playing") setStatus("failed");
  };

  const reset = () => {
    stoppedRef.current.crossed = false;
    setStatus("playing");
    if (carRef.current) {
      carRef.current.position.set(0, 0.3, 18);
      carRef.current.rotation.set(0, 0, 0);
    }
    // reset physics
    const el = carRef.current as any;
    if (el?.__physics) { el.__physics.vx = 0; el.__physics.vz = 0; el.__physics.angle = 0; }
  };

  // ── HUD values ─────────────────────────────────────────────────────────────
  const speedKmh = Math.round(speed * 3.6 * 4); // scale for feel
  const lightProgress = Math.min(1, (lightDurationRef.current - lightTimeLeft) / lightDurationRef.current);
  const lightColor = lightState === "red" ? "#ef4444" : lightState === "yellow" ? "#f59e0b" : "#22c55e";
  const lightLabel = lightState === "red" ? "RØD" : lightState === "yellow" ? "GUL" : "GRØNN";

  return (
    <div style={{ position: "relative", width: "100%", height: "720px" }}>
      <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 50 }}>
        <button onClick={reset} style={{ padding: "8px 14px", background: "rgba(0,0,0,0.7)", color: "#fff", borderRadius: 8, border: "1px solid #444", cursor: "pointer" }}>
          Reset
        </button>
      </div>

      <Canvas shadows camera={{ position: [0, 6, 24], fov: 50 }} style={{ background: "linear-gradient(#7fb0ff, #0b1724)" }}>
        <ambientLight intensity={0.7} />
        <directionalLight castShadow position={[5, 12, 5]} intensity={1.2} shadow-mapSize={[1024, 1024]} />
        <Sky sunPosition={[100, 20, 100]} />
        <Environment preset="sunset" />

        <Road />

        {/* Traffic lights */}
        <group position={[0, 0, -14]}>
          <TrafficLight position={[4, 0, 0]} state={lightState} />
          <TrafficLight position={[-4, 0, 0]} state={lightState} />
        </group>

        {/* Side barriers (visual) */}
        {([-5.1, 5.1] as number[]).map((x) => (
          <mesh key={x} castShadow position={[x, 0.5, 5]}>
            <boxGeometry args={[0.4, 1, 30]} />
            <meshStandardMaterial color="#7b1e1e" />
          </mesh>
        ))}

        <Car
          carRef={carRef}
          onCrossStopLine={onCrossStopLine}
          stoppedRef={stoppedRef}
          onSpeedChange={setSpeed}
          paused={paused}
          onBarrierHit={onBarrierHit}
        />

        <ThirdPersonCamera carRef={carRef} />

        <Html fullscreen>
          <div style={{ pointerEvents: "none", fontFamily: "monospace" }}>

            {/* Top-left HUD */}
            <div style={{ position: "absolute", left: 18, top: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Light + timer */}
              <div style={{ background: "rgba(0,0,0,0.65)", borderRadius: 10, padding: "10px 14px", minWidth: 180 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: lightColor, boxShadow: `0 0 8px ${lightColor}` }} />
                  <span style={{ color: lightColor, fontWeight: "bold", fontSize: 15 }}>{lightLabel}</span>
                  <span style={{ color: "#aaa", fontSize: 12, marginLeft: "auto" }}>{(lightTimeLeft / 1000).toFixed(1)}s</span>
                </div>
                <div style={{ background: "#333", borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: lightColor, width: `${lightProgress * 100}%`, transition: "width 0.1s linear" }} />
                </div>
              </div>

              {/* Speedometer */}
              <div style={{ background: "rgba(0,0,0,0.65)", borderRadius: 10, padding: "8px 14px" }}>
                <div style={{ color: "#fff", fontSize: 22, fontWeight: "bold" }}>
                  {speedKmh} <span style={{ fontSize: 12, color: "#aaa" }}>km/h</span>
                </div>
                <div style={{ background: "#333", borderRadius: 4, height: 4, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: speedKmh > 80 ? "#ef4444" : speedKmh > 40 ? "#f59e0b" : "#22c55e", width: `${Math.min(100, speedKmh / 120 * 100)}%`, transition: "width 0.1s" }} />
                </div>
              </div>

              {/* Score */}
              <div style={{ background: "rgba(0,0,0,0.65)", borderRadius: 10, padding: "8px 14px" }}>
                <div style={{ color: "#facc15", fontSize: 13 }}>POENG</div>
                <div style={{ color: "#fff", fontSize: 26, fontWeight: "bold" }}>{score}</div>
              </div>
            </div>

            {/* Instructions */}
            {showInstructions && (
              <div style={{ position: "absolute", right: 18, top: 18, color: "#fff", maxWidth: 200, background: "rgba(0,0,0,0.55)", padding: 12, borderRadius: 10, fontSize: 13 }}>
                <div style={{ fontWeight: "bold", marginBottom: 6 }}>Kontroller</div>
                <div>↑ gass &nbsp; ↓ brems</div>
                <div>← → styr &nbsp; P pause</div>
                <div style={{ marginTop: 8, color: "#facc15", fontSize: 11 }}>Stopp før hvit linje når lyset er RØDT. Kjør over på GRØNT.</div>
              </div>
            )}

            {/* Paused */}
            {paused && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto" }}>
                <div style={{ background: "rgba(0,0,0,0.85)", color: "#fff", padding: 24, borderRadius: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: "bold", marginBottom: 8 }}>PAUSE</div>
                  <div style={{ color: "#aaa" }}>Trykk P for å fortsette</div>
                </div>
              </div>
            )}

            {/* Failed */}
            {status === "failed" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto" }}>
                <div style={{ background: "rgba(0,0,0,0.82)", color: "#fff", padding: 28, borderRadius: 14, textAlign: "center", minWidth: 260 }}>
                  <div style={{ fontSize: 36 }}>🚨</div>
                  <div style={{ fontSize: 24, fontWeight: "bold", color: "#ef4444", marginBottom: 8 }}>FEIL!</div>
                  <div style={{ color: "#ccc", marginBottom: 14 }}>Prøv igjen.</div>
                  <button onClick={reset} style={{ padding: "9px 18px", background: "#ef4444", color: "#fff", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold" }}>Prøv igjen</button>
                </div>
              </div>
            )}

            {/* Passed */}
            {status === "passed" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto" }}>
                <div style={{ background: "rgba(0,0,0,0.82)", color: "#fff", padding: 28, borderRadius: 14, textAlign: "center", minWidth: 260 }}>
                  <div style={{ fontSize: 36 }}>✅</div>
                  <div style={{ fontSize: 24, fontWeight: "bold", color: "#22c55e", marginBottom: 8 }}>Bra kjørt!</div>
                  <div style={{ color: "#facc15", fontSize: 18, marginBottom: 14 }}>Poeng: {score}</div>
                  <button onClick={reset} style={{ padding: "9px 18px", background: "#22c55e", color: "#fff", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold" }}>Spill igjen</button>
                </div>
              </div>
            )}
          </div>
        </Html>
      </Canvas>
    </div>
  );
}
