// Reusable Three.js viewer for the Uno GLB model.
// - Loads /models/uno.glb once, caches the parsed scene.
// - Orbit camera by default; can lock to orthographic top-down view.
// - Optional `onTopViewClick(localX, localY)` returns coordinates in the board's
//   top-view local space (mapped to a viewBox-like coordinate system) so the
//   admin pin editor can place pins on the real top view.
// - Optional `markers` overlay 3D dots above the board for placed pins.
// - Optional `tablePieces` renders simple boxes on the board surface for placed
//   components (the lightweight 3D workspace preview).
//
// NOTE: STEP→GLB happened offline; this only consumes the GLB.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface Marker3D {
  id: string;
  /** Top-view local coordinates (same space as topViewWidth/Height). */
  x: number;
  y: number;
  label?: string;
  color?: string;
}

export interface TablePiece3D {
  id: string;
  /** Top-view local coordinates of the piece's center. */
  x: number;
  y: number;
  /** Top-view local size; defaults to 14x10. */
  w?: number;
  h?: number;
  color?: string;
  label?: string;
  height?: number; // 3D height above the board surface (mm-ish)
}

interface Props {
  /** Forces a locked top-orthographic camera. Disables orbit. */
  topView?: boolean;
  /** Used to map 3D click positions back to board-local coordinates. */
  topViewWidth?: number;
  topViewHeight?: number;
  /** Click handler for the top-view; only called when topView is true. */
  onTopViewClick?: (x: number, y: number) => void;
  /** Pin markers (rendered as floating spheres). */
  markers?: Marker3D[];
  /** Component pieces (rendered as flat boxes on the board). */
  tablePieces?: TablePiece3D[];
  className?: string;
}

// Simple module-level cache so we don't re-parse the 4.5 MB GLB on every mount.
let cachedScene: THREE.Group | null = null;
let cachedBBox: THREE.Box3 | null = null;
let cachedPromise: Promise<{ scene: THREE.Group; bbox: THREE.Box3 }> | null = null;

// The source GLB is in METERS (~0.053 × 0.069). We rescale on import to a
// comfortable working size so the camera/lights set up in "centimeter-ish"
// units (real Uno is ~53×69 mm) actually frame the board.
const TARGET_BOARD_WIDTH = 70; // scene units across the long edge of the board

/** Public audit row, one entry per unique material in the model. */
export interface MaterialAuditEntry {
  index: number;
  name: string;
  /** Hex of baseColorFactor (e.g. "#0a7a55"). */
  color: string;
  metalness: number;
  roughness: number;
  hasMap: boolean;
  hasNormalMap: boolean;
  hasEmissive: boolean;
  /** Number of mesh primitives using this material. */
  primCount: number;
  /** Heuristic role label so the panel can flag suspicious assignments. */
  role: "pcb" | "metal-gold" | "metal-silver" | "plastic-dark" | "plastic-light" | "blue" | "red" | "yellow" | "unknown";
}

/** Imperative handle exposed via ref so the audit panel can talk to the live scene. */
export interface Uno3DViewerHandle {
  /** Read materials currently applied to the loaded model. */
  audit(): MaterialAuditEntry[];
  /** Re-walk the scene and re-apply STEP→GLB material fix-ups. Returns the fresh audit. */
  reloadMaterials(): MaterialAuditEntry[];
  /** Override one material's color (any CSS color). Returns new audit. */
  setMaterialColor(index: number, color: string): MaterialAuditEntry[];
  /** True once the GLB finished loading. */
  isReady(): boolean;
  /** Quick stats from the source file (textures/images count). */
  modelStats(): { materials: number; textures: number; images: number };
}

function classifyRole(hex: string, metal: number): MaterialAuditEntry["role"] {
  // Hex like "#rrggbb"
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  // Greens dominate G channel
  if (g > r && g > b && sat > 0.2) return "pcb";
  // Yellow / gold (R≈G, B much lower)
  if (r > 0.7 && g > 0.5 && b < 0.4) return metal > 0.5 ? "metal-gold" : "yellow";
  if (r > 0.55 && g > 0.45 && b < 0.35) return "metal-gold";
  // Silver / chrome (R≈G≈B, fairly bright, metallic)
  if (sat < 0.12 && max > 0.55) return metal > 0.5 ? "metal-silver" : "plastic-light";
  // Blue
  if (b > r && b > g && sat > 0.25) return "blue";
  // Red
  if (r > g && r > b && sat > 0.35) return "red";
  // Dark
  if (max < 0.25) return "plastic-dark";
  if (max > 0.55) return "plastic-light";
  return "unknown";
}

