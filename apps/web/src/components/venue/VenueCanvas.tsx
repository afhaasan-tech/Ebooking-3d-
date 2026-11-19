import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { VenueContent, type SeatInstancesProps } from './VenueModel';
import type { SeatIndex, SeatMap, SeatRow, Vec3 } from './useSeatMap';

export type ViewMode = { level: 'overview' } | { level: 'section'; section: string } | { level: 'seat'; seatId: string };

export interface CameraInfo {
  yaw: number; // radians, 0 = looking toward -z (the stage)
  position: Vec3;
}

interface Goal {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  level: ViewMode['level'];
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function goalFor(mode: ViewMode, map: SeatMap, index: SeatIndex, seatFov: number, aspect = 1.6): Goal {
  const f = map.performance.geometry.stage.focus;
  const focus = new THREE.Vector3(f.x, f.y, f.z);
  if (mode.level === 'seat') {
    const s = index.byId.get(mode.seatId)!;
    return { position: new THREE.Vector3(s.x, s.y + s.eye_height, s.z), target: focus, fov: seatFov, level: 'seat' };
  }
  if (mode.level === 'section') {
    const c = index.sectionCentroid.get(mode.section)!;
    const dir = new THREE.Vector3(c.x - f.x, 0, c.z - f.z).normalize();
    const pos = new THREE.Vector3(c.x, c.y, c.z).addScaledVector(dir, 7.5).add(new THREE.Vector3(0, 6.5, 0));
    return { position: pos, target: new THREE.Vector3(c.x, c.y + 0.5, c.z - 0.5), fov: 50, level: 'section' };
  }
  // portrait screens: higher, more top-down camera so the seating bowl fills the narrow frame
  if (aspect < 0.9) return { position: new THREE.Vector3(0, 46, 30), target: new THREE.Vector3(0, 0, 7), fov: 55, level: 'overview' };
  return { position: new THREE.Vector3(0, 15.5, 31), target: new THREE.Vector3(0, 1.5, 7), fov: 50, level: 'overview' };
}

function CameraRig({ goal, reduced, autoRotate, tour, onCamera, controlsRef, onArrive }: { goal: Goal; reduced: boolean; autoRotate: boolean; tour: boolean; onCamera?: (c: CameraInfo) => void; controlsRef: React.MutableRefObject<OrbitControlsImpl | null>; onArrive?: () => void }) {
  const { camera, invalidate } = useThree();
  const anim = useRef<{ from: THREE.Vector3; fromT: THREE.Vector3; fromFov: number; t: number } | null>(null);
  const lastEmit = useRef(0);
  const cam = camera as THREE.PerspectiveCamera;

  useEffect(() => {
    const ctr = controlsRef.current;
    const fromT = ctr ? ctr.target.clone() : goal.target.clone();
    anim.current = { from: camera.position.clone(), fromT, fromFov: cam.fov, t: reduced ? 1 : 0 };
    if (ctr) ctr.enabled = false;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal]);

  useFrame((state, dt) => {
    const ctr = controlsRef.current;
    const a = anim.current;
    if (a) {
      // clamp: in on-demand mode the first frame after idling can carry a large delta
      a.t = Math.min(1, a.t + Math.min(dt, 1 / 30) / 1.15);
      const k = ease(a.t);
      const lookTarget = new THREE.Vector3().lerpVectors(a.fromT, goal.target, k);
      camera.position.lerpVectors(a.from, goal.position, k);
      cam.fov = a.fromFov + (goal.fov - a.fromFov) * k;
      cam.updateProjectionMatrix();
      if (ctr) ctr.target.copy(lookTarget);
      camera.lookAt(lookTarget);
      if (a.t >= 1) {
        anim.current = null;
        if (ctr) {
          if (goal.level === 'seat') {
            // look-around pivot just in front of the eye → rotation without leaving the seat
            const dir = new THREE.Vector3().subVectors(goal.target, goal.position).normalize();
            ctr.target.copy(goal.position).addScaledVector(dir, 0.08);
          } else ctr.target.copy(goal.target);
          ctr.enabled = true;
          ctr.update();
        }
        onArrive?.();
        lastEmit.current = -1; // force a final camera report
      }
    } else if (goal.level === 'seat' && Math.abs(cam.fov - goal.fov) > 0.01) {
      cam.fov += (goal.fov - cam.fov) * Math.min(1, Math.min(dt, 1 / 30) * 10);
      cam.updateProjectionMatrix();
      invalidate();
    }
    if (ctr) {
      ctr.autoRotate = goal.level === 'overview' && (autoRotate || tour) && !anim.current;
      ctr.autoRotateSpeed = tour ? 6 : 0.6;
    }
    // on-demand rendering: keep frames coming only while something is actually moving
    if (anim.current || ctr?.autoRotate) invalidate();
    if (onCamera && (lastEmit.current < 0 || state.clock.elapsedTime - lastEmit.current > 0.15)) {
      lastEmit.current = state.clock.elapsedTime;
      const d = new THREE.Vector3();
      camera.getWorldDirection(d);
      onCamera({ yaw: Math.atan2(d.x, -d.z), position: { x: camera.position.x, y: camera.position.y, z: camera.position.z } });
    }
  });
  return null;
}

/** Simple frame-time monitor: reports sustained low FPS once so the UI can offer 2D / low quality. */
function PerfMonitor({ onSlow }: { onSlow?: () => void }) {
  const acc = useRef({ frames: 0, time: 0, reported: false });
  useFrame((_, dt) => {
    const a = acc.current;
    if (a.reported || !onSlow) return;
    a.frames++;
    a.time += dt;
    if (a.time > 5) {
      if (a.frames / a.time < 18) {
        a.reported = true;
        onSlow();
      }
      a.frames = 0;
      a.time = 0;
    }
  });
  return null;
}

interface Anchor {
  key: string;
  x: number;
  y: number;
  z: number;
}

/** Projects 3D anchors to screen space and moves plain DOM labels (no React re-render per frame). */
function LabelProjector({ anchors, elements }: { anchors: Anchor[]; elements: React.MutableRefObject<Map<string, HTMLElement>> }) {
  const { camera, size, invalidate } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => invalidate(), [anchors, invalidate]);
  useFrame(() => {
    for (const a of anchors) {
      const el = elements.current.get(a.key);
      if (!el) continue;
      v.set(a.x, a.y, a.z).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) continue;
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  });
  return null;
}

