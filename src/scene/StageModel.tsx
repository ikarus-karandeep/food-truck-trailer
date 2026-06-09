import { Clone, useGLTF, Html, Line, useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { Box3, Vector3, Mesh, Euler, Quaternion } from "three";

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
  selectedCustomizationId
}: {
  src: string;
  rotationY?: number;
  onLoad?: () => void;
  showMeasurements?: boolean;
  selectedCustomizationId?: string;
}) {
  const gltf = useGLTF(src);

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

  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    
    cloned.traverse((child: any) => {
      if (child.isMesh) {
        const mesh = child as Mesh;
        const name = mesh.name.toLowerCase();
        
        const isWrapMesh = name.includes("wrap") && name.includes("image");
        const isSideMesh = name.includes("side") && (name.includes("right") || name.includes("left") || name.includes("front") || name.includes("back"));
        
        const isTargetMesh = isWrapMesh || isSideMesh;

        if (isTargetMesh) {
          let sideTexture = null;
          if (name.includes("right")) sideTexture = textures.A;
          else if (name.includes("left")) sideTexture = textures.B;
          else if (name.includes("front")) sideTexture = textures.C;
          else if (name.includes("back")) sideTexture = textures.D;

          if (sideTexture && selectedCustomizationId && selectedCustomizationId !== "no-wrap") {
            const applyToMaterial = (mat: any) => {
                const newMat = mat.clone();
                newMat.map = sideTexture;
                newMat.map.flipY = false; 
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
    scene.updateWorldMatrix(true, true);
    const combinedBox = new Box3();
    scene.traverseVisible((child: any) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      combinedBox.union(new Box3().setFromObject(mesh, true));
    });
    const bounds = combinedBox.isEmpty()
      ? new Box3().setFromObject(scene, true)
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
  }, [scene]);

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
    <group position={[0, 0.08, 0]} rotation={[0, rotationY, 0]}>
      <group
        scale={metrics.scale}
        position={[metrics.offset.x, metrics.offset.y, metrics.offset.z]}
      >
        <Clone object={scene} />
        {showMeasurements && (
          <group position={[metrics.center.x, metrics.center.y, metrics.center.z]}>
            {/* Wireframe box to debug actual bounds */}
            {/* <mesh>
              <boxGeometry args={[metrics.size.x, metrics.size.y, metrics.size.z]} />
              <meshBasicMaterial color="#ff00ff" wireframe />
            </mesh> */}

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
  );
}

export default function StageModel({
  src,
  rotationY = 0,
  onLoad,
  showMeasurements,
  selectedCustomizationId
}: {
  src: string | null;
  rotationY?: number;
  onLoad?: () => void;
  showMeasurements?: boolean;
  selectedCustomizationId?: string;
}) {
  if (!src) {
    return null;
  }

  return <VisibleStageModel src={src} rotationY={rotationY} onLoad={onLoad} showMeasurements={showMeasurements} selectedCustomizationId={selectedCustomizationId} />;
}

