/**
 * SpaceVision 3D hall (lazy-loaded). frameloop="demand": frames are requested only by camera
 * transitions, OrbitControls changes (including the idle auto-rotation, paused when off-screen or
 * when reduced motion is preferred) and state changes. No network calls happen per frame.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { STATUSES, STATUS_META, hallOpenings, wallSegments, type Booth, type BoothGeo, type BoothStatus, type HallGeometry, type Opening, type Pt, type ViewMode, type WallSegment } from './model';
import { useInView } from './webgl';

export interface SceneText {
  status: Record<BoothStatus, string>;
  exit: string;
  entrance: (o: Opening) => string;
  sceneLabel: string;
  controls: string;
  orbitLeft: string;
  orbitRight: string;
  lookLeft: string;
  lookRight: string;
  zoomIn: string;
  zoomOut: string;
  reset: string;
}

export interface HallSceneProps {
  geometry: HallGeometry;
  booths: Booth[];
  geo: Map<string, BoothGeo>;
  selected: string | null;
  pinned: string[];
  recommended: Map<string, number>;
  mode: ViewMode;
  /** Bump to replay the current camera move (e.g. "reset view"). */
  nonce: number;
  reducedMotion: boolean;
  text: SceneText;
  onSelect: (code: string) => void;
  onContextLost: () => void;
  onReset: () => void;
}

const WALL_H = 3.2;
const WALL_T = 0.3;
const EYE_HEIGHT = 1.65;
const DEG = Math.PI / 180;

// ───────────────────────── shared resources (one geometry, one material per status) ─────────────────────────
interface Res {
  box: THREE.BoxGeometry;
  tile: Record<BoothStatus, THREE.MeshStandardMaterial>;
  fascia: Record<BoothStatus, THREE.MeshStandardMaterial>;
  panel: THREE.MeshStandardMaterial;
  counter: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  aisle: THREE.MeshStandardMaterial;
  aisleLine: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  exitSign: THREE.MeshStandardMaterial;
  frameSel: THREE.MeshBasicMaterial;
  framePin: THREE.MeshBasicMaterial;
  frameHover: THREE.MeshBasicMaterial;
}

function createResources(): Res {
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.04, ...extra });
  const perStatus = (make: (s: BoothStatus) => THREE.MeshStandardMaterial) => Object.fromEntries(STATUSES.map((s) => [s, make(s)])) as Record<BoothStatus, THREE.MeshStandardMaterial>;
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    tile: perStatus((s) => std(STATUS_META[s].color, { roughness: 0.95 })),
    fascia: perStatus((s) => std(STATUS_META[s].color, { emissive: STATUS_META[s].color, emissiveIntensity: 0.3 })),
    panel: std('#d9d0c1'),
    counter: std('#3d3644'),
    wall: std('#2e2934'),
    aisle: std('#2b2631', { roughness: 1 }),
    aisleLine: std('#6f5c33', { roughness: 1 }),
    gold: std('#d4a64a', { metalness: 0.3, roughness: 0.5, emissive: '#d4a64a', emissiveIntensity: 0.15 }),
    exitSign: std('#1f8a4c', { emissive: '#2fbf71', emissiveIntensity: 0.9 }),
    frameSel: new THREE.MeshBasicMaterial({ color: '#e8c77c' }),
    framePin: new THREE.MeshBasicMaterial({ color: '#7aa8d8' }),
    frameHover: new THREE.MeshBasicMaterial({ color: '#f3ead8', transparent: true, opacity: 0.55 }),
  };
}

function disposeResources(r: Res) {
  r.box.dispose();
  const mats: THREE.Material[] = [...Object.values(r.tile), ...Object.values(r.fascia), r.panel, r.counter, r.wall, r.aisle, r.aisleLine, r.gold, r.exitSign, r.frameSel, r.framePin, r.frameHover];
  for (const m of mats) m.dispose();
}

