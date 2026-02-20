"use client"

import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky, Html, Environment, ContactShadows } from "@react-three/drei";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

const LIGHT_DURATIONS = { green: 6000, yellow: 1500, red: 5000 };

// ─── Hit flash effects ────────────────────────────────────────────────────────
function HitEffects({ hits }: { hits: Array<{ id: number; pos: { x: number; y: number; z: number }; t: number }> }) {
  const [, setTick] = React.useState(0);
  useFrame(() => setTick((v) => (v + 1) % 100000));
  const now = Date.now();
  const duration = 900;
  return (
    <group>
      {hits.map((h) => {
        const age = now - h.t;
        if (age > duration) return null;
        const life = age / duration;
        const scale = 1 + life * 3;
        const opacity = 1 - life;
        return (
          <mesh key={h.id} position={[h.pos.x, h.pos.y + 0.6, h.pos.z]} scale={[scale, scale, scale]}>
            <sphereGeometry args={[0.18, 12, 10]} />
            <meshStandardMaterial emissive={new THREE.Color(1, 0.7, 0.3)} color="#ffbb88" transparent opacity={opacity} />
          </mesh>
        );
      })}
    </group>
  );
}

// ─── Third-person follow camera ───────────────────────────────────────────────
function ThirdPersonCamera({ bodyRef }: { bodyRef: React.RefObject<any> }) {
  const { camera } = useThree();
  useFrame(() => {
    if (!bodyRef.current) return;
    const pos = bodyRef.current.translation();
    const rot = bodyRef.current.rotation();
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const offset = new THREE.Vector3(0, 3.5, 8).applyQuaternion(quat);
    const desired = new THREE.Vector3(pos.x, pos.y, pos.z).add(offset);
    camera.position.lerp(desired, 0.1);
    camera.lookAt(pos.x, pos.y + 1.2, pos.z);
  });
  return null;
}

// ─── Car ──────────────────────────────────────────────────────────────────────
function Car({ position, onCrossStopLine, stoppedRef, onSpeedChange, bodyRef, paused }: {
  position: [number, number, number];
  onCrossStopLine: () => void;
  stoppedRef: React.MutableRefObject<{ crossed: boolean }>;
  onSpeedChange?: (s: number) => void;
  bodyRef: React.RefObject<any>;
  paused: boolean;
}) {
  const mass = 1200;
  const engineForce = 6000;
  const brakeForce = 18000;
  const maxSteer = 1.6;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
  }, [position]);

  useFrame(() => {
    const keys = (window as any)._trafficKeys || {};
    const throttle = keys.ArrowUp ? 1 : 0;
    const brake = keys.ArrowDown ? 1 : 0;
    const steerLeft = keys.ArrowLeft ? 1 : 0;
    const steerRight = keys.ArrowRight ? 1 : 0;

    if (!bodyRef.current || paused) return;

    const worldQuat = bodyRef.current.rotation();
    const forward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(new THREE.Quaternion(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w))
      .normalize();

    if (throttle) {
      bodyRef.current.applyForce({ x: forward.x * -engineForce, y: 0, z: forward.z * -engineForce }, true);
    } else if (brake) {
      const lin = bodyRef.current.linvel();
      bodyRef.current.applyForce({
        x: -lin.x * Math.min(brakeForce, Math.abs(lin.x) * 200),
        y: 0,
        z: -lin.z * Math.min(brakeForce, Math.abs(lin.z) * 200),
      }, true);
    } else {
      const lin = bodyRef.current.linvel();
      bodyRef.current.applyForce({ x: -lin.x * 120, y: 0, z: -lin.z * 120 }, true);
    }

    const steer = steerLeft - steerRight;
    if (steer) bodyRef.current.applyTorque({ x: 0, y: steer * maxSteer * 80, z: 0 }, true);

    const vel = bodyRef.current.linvel();
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
    if (onSpeedChange) onSpeedChange(speed);

    const pos = bodyRef.current.translation();
    if (!stoppedRef.current.crossed && pos.z < 0) {
      stoppedRef.current.crossed = true;
      onCrossStopLine();
    }
  });

  return (
    <RigidBody ref={bodyRef} type="dynamic" mass={mass} linearDamping={0.8} angularDamping={0.9}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.6, 3]} />
        <meshPhysicalMaterial color="#1f8ef1" metalness={0.6} roughness={0.15} clearcoat={0.2} />
      </mesh>
      <CuboidCollider args={[0.9, 0.3, 1.5]} />
      {([[ 0.9, 1], [-0.9, 1], [ 0.9, -1], [-0.9, -1]] as [number, number][]).map(([x, z], i) => (
        <mesh key={i} position={[x, -0.25, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.25, 0.25, 0.4, 16]} />
          <meshStandardMaterial color="#111" metalness={0.2} roughness={0.6} />
        </mesh>
      ))}
    </RigidBody>
  );
}

