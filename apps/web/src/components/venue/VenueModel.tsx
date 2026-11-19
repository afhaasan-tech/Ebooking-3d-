import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Geometry, SeatMap, SeatRow } from './useSeatMap';

export type DisplayState = 'available' | 'held' | 'sold' | 'blocked' | 'focused' | 'basket' | 'mine' | 'highlight' | 'dimmed';

const STATE_COLOR: Record<Exclude<DisplayState, 'available'>, string> = {
  held: '#b9893e',
  sold: '#3b3440',
  blocked: '#1f1b22',
  focused: '#ffe08a',
  basket: '#6fbf8e',
  mine: '#5fb4d6',
  highlight: '#c9a0dc',
  dimmed: '#2c3a33',
};

const FLOOR_ROW_ELEV = (i: number) => Math.round((0.1 * i + 0.015 * i * i) * 1000) / 1000;
const FLOOR_ROWS = 'ABCDEFGHJKLM';

// ───────────────────────────── seats (instanced) ─────────────────────────────
const cushionGeo = new THREE.BoxGeometry(0.5, 0.14, 0.48);
const backGeo = new THREE.BoxGeometry(0.5, 0.56, 0.08);
const tmp = new THREE.Object3D();
const color = new THREE.Color();

export interface SeatInstancesProps {
  seats: SeatRow[];
  stateOf: (s: SeatRow) => DisplayState;
  categoryColor: (s: SeatRow) => string;
  stateVersion: unknown;
  onSeatClick?: (seat: SeatRow, e: ThreeEvent<MouseEvent>) => void;
  onSeatHover?: (seat: SeatRow | null) => void;
}

/** All seats in two draw calls. instanceId → seats[instanceId]. */
export const SeatInstances = memo(function SeatInstances({ seats, stateOf, categoryColor, stateVersion, onSeatClick, onSeatHover }: SeatInstancesProps) {
  const cushions = useRef<THREE.InstancedMesh>(null);
  const backs = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    const c = cushions.current!;
    const b = backs.current!;
    seats.forEach((s, i) => {
      const st = stateOf(s);
      const flat = st === 'sold' || st === 'blocked';
      // cushion
      tmp.position.set(s.x, s.y + 0.42, s.z);
      tmp.rotation.set(0, s.yaw, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      c.setMatrixAt(i, tmp.matrix);
      // backrest (behind the cushion, away from the stage) — folded down when sold/blocked
      const back = new THREE.Vector3(0, 0, -0.26).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
      tmp.position.set(s.x + back.x, s.y + (flat ? 0.55 : 0.75), s.z + back.z);
      tmp.scale.set(1, flat ? 0.35 : 1, 1);
      tmp.updateMatrix();
      b.setMatrixAt(i, tmp.matrix);
      color.set(st === 'available' ? categoryColor(s) : STATE_COLOR[st]);
      c.setColorAt(i, color);
      b.setColorAt(i, color.multiplyScalar(st === 'available' ? 0.85 : 1));
    });
    c.instanceMatrix.needsUpdate = true;
    b.instanceMatrix.needsUpdate = true;
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    c.computeBoundingSphere();
    b.computeBoundingSphere();
    invalidate(); // seat states changed → draw one frame (on-demand rendering)
  }, [seats, stateOf, categoryColor, stateVersion, invalidate]);

  const handle = (e: ThreeEvent<MouseEvent>) => {
    if (e.instanceId == null || !onSeatClick) return;
    e.stopPropagation();
    onSeatClick(seats[e.instanceId], e);
  };
  const hover = (e: ThreeEvent<PointerEvent>) => {
    if (!onSeatHover || e.instanceId == null) return;
    e.stopPropagation();
    onSeatHover(seats[e.instanceId]);
  };

  return (
    <group>
      <instancedMesh ref={cushions} args={[cushionGeo, undefined, seats.length]} onClick={handle} onPointerMove={hover} onPointerOut={() => onSeatHover?.(null)}>
        <meshStandardMaterial roughness={0.7} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={backs} args={[backGeo, undefined, seats.length]} onClick={handle} onPointerMove={hover} onPointerOut={() => onSeatHover?.(null)}>
        <meshStandardMaterial roughness={0.75} />
      </instancedMesh>
    </group>
  );
});