// ───────────────────────── camera goals ─────────────────────────
interface Goal {
  mode: ViewMode;
  pos: THREE.Vector3;
  /** Where the camera looks during the transition. */
  look: THREE.Vector3;
  /** OrbitControls target after arrival (a point just in front of the eye for the look-around mode). */
  pivot: THREE.Vector3;
  fov: number;
  azimuth: [number, number] | null;
}

function overviewGoal(hall: HallGeometry['hall'], aspect: number): Goal {
  const fov = 45;
  const elev = (aspect < 1 ? 62 : 50) * DEG;
  const mid = hall.depth / 2;
  const cam = new THREE.PerspectiveCamera(fov, Math.max(0.3, aspect), 0.1, 1000);
  const pad = 1.2;
  const corners: THREE.Vector3[] = [];
  for (const x of [-hall.width / 2 - pad, hall.width / 2 + pad]) for (const y of [0, WALL_H]) for (const z of [-pad, hall.depth + pad]) corners.push(new THREE.Vector3(x, y, z));
  const v = new THREE.Vector3();
  const place = (d: number) => {
    cam.position.set(0, d * Math.sin(elev), mid + d * Math.cos(elev));
    cam.lookAt(0, 0, mid);
    cam.updateMatrixWorld(true);
  };
  const fits = (d: number) => {
    place(d);
    return corners.every((p) => {
      v.copy(p).project(cam);
      return v.z > -1 && v.z < 1 && Math.abs(v.x) <= 0.95 && Math.abs(v.y) <= 0.9;
    });
  };
  let lo = 8;
  let hi = 240;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (fits(m)) hi = m;
    else lo = m;
  }
  place(hi);
  const look = new THREE.Vector3(0, 0, mid);
  return { mode: 'overview', pos: cam.position.clone(), look, pivot: look.clone(), fov, azimuth: null };
}

function boothGoal(b: Booth, g: BoothGeo): Goal {
  const look = new THREE.Vector3(b.x, 0.9, b.z);
  const toCentre = b.x > 0 ? -1 : 1; // slight 3/4 view, offset toward the hall's middle
  const pos = new THREE.Vector3(b.x + toCentre * 3.2 + g.facing.x * 9, 8.5, b.z + g.facing.z * 9);
  return { mode: 'booth', pos, look, pivot: look.clone(), fov: 45, azimuth: null };
}

function eyeGoal(b: Booth, g: BoothGeo): Goal {
  const f = g.facing;
  // standing just inside the open front, looking out along the facing direction
  const eye = new THREE.Vector3(b.x + f.x * (b.width / 2 - 0.35), EYE_HEIGHT, b.z + f.z * (b.depth / 2 - 0.35));
  const dir = new THREE.Vector3(f.x, -0.07, f.z).normalize();
  const look = eye.clone().addScaledVector(dir, 6);
  const pivot = eye.clone().addScaledVector(dir, 0.08);
  const centre = Math.atan2(-dir.x, -dir.z);
  return { mode: 'eye', pos: eye, look, pivot, fov: 62, azimuth: [centre - 1.25, centre + 1.25] };
}