function Marker({ seat, color, animate }: { seat: SeatRow; color: string; animate: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current && animate) ref.current.position.y = seat.y + 1.55 + Math.sin(clock.elapsedTime * 3) * 0.08;
  });
  return (
    <mesh ref={ref} position={[seat.x, seat.y + 1.55, seat.z]} rotation={[Math.PI, 0, 0]}>
      <coneGeometry args={[0.16, 0.36, 12]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

class CanvasBoundary extends Component<{ fallback: ReactNode; children: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface VenueCanvasProps {
  map: SeatMap;
  index: SeatIndex;
  mode: ViewMode;
  seatFov: number;
  seatProps: SeatInstancesProps;
  hovered: SeatRow | null;
  hoverLabel?: (s: SeatRow) => string;
  markers: { seat: SeatRow; color: string }[];
  quality: 'high' | 'low';
  reduced: boolean;
  tour: boolean;
  sectionLabel: (code: string) => ReactNode;
  onSectionClick: (code: string) => void;
  onCamera?: (c: CameraInfo) => void;
  onSlow?: () => void;
  onFatal: () => void;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  fallback: ReactNode;
}

export function VenueCanvas(p: VenueCanvasProps) {
  const [interacted, setInteracted] = useState(false);
  const [contextKey, setContextKey] = useState(0);
  const [lost, setLost] = useState(false);
  const lostCount = useRef(0);
  const layerRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1.6);
  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => el.clientHeight && setAspect(Math.round((el.clientWidth / el.clientHeight) * 10) / 10));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const goal = useMemo(() => goalFor(p.mode, p.map, p.index, p.seatFov, aspect), [p.mode, p.map, p.index, p.seatFov, aspect]);
  const low = p.quality === 'low';
  // stage animation (performers, LED) only in high quality; otherwise render on demand
  const animate = !p.reduced && !low;
  const labelEls = useRef(new Map<string, HTMLElement>());
  const showSections = p.mode.level !== 'seat';
  const anchors = useMemo(() => {
    const a: Anchor[] = [];
    if (showSections)
      for (const s of p.map.sections) {
        const c = p.index.sectionCentroid.get(s.code)!;
        a.push({ key: `sec:${s.code}`, x: c.x, y: c.y + (p.mode.level === 'section' ? 2.4 : 3.2), z: c.z });
      }
    if (p.hovered && showSections) a.push({ key: 'hover', x: p.hovered.x, y: p.hovered.y + 1.4, z: p.hovered.z });
    return a;
  }, [showSections, p.map, p.index, p.mode, p.hovered]);
  const reg = (key: string) => (el: HTMLElement | null) => {
    if (el) labelEls.current.set(key, el);
    else labelEls.current.delete(key);
  };

  if (lost)
    return (
      <div className="card" role="alert" style={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div className="stack">
          <p>WebGL context lost — العرض ثلاثي الأبعاد توقف مؤقتاً.</p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setLost(false);
              setContextKey((k) => k + 1);
            }}
          >
            ↻ Restart 3D / إعادة تشغيل
          </button>
        </div>
      </div>
    );

  return (
    <CanvasBoundary fallback={p.fallback} onError={p.onFatal}>
      <div ref={layerRef} className="label-layer" aria-hidden={!showSections}>
        {showSections &&
          p.map.sections.map((s) => (
            <button
              key={s.code}
              ref={reg(`sec:${s.code}`)}
              className="badge badge-gold venue-label"
              style={{ opacity: p.mode.level === 'section' && p.mode.section !== s.code ? 0.55 : 1 }}
              onClick={() => p.onSectionClick(s.code)}
            >
              {p.sectionLabel(s.code)}
            </button>
          ))}
        {p.hovered && p.hoverLabel && showSections && (
          <div ref={reg('hover')} className="glass tiny venue-label" style={{ padding: '4px 8px', pointerEvents: 'none', zIndex: 3 }}>
            {p.hoverLabel(p.hovered)}
          </div>
        )}
      </div>
      <Canvas
        key={contextKey}
        dpr={low ? 1 : [1, 2]}
        gl={{ antialias: !low, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
        camera={{ position: [0, 19, 40], fov: 50, near: 0.05, far: 200 }}
        frameloop={animate ? "always" : "demand"}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          const el = gl.domElement;
          el.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            lostCount.current++;
            if (lostCount.current > 2) p.onFatal();
            else setLost(true);
          });
        }}
        onPointerMissed={() => undefined}
        style={{ touchAction: 'none' }}
        aria-label="3D venue"
      >
        <VenueContent map={p.map} seats={p.seatProps} animate={animate} lowDetail={low} />
        {p.markers.map((m) => (
          <Marker key={m.seat.id + m.color} seat={m.seat} color={m.color} animate={animate} />
        ))}
        <LabelProjector anchors={anchors} elements={labelEls} />

        <OrbitControls
          ref={p.controlsRef as any}
          makeDefault
          enablePan={false}
          enableZoom={p.mode.level !== 'seat'}
          enableDamping
          dampingFactor={0.08}
          minDistance={p.mode.level === 'seat' ? 0.05 : 4}
          maxDistance={p.mode.level === 'seat' ? 0.12 : 70}
          maxPolarAngle={p.mode.level === 'seat' ? Math.PI * 0.8 : Math.PI * 0.47}
          minPolarAngle={p.mode.level === 'seat' ? Math.PI * 0.2 : 0.15}
          rotateSpeed={p.mode.level === 'seat' ? -0.35 : 0.6}
          onStart={() => setInteracted(true)}
        />
        <CameraRig goal={goal} reduced={p.reduced} autoRotate={!interacted && !p.reduced} tour={p.tour} onCamera={p.onCamera} controlsRef={p.controlsRef} />
        {animate && <PerfMonitor onSlow={p.onSlow} />}
      </Canvas>
    </CanvasBoundary>
  );
}