// ───────────────────────────── architecture ─────────────────────────────
const mat = {
  floor: new THREE.MeshStandardMaterial({ color: '#2a2230', roughness: 0.95 }),
  carpet: new THREE.MeshStandardMaterial({ color: '#3a1f2a', roughness: 1, side: THREE.DoubleSide }),
  riser: new THREE.MeshStandardMaterial({ color: '#241c26', roughness: 1, side: THREE.DoubleSide }),
  wall: new THREE.MeshStandardMaterial({ color: '#1d1820', roughness: 0.9, side: THREE.BackSide }),
  wood: new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.6 }),
  gold: new THREE.MeshStandardMaterial({ color: '#b98a3c', metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }),
  truss: new THREE.MeshStandardMaterial({ color: '#3a3a40', metalness: 0.6, roughness: 0.4 }),
  curtain: new THREE.MeshStandardMaterial({ color: '#6e1423', roughness: 0.85 }),
  curtainDark: new THREE.MeshStandardMaterial({ color: '#4f0e19', roughness: 0.85 }),
  rail: new THREE.MeshStandardMaterial({ color: '#2f2734', roughness: 0.6, side: THREE.DoubleSide }),
  exit: new THREE.MeshBasicMaterial({ color: '#3ad17a' }),
  door: new THREE.MeshStandardMaterial({ color: '#2b2025' }),
};