function configureControls(c: OrbitControlsImpl, goal: Goal) {
  const eye = goal.mode === 'eye';
  c.enableZoom = !eye;
  c.enablePan = !eye;
  // drag-the-world feel for the standing look-around
  c.reverseOrbit = eye;
  c.rotateSpeed = eye ? 0.4 : 0.75;
  c.minDistance = eye ? 0 : 4;
  c.maxDistance = eye ? Infinity : 160;
  c.minPolarAngle = eye ? Math.PI / 2 - 0.6 : 0.08;
  c.maxPolarAngle = eye ? Math.PI / 2 + 0.3 : 1.4;
  c.minAzimuthAngle = goal.azimuth ? goal.azimuth[0] : -Infinity;
  c.maxAzimuthAngle = goal.azimuth ? goal.azimuth[1] : Infinity;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Anim {
  from: THREE.Vector3;
  fromLook: THREE.Vector3;
  fromFov: number;
  goal: Goal;
  t: number;
  dur: number;
  lift: number;
  /** false until the first frame: in demand mode that frame's delta spans the idle time. */
  ticked: boolean;
}

function CameraRig({
  goalKey,
  makeGoal,
  reducedMotion,
  controlsRef,
  interactedRef,
  onAnimating,
}: {
  goalKey: string;
  makeGoal: (aspect: number) => Goal;
  reducedMotion: boolean;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  interactedRef: MutableRefObject<boolean>;
  onAnimating: (v: boolean) => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const anim = useRef<Anim | null>(null);
  const placed = useRef(false);
  const lastGoal = useRef<Goal | null>(null);
  const makeRef = useRef(makeGoal);
  makeRef.current = makeGoal;
  const aspect = size.width / Math.max(1, size.height);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  const arrive = useCallback(
    (c: OrbitControlsImpl, goal: Goal) => {
      configureControls(c, goal);
      c.target.copy(goal.pivot);
      c.enabled = true;
      c.update();
      lastGoal.current = goal;
      invalidate();
    },
    [invalidate],
  );

  const jump = useCallback(
    (c: OrbitControlsImpl, goal: Goal) => {
      camera.position.copy(goal.pos);
      camera.fov = goal.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(goal.look);
      arrive(c, goal);
    },
    [camera, arrive],
  );

  useLayoutEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const goal = makeRef.current(aspectRef.current);
    if (!anim.current && c.enabled) {
      // settle any leftover inertia so it cannot drift the camera after arrival
      const damping = c.enableDamping;
      c.enableDamping = false;
      c.update();
      c.enableDamping = damping;
    }
    c.enabled = false;
    const from = camera.position.clone();
    const dist = from.distanceTo(goal.pos);
    const alreadyThere = dist < 0.01 && Math.min(c.target.distanceTo(goal.look), c.target.distanceTo(goal.pivot)) < 0.01 && Math.abs(camera.fov - goal.fov) < 0.01;
    if (reducedMotion || !placed.current || alreadyThere) {
      placed.current = true;
      anim.current = null;
      onAnimating(false);
      jump(c, goal);
      return;
    }
    anim.current = {
      from,
      fromLook: c.target.clone(),
      fromFov: camera.fov,
      goal,
      t: 0,
      dur: Math.min(1.5, Math.max(0.8, 0.7 + dist / 60)),
      // hop over booth walls when moving between two low (eye-level) positions
      lift: from.y < 4 && goal.pos.y < 4 ? 6 : 0,
      ticked: false,
    };
    onAnimating(true);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalKey]);

  // keep the untouched overview framed when the canvas is resized (e.g. phone rotation)
  useEffect(() => {
    const c = controlsRef.current;
    if (!c || !placed.current || anim.current || interactedRef.current || lastGoal.current?.mode !== 'overview') return;
    c.enabled = false;
    jump(c, makeRef.current(aspect));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(aspect * 20)]);

  useFrame((_, dt) => {
    const a = anim.current;
    const c = controlsRef.current;
    if (!a || !c) return;
    // real frame time keeps the move ~dur long on slow GPUs; only the first (post-idle) delta is clamped
    a.t = Math.min(1, a.t + Math.min(dt, a.ticked ? 0.25 : 1 / 60) / a.dur);
    a.ticked = true;
    const k = easeInOut(a.t);
    camera.position.lerpVectors(a.from, a.goal.pos, k);
    camera.position.y += a.lift * 4 * k * (1 - k);
    c.target.lerpVectors(a.fromLook, a.goal.look, k);
    camera.fov = a.fromFov + (a.goal.fov - a.fromFov) * k;
    camera.updateProjectionMatrix();
    camera.lookAt(c.target);
    if (a.t >= 1) {
      anim.current = null;
      arrive(c, a.goal);
      onAnimating(false);
    } else invalidate();
  });

  return null;
}