/** Apply the STEP→GLB fix-ups in place. Called on first load AND from the panel. */
function applyMaterialFixups(scene: THREE.Group): void {
  const seen = new Set<THREE.Material>();
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      const std = m as THREE.MeshStandardMaterial;
      if (!("isMeshStandardMaterial" in std)) continue;

      // Bug from the converter: every material exports metallicFactor=1.0.
      // That makes dielectrics (PCB, plastics) render as flat dark mirrors.
      // We classify by base color and pick a sane PBR setup per role.
      const c = std.color;
      const hex = "#" + c.getHexString();
      const role = classifyRole(hex, std.metalness ?? 1);
      switch (role) {
        case "pcb":
          // If the converter actually made the PCB green-ish, keep the hue but
          // saturate it toward Arduino teal; force dielectric.
          std.color.set(hex);
          std.metalness = 0.0;
          std.roughness = 0.55;
          break;
        case "metal-gold":
          std.metalness = 1.0;
          std.roughness = 0.35;
          break;
        case "metal-silver":
          std.metalness = 1.0;
          std.roughness = 0.4;
          break;
        case "plastic-dark":
        case "plastic-light":
        case "blue":
        case "red":
        case "yellow":
          std.metalness = 0.0;
          std.roughness = 0.55;
          break;
        default:
          std.metalness = 0.1;
          std.roughness = 0.6;
      }
      std.needsUpdate = true;
    }
  });
}

/** Walk the scene and produce an audit row per unique material. */
function auditScene(scene: THREE.Group): MaterialAuditEntry[] {
  const map = new Map<THREE.Material, MaterialAuditEntry>();
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      const existing = map.get(m);
      if (existing) {
        existing.primCount++;
        continue;
      }
      const std = m as THREE.MeshStandardMaterial;
      const hex = "#" + (std.color?.getHexString?.() ?? "808080");
      const metal = std.metalness ?? 0;
      map.set(m, {
        index: map.size,
        name: m.name || `mat_${map.size}`,
        color: hex,
        metalness: metal,
        roughness: std.roughness ?? 1,
        hasMap: !!std.map,
        hasNormalMap: !!std.normalMap,
        hasEmissive: !!std.emissiveMap || (std.emissive && std.emissive.getHex() !== 0),
        primCount: 1,
        role: classifyRole(hex, metal),
      });
    }
  });
  // Re-index in insertion order
  return Array.from(map.values()).map((e, i) => ({ ...e, index: i }));
}

/** Map "audit index" → live material reference, for color overrides. */
function indexedMaterials(scene: THREE.Group): THREE.Material[] {
  const seen = new Set<THREE.Material>();
  const list: THREE.Material[] = [];
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      list.push(m);
    }
  });
  return list;
}

function loadUno() {
  if (cachedScene && cachedBBox) {
    return Promise.resolve({ scene: cachedScene, bbox: cachedBBox });
  }
  if (cachedPromise) return cachedPromise;
  cachedPromise = new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      "/models/uno.glb",
      (gltf) => {
        const scene = gltf.scene;
        // Rescale to working units.
        const raw = new THREE.Box3().setFromObject(scene);
        const rawSize = new THREE.Vector3();
        raw.getSize(rawSize);
        const longest = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
        const k = TARGET_BOARD_WIDTH / longest;
        scene.scale.setScalar(k);
        scene.updateMatrixWorld(true);
        const scaled = new THREE.Box3().setFromObject(scene);
        const center = new THREE.Vector3();
        scaled.getCenter(center);
        scene.position.sub(center);
        scene.updateMatrixWorld(true);
        const bbox2 = new THREE.Box3().setFromObject(scene);
        applyMaterialFixups(scene);
        cachedScene = scene;
        cachedBBox = bbox2;
        resolve({ scene, bbox: bbox2 });
      },
      undefined,
      (err) => reject(err),
    );
  });
  return cachedPromise;
}

