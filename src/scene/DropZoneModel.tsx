import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { Box3, Group, Vector3 } from "three";
import type { Zone } from "../types";

type DropZoneModelProps = {
  src: string | null;
  referenceSrc: string | null;
  onBoundsChange: (
    bounds: Pick<Zone, "x" | "y" | "z" | "length" | "width" | "height" | "lineY"> | null
  ) => void;
  onTargetChange: (target: Group | null) => void;
};

function MeasuredDropZoneModel({
  src,
  referenceSrc,
  onBoundsChange,
  onTargetChange
}: Required<DropZoneModelProps> & { src: string; referenceSrc: string }) {
  const gltf = useGLTF(src);
  const referenceGltf = useGLTF(referenceSrc);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const referenceScene = useMemo(() => referenceGltf.scene.clone(true), [referenceGltf.scene]);
  const metrics = useMemo(() => {
    const referenceBounds = new Box3().setFromObject(referenceScene);
    const referenceCenter = referenceBounds.getCenter(new Vector3());
    const referenceSize = referenceBounds.getSize(new Vector3());
    const longestSide = Math.max(referenceSize.x, referenceSize.y, referenceSize.z, 1);
    const scale = 4.6 / longestSide;

    return {
      scale,
      offset: {
        x: -referenceCenter.x * scale,
        y: -referenceBounds.min.y * scale,
        z: -referenceCenter.z * scale
      }
    };
  }, [referenceScene]);

  const transformedDropZone = useMemo(() => {
    const target = new Group();
    const content = scene.clone(true);

    target.position.set(0, 0.08, 0);
    content.scale.setScalar(metrics.scale);
    content.position.set(metrics.offset.x, metrics.offset.y, metrics.offset.z);
    target.add(content);
    target.updateMatrixWorld(true);

    return target;
  }, [metrics.offset.x, metrics.offset.y, metrics.offset.z, metrics.scale, scene]);

  useEffect(() => {
    const transformedBounds = new Box3().setFromObject(transformedDropZone);
    const center = transformedBounds.getCenter(new Vector3());
    const size = transformedBounds.getSize(new Vector3());

    onBoundsChange({
      x: center.x,
      y: center.y,
      z: center.z,
      length: size.z,
      width: size.x,
      height: size.y,
      lineY: transformedBounds.max.y
    });
  }, [onBoundsChange, transformedDropZone]);

  useEffect(() => {
    onTargetChange(transformedDropZone);

    return () => {
      onTargetChange(null);
    };
  }, [onTargetChange, transformedDropZone]);

  return <primitive object={transformedDropZone} />;
}

export default function DropZoneModel({
  src,
  referenceSrc,
  onBoundsChange,
  onTargetChange
}: DropZoneModelProps) {
  useEffect(() => {
    if (!src) {
      onBoundsChange(null);
      onTargetChange(null);
    }
  }, [src, onBoundsChange, onTargetChange]);

  if (!src) {
    return null;
  }

  return (
    <MeasuredDropZoneModel
      src={src}
      referenceSrc={referenceSrc ?? src}
      onBoundsChange={onBoundsChange}
      onTargetChange={onTargetChange}
    />
  );
}