/** Losing the GL context (GPU reset, too many contexts…) hands control back to the page → 2D plan. */
function ContextLossWatcher({ onLost }: { onLost: () => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const handler = (e: Event) => {
      e.preventDefault();
      onLost();
    };
    canvas.addEventListener('webglcontextlost', handler);
    return () => canvas.removeEventListener('webglcontextlost', handler);
  }, [gl, onLost]);
  return null;
}

// ───────────────────────── hall shell ─────────────────────────
function inwardOf(side: Opening['side']): Pt {
  return side === 'back' ? { x: 0, z: 1 } : side === 'front' ? { x: 0, z: -1 } : side === 'left' ? { x: 1, z: 0 } : { x: -1, z: 0 };
}

function wallPoint(side: Opening['side'], along: number, hall: HallGeometry['hall']): Pt {
  const hw = hall.width / 2;
  if (side === 'back') return { x: along, z: -WALL_T / 2 };
  if (side === 'front') return { x: along, z: hall.depth + WALL_T / 2 };
  if (side === 'left') return { x: -hw - WALL_T / 2, z: along };
  return { x: hw + WALL_T / 2, z: along };
}

function WallPiece({ s, hall, res }: { s: WallSegment; hall: HallGeometry['hall']; res: Res }) {
  const len = s.to - s.from;
  const p = wallPoint(s.side, (s.from + s.to) / 2, hall);
  const alongX = s.side === 'back' || s.side === 'front';
  return <mesh geometry={res.box} material={res.wall} position={[p.x, WALL_H / 2, p.z]} scale={alongX ? [len, WALL_H, WALL_T] : [WALL_T, WALL_H, len]} />;
}

/** Point just inside a door opening, `inset` metres into the hall at height `y`. */
function doorPoint(o: Opening, hall: HallGeometry['hall'], inset: number, y: number): [number, number, number] {
  const p = wallPoint(o.side, o.center, hall);
  const n = inwardOf(o.side);
  return [p.x + n.x * inset, y, p.z + n.z * inset];
}

function Doorway({ o, hall, res }: { o: Opening; hall: HallGeometry['hall']; res: Res }) {
  const p = wallPoint(o.side, o.center, hall);
  const yaw = o.side === 'back' || o.side === 'front' ? 0 : Math.PI / 2;
  const entrance = o.kind === 'entrance';
  return (
    <group>
      {/* lintel above the opening */}
      <mesh geometry={res.box} material={entrance && o.main ? res.gold : res.wall} position={[p.x, WALL_H - 0.35, p.z]} rotation={[0, yaw, 0]} scale={[o.width, 0.7, WALL_T]} />
      {entrance ? (
        <mesh geometry={res.box} material={o.main ? res.gold : res.panel} position={doorPoint(o, hall, WALL_T / 2 + 0.7, 0.012)} rotation={[0, yaw, 0]} scale={[Math.max(1, o.width - 0.4), 0.024, 1.4]} />
      ) : (
        <mesh geometry={res.box} material={res.exitSign} position={doorPoint(o, hall, WALL_T / 2 + 0.04, WALL_H - 0.35)} rotation={[0, yaw, 0]} scale={[1.1, 0.34, 0.06]} />
      )}
    </group>
  );
}

// ───────────────────────── labels ─────────────────────────
// One DOM layer in this React tree, positioned from a single useFrame (no per-label React roots).
interface LabelAnchor {
  key: string;
  pos: THREE.Vector3;
}

function LabelProjector({ anchors, nodes }: { anchors: LabelAnchor[]; nodes: MutableRefObject<Map<string, HTMLElement>> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    for (const a of anchors) {
      const el = nodes.current.get(a.key);
      if (!el) continue;
      v.copy(a.pos).applyMatrix4(camera.matrixWorldInverse);
      const behind = v.z > -0.1;
      v.copy(a.pos).project(camera);
      if (behind || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
        if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.visibility = 'visible';
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.zIndex = String(Math.max(1, 2000 - Math.round(camera.position.distanceTo(a.pos) * 10)));
    }
  });
  return null;
}