/** Source-file stats. Static for our shipped GLB; exposed via the handle so the
 *  audit panel can show "0 textures / 0 images" without re-parsing the file. */
const MODEL_STATS = { materials: 24, textures: 0, images: 0 };

export const Uno3DViewer = forwardRef<Uno3DViewerHandle, Props>(function Uno3DViewer(
  {
    topView = false,
    topViewWidth = 1000,
    topViewHeight = 700,
    onTopViewClick,
    markers,
    tablePieces,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Latest props reachable from event handlers without re-creating the scene.
  const propsRef = useRef({ topView, topViewWidth, topViewHeight, onTopViewClick, markers, tablePieces });
  propsRef.current = { topView, topViewWidth, topViewHeight, onTopViewClick, markers, tablePieces };

  // We keep a stable ref for runtime objects so a single useEffect can manage
  // the lifecycle while later effects mutate markers / pieces in place.
  const runtime = useMemo(
    () => ({
      markersGroup: null as THREE.Group | null,
      piecesGroup: null as THREE.Group | null,
      bbox: null as THREE.Box3 | null,
      /** The cloned, live Uno scene currently in the renderer (for audit/reload). */
      unoClone: null as THREE.Group | null,
    }),
    [],
  );

  // Imperative API for the audit panel. Methods read from/mutate the LIVE clone
  // so changes appear in the running renderer immediately.
  useImperativeHandle(
    ref,
    () => ({
      isReady: () => !!runtime.unoClone,
      modelStats: () => MODEL_STATS,
      audit: () => (runtime.unoClone ? auditScene(runtime.unoClone) : []),
      reloadMaterials: () => {
        if (!runtime.unoClone) return [];
        applyMaterialFixups(runtime.unoClone);
        return auditScene(runtime.unoClone);
      },
      setMaterialColor: (index, color) => {
        if (!runtime.unoClone) return [];
        const mats = indexedMaterials(runtime.unoClone);
        const m = mats[index] as THREE.MeshStandardMaterial | undefined;
        if (m && "color" in m) {
          try {
            m.color.set(color);
            m.needsUpdate = true;
          } catch {
            /* ignore invalid CSS color */
          }
        }
        return auditScene(runtime.unoClone);
      },
    }),
    [runtime],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1115);

    // Lighting setup: hemisphere + key + fill, matching a "clean studio" look.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.6);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(80, 140, 80);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xa0c8ff, 0.4);
    fill.position.set(-80, 60, -40);
    scene.add(fill);

    // The "table" — a soft surface beneath the board, only visible in 3D mode.
    const tableGeom = new THREE.PlaneGeometry(800, 800);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d24,
      roughness: 0.95,
      metalness: 0.0,
    });
    const table = new THREE.Mesh(tableGeom, tableMat);
    table.rotation.x = -Math.PI / 2;
    table.position.y = -1.5;
    scene.add(table);

    // Two camera modes; we'll switch between them as `topView` changes.
    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    const perspCam = new THREE.PerspectiveCamera(40, aspect, 1, 2000);
    perspCam.position.set(120, 110, 140);

    const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    orthoCam.up.set(0, 0, -1); // so +X is right and +Z is "down" on screen
    orthoCam.position.set(0, 200, 0);
    orthoCam.lookAt(0, 0, 0);

    let activeCam: THREE.Camera = perspCam;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(perspCam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);

    // Marker / piece groups (mutated by the second effect below).
    const markersGroup = new THREE.Group();
    scene.add(markersGroup);
    runtime.markersGroup = markersGroup;
    const piecesGroup = new THREE.Group();
    scene.add(piecesGroup);
    runtime.piecesGroup = piecesGroup;

    // Load the Uno GLB.
    loadUno().then(({ scene: unoScene, bbox }) => {
      if (disposed) return;
      // Clone so multiple mounted viewers don't fight over the same instance.
      // We clone materials too (deep) so the audit panel's per-instance overrides
      // don't bleed into other viewers sharing the cached scene.
      const clone = unoScene.clone(true);
      clone.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.clone())
          : (mesh.material as THREE.Material).clone();
      });
      applyMaterialFixups(clone);
      scene.add(clone);
      runtime.bbox = bbox;
      runtime.unoClone = clone;

      // Fit ortho camera to board top extents.
      const sizeX = bbox.max.x - bbox.min.x;
      const sizeZ = bbox.max.z - bbox.min.z;
      const halfW = sizeX / 2 + 5;
      const halfH = sizeZ / 2 + 5;
      orthoCam.left = -halfW;
      orthoCam.right = halfW;
      orthoCam.top = halfH;
      orthoCam.bottom = -halfH;
      orthoCam.updateProjectionMatrix();
    });

    function onResize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      perspCam.aspect = w / Math.max(1, h);
      perspCam.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // Click → top-view coords. Used by admin pin editor.
    function onClick(ev: MouseEvent) {
      const p = propsRef.current;
      if (!p.topView || !p.onTopViewClick || !runtime.bbox) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      // Raycast from ortho camera onto the y=0 plane (board top surface
      // is approximately at the bbox top; we use bbox-center plane instead).
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(nx, ny), orthoCam);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -runtime.bbox.max.y);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return;
      // Map 3D world XZ to top-view local XY (origin at board top-left).
      const sizeX = runtime.bbox.max.x - runtime.bbox.min.x;
      const sizeZ = runtime.bbox.max.z - runtime.bbox.min.z;
      const u = (hit.x - runtime.bbox.min.x) / sizeX;
      const v = (hit.z - runtime.bbox.min.z) / sizeZ;
      const lx = u * p.topViewWidth;
      const ly = v * p.topViewHeight;
      p.onTopViewClick(lx, ly);
    }
    renderer.domElement.addEventListener("click", onClick);

    let raf = 0;
    function tick() {
      const p = propsRef.current;
      activeCam = p.topView ? orthoCam : perspCam;
      controls.enabled = !p.topView;
      if (!p.topView) controls.update();
      renderer.render(scene, activeCam);
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // We deliberately set up the scene exactly once. Top-view, markers, and
    // pieces flow through propsRef + the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers.
  useEffect(() => {
    const group = runtime.markersGroup;
    const bbox = runtime.bbox;
    if (!group || !bbox) return;
    while (group.children.length) {
      const c = group.children[0];
      group.remove(c);
      (c as THREE.Mesh).geometry?.dispose?.();
      const m = (c as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else m?.dispose?.();
    }
    if (!markers) return;
    const sizeX = bbox.max.x - bbox.min.x;
    const sizeZ = bbox.max.z - bbox.min.z;
    for (const mk of markers) {
      const wx = bbox.min.x + (mk.x / topViewWidth) * sizeX;
      const wz = bbox.min.z + (mk.y / topViewHeight) * sizeZ;
      const wy = bbox.max.y + 1.2;
      const geo = new THREE.SphereGeometry(0.9, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(mk.color ?? "#22c55e"),
        emissive: new THREE.Color(mk.color ?? "#22c55e"),
        emissiveIntensity: 0.4,
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.position.set(wx, wy, wz);
      group.add(sphere);
    }
  }, [markers, topViewWidth, topViewHeight, runtime]);

  // Sync table pieces (component blocks).
  useEffect(() => {
    const group = runtime.piecesGroup;
    const bbox = runtime.bbox;
    if (!group || !bbox) return;
    while (group.children.length) {
      const c = group.children[0];
      group.remove(c);
      (c as THREE.Mesh).geometry?.dispose?.();
      const m = (c as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else m?.dispose?.();
    }
    if (!tablePieces) return;
    const sizeX = bbox.max.x - bbox.min.x;
    const sizeZ = bbox.max.z - bbox.min.z;
    for (const pc of tablePieces) {
      const w = (pc.w ?? 14) * (sizeX / topViewWidth);
      const d = (pc.h ?? 10) * (sizeZ / topViewHeight);
      const h = pc.height ?? 4;
      const wx = bbox.min.x + (pc.x / topViewWidth) * sizeX;
      const wz = bbox.min.z + (pc.y / topViewHeight) * sizeZ;
      const wy = bbox.max.y + h / 2 + 0.2;
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(pc.color ?? "#3b82f6"),
        roughness: 0.5,
        metalness: 0.1,
      });
      const cube = new THREE.Mesh(geo, mat);
      cube.position.set(wx, wy, wz);
      group.add(cube);
    }
  }, [tablePieces, topViewWidth, topViewHeight, runtime]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />;
});
