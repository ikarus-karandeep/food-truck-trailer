import { Clone, useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { Box3, Material, Object3D, Vector3 } from "three";
import type { DropPlacement, EquipmentDefinition } from "../types";
import type { MeasuredFootprint } from "./types";

type ModeledEquipmentVisualProps = {
  definition: EquipmentDefinition;
  scaleMultiplier?: number;
  ghost?: boolean;
  onFootprintChange?: (footprint: MeasuredFootprint) => void;
};

function ModeledEquipmentVisual({
  definition,
  scaleMultiplier = 1,
  ghost = false,
  onFootprintChange
}: ModeledEquipmentVisualProps) {
  const model = definition.model3d;

  if (!model) {
    return null;
  }

  const gltf = useGLTF(model.src);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);

    if (!ghost) {
      return clone;
    }

    clone.traverse((child: Object3D) => {
      const mesh = child as Object3D & { material?: Material | Material[] };

      if (!mesh.material) {
        return;
      }

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clonedMaterials = materials.map((material) => {
        const nextMaterial = material.clone();
        nextMaterial.transparent = true;
        nextMaterial.opacity = 0.55;
        return nextMaterial;
      });

      mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0];
    });

    return clone;
  }, [ghost, gltf.scene]);
  const metrics = useMemo(() => {
    const bounds = new Box3().setFromObject(scene);
    const center = bounds.getCenter(new Vector3());
    const rawSize = bounds.getSize(new Vector3());
    const appliedScale = model.scale * scaleMultiplier;
    const scaledSize = rawSize.clone().multiplyScalar(appliedScale);
    const normalizedRotation =
      ((((model.rotationY ?? 0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
    const quarterTurn =
      Math.abs(normalizedRotation - Math.PI / 2) < 0.001 ||
      Math.abs(normalizedRotation - (Math.PI * 3) / 2) < 0.001;

    return {
      offset: {
        x: -center.x * appliedScale,
        y: -bounds.min.y * appliedScale + (model.yOffset ?? 0) * scaleMultiplier,
        z: -center.z * appliedScale
      },
      footprint: {
        width: quarterTurn ? scaledSize.z : scaledSize.x,
        length: quarterTurn ? scaledSize.x : scaledSize.z,
        height: scaledSize.y
      }
    };
  }, [model.rotationY, model.scale, model.yOffset, scaleMultiplier, scene]);

  useEffect(() => {
    if (!onFootprintChange) {
      return;
    }

    onFootprintChange(metrics.footprint);
  }, [metrics.footprint, onFootprintChange]);

  return (
    <group>
      <group
        scale={model.scale * scaleMultiplier}
        position={[metrics.offset.x, metrics.offset.y, metrics.offset.z]}
        rotation={[0, model.rotationY ?? 0, 0]}
      >
        <Clone object={scene} />
      </group>
    </group>
  );
}

type EquipmentVisualProps = {
  definition: EquipmentDefinition;
  scaleMultiplier?: number;
  onFootprintChange?: (footprint: MeasuredFootprint) => void;
};

export function EquipmentVisual({
  definition,
  scaleMultiplier = 1,
  onFootprintChange
}: EquipmentVisualProps) {
  if (!definition.model3d) {
    return null;
  }

  return (
    <ModeledEquipmentVisual
      definition={definition}
      scaleMultiplier={scaleMultiplier}
      onFootprintChange={onFootprintChange}
    />
  );
}

export function DragPreviewEquipmentVisual({
  definition,
  placement,
  onFootprintChange
}: {
  definition: EquipmentDefinition;
  placement: DropPlacement;
  onFootprintChange?: (footprint: MeasuredFootprint) => void;
}) {
  return (
    <group position={[placement.x, placement.y, placement.z]} rotation={[0, placement.rotationY, 0]}>
      <ModeledEquipmentVisual
        definition={definition}
        ghost
        onFootprintChange={onFootprintChange}
      />
    </group>
  );
}