const BoothTag = memo(function BoothTag({ code, status, word, selected, hovered, pin, rec, nodeRef }: { code: string; status: BoothStatus; word: string; selected: boolean; hovered: boolean; pin: number; rec: number; nodeRef: (el: HTMLElement | null) => void }) {
  const meta = STATUS_META[status];
  return (
    <span ref={nodeRef} className={`sv-tag${selected ? ' is-sel' : hovered ? ' is-hover' : ''}`} style={{ '--sv-c': meta.color } as CSSProperties}>
      <b>{code}</b>
      <span className="ic">{meta.icon}</span>
      {(selected || hovered || status !== 'available') && <span className="word">{word}</span>}
      {rec > 0 && <span className="rec">★{rec}</span>}
      {pin >= 0 && <span className="pin">{pin + 1}</span>}
    </span>
  );
});

function Aisle({ a, res }: { a: HallGeometry['mainAisles'][number]; res: Res }) {
  const dx = a.to.x - a.from.x;
  const dz = a.to.z - a.from.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return null;
  return (
    <group position={[(a.from.x + a.to.x) / 2, 0, (a.from.z + a.to.z) / 2]} rotation={[0, Math.atan2(dx, dz), 0]}>
      <mesh geometry={res.box} material={res.aisle} position={[0, 0.006, 0]} scale={[a.width, 0.012, len]} />
      <mesh geometry={res.box} material={res.aisleLine} position={[0, 0.009, 0]} scale={[0.1, 0.012, len]} />
    </group>
  );
}


const HallShell = memo(function HallShell({ geometry, openings, res }: { geometry: HallGeometry; openings: Opening[]; res: Res }) {
  const { hall } = geometry;
  const segments = useMemo(() => wallSegments(geometry, openings), [geometry, openings]);
  const grid = useMemo(() => {
    const pts: number[] = [];
    const hw = hall.width / 2;
    for (let x = -hw; x <= hw + 1e-6; x += 2) pts.push(x, 0.004, 0, x, 0.004, hall.depth);
    for (let z = 0; z <= hall.depth + 1e-6; z += 2) pts.push(-hw, 0.004, z, hw, 0.004, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [hall.width, hall.depth]);
  useEffect(() => () => grid.dispose(), [grid]);
  const hw = hall.width / 2;
  const corners: [number, number][] = [
    [-hw - WALL_T / 2, -WALL_T / 2],
    [hw + WALL_T / 2, -WALL_T / 2],
    [-hw - WALL_T / 2, hall.depth + WALL_T / 2],
    [hw + WALL_T / 2, hall.depth + WALL_T / 2],
  ];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, hall.depth / 2]}>
        <planeGeometry args={[hall.width + 90, hall.depth + 90]} />
        <meshStandardMaterial color="#110f13" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, hall.depth / 2]}>
        <planeGeometry args={[hall.width, hall.depth]} />
        <meshStandardMaterial color="#1f1b23" roughness={0.95} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#3a3341" transparent opacity={0.65} />
      </lineSegments>
      {geometry.mainAisles.map((a, i) => (
        <Aisle key={a.id || i} a={a} res={res} />
      ))}
      {segments.map((s, i) => (
        <WallPiece key={`${s.side}-${i}`} s={s} hall={hall} res={res} />
      ))}
      {corners.map(([x, z], i) => (
        <mesh key={`c${i}`} geometry={res.box} material={res.wall} position={[x, WALL_H / 2, z]} scale={[WALL_T, WALL_H, WALL_T]} />
      ))}
      {openings.map((o) => (
        <Doorway key={`${o.kind}-${o.id}`} o={o} hall={hall} res={res} />
      ))}
    </group>
  );
});

// ───────────────────────── booths ─────────────────────────
const PANEL_T = 0.08;
/** z offset (booth-local) of the back panel; the label floats above it. */
const backZOf = (b: Booth, g: BoothGeo) => -(g.facing.z >= 0 ? 1 : -1) * (b.depth / 2 - PANEL_T / 2);

