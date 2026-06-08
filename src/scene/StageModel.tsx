import { Clone, useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { Box3, Vector3 } from "three";

function VisibleStageModel({
  src,
  rotationY = 0,
  onLoad
}: {
  src: string;
  rotationY?: number;
  onLoad?: () => void;
}) {
  const gltf = useGLTF(src);

  useEffect(() => {
    if (onLoad) onLoad();
  }, [onLoad, src]);

  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const metrics = useMemo(() => {
    const bounds = new Box3().setFromObject(scene);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const longestSide = Math.max(size.x, size.y, size.z, 1);
    const scale = 4.6 / longestSide;

    return {
      scale,
      offset: {
        x: -center.x * scale,
        y: -bounds.min.y * scale,
        z: -center.z * scale
      }
    };
  }, [scene]);

  return (
    <group position={[0, 0.08, 0]} rotation={[0, rotationY, 0]}>
      <group
        scale={metrics.scale}
        position={[metrics.offset.x, metrics.offset.y, metrics.offset.z]}
      >
        <Clone object={scene} />
      </group>
    </group>
  );
}

export default function StageModel({
  src,
  rotationY = 0,
  onLoad
}: {
  src: string | null;
  rotationY?: number;
  onLoad?: () => void;
}) {
  if (!src) {
    return null;
  }

  return <VisibleStageModel src={src} rotationY={rotationY} onLoad={onLoad} />;
}