function ArcPlatform({ center, r0, r1, a0, a1, y, prevY }: { center: THREE.Vector3; r0: number; r1: number; a0: number; a1: number; y: number; prevY: number }) {
  const rise = y - prevY;
  return (
    <group position={[center.x, 0, center.z]}>
      <mesh position={[0, y + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat.carpet}>
        <ringGeometry args={[r0, r1, 48, 1, a0 - Math.PI / 2, a1 - a0]} />
      </mesh>
      {rise > 0.001 && (
        <mesh position={[0, prevY + rise / 2, 0]} material={mat.riser}>
          <cylinderGeometry args={[r0, r0, rise, 48, 1, true, a0, a1 - a0]} />
        </mesh>
      )}
    </group>
  );
}

export function Architecture({ geometry, lowDetail }: { geometry: Geometry; lowDetail: boolean }) {
  const c = new THREE.Vector3(geometry.arcCenter.x, 0, geometry.arcCenter.z);
  const a0 = (-40 * Math.PI) / 180;
  const a1 = (40 * Math.PI) / 180;
  const platforms = useMemo(() => {
    const out: { r0: number; r1: number; y: number; prevY: number }[] = [];
    for (let i = 0; i < FLOOR_ROWS.length; i++) {
      const R = 9.2 + i * 0.95;
      out.push({ r0: R - 0.475, r1: R + 0.475, y: FLOOR_ROW_ELEV(i), prevY: i ? FLOOR_ROW_ELEV(i - 1) : 0 });
    }
    return out;
  }, []);
  const balconyA0 = (-33 * Math.PI) / 180;
  const balconyA1 = (33 * Math.PI) / 180;

  return (
    <group>
      {/* room shell */}
      <mesh position={[0, 7, 8]} material={mat.wall}>
        <boxGeometry args={[50, 14, 40]} />
      </mesh>
      <mesh position={[0, 0, 8]} rotation={[-Math.PI / 2, 0, 0]} material={mat.floor}>
        <planeGeometry args={[50, 40]} />
      </mesh>
      {/* raked floor rows */}
      {platforms.map((p, i) => (
        <ArcPlatform key={i} center={c} r0={p.r0} r1={p.r1} a0={a0} a1={a1} y={p.y} prevY={p.prevY} />
      ))}
      {/* balcony: slab, rows, rail */}
      <group position={[c.x, 0, c.z]}>
        <mesh position={[0, 4.85, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat.riser}>
          <ringGeometry args={[20.2, 25, 48, 1, balconyA0 - Math.PI / 2, balconyA1 - balconyA0]} />
        </mesh>
        {[0, 1, 2].map((j) => {
          const R = 21 + j;
          const y = 5.2 + 0.45 * j;
          return (
            <group key={j}>
              <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat.carpet}>
                <ringGeometry args={[R - 0.5, R + 0.5, 48, 1, balconyA0 - Math.PI / 2, balconyA1 - balconyA0]} />
              </mesh>
              <mesh position={[0, y - 0.18, 0]} material={mat.riser}>
                <cylinderGeometry args={[R - 0.5, R - 0.5, 0.45, 48, 1, true, balconyA0, balconyA1 - balconyA0]} />
              </mesh>
            </group>
          );
        })}
        <mesh position={[0, 5.4, 0]} material={mat.rail}>
          <cylinderGeometry args={[20.3, 20.3, 1.1, 48, 1, true, balconyA0, balconyA1 - balconyA0]} />
        </mesh>
        <mesh position={[0, 5.95, 0]} material={mat.gold}>
          <cylinderGeometry args={[20.32, 20.32, 0.06, 48, 1, true, balconyA0, balconyA1 - balconyA0]} />
        </mesh>
      </group>
      {/* exits (doors + green signs) */}
      {[
        [-24.9, 18, Math.PI / 2],
        [24.9, 18, -Math.PI / 2],
        [-24.9, 4, Math.PI / 2],
        [24.9, 4, -Math.PI / 2],
      ].map(([x, z, r], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
          <mesh position={[0, 1.2, 0.02]} material={mat.door}>
            <planeGeometry args={[1.8, 2.4]} />
          </mesh>
          <mesh position={[0, 2.7, 0.03]} material={mat.exit}>
            <planeGeometry args={[0.9, 0.3]} />
          </mesh>
        </group>
      ))}
      {/* decorative wall panels */}
      {!lowDetail &&
        [-1, 1].map((sx) =>
          [6, 12, 18, 24].map((z) => (
            <mesh key={`${sx}-${z}`} position={[sx * 24.85, 6.5, z]} rotation={[0, (-sx * Math.PI) / 2, 0]} material={mat.gold}>
              <planeGeometry args={[0.12, 9]} />
            </mesh>
          )),
        )}
    </group>
  );
}

// ───────────────────────────── obstacles used by the scoring engine ─────────────────────────────
export function Obstacles({ geometry }: { geometry: Geometry }) {
  return (
    <group>
      {geometry.obstacles
        .filter((o) => o.id !== 'stage-deck')
        .map((o) => {
          const size: [number, number, number] = [o.max.x - o.min.x, o.max.y - o.min.y, o.max.z - o.min.z];
          const pos: [number, number, number] = [(o.max.x + o.min.x) / 2, (o.max.y + o.min.y) / 2, (o.max.z + o.min.z) / 2];
          const isTruss = o.id.startsWith('truss');
          return (
            <mesh key={o.id} position={pos} material={isTruss ? mat.truss : mat.wood}>
              <boxGeometry args={size} />
            </mesh>
          );
        })}
    </group>
  );
}

// ───────────────────────────── stage ─────────────────────────────
function Performer({ x, z, color: c, phase, animate, h = 1.75 }: { x: number; z: number; color: string; phase: number; animate: boolean; h?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!animate || !ref.current) return;
    const t = clock.elapsedTime + phase;
    ref.current.position.y = 1.1 + Math.abs(Math.sin(t * 2)) * 0.08;
    ref.current.rotation.y = Math.sin(t * 0.7) * 0.5;
    ref.current.position.x = x + Math.sin(t * 0.4) * 0.8;
  });
  return (
    <group ref={ref} position={[x, 1.1, z]}>
      <mesh position={[0, h * 0.42, 0]}>
        <capsuleGeometry args={[0.22, h * 0.5, 4, 12]} />
        <meshStandardMaterial color={c} roughness={0.6} />
      </mesh>
      <mesh position={[0, h * 0.86, 0]}>
        <sphereGeometry args={[0.16, 16, 12]} />
        <meshStandardMaterial color="#c8a27c" roughness={0.6} />
      </mesh>
    </group>
  );
}