function Frame({ w, d, box, material }: { w: number; d: number; box: THREE.BufferGeometry; material: THREE.Material }) {
  const m = 0.16;
  const th = 0.12;
  const y = 0.075;
  const h = 0.03;
  return (
    <group>
      <mesh geometry={box} material={material} position={[0, y, -(d / 2 + m)]} scale={[w + 2 * m + th, h, th]} />
      <mesh geometry={box} material={material} position={[0, y, d / 2 + m]} scale={[w + 2 * m + th, h, th]} />
      <mesh geometry={box} material={material} position={[-(w / 2 + m), y, 0]} scale={[th, h, d + 2 * m]} />
      <mesh geometry={box} material={material} position={[w / 2 + m, y, 0]} scale={[th, h, d + 2 * m]} />
    </group>
  );
}

interface BoothModelProps {
  b: Booth;
  g: BoothGeo;
  res: Res;
  selected: boolean;
  hovered: boolean;
  pinned: boolean;
  onSelect: (code: string) => void;
  onHover: (code: string | null) => void;
}

const BoothModel = memo(function BoothModel({ b, g, res, selected, hovered, pinned, onSelect, onHover }: BoothModelProps) {
  const f = g.facing.z >= 0 ? 1 : -1;
  const w = b.width;
  const d = b.depth;
  const backZ = backZOf(b, g);
  const frameMat = selected ? res.frameSel : pinned ? res.framePin : hovered ? res.frameHover : null;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // a drag of the camera, not a tap
    e.stopPropagation();
    onSelect(b.code);
  };
  return (
    <group
      position={[b.x, 0, b.z]}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(b.code);
      }}
      onPointerOut={() => onHover(null)}
    >
      <mesh geometry={res.box} material={res.tile[b.status]} position={[0, 0.03, 0]} scale={[w - 0.1, 0.06, d - 0.1]} />
      <mesh geometry={res.box} material={res.panel} position={[0, 1.2, backZ]} scale={[w, 2.4, PANEL_T]} />
      <mesh geometry={res.box} material={res.fascia[b.status]} position={[0, 2.58, backZ]} scale={[w + 0.02, 0.36, PANEL_T + 0.04]} />
      {g.closedLeft && <mesh geometry={res.box} material={res.panel} position={[-(w / 2 - PANEL_T / 2), 0.55, 0]} scale={[PANEL_T, 1.1, d]} />}
      {g.closedRight && <mesh geometry={res.box} material={res.panel} position={[w / 2 - PANEL_T / 2, 0.55, 0]} scale={[PANEL_T, 1.1, d]} />}
      {b.status !== 'unavailable' && <mesh geometry={res.box} material={res.counter} position={[-w / 2 + 0.95, 0.5, f * (d / 2 - 0.45)]} scale={[1.3, 1, 0.5]} />}
      {frameMat && <Frame w={w} d={d} box={res.box} material={frameMat} />}
    </group>
  );
});

function SceneContent({
  geometry,
  openings,
  booths,
  geo,
  selected,
  pinned,
  hover,
  onHover,
  onSelect,
}: {
  geometry: HallGeometry;
  openings: Opening[];
  booths: Booth[];
  geo: Map<string, BoothGeo>;
  selected: string | null;
  pinned: string[];
  hover: string | null;
  onHover: (code: string | null) => void;
  onSelect: (code: string) => void;
}) {
  const res = useMemo(createResources, []);
  useEffect(() => () => disposeResources(res), [res]);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.domElement.style.cursor = hover ? 'pointer' : '';
  }, [gl, hover]);
  return (
    <>
      <HallShell geometry={geometry} openings={openings} res={res} />
      {booths.map((b) => {
        const g = geo.get(b.code);
        if (!g) return null;
        return <BoothModel key={b.code} b={b} g={g} res={res} selected={selected === b.code} hovered={hover === b.code} pinned={pinned.includes(b.code)} onSelect={onSelect} onHover={onHover} />;
      })}
    </>
  );
}