// ─── Traffic light ────────────────────────────────────────────────────────────
function TrafficLight({ position, state }: { position: [number, number, number]; state: string }) {
  const red = state === "red";
  const yellow = state === "yellow";
  const green = state === "green";
  return (
    <group position={position}>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[0.5, 3.2, 0.4]} />
        <meshStandardMaterial color="#202020" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.8, 0.3]}>
        <sphereGeometry args={[0.28, 16, 12]} />
        <meshStandardMaterial emissive={red ? "#ff0000" : "#220000"} color={red ? "#ff4d4d" : "#330000"} />
      </mesh>
      <mesh position={[0, 2.2, 0.3]}>
        <sphereGeometry args={[0.28, 16, 12]} />
        <meshStandardMaterial emissive={yellow ? "#ffbf00" : "#221900"} color={yellow ? "#ffdf66" : "#332900"} />
      </mesh>
      <mesh position={[0, 1.6, 0.3]}>
        <sphereGeometry args={[0.28, 16, 12]} />
        <meshStandardMaterial emissive={green ? "#00ff00" : "#002200"} color={green ? "#7dff7d" : "#002200"} />
      </mesh>
    </group>
  );
}

// ─── Road ─────────────────────────────────────────────────────────────────────
function Road() {
  return (
    <RigidBody type="fixed">
      <group>
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[40, 200]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        {Array.from({ length: 30 }).map((_, i) => (
          <mesh key={i} position={[0, 0.01, 90 - i * 6.5]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.6, 3.6]} />
            <meshStandardMaterial color="#fff" />
          </mesh>
        ))}
        {/* Stop line */}
        <mesh position={[0, 0.02, 1]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8, 0.14]} />
          <meshStandardMaterial color="#fff" />
        </mesh>
      </group>
    </RigidBody>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TrafficGame() {
  const carBodyRef = useRef<any>(null);
  const stoppedRef = useRef({ crossed: false });

  const [lightState, setLightState] = useState("green");
  const lightStartRef = useRef(Date.now());
  const lightDurationRef = useRef(LIGHT_DURATIONS.green);
  const [lightTimeLeft, setLightTimeLeft] = useState(LIGHT_DURATIONS.green);

  const [status, setStatus] = useState<"playing" | "passed" | "failed">("playing");
  const [score, setScore] = useState(0);
  const [showInstructions, setShowInstructions] = useState(true);
  const [speed, setSpeed] = useState(0); // m/s
  const [paused, setPaused] = useState(false);
  const [hits, setHits] = useState<Array<{ id: number; pos: { x: number; y: number; z: number }; t: number }>>([]);

  const savedVelRef = useRef<{ lin?: any; ang?: any } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<any>(null);
  const engineOscRef = useRef<any>(null);
  const engineGainRef = useRef<any>(null);
  const useAudioFallback = useRef(false);
  const collisionAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── Light cycle ──────────────────────────────────────────────────────────────
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
        await new Promise((r) => setTimeout(r, LIGHT_DURATIONS.green));
        if (!mounted) break;
        setLight("yellow");
        await new Promise((r) => setTimeout(r, LIGHT_DURATIONS.yellow));
        if (!mounted) break;
        setLight("red");
        await new Promise((r) => setTimeout(r, LIGHT_DURATIONS.red));
      }
    };
    cycle();
    return () => { mounted = false; };
  }, []);

  // Light timer countdown (100ms tick)
  useEffect(() => {
    const iv = setInterval(() => {
      const elapsed = Date.now() - lightStartRef.current;
      setLightTimeLeft(Math.max(0, lightDurationRef.current - elapsed));
    }, 100);
    return () => clearInterval(iv);
  }, []);

  // ── Audio setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio("/sounds/engine_loop_short.mp3");
    audio.loop = true;
    audio.volume = 0.12;
    audioRef.current = audio;
    audio.play().catch(() => {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AC();
        const ctx = audioContextRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 120;
        gain.gain.value = 0.04;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        engineOscRef.current = osc;
        engineGainRef.current = gain;
        useAudioFallback.current = true;
      } catch {}
    });

    const ca = new Audio("/sounds/collision_small.ogg");
    ca.volume = 0.28;
    collisionAudioRef.current = ca;

    return () => { try { audio.pause(); } catch {} };
  }, []);

  // Engine audio pitch by speed
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const rate = 1 + Math.min(1.3, speed / 12);
    a.playbackRate = rate;
    a.volume = 0.06 + Math.min(0.8, speed / 20);
    if (useAudioFallback.current && engineOscRef.current && engineGainRef.current) {
      try {
        engineOscRef.current.frequency.value = 80 + speed * 20;
        engineGainRef.current.gain.value = 0.02 + Math.min(0.18, speed / 60);
      } catch {}
    }
  }, [speed]);

  const playCollisionSound = () => {
    try {
      const a = collisionAudioRef.current;
      if (a) { a.currentTime = 0; a.play().catch(() => playNoiseBurst()); }
      else playNoiseBurst();
    } catch {}
  };

  const playNoiseBurst = () => {
    try {
      const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, sr * 0.2, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.6;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain(); g.gain.value = 0.12;
      src.connect(g); g.connect(ctx.destination); src.start();
    } catch {}
  };

  const addHit = (pos: { x: number; y: number; z: number }) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setHits((h) => [...h, { id, pos, t: Date.now() }]);
  };

  // Prune old hits
  useEffect(() => {
    const iv = setInterval(() => {
      setHits((h) => h.filter((x) => x.t >= Date.now() - 1000));
    }, 250);
    return () => clearInterval(iv);
  }, []);

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const keys: any = {};
    (window as any)._trafficKeys = keys;
    const down = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        keys[e.key] = true;
        setShowInstructions(false);
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaused((v) => !v);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        keys[e.key] = false;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ── Pause/resume ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const body = carBodyRef.current;
    const a = audioRef.current;
    if (paused) {
      if (body) {
        try {
          savedVelRef.current = { lin: body.linvel(), ang: body.angvel() };
          body.setLinvel({ x: 0, y: 0, z: 0 });
          body.setAngvel({ x: 0, y: 0, z: 0 });
        } catch {}
      }
      try { a?.pause(); } catch {}
    } else {
      if (body && savedVelRef.current) {
        try {
          body.setLinvel(savedVelRef.current.lin);
          body.setAngvel(savedVelRef.current.ang);
        } catch {}
      }
      try { a?.play().catch(() => {}); } catch {}
      savedVelRef.current = null;
    }
  }, [paused]);

  // ── Auto-reset after pass/fail ────────────────────────────────────────────────
  useEffect(() => {
    if (status === "passed" || status === "failed") {
      const t = setTimeout(() => reset(), 4000);
      return () => clearTimeout(t);
    }
  }, [status]);

  // ── Game logic ────────────────────────────────────────────────────────────────
  const onCrossStopLine = () => {
    if (lightState === "red") {
      setStatus("failed");
    } else {
      setScore((s) => s + 1);
      setStatus("passed");
    }
  };

  const onBarrierHit = () => {
    setStatus("failed");
    playCollisionSound();
    const p = carBodyRef.current?.translation ? carBodyRef.current.translation() : { x: 0, y: 0, z: 0 };
    addHit(p);
  };

  const reset = () => {
    stoppedRef.current.crossed = false;
    setStatus("playing");
    try {
      const b = carBodyRef.current;
      if (b) {
        b.setTranslation({ x: 0, y: 0.4, z: 18 }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 });
        b.setAngvel({ x: 0, y: 0, z: 0 });
      }
    } catch {
      window.location.reload();
    }
  };

  // ── HUD helpers ───────────────────────────────────────────────────────────────
  const speedKmh = Math.round(speed * 3.6);
  const lightProgress = Math.min(1, (lightDurationRef.current - lightTimeLeft) / lightDurationRef.current);
  const lightColor = lightState === "red" ? "#ef4444" : lightState === "yellow" ? "#f59e0b" : "#22c55e";
  const lightLabel = lightState === "red" ? "RØD" : lightState === "yellow" ? "GUL" : "GRØNN";

  return (
    <div style={{ position: "relative", width: "100%", height: "720px", background: "#000" }}>

      {/* Reset button (always visible during play) */}
      <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 50 }}>
        <button
          onClick={reset}
          style={{ padding: "8px 14px", background: "rgba(0,0,0,0.7)", color: "#fff", borderRadius: 8, border: "1px solid #444", cursor: "pointer" }}
        >
          Reset
        </button>
      </div>

      <Canvas shadows camera={{ position: [0, 6, 12], fov: 50 }} style={{ background: "linear-gradient(#7fb0ff, #0b1724)" }}>
        <Physics gravity={[0, -9.81, 0]}>
          <ambientLight intensity={0.6} />
          <directionalLight castShadow position={[5, 12, 5]} intensity={1.2} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
          <Sky sunPosition={[100, 20, 100]} />
          <Environment preset="sunset" />

          <Road />

          <group position={[0, 0, -14]}>
            <TrafficLight position={[3.6, 0, 0]} state={lightState} />
            <TrafficLight position={[-3.6, 0, 0]} state={lightState} />
          </group>

          {/* Side barriers */}
          {([5, -5] as number[]).map((x) => (
            <RigidBody key={x} type="fixed" position={[x, 0.8, 2]} onCollisionEnter={onBarrierHit}>
              <mesh castShadow>
                <boxGeometry args={[1.2, 1.6, 0.6]} />
                <meshStandardMaterial color="#7b1e1e" />
              </mesh>
            </RigidBody>
          ))}

          <Car
            position={[0, 0.4, 18]}
            onCrossStopLine={onCrossStopLine}
            stoppedRef={stoppedRef}
            onSpeedChange={setSpeed}
            bodyRef={carBodyRef}
            paused={paused}
          />

          <ThirdPersonCamera bodyRef={carBodyRef} />

          <ContactShadows position={[0, -0.01, 20]} opacity={0.6} scale={18} blur={2} far={6} />
          <HitEffects hits={hits} />

          {/* Stop line post */}
          <mesh receiveShadow position={[0, 0, -1]}>
            <boxGeometry args={[0.2, 2.4, 0.2]} />
            <meshStandardMaterial color="#fff" />
          </mesh>

          <EffectComposer>
            <Bloom luminanceThreshold={0.6} luminanceSmoothing={0.9} intensity={0.9} />
          </EffectComposer>

          <Html fullscreen>
            <div style={{ pointerEvents: "none", fontFamily: "monospace" }}>

              {/* ── Top-left HUD ── */}
              <div style={{ position: "absolute", left: 18, top: 18, display: "flex", flexDirection: "column", gap: 10 }}>

                {/* Traffic light status + timer bar */}
                <div style={{ background: "rgba(0,0,0,0.65)", borderRadius: 10, padding: "10px 14px", minWidth: 180 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: lightColor, boxShadow: `0 0 8px ${lightColor}` }} />
                    <span style={{ color: lightColor, fontWeight: "bold", fontSize: 15 }}>{lightLabel}</span>
                    <span style={{ color: "#aaa", fontSize: 12, marginLeft: "auto" }}>{(lightTimeLeft / 1000).toFixed(1)}s</span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ background: "#333", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 4,
                      background: lightColor,
                      width: `${lightProgress * 100}%`,
                      transition: "width 0.1s linear, background 0.3s"
                    }} />
                  </div>
                </div>

                {/* Speedometer */}
                <div style={{ background: "rgba(0,0,0,0.65)", borderRadius: 10, padding: "8px 14px" }}>
                  <div style={{ color: "#fff", fontSize: 22, fontWeight: "bold" }}>
                    {speedKmh} <span style={{ fontSize: 12, color: "#aaa" }}>km/h</span>
                  </div>
                  <div style={{ background: "#333", borderRadius: 4, height: 4, marginTop: 4, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 4,
                      background: speedKmh > 60 ? "#ef4444" : speedKmh > 30 ? "#f59e0b" : "#22c55e",
                      width: `${Math.min(100, speedKmh / 120 * 100)}%`,
                      transition: "width 0.1s"
                    }} />
                  </div>
                </div>

                {/* Score */}
                <div style={{ background: "rgba(0,0,0,0.65)", borderRadius: 10, padding: "8px 14px" }}>
                  <div style={{ color: "#facc15", fontSize: 13 }}>POENG</div>
                  <div style={{ color: "#fff", fontSize: 26, fontWeight: "bold" }}>{score}</div>
                </div>
              </div>

              {/* ── Instructions ── */}
              {showInstructions && (
                <div style={{ position: "absolute", right: 18, top: 18, color: "#fff", maxWidth: 220, background: "rgba(0,0,0,0.55)", padding: 12, borderRadius: 10, fontSize: 13 }}>
                  <div style={{ fontWeight: "bold", marginBottom: 6 }}>Kontroller</div>
                  <div>↑ gass &nbsp; ↓ brems</div>
                  <div>← → styr</div>
                  <div>P pause</div>
                  <div style={{ marginTop: 8, color: "#facc15", fontSize: 12 }}>
                    Stopp før den hvite linjen når lyset er RØDt. Kjør over når det er GRØNt.
                  </div>
                </div>
              )}

              {/* ── Paused overlay ── */}
              {paused && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto" }}>
                  <div style={{ background: "rgba(0,0,0,0.85)", color: "#fff", padding: 24, borderRadius: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: "bold", marginBottom: 8 }}>PAUSE</div>
                    <div style={{ color: "#aaa" }}>Trykk P for å fortsette</div>
                  </div>
                </div>
              )}

              {/* ── Failed overlay ── */}
              {status === "failed" && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto" }}>
                  <div style={{ background: "rgba(0,0,0,0.82)", color: "#fff", padding: 28, borderRadius: 14, textAlign: "center", minWidth: 260 }}>
                    <div style={{ fontSize: 36 }}>🚨</div>
                    <div style={{ fontSize: 24, fontWeight: "bold", color: "#ef4444", marginBottom: 8 }}>FEIL — Rødt lys!</div>
                    <div style={{ color: "#ccc", marginBottom: 6 }}>Du kjørte over på rødt.</div>
                    <div style={{ color: "#888", fontSize: 12, marginBottom: 14 }}>Resetter automatisk…</div>
                    <button onClick={reset} style={{ padding: "9px 18px", background: "#ef4444", color: "#fff", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold" }}>
                      Prøv igjen
                    </button>
                  </div>
                </div>
              )}

              {/* ── Passed overlay ── */}
              {status === "passed" && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto" }}>
                  <div style={{ background: "rgba(0,0,0,0.82)", color: "#fff", padding: 28, borderRadius: 14, textAlign: "center", minWidth: 260 }}>
                    <div style={{ fontSize: 36 }}>✅</div>
                    <div style={{ fontSize: 24, fontWeight: "bold", color: "#22c55e", marginBottom: 8 }}>Bra kjørt!</div>
                    <div style={{ color: "#ccc", marginBottom: 4 }}>Du stoppet og kjørte riktig.</div>
                    <div style={{ color: "#facc15", fontSize: 18, marginBottom: 6 }}>Poeng: {score}</div>
                    <div style={{ color: "#888", fontSize: 12, marginBottom: 14 }}>Resetter automatisk…</div>
                    <button onClick={reset} style={{ padding: "9px 18px", background: "#22c55e", color: "#fff", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold" }}>
                      Spill igjen
                    </button>
                  </div>
                </div>
              )}

            </div>
          </Html>

        </Physics>
      </Canvas>
    </div>
  );
}
