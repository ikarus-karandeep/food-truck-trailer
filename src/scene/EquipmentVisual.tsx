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

    // Use the defined equipment height as the reference for vertical alignment
    const targetHeight = definition.size.height;
    const midPointY = targetHeight / 2;
    const actualHeight = scaledSize.y;

    // Calculate Y offset to center the model if it fits, otherwise keep bottom at 0
    // This prevents sinking while maintaining centering for smaller models
    const yOffset = actualHeight <= targetHeight
      ? midPointY - center.y * appliedScale
      : -bounds.min.y * appliedScale;

    return {
      offset: {
        x: -center.x * appliedScale,
        y: yOffset + (model.yOffset ?? 0) * scaleMultiplier,
        z: -center.z * appliedScale
      },
      footprint: {
        width: (quarterTurn ? scaledSize.z : scaledSize.x),
        length: (quarterTurn ? scaledSize.x : scaledSize.z),
        height: Math.max(actualHeight, targetHeight)
      },
      midPointY: actualHeight <= targetHeight ? midPointY : (actualHeight / 2),
      actualHeight,
      targetHeight
    };
  }, [model.rotationY, model.scale, model.yOffset, scaleMultiplier, scene, definition.size.height]);

  useEffect(() => {
    if (!onFootprintChange) {
      return;
    }

    onFootprintChange(metrics.footprint);
  }, [metrics.footprint, onFootprintChange]);

  const supportHeight = Math.max(0, metrics.midPointY - metrics.actualHeight / 2);

  return (
    <group>
      {/* Central Point/Box */}
      <mesh position={[0, metrics.midPointY, 0]}>
        <boxGeometry args={[0.02, 0.02, 0.02]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
      </mesh>

      {/* Support Box (added below if model is smaller) */}
      {supportHeight > 0.001 && (
        <mesh position={[0, supportHeight / 2, 0]}>
          <boxGeometry
            args={[
              metrics.footprint.width + 0.005, // Slightly oversized to ensure overlap
              supportHeight,
              metrics.footprint.length + 0.005
            ]}
          />
          <meshStandardMaterial color="#333333" metalness={0.2} roughness={0.8} />
        </mesh>
      )}

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