// ───────────────────────── icons ─────────────────────────
function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
const ICONS = {
  orbitLeft: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  orbitRight: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  lookLeft: 'M15 6l-6 6 6 6',
  lookRight: 'M9 6l6 6-6 6',
  zoomIn: 'M12 5v14M5 12h14',
  zoomOut: 'M5 12h14',
  reset: 'M3 11l9-7 9 7M5 10v10h14V10',
};

// ───────────────────────── root ─────────────────────────
export default function HallScene(props: HallSceneProps) {
  const { geometry, booths, geo, selected, pinned, recommended, mode, nonce, reducedMotion, text, onSelect, onContextLost, onReset } = props;
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const labelNodes = useRef(new Map<string, HTMLElement>());
  const inView = useInView(wrapRef);
  const [animating, setAnimating] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const interactedRef = useRef(false);
  interactedRef.current = interacted;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (mode !== 'overview') setInteracted(true);
  }, [mode]);

  const openings = useMemo(() => hallOpenings(geometry), [geometry]);
  const anchors = useMemo<LabelAnchor[]>(() => {
    const out: LabelAnchor[] = [];
    // over the booth centre (not the back panel): back-to-back booths share a back wall
    for (const b of booths) out.push({ key: `b:${b.code}`, pos: new THREE.Vector3(b.x, 2.9, b.z) });
    for (const o of openings) out.push({ key: `o:${o.kind}:${o.id}`, pos: new THREE.Vector3(...doorPoint(o, geometry.hall, o.kind === 'entrance' ? 1.4 : 0.9, o.kind === 'entrance' ? 4.3 : 3.7)) });
    return out;
  }, [booths, openings, geometry.hall]);
  // stable ref callbacks so memoised tags do not re-render on every parent render
  const refCallbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const nodeRef = (key: string) => {
    let cb = refCallbacks.current.get(key);
    if (!cb) {
      cb = (el) => {
        if (el) labelNodes.current.set(key, el);
        else labelNodes.current.delete(key);
      };
      refCallbacks.current.set(key, cb);
    }
    return cb;
  };

  const booth = selected ? booths.find((b) => b.code === selected) ?? null : null;
  const boothGeo = booth ? geo.get(booth.code) ?? null : null;
  const effectiveMode: ViewMode = booth && boothGeo ? mode : 'overview';
  const goalKey = `${effectiveMode}|${effectiveMode === 'overview' ? '' : booth?.code}|${nonce}`;
  const makeGoal = useCallback(
    (aspect: number): Goal => {
      if (effectiveMode === 'eye' && booth && boothGeo) return eyeGoal(booth, boothGeo);
      if (effectiveMode === 'booth' && booth && boothGeo) return boothGoal(booth, boothGeo);
      return overviewGoal(geometry.hall, aspect);
    },
    [effectiveMode, booth, boothGeo, geometry.hall],
  );

  const autoRotate = effectiveMode === 'overview' && !interacted && !reducedMotion && !animating && inView;

  const onStart = useCallback(() => setInteracted(true), []);
  // keep panning inside the hall
  const onChange = useCallback(() => {
    const c = controlsRef.current;
    if (!c || !c.enabled || modeRef.current === 'eye') return;
    const hw = geometry.hall.width / 2 + 3;
    const t = c.target;
    const x = Math.min(hw, Math.max(-hw, t.x));
    const y = Math.min(5, Math.max(0, t.y));
    const z = Math.min(geometry.hall.depth + 3, Math.max(-3, t.z));
    if (x !== t.x || y !== t.y || z !== t.z) {
      c.object.position.add(new THREE.Vector3(x - t.x, y - t.y, z - t.z));
      t.set(x, y, z);
    }
  }, [geometry.hall.width, geometry.hall.depth]);

  const act = (fn: (c: OrbitControlsImpl) => void) => () => {
    const c = controlsRef.current;
    if (!c || !c.enabled) return;
    setInteracted(true);
    const damping = c.enableDamping;
    if (reducedMotion) c.enableDamping = false;
    fn(c);
    c.enableDamping = damping;
  };
  const eye = effectiveMode === 'eye';
  const step = Math.PI / 8;

  return (
    <div className="sv-canvas-wrap" ref={wrapRef}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        flat
        camera={{ fov: 45, near: 0.1, far: 600, position: [0, 32, 52] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        role="img"
        aria-label={text.sceneLabel}
      >
        <color attach="background" args={['#141117']} />
        <hemisphereLight args={['#fff4e2', '#2a2430', 1.1]} />
        <directionalLight position={[14, 30, 24]} intensity={1.5} color="#fff3df" />
        <directionalLight position={[-20, 16, -12]} intensity={0.45} color="#9fbbe0" />
        <SceneContent geometry={geometry} openings={openings} booths={booths} geo={geo} selected={selected} pinned={pinned} hover={hover} onHover={setHover} onSelect={onSelect} />
        <OrbitControls ref={controlsRef} makeDefault enableDamping={!reducedMotion} dampingFactor={0.09} autoRotate={autoRotate} autoRotateSpeed={0.4} onStart={onStart} onChange={onChange} />
        <CameraRig goalKey={goalKey} makeGoal={makeGoal} reducedMotion={reducedMotion} controlsRef={controlsRef} interactedRef={interactedRef} onAnimating={setAnimating} />
        <LabelProjector anchors={anchors} nodes={labelNodes} />
        <ContextLossWatcher onLost={onContextLost} />
      </Canvas>

      <div className="sv-label-layer" aria-hidden="true">
        {booths.map((b) => (
          <BoothTag
            key={b.code}
            code={b.code}
            status={b.status}
            word={text.status[b.status]}
            selected={selected === b.code}
            hovered={hover === b.code}
            pin={pinned.indexOf(b.code)}
            rec={recommended.get(b.code) ?? 0}
            nodeRef={nodeRef(`b:${b.code}`)}
          />
        ))}
        {openings.map((o) => (
          <span key={`${o.kind}-${o.id}`} ref={nodeRef(`o:${o.kind}:${o.id}`)} className={`sv-sign ${o.kind === 'entrance' ? `entrance${o.main ? '' : ' minor'}` : 'exit'}`}>
            {o.kind === 'entrance' ? text.entrance(o) : text.exit}
          </span>
        ))}
      </div>

      <div className="sv-ctrls" role="group" aria-label={text.controls}>
        <button type="button" className="sv-ctrl" disabled={animating} onClick={act((c) => c.setAzimuthalAngle(c.getAzimuthalAngle() + (eye ? step : -step)))} aria-label={eye ? text.lookLeft : text.orbitLeft} title={eye ? text.lookLeft : text.orbitLeft}>
          <Icon d={eye ? ICONS.lookLeft : ICONS.orbitLeft} />
        </button>
        <button type="button" className="sv-ctrl" disabled={animating} onClick={act((c) => c.setAzimuthalAngle(c.getAzimuthalAngle() - (eye ? step : -step)))} aria-label={eye ? text.lookRight : text.orbitRight} title={eye ? text.lookRight : text.orbitRight}>
          <Icon d={eye ? ICONS.lookRight : ICONS.orbitRight} />
        </button>
        {!eye && (
          <>
            <button type="button" className="sv-ctrl" disabled={animating} onClick={act((c) => c.dollyIn(0.8))} aria-label={text.zoomIn} title={text.zoomIn}>
              <Icon d={ICONS.zoomIn} />
            </button>
            <button type="button" className="sv-ctrl" disabled={animating} onClick={act((c) => c.dollyOut(0.8))} aria-label={text.zoomOut} title={text.zoomOut}>
              <Icon d={ICONS.zoomOut} />
            </button>
          </>
        )}
        <button
          type="button"
          className="sv-ctrl"
          onClick={() => {
            setInteracted(true);
            onReset();
          }}
          aria-label={text.reset}
          title={text.reset}
        >
          <Icon d={ICONS.reset} />
        </button>
      </div>
    </div>
  );
}
