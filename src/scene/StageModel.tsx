import { Clone, useGLTF, Html, Line, useTexture, TransformControls } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import {
    Box3,
    Vector3,
    Mesh,
    Euler,
    Quaternion,
    Object3D,
    BoxGeometry,
    Matrix4,
    Group
} from "three";

import { Evaluator, SUBTRACTION, Brush } from "three-bvh-csg";
import type { PlacementView } from "../types";
import { BufferGeometry } from "three";
import { useRef } from "react";
import type { MeasuredFootprint } from "./types";

function formatDimensionFeet(feetDecimal: number) {
  const feet = Math.floor(feetDecimal);
  const inches = ((feetDecimal - feet) * 12).toFixed(1);
  return `${feet} ft ${inches} in`;
}

function DimensionAnnotation({ start, end, label, labelOffset }: { start: Vector3, end: Vector3, label: string, labelOffset: Vector3 }) {
  const midPoint = new Vector3().addVectors(start, end).multiplyScalar(0.5).add(labelOffset);
  
  // Calculate orientation for cones
  const dir = new Vector3().subVectors(end, start).normalize();
  
  // For start cone (pointing towards start, i.e., opposite of dir)
  const startRotation = new Euler().setFromQuaternion(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().multiplyScalar(-1))
  );
  
  // For end cone (pointing towards end, i.e., same as dir)
  const endRotation = new Euler().setFromQuaternion(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir)
  );

  const coneRadius = 0.04;
  const coneHeight = 0.12;

  return (
    <>
      <Line points={[start, end]} color="#555" lineWidth={2} />
      
      {/* Start Cone */}
      <mesh position={[start.x, start.y, start.z]} rotation={startRotation}>
        <coneGeometry args={[coneRadius, coneHeight, 12]} />
        <meshBasicMaterial color="#555" />
      </mesh>

      {/* End Cone */}
      <mesh position={[end.x, end.y, end.z]} rotation={endRotation}>
        <coneGeometry args={[coneRadius, coneHeight, 12]} />
        <meshBasicMaterial color="#555" />
      </mesh>

      <Html position={[midPoint.x, midPoint.y, midPoint.z]} center zIndexRange={[100, 0]}>
         <div style={{ background: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #ccc', color: '#333', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
           {label}
         </div>
      </Html>
    </>
  );
}

const CUSTOMIZATION_TEXTURES: Record<string, Record<number, Record<string, string>>> = {
  coffee: {
    16: {
      A: "/Textures/16ft_Coffee_A.png",
      B: "/Textures/16ft_Coffee_B.png",
      C: "/Textures/16ft_Coffee_C.png",
      D: "/Textures/16ft_Coffee_D.png",
    },
    30: {
      A: "/Textures/30ft_Coffee_Side_A-scaled.png",
      B: "/Textures/30ft_Coffee_Side_B-scaled.png",
      C: "/Textures/30ft_Coffee_Side_C-1.png",
      D: "/Textures/30ft_Coffee_Side_D-1.png",
    }
  },
  sushi: {
    16: {
      A: "/Textures/16ft_Sushi_Side_A.png",
      B: "/Textures/16ft_Sushi_Side_B.png",
      C: "/Textures/16ft_Sushi_Side_C.png",
      D: "/Textures/16ft_Sushi_Side_D.png",
    },
    30: { // Fallback for 30ft
      A: "/Textures/16ft_Sushi_Side_A.png",
      B: "/Textures/16ft_Sushi_Side_B.png",
      C: "/Textures/16ft_Sushi_Side_C.png",
      D: "/Textures/16ft_Sushi_Side_D.png",
    }
  },
  taco: {
    30: {
      A: "/Textures/30ft_Taco_Side_A-scaled.png",
      B: "/Textures/30ft_Taco_Side_B-scaled.png",
      C: "/Textures/30ft_Taco_Side_C.png",
      D: "/Textures/30ft_Taco_D.png",
    },
    16: { // Fallback for 16ft
       A: "/Textures/30ft_Taco_Side_A-scaled.png",
       B: "/Textures/30ft_Taco_Side_B-scaled.png",
       C: "/Textures/30ft_Taco_Side_C.png",
       D: "/Textures/30ft_Taco_D.png",
    }
  }
};

function VisibleStageModel({
  src,
  rotationY = 0,
  onLoad,
  showMeasurements,
  selectedCustomizationId,
  placements = [],
  measuredFootprints = {},
  initialWindowPosition,
  onWindowPositionChange
}: {
  src: string;
  rotationY?: number;
  onLoad?: () => void;
  showMeasurements?: boolean;
  selectedCustomizationId?: string;
  placements?: PlacementView[];
  measuredFootprints?: Record<string, MeasuredFootprint>;
  initialWindowPosition?: { x: number; y: number; z: number } | null;
  onWindowPositionChange?: (pos: { x: number; y: number; z: number }) => void;
}) {
  const gltf = useGLTF(src);
  const [nativeWindowPos, setNativeWindowPos] = useState<Vector3 | null>(null);
  const [windowMoved, setWindowMoved] = useState(false);

  useEffect(() => {
    setNativeWindowPos(null);
    setWindowMoved(false);
  }, [src]);

  useEffect(() => {
    // Call onLoad when the model AND textures (dependent on selectedCustomizationId)
    // have been resolved. The component is mounted inside a Suspense boundary
    // so this effect will run after loaders complete for gltf and textures.
    if (onLoad) onLoad();
  }, [onLoad, src, selectedCustomizationId]);

  // Texture loading
  const trailerSize = src.includes("16") ? 16 : src.includes("30") ? 30 : 16;
  const designTextures = selectedCustomizationId ? CUSTOMIZATION_TEXTURES[selectedCustomizationId]?.[trailerSize] : null;

  const textures = useTexture(
    designTextures 
      ? {
          A: designTextures.A,
          B: designTextures.B,
          C: designTextures.C,
          D: designTextures.D
        }
      : { A: "/Textures/16ft_Coffee_A.png", B: "/Textures/16ft_Coffee_A.png", C: "/Textures/16ft_Coffee_A.png", D: "/Textures/16ft_Coffee_A.png" } // Fallback
  );
  const originalPlaneGeometry = useRef<BufferGeometry | null>(null);
  // Stores original geometries for ALL wall-side meshes that need to be cut (keyed by mesh name)
  const originalWallGeometries = useRef<Map<string, BufferGeometry>>(new Map());
  // Original world positions of Window group and WindowBox — needed to compute drag delta for cutter placement
  const originalWindowGroupPos = useRef<Vector3 | null>(null);
  const originalWindowBoxPos = useRef<Vector3 | null>(null);

  // Capture clean geometries and original positions from the source GLTF (never mutated by CSG).
  useEffect(() => {
    originalPlaneGeometry.current = null;
    originalWallGeometries.current.clear();
    originalWindowGroupPos.current = null;
    originalWindowBoxPos.current = null;

    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((child: any) => {
      const name: string = child.name;
      const nameLower = name.toLowerCase();

      if (child.isMesh) {
        if (name === "Plane_006") {
          originalPlaneGeometry.current = (child as Mesh).geometry.clone();
          originalWallGeometries.current.set(name, (child as Mesh).geometry.clone());
        } else if (nameLower.startsWith("wrap_image_")) {
          originalWallGeometries.current.set(name, (child as Mesh).geometry.clone());
        } else if (nameLower.includes("windowbox")) {
          const box = new Box3().setFromObject(child);
          const center = new Vector3();
          box.getCenter(center);
          originalWindowBoxPos.current = center;
        }
      } else if (nameLower === "window") {
        const p = new Vector3();
        (child as Object3D).getWorldPosition(p);
        originalWindowGroupPos.current = p;

        // Compute bounding box as a fallback if no windowbox is found later
        const box = new Box3().setFromObject(child);
        const center = new Vector3();
        box.getCenter(center);

        // We'll set originalWindowBoxPos right here as a fallback in case we never find 'windowbox'
        if (!originalWindowBoxPos.current) {
          originalWindowBoxPos.current = center;
        }

        // If a saved position was provided, restore it; otherwise use the model's native world position
        // We store world positions (scene-root space) so they work correctly regardless of GLB hierarchy depth
        if (initialWindowPosition) {
          setNativeWindowPos(new Vector3(initialWindowPosition.x, initialWindowPosition.y, initialWindowPosition.z));
        } else {
          setNativeWindowPos(p.clone()); // p = getWorldPosition result, already computed above
        }
        setWindowMoved(true);
      }
    });

    console.log("[INIT] windowGroupOriginalPos:", originalWindowGroupPos.current);
    console.log("[INIT] windowBoxOriginalPos:", originalWindowBoxPos.current);
    console.log("[INIT] wallGeometries:", [...originalWallGeometries.current.keys()]);
  }, [gltf.scene]);

  const rawScene = useMemo(() => {
    const cloned = gltf.scene.clone(true);

    cloned.traverse((child: any) => {
      if (child.isMesh) {
        const mesh = child as Mesh;
        const name = mesh.name.toLowerCase();

        const isWrapMesh = name.includes("wrap") && name.includes("image");
        const isSideMesh = name.includes("side") && (name.includes("right") || name.includes("left") || name.includes("front") || name.includes("back"));

        const isTargetMesh = isWrapMesh || mesh.name === "Plane_006";

        if (isTargetMesh) {
          let sideTexture = null;
          if (name.includes("right") || name.includes("_a")) sideTexture = textures.A;
          else if (name.includes("left") || name.includes("_b")) sideTexture = textures.B;
          else if (name.includes("front") || name.includes("_c")) sideTexture = textures.C;
          else if (name.includes("back") || name.includes("_d")) sideTexture = textures.D;

          if (sideTexture && selectedCustomizationId && selectedCustomizationId !== "no-wrap") {
            const applyToMaterial = (mat: any) => {
                const newMat = mat.clone();
                const tex = sideTexture.clone();
                tex.flipY = false;
                tex.rotation = 0;
                tex.center.set(0.5, 0.5);
                tex.repeat.set(1, 1);
                tex.offset.set(0, 0);
                tex.needsUpdate = true;
                newMat.map = tex;
                newMat.needsUpdate = true;
                if (newMat.color) newMat.color.set("white");
                newMat.polygonOffset = true;
                newMat.polygonOffsetFactor = -4;
                newMat.polygonOffsetUnits = -4;
                newMat.transparent = false;
                newMat.opacity = 1;
                return newMat;
            };

            if (Array.isArray(mesh.material)) {
              mesh.material = mesh.material.map(applyToMaterial);
            } else {
              mesh.material = applyToMaterial(mesh.material);
            }

            mesh.visible = true;
            mesh.renderOrder = 10;
          } else {
            if (isWrapMesh) {
              mesh.visible = false;
            } else if (isSideMesh) {
              mesh.visible = true;
            }
          }
        }
      }
    });

    return cloned;
  }, [gltf.scene, selectedCustomizationId, textures, trailerSize]);


  const metrics = useMemo(() => {
    rawScene.updateWorldMatrix(true, true);
    const combinedBox = new Box3();
    rawScene.traverseVisible((child: any) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      combinedBox.union(new Box3().setFromObject(mesh, true));
    });
    const bounds = combinedBox.isEmpty()
      ? new Box3().setFromObject(rawScene, true)
      : combinedBox;

    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const scale = 1; // 1:1 scale to respect original model dimensions

    return {
      scale,
      size,
      center,
      offset: {
        x: -center.x,
        y: -center.y,
        z: -center.z
      }
    };
  }, [rawScene]);

  const scene = useMemo(() => {
    const csgScene = rawScene.clone(true);

    // No CSG needed until user has actually dragged the window
    if (!nativeWindowPos || !windowMoved) {
      // Still hide the WindowBox helper mesh so it doesn't show in the model
      csgScene.traverse((child: any) => {
        if (child.isMesh && child.name.toLowerCase().includes("windowbox")) {
          child.visible = false;
        }
      });
      return csgScene;
    }

    // Bail if we don't have the original geometries captured yet
    if (originalWallGeometries.current.size === 0) return csgScene;
    if (!originalWindowGroupPos.current) return csgScene;

    // Use originalWindowBoxPos if available, else fallback to window group pos
    const baseBoxPos = originalWindowBoxPos.current || originalWindowGroupPos.current;

    // Hide WindowBox helper mesh
    csgScene.traverse((child: any) => {
      if (child.isMesh && child.name.toLowerCase().includes("windowbox")) child.visible = false;
    });

    // Also move the Window group visually in csgScene so the frame appears at the right place
    let windowGroupNode: Object3D | null = null;
    csgScene.traverse((child: any) => {
      if (child.name.toLowerCase() === "window") windowGroupNode = child as Object3D;
    });
    if (windowGroupNode) {
      // nativeWindowPos is in world/scene-root space; convert to the node's parent local space
      const node = windowGroupNode as Object3D;
      if (node.parent) {
        node.parent.updateMatrixWorld(true);
        const localPos = nativeWindowPos.clone().applyMatrix4(
          new (node.parent.matrixWorld.constructor as any)().copy(node.parent.matrixWorld).invert()
        );
        node.position.copy(localPos);
      } else {
        node.position.copy(nativeWindowPos);
      }
      node.updateMatrixWorld(true);
    }
    csgScene.updateMatrixWorld(true);

    // dragDelta is simply the difference in world positions (nativeWindowPos is already world space)
    const dragDelta = new Vector3().subVectors(nativeWindowPos, originalWindowGroupPos.current);
    let cutterWorldPos = new Vector3().addVectors(baseBoxPos, dragDelta);

    // Get WindowBox geometry for cutter sizing, fallback to Window group bounds
    let windowBoxMesh: Mesh | null = null;
    let glassMesh: Mesh | null = null;
    // Find the glass pane: the flattest mesh (smallest depth) inside the window group that covers most of the opening
    let smallestDepth = Infinity;
    csgScene.traverse((child: any) => {
      if (!child.isMesh) return;
      if (child.name.toLowerCase().includes("windowbox")) windowBoxMesh = child as Mesh;
      if (windowGroupNode && (windowGroupNode as Object3D).getObjectByName(child.name)) {
        const b = new Box3().setFromObject(child);
        const w = b.max.x - b.min.x;
        const h = b.max.y - b.min.y;
        const l = b.max.z - b.min.z;
        const minDim = Math.min(w, h, l);
        // Must be reasonably large (>0.5 in two dimensions) and flattest mesh
        if (w > 0.5 && h > 0.5 && minDim < smallestDepth) {
          smallestDepth = minDim;
          glassMesh = child as Mesh;
        }
      }
    });

    let boxW = 1.0, boxH = 0.8, boxL = 0.5;

    if (glassMesh) {
      // Use the glass pane mesh directly — its bbox IS the wall opening
      const gm = glassMesh as Mesh;
      gm.updateWorldMatrix(true, false);
      const geomClone = gm.geometry.clone().applyMatrix4(gm.matrixWorld);
      const bbox = new Box3().setFromBufferAttribute(geomClone.attributes.position as any);
      geomClone.dispose();
      boxW = bbox.max.x - bbox.min.x;
      boxH = Math.max(0.1, bbox.max.y - bbox.min.y);
      boxL = bbox.max.z - bbox.min.z;
      // Use glass center for cut position so hole aligns with glass, not outer frame center
      const glassCenter = new Vector3();
      bbox.getCenter(glassCenter);
      cutterWorldPos.copy(glassCenter);
    } else if (windowBoxMesh) {
      // Compute bbox from the mesh's own geometry in world space (avoids including children)
      const wbMesh = windowBoxMesh as Mesh;
      wbMesh.updateWorldMatrix(true, false);
      const geomClone = wbMesh.geometry.clone().applyMatrix4(wbMesh.matrixWorld);
      const bbox = new Box3().setFromBufferAttribute(geomClone.attributes.position as any);
      geomClone.dispose();
      boxW = Math.max(0.1, (bbox.max.x - bbox.min.x) - 0.155);
      boxH = Math.max(0.1, (bbox.max.y - bbox.min.y) - 0.187);
      boxL = bbox.max.z - bbox.min.z;
    } else if (windowGroupNode) {
      const bbox = new Box3().setFromObject(windowGroupNode);
      boxW = bbox.max.x - bbox.min.x;
      boxH = Math.max(0.1, bbox.max.y - bbox.min.y);
      boxL = bbox.max.z - bbox.min.z;
    } else {
      return csgScene;
    }

    // Extend depth so cutter always punches fully through any thin wall/wrap mesh.
    // Do NOT shrink W/H — the WindowBox is already sized to the opening.
    if (boxW > boxL) { boxL = 1.5; }
    else              { boxW = 1.5; }

const cutterGeom = new BoxGeometry(boxW, boxH, boxL);
    console.log("[CSG] cutter size W/H/L:", boxW, boxH, boxL, "cutterWorldPos:", cutterWorldPos);

    const evaluator = new Evaluator();
    evaluator.useGroups = false;

    // Cut every wall mesh that has a stored original geometry (Plane_006 + all wrap_image_* overlays)
    csgScene.traverse((child: any) => {
      if (!child.isMesh) return;
      const originalGeom = originalWallGeometries.current.get(child.name);
      if (!originalGeom) return;

      const mesh = child as Mesh;
      mesh.updateWorldMatrix(true, false);
      const meshWorldMatrix = mesh.matrixWorld.clone();
      const meshWorldInverse = meshWorldMatrix.clone().invert();

      // Express mesh geometry in world space using the pristine original
      const geomWorld = originalGeom.clone();
      geomWorld.applyMatrix4(meshWorldMatrix);
      const meshBrush = new Brush(geomWorld, mesh.material);
      meshBrush.updateMatrixWorld(true);

      // Cutter positioned at the dragged world position
      const cutter = new Brush(cutterGeom.clone(), mesh.material);
      cutter.position.copy(cutterWorldPos);
      cutter.updateMatrix();
      cutter.updateMatrixWorld(true);

      const result = evaluator.evaluate(meshBrush, cutter, SUBTRACTION);

      // Convert result back to mesh local space
      result.geometry.applyMatrix4(meshWorldInverse);
      mesh.geometry.dispose();
      mesh.geometry = result.geometry;
    });

    return csgScene;
  }, [rawScene, nativeWindowPos, windowMoved, originalWallGeometries, placements, measuredFootprints]);

  // Attach TransformControls to the "Window" parent group so WindowBox + all frame
  // meshes (Window_with_frame_60_open011_*) all drag together with a single gizmo.
  const windowBoxNode = useMemo<Object3D | null>(() => {
    let found: Object3D | null = null;
    scene.traverse((child: any) => {
      if (child.name.toLowerCase() === "window") found = child as Object3D;
    });
    return found;
  }, [scene]);
  const centerOffset = useMemo(() => {
    if (!windowBoxNode) return new Vector3();
    scene.updateMatrixWorld(true);

    // bbox center in world space (scene-root space, same as nativeWindowPos)
    const box = new Box3().setFromObject(windowBoxNode);
    const bboxCenterWorld = new Vector3();
    box.getCenter(bboxCenterWorld);

    // pivot in world space
    const pivotWorld = new Vector3();
    windowBoxNode.getWorldPosition(pivotWorld);

    // Both are in world/scene-root space — delta is the visual centering offset
    const off = new Vector3().subVectors(bboxCenterWorld, pivotWorld);
    console.log("[DEBUG centerOffset] pivotWorld:", pivotWorld.toArray(), "bboxCenterWorld:", bboxCenterWorld.toArray(), "offset:", off.toArray());
    return off;
  }, [windowBoxNode, scene]);

  const proxyPosition = useMemo(() => {
    if (!nativeWindowPos) return null;
    return nativeWindowPos.clone().add(centerOffset);
  }, [nativeWindowPos, centerOffset]);

  const [proxyGroupNode, setProxyGroupNode] = useState<Object3D | null>(null);
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    let timeoutIds: ReturnType<typeof setTimeout>[] = [];
    let raf: number;
    
    const applyDepthTest = () => {
      if (controlsRef.current) {
        controlsRef.current.traverse((child: any) => {
          if ((child.isMesh || child.isLine) && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            let modified = false;
            mats.forEach((m: any) => {
              if (m.depthTest !== false) {
                m.depthTest = false;
                m.depthWrite = false;
                modified = true;
              }
            });
            if (modified) child.renderOrder = 99999;
          }
        });
      }
    };

    if (windowBoxNode) {
      raf = requestAnimationFrame(applyDepthTest);
      timeoutIds.push(setTimeout(applyDepthTest, 100));
      timeoutIds.push(setTimeout(applyDepthTest, 500));
    }

    return () => {
      cancelAnimationFrame(raf);
      timeoutIds.forEach(clearTimeout);
    };
  }, [windowBoxNode]);

  // Compute realistic dimensions
  const trailerLengthFeet = src.includes("16") ? 16 : src.includes("30") ? 30 : 16;
  const feetPerUnit = trailerLengthFeet / metrics.size.x; // Length is along X axis
  
  const realSizeFeet = {
     x: metrics.size.x * feetPerUnit,
     y: metrics.size.y * feetPerUnit,
     z: metrics.size.z * feetPerUnit
  };

  const hw = metrics.size.x / 2;
  const hh = metrics.size.y / 2;
  const hl = metrics.size.z / 2;
  // Scale visual gaps (now that scale is 1:1, we use larger absolute values)
  const gap = 0.15;
  const labelOff = 0.1;

  return (
    <>
      <group position={[0, 0.08, 0]} rotation={[0, rotationY, 0]}>
        <group
          scale={metrics.scale}
          position={[metrics.offset.x, metrics.offset.y, metrics.offset.z]}
        >
          <primitive object={scene} />
          {proxyPosition && <group ref={setProxyGroupNode} position={proxyPosition} />}
          {showMeasurements && (
            <group position={[metrics.center.x, metrics.center.y, metrics.center.z]}>
              {/* Length (X-axis) - Front Bottom Edge */}
              <DimensionAnnotation 
                 start={new Vector3(-hw, -hh - gap, hl + gap)} 
                 end={new Vector3(hw, -hh - gap, hl + gap)} 
                 label={formatDimensionFeet(realSizeFeet.x)} 
                 labelOffset={new Vector3(0, -labelOff, 0)}
              />
              {/* Height (Y-axis) - Left Front Edge */}
              <DimensionAnnotation 
                 start={new Vector3(-hw - gap, -hh, hl + gap)} 
                 end={new Vector3(-hw - gap, hh, hl + gap)} 
                 label={formatDimensionFeet(realSizeFeet.y)} 
                 labelOffset={new Vector3(-labelOff, 0, 0)}
              />
              {/* Depth (Z-axis) - Left Bottom Edge */}
              <DimensionAnnotation 
                 start={new Vector3(-hw - gap, -hh - gap, -hl)} 
                 end={new Vector3(-hw - gap, -hh - gap, hl)} 
                 label={formatDimensionFeet(realSizeFeet.z)} 
                 labelOffset={new Vector3(-labelOff, -labelOff, 0)}
              />
            </group>
          )}
        </group>
      </group>
      {proxyGroupNode && proxyPosition && (
        <TransformControls
          ref={controlsRef}
          object={proxyGroupNode}
          mode="translate"
          space="local"
          size={0.5}
          showY={false}
          showZ={false}
          showX={true}
          onMouseUp={(e: any) => {
            if (e.target?.object) {
              const newPos = e.target.object.position.clone().sub(centerOffset);
              setNativeWindowPos(newPos);
              setWindowMoved(true);
              onWindowPositionChange?.({ x: newPos.x, y: newPos.y, z: newPos.z });
            }
          }}
        />
      )}
    </>
  );
}

export default function StageModel({
  src,
  rotationY = 0,
  onLoad,
  showMeasurements,
  selectedCustomizationId,
  placements,
  measuredFootprints,
  initialWindowPosition,
  onWindowPositionChange
}: {
  src: string | null;
  rotationY?: number;
  onLoad?: () => void;
  showMeasurements?: boolean;
  selectedCustomizationId?: string;
  placements?: PlacementView[];
  measuredFootprints?: Record<string, MeasuredFootprint>;
  initialWindowPosition?: { x: number; y: number; z: number } | null;
  onWindowPositionChange?: (pos: { x: number; y: number; z: number }) => void;
}) {
  if (!src) {
    return null;
  }

  return <VisibleStageModel
            src={src}
            rotationY={rotationY}
            onLoad={onLoad}
            showMeasurements={showMeasurements}
            selectedCustomizationId={selectedCustomizationId}
            placements={placements}
            measuredFootprints={measuredFootprints}
            initialWindowPosition={initialWindowPosition}
            onWindowPositionChange={onWindowPositionChange}
         />;
}