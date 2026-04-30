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

import { useEffect, useMemo, useRef } from "react";
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
        // Center the model at origin so camera math is predictable.
        const bbox = new THREE.Box3().setFromObject(scene);
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        scene.position.sub(center);
        // Recompute bbox after recentering.
        const bbox2 = new THREE.Box3().setFromObject(scene);
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

export function Uno3DViewer({
  topView = false,
  topViewWidth = 1000,
  topViewHeight = 700,
  onTopViewClick,
  markers,
  tablePieces,
  className,
}: Props) {
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
    }),
    [],
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
      const clone = unoScene.clone(true);
      scene.add(clone);
      runtime.bbox = bbox;

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
}