/** Up to three seat cameras rendered side-by-side in ONE WebGL context (scissor viewports). */
function MultiView({ seats, focus }: { seats: SeatRow[]; focus: Vec3 }) {
  const { gl, scene, size, invalidate } = useThree();
  const cams = useMemo(() => [0, 1, 2].map(() => new THREE.PerspectiveCamera(58, 1, 0.05, 200)), []);
  useEffect(() => invalidate(), [seats, size, invalidate]);
  useFrame(() => {
    const n = Math.max(1, seats.length);
    const w = Math.floor(size.width / n);
    const h = size.height;
    gl.autoClear = false;
    gl.setScissorTest(true);
    gl.clear();
    seats.forEach((s, i) => {
      const cam = cams[i];
      cam.position.set(s.x, s.y + s.eye_height, s.z);
      cam.lookAt(focus.x, focus.y, focus.z);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      gl.setViewport(i * w, 0, w - 2, h);
      gl.setScissor(i * w, 0, w - 2, h);
      gl.render(scene, cam);
    });
    gl.setScissorTest(false);
  }, 1);
  return null;
}

export function CompareCanvas({ map, seats, seatProps, reduced, onFatal, fallback }: { map: SeatMap; seats: SeatRow[]; seatProps: SeatInstancesProps; reduced: boolean; onFatal: () => void; fallback: ReactNode }) {
  return (
    <CanvasBoundary fallback={fallback} onError={onFatal}>
      <Canvas dpr={1} gl={{ antialias: true }} frameloop="demand" aria-label="Seat comparison previews">
        <VenueContent map={map} seats={{ ...seatProps, onSeatClick: undefined, onSeatHover: undefined }} animate={!reduced} lowDetail />
        <MultiView seats={seats} focus={map.performance.geometry.stage.focus} />
      </Canvas>
    </CanvasBoundary>
  );
}