function LedWall({ width, height, position, animate, hue = 0 }: { width: number; height: number; position: [number, number, number]; animate: boolean; hue?: number }) {
  const m = useRef<THREE.MeshBasicMaterial>(null);
  // original procedural pattern drawn into a small canvas texture
  const tex = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 64;
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const ctx = useMemo(() => (tex.image as HTMLCanvasElement).getContext('2d')!, [tex]);
  const last = useRef(-1);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!animate && last.current >= 0) return;
    if (t - last.current < 1 / 15) return; // 15 fps is plenty for an LED wall
    last.current = t;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 16; x++) {
        const v = Math.sin(x * 0.5 + t * 2 + hue) + Math.cos(y * 0.7 - t * 1.5) + Math.sin((x + y) * 0.3 + t);
        const h = (((v + 3) / 6) * 120 + hue * 40 + t * 10) % 360;
        ctx.fillStyle = `hsl(${h}, 80%, ${30 + ((v + 3) / 6) * 35}%)`;
        ctx.fillRect(x * 8, y * 8, 7, 7);
      }
    tex.needsUpdate = true;
    if (m.current) m.current.needsUpdate = false;
  });
  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial ref={m} map={tex} toneMapped={false} />
    </mesh>
  );
}

function Beam({ x, animate, hue, phase }: { x: number; animate: boolean; hue: string; phase: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animate || !ref.current) return;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.8 + phase) * 0.45;
  });
  return (
    <mesh ref={ref} position={[x, 9.5, -2]} rotation={[0.35, 0, 0]}>
      <coneGeometry args={[1.4, 9, 24, 1, true]} />
      <meshBasicMaterial color={hue} transparent opacity={0.07} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function Stage({ geometry, mode, animate, lowDetail }: { geometry: Geometry; mode: 'theatre' | 'concert'; animate: boolean; lowDetail: boolean }) {
  const { width, depth, height } = geometry.stage;
  return (
    <group>
      {/* deck & apron edge */}
      <mesh position={[0, height / 2, -depth / 2]} material={mat.wood}>
        <boxGeometry args={[width, height, depth]} />
      </mesh>
      <mesh position={[0, height + 0.005, -depth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={mode === 'concert' ? '#151318' : '#5a3d28'} roughness={0.5} />
      </mesh>
      <mesh position={[0, height - 0.05, 0.02]} material={mat.gold}>
        <boxGeometry args={[width, 0.1, 0.06]} />
      </mesh>
      {/* proscenium header */}
      <mesh position={[0, 9.4, -0.7]} material={mat.wood}>
        <boxGeometry args={[17.6, 1.6, 0.4]} />
      </mesh>
      <mesh position={[0, 8.55, -0.48]} material={mat.gold}>
        <boxGeometry args={[17.4, 0.08, 0.05]} />
      </mesh>

      {mode === 'theatre' ? (
        <group>
          {/* side curtains (folded) + valance */}
          {[-1, 1].map((sx) =>
            Array.from({ length: 6 }, (_, i) => (
              <mesh key={`${sx}-${i}`} position={[sx * (7.6 - i * 0.3), 5.1, -1.2 - (i % 2) * 0.12]} material={i % 2 ? mat.curtainDark : mat.curtain}>
                <boxGeometry args={[0.32, 8, 0.12]} />
              </mesh>
            )),
          )}
          <mesh position={[0, 8.2, -1.1]} material={mat.curtain}>
            <boxGeometry args={[16, 1.2, 0.15]} />
          </mesh>
          {/* painted set: an original old-souq street */}
          <mesh position={[0, 4.5, -8.8]}>
            <planeGeometry args={[16, 7]} />
            <meshStandardMaterial color="#2c3e57" roughness={1} />
          </mesh>
          {[-5.5, -2, 1.8, 5.2].map((x, i) => (
            <group key={i} position={[x, height, -7.5 + (i % 2) * 0.6]}>
              <mesh position={[0, 1.6, 0]}>
                <boxGeometry args={[2.8, 3.2, 1]} />
                <meshStandardMaterial color={['#b08a5a', '#9c7a50', '#c49a68', '#a5825a'][i]} roughness={0.9} />
              </mesh>
              <mesh position={[0, 1.1, 0.51]}>
                <planeGeometry args={[1.1, 2.0]} />
                <meshStandardMaterial color="#3b2a1a" />
              </mesh>
            </group>
          ))}
          <Performer x={-2} z={-3} color="#e8d9b5" phase={0} animate={animate} />
          <Performer x={1.5} z={-2.5} color="#2f4f6f" phase={1.7} animate={animate} />
          {!lowDetail && <Performer x={3.8} z={-4.5} color="#7a2f2f" phase={3.1} animate={animate} h={1.6} />}
        </group>
      ) : (
        <group>
          <LedWall width={14} height={5.5} position={[0, 5.2, -8.9]} animate={animate} />
          {/* drum riser & kit */}
          <mesh position={[0, height + 0.3, -6]} material={mat.truss}>
            <boxGeometry args={[4, 0.6, 2.5]} />
          </mesh>
          {[-0.7, 0, 0.7].map((x, i) => (
            <mesh key={i} position={[x, height + 0.95, -6 + (i === 1 ? -0.4 : 0)]}>
              <cylinderGeometry args={[0.35, 0.35, 0.5, 20]} />
              <meshStandardMaterial color="#b0b6c2" metalness={0.4} roughness={0.3} />
            </mesh>
          ))}
          {/* keyboard */}
          <mesh position={[-4.5, height + 0.9, -4.5]}>
            <boxGeometry args={[1.4, 0.12, 0.4]} />
            <meshStandardMaterial color="#111" />
          </mesh>
          <Performer x={0} z={-2.2} color="#d4a64a" phase={0} animate={animate} />
          <Performer x={-4.5} z={-5.2} color="#5a6b8a" phase={2} animate={animate} />
          {!lowDetail && <Performer x={4.5} z={-4} color="#7a5a8a" phase={4} animate={animate} />}
          {/* mic stand */}
          <mesh position={[0, height + 0.8, -1.6]}>
            <cylinderGeometry args={[0.02, 0.02, 1.6, 8]} />
            <meshStandardMaterial color="#999" />
          </mesh>
          {!lowDetail && ['#7aa8d8', '#a58bd6', '#e8c77c', '#7aa8d8'].map((h, i) => <Beam key={i} x={-6 + i * 4} hue={h} phase={i} animate={animate} />)}
        </group>
      )}
      {/* side LED screens */}
      {!lowDetail && [-1, 1].map((sx) => <LedWall key={sx} width={3.2} height={1.9} position={[sx * 10.6, 6.3, -0.3]} animate={animate && mode === 'concert'} hue={sx} />)}
    </group>
  );
}

export function Lights({ mode, lowDetail }: { mode: 'theatre' | 'concert'; lowDetail: boolean }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#c8b8ff', '#1a1418', 0.5]} />
      <directionalLight position={[0, 14, 22]} intensity={0.9} color="#f3ead8" />
      <spotLight position={[0, 11, 6]} angle={0.45} penumbra={0.6} intensity={mode === 'concert' ? 60 : 90} color="#ffe2b0" target-position={[0, 1, -3]} distance={30} decay={1.2} />
      {!lowDetail && <spotLight position={[-8, 10, 2]} angle={0.4} penumbra={0.7} intensity={40} color={mode === 'concert' ? '#7aa8d8' : '#ffd9a0'} distance={30} decay={1.2} />}
      {!lowDetail && <spotLight position={[8, 10, 2]} angle={0.4} penumbra={0.7} intensity={40} color={mode === 'concert' ? '#a58bd6' : '#ffd9a0'} distance={30} decay={1.2} />}
    </>
  );
}

export interface VenueSceneProps {
  map: SeatMap;
  seats: SeatInstancesProps;
  animate: boolean;
  lowDetail: boolean;
}

/** Pure scene content, reusable in the main view and the comparison view. */
export function VenueContent({ map, seats, animate, lowDetail }: VenueSceneProps) {
  const g = map.performance.geometry as Geometry;
  return (
    <>
      <color attach="background" args={['#0d0b0f']} />
      <fog attach="fog" args={['#0d0b0f', 40, 90]} />
      <Lights mode={map.performance.stage_mode} lowDetail={lowDetail} />
      <Architecture geometry={g} lowDetail={lowDetail} />
      <Obstacles geometry={g} />
      <Stage geometry={g} mode={map.performance.stage_mode} animate={animate} lowDetail={lowDetail} />
      <SeatInstances {...seats} />
    </>
  );
}
