import {
  Clone,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Html,
  OrbitControls,
  useGLTF
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box3, Group, Material, Object3D, OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import type {
  DropPlacement,
  EquipmentDefinition,
  PlacementView,
  Zone,
  ZoneId
} from "./App";

type BuilderSceneProps = {
  activeStageModelSrc: string | null;
  dropZoneModelSrc: string | null;
  draggingEquipment: EquipmentDefinition | null;
  zones: Zone[];
  placements: PlacementView[];
  selectedPlaced: PlacementView | null;
  selectedPlacedId: string | null;
  isEditingSelected: boolean;
  editableEquipmentOptions: EquipmentDefinition[];
  onPlacedSelect: (placedId: string | null) => void;
  onDeletePlaced: (placedId: string) => void;
  onToggleViewportEdit: (placedId: string) => void;
  onDropZoneBoundsChange: (bounds: Pick<Zone, "x" | "z" | "length" | "width" | "height"> | null) => void;
  onEquipmentDrop: (
    definitionId: string,
    zoneId: ZoneId | null,
    placement: DropPlacement | null
  ) => void;
  onViewportEquipmentChange: (placedId: string, definitionId: string) => void;
};

type MeasuredFootprint = {
  width: number;
  length: number;
  height: number;
};

function StageModel({
  src
}: {
  src: string | null;
}) {
  if (!src) {
    return null;
  }

  return <VisibleStageModel src={src} />;
}

function DropZoneModel({
  src,
  referenceSrc,
  onBoundsChange,
  onTargetChange
}: {
  src: string | null;
  referenceSrc: string | null;
  onBoundsChange: (bounds: Pick<Zone, "x" | "z" | "length" | "width" | "height"> | null) => void;
  onTargetChange: (target: Group | null) => void;
}) {
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

function VisibleStageModel({ src }: { src: string }) {
  const gltf = useGLTF(src);
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
    <group position={[0, 0.08, 0]}>
      <group
        scale={metrics.scale}
        position={[metrics.offset.x, metrics.offset.y, metrics.offset.z]}
      >
        <Clone object={scene} />
      </group>
    </group>
  );
}

function MeasuredDropZoneModel({
  src,
  referenceSrc,
  onBoundsChange,
  onTargetChange
}: {
  src: string;
  referenceSrc: string;
  onBoundsChange: (bounds: Pick<Zone, "x" | "z" | "length" | "width" | "height"> | null) => void;
  onTargetChange: (target: Group | null) => void;
}) {
  const gltf = useGLTF(src);
  const referenceGltf = useGLTF(referenceSrc);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const referenceScene = useMemo(
    () => referenceGltf.scene.clone(true),
    [referenceGltf.scene]
  );
  const metrics = useMemo(() => {
    const bounds = new Box3().setFromObject(scene);
    const referenceBounds = new Box3().setFromObject(referenceScene);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const referenceCenter = referenceBounds.getCenter(new Vector3());
    const referenceSize = referenceBounds.getSize(new Vector3());
    const longestSide = Math.max(referenceSize.x, referenceSize.y, referenceSize.z, 1);
    const scale = 4.6 / longestSide;

    return {
      scale,
      size,
      offset: {
        x: -referenceCenter.x * scale,
        y: -referenceBounds.min.y * scale,
        z: -referenceCenter.z * scale
      },
      center: {
        x: center.x * scale,
        y: center.y * scale,
        z: center.z * scale
      }
    };
  }, [referenceScene, scene]);

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
    onBoundsChange({
      x: metrics.center.x + metrics.offset.x,
      z: metrics.center.z + metrics.offset.z,
      length: metrics.size.z * metrics.scale,
      width: metrics.size.x * metrics.scale,
      height: metrics.size.y * metrics.scale
    });
  }, [
    metrics.center.x,
    metrics.center.z,
    metrics.offset.x,
    metrics.offset.z,
    metrics.scale,
    metrics.size.x,
    metrics.size.y,
    metrics.size.z,
    onBoundsChange
  ]);

  useEffect(() => {
    onTargetChange(transformedDropZone);

    return () => {
      onTargetChange(null);
    };
  }, [onTargetChange, transformedDropZone]);

  return <primitive object={transformedDropZone} />;
}

function EquipmentVisual({
  definition,
  isSelected,
  onFootprintChange
}: {
  definition: EquipmentDefinition;
  isSelected: boolean;
  onFootprintChange?: (footprint: MeasuredFootprint) => void;
}) {
  const model = definition.model3d;

  if (!model) {
    return null;
  }

  return (
    <ModeledEquipmentVisual
      definition={definition}
      isSelected={isSelected}
      onFootprintChange={onFootprintChange}
    />
  );
}

function ModeledEquipmentVisual({
  definition,
  ghost = false,
  onFootprintChange
}: {
  definition: EquipmentDefinition;
  isSelected: boolean;
  ghost?: boolean;
  onFootprintChange?: (footprint: MeasuredFootprint) => void;
}) {
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
    const scaledSize = rawSize.clone().multiplyScalar(model.scale);
    const normalizedRotation =
      ((((model.rotationY ?? 0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
    const quarterTurn =
      Math.abs(normalizedRotation - Math.PI / 2) < 0.001 ||
      Math.abs(normalizedRotation - (Math.PI * 3) / 2) < 0.001;

    return {
      offset: {
        x: -center.x * model.scale,
        y: -bounds.min.y * model.scale + (model.yOffset ?? 0),
        z: -center.z * model.scale
      },
      footprint: {
        width: quarterTurn ? scaledSize.z : scaledSize.x,
        length: quarterTurn ? scaledSize.x : scaledSize.z,
        height: scaledSize.y
      }
    };
  }, [model.scale, model.yOffset, scene]);

  useEffect(() => {
    if (!onFootprintChange) {
      return;
    }

    onFootprintChange(metrics.footprint);
  }, [metrics.footprint, onFootprintChange]);

  return (
    <group>
      <group
        scale={model.scale}
        position={[metrics.offset.x, metrics.offset.y, metrics.offset.z]}
        rotation={[0, model.rotationY ?? 0, 0]}
      >
        <Clone object={scene} />
      </group>
    </group>
  );
}

function ViewportControls({
  selectedPlaced,
  isEditingSelected,
  editableEquipmentOptions,
  measuredFootprint,
  onDeletePlaced,
  onToggleViewportEdit,
  onViewportEquipmentChange
}: {
  selectedPlaced: PlacementView;
  isEditingSelected: boolean;
  editableEquipmentOptions: EquipmentDefinition[];
  measuredFootprint?: MeasuredFootprint;
  onDeletePlaced: (placedId: string) => void;
  onToggleViewportEdit: (placedId: string) => void;
  onViewportEquipmentChange: (placedId: string, definitionId: string) => void;
}) {
  const { item, definition } = selectedPlaced;
  const controlHeight = (measuredFootprint?.height ?? definition.size.height) + 0.35;

  return (
    <Html
      position={[0, controlHeight, 0]}
      center
      occlude={false}
      style={{ pointerEvents: "auto" }}
    >
      <div className="viewport-controls" onClick={(event) => event.stopPropagation()}>
        <div className="viewport-actions">
          <button
            className="viewport-icon-button"
            onClick={() => onToggleViewportEdit(item.id)}
            title="Edit"
          >
            ED
          </button>
          <button
            className="viewport-icon-button viewport-delete-button"
            onClick={() => onDeletePlaced(item.id)}
            title="Delete"
          >
            X
          </button>
        </div>
        {isEditingSelected ? (
          <div className="viewport-editor">
            <label>
              <span>Equipment</span>
              <select
                value={definition.id}
                onChange={(event) =>
                  onViewportEquipmentChange(item.id, event.target.value)
                }
              >
                {editableEquipmentOptions.map((equipment) => (
                  <option key={equipment.id} value={equipment.id}>
                    {equipment.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>
    </Html>
  );
}

function DragPreviewEquipmentVisual({
  definition,
  placement,
  onFootprintChange
}: {
  definition: EquipmentDefinition;
  placement: DropPlacement;
  onFootprintChange?: (footprint: MeasuredFootprint) => void;
}) {
  return (
    <group position={[placement.x, 0.08, placement.z]} rotation={[0, placement.rotationY, 0]}>
      <ModeledEquipmentVisual
        definition={definition}
        isSelected={false}
        ghost
        onFootprintChange={onFootprintChange}
      />
    </group>
  );
}

function getZoneCenterlineEndpoints(zone: Zone) {
  const lineY = 0.082;

  if (zone.length >= zone.width) {
    return [
      new Vector3(zone.x, lineY, zone.z - zone.length / 2),
      new Vector3(zone.x, lineY, zone.z + zone.length / 2)
    ] as const;
  }

  return [
    new Vector3(zone.x - zone.width / 2, lineY, zone.z),
    new Vector3(zone.x + zone.width / 2, lineY, zone.z)
  ] as const;
}

function getZoneAxisInfo(zone: Zone) {
  const horizontal = zone.length >= zone.width;

  return {
    horizontal,
    min: horizontal ? zone.z - zone.length / 2 : zone.x - zone.width / 2,
    max: horizontal ? zone.z + zone.length / 2 : zone.x + zone.width / 2
  };
}

function getEquipmentAxisSize(
  definition: EquipmentDefinition,
  zone: Zone,
  measuredFootprints: Record<string, MeasuredFootprint>
) {
  const measured = measuredFootprints[definition.id];

  if (measured) {
    return zone.length >= zone.width ? measured.length : measured.width;
  }

  return zone.length >= zone.width ? definition.size.length : definition.size.width;
}

function snapPointToZoneCenterline(zone: Zone, point: Vector3) {
  if (zone.length >= zone.width) {
    return {
      x: zone.x,
      z: Math.min(zone.z + zone.length / 2, Math.max(zone.z - zone.length / 2, point.z))
    };
  }

  return {
    x: Math.min(zone.x + zone.width / 2, Math.max(zone.x - zone.width / 2, point.x)),
    z: zone.z
  };
}

function DropZoneCenterLine({ zone }: { zone: Zone }) {
  const points = useMemo(() => getZoneCenterlineEndpoints(zone), [zone]);

  return (
    <line>
      <bufferGeometry attach="geometry">
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array(points.flatMap((point) => point.toArray())), 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial attach="material" color="#d62828" linewidth={2} />
    </line>
  );
}

function resolveNonIntersectingPlacement(
  zone: Zone,
  definition: EquipmentDefinition,
  point: Vector3,
  placements: PlacementView[],
  measuredFootprints: Record<string, MeasuredFootprint>
) {
  const axis = getZoneAxisInfo(zone);
  const itemHalf = getEquipmentAxisSize(definition, zone, measuredFootprints) / 2;
  const candidate = axis.horizontal ? point.z : point.x;
  const gap = 0;
  const occupied = placements
    .filter(({ item }) => item.zoneId === zone.id)
    .map(({ definition: placedDefinition, placement }) => {
      const placedHalf = getEquipmentAxisSize(placedDefinition, zone, measuredFootprints) / 2;
      const center = axis.horizontal ? placement.z : placement.x;

      return {
        start: center - placedHalf - gap,
        end: center + placedHalf + gap
      };
    })
    .sort((a, b) => a.start - b.start);

  const freeSegments: Array<{ start: number; end: number }> = [];
  let cursor = axis.min;

  for (const interval of occupied) {
    if (interval.start > cursor) {
      freeSegments.push({ start: cursor, end: interval.start });
    }

    cursor = Math.max(cursor, interval.end);
  }

  if (cursor < axis.max) {
    freeSegments.push({ start: cursor, end: axis.max });
  }

  const nearestFit =
    freeSegments
      .map((segment) => {
        const minCenter = segment.start + itemHalf;
        const maxCenter = segment.end - itemHalf;

        if (minCenter > maxCenter) {
          return null;
        }

        const center = Math.min(maxCenter, Math.max(minCenter, candidate));
        return { center, distance: Math.abs(center - candidate) };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => a.distance - b.distance)[0] ?? null;

  if (!nearestFit) {
    return null;
  }

  return axis.horizontal
    ? {
        x: zone.x,
        z: nearestFit.center,
        rotationY: 0
      }
    : {
        x: nearestFit.center,
        z: zone.z,
        rotationY: 0
      };
}

function BuilderScene({
  activeStageModelSrc,
  dropZoneModelSrc,
  draggingEquipment,
  zones,
  placements,
  selectedPlaced,
  selectedPlacedId,
  isEditingSelected,
  editableEquipmentOptions,
  onPlacedSelect,
  onDeletePlaced,
  onToggleViewportEdit,
  onDropZoneBoundsChange,
  onEquipmentDrop,
  onViewportEquipmentChange
}: BuilderSceneProps) {
  const sceneWrapperRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<PerspectiveCamera | OrthographicCamera | null>(null);
  const dropZoneTargetRef = useRef<Group | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const droppableZones = useMemo(() => zones, [zones]);
  const [dragPreviewPlacement, setDragPreviewPlacement] = useState<DropPlacement | null>(null);
  const [measuredFootprints, setMeasuredFootprints] = useState<Record<string, MeasuredFootprint>>({});

  function handleFootprintChange(definitionId: string, footprint: MeasuredFootprint) {
    setMeasuredFootprints((current) => {
      const previous = current[definitionId];

      if (
        previous &&
        previous.width === footprint.width &&
        previous.length === footprint.length &&
        previous.height === footprint.height
      ) {
        return current;
      }

      return {
        ...current,
        [definitionId]: footprint
      };
    });
  }

  useEffect(() => {
    if (!draggingEquipment) {
      setDragPreviewPlacement(null);
    }
  }, [draggingEquipment]);

  function resolveDropTarget(
    event: React.DragEvent<HTMLDivElement>,
    definition: EquipmentDefinition | null
  ) {
    const wrapper = sceneWrapperRef.current;
    const camera = cameraRef.current;

    if (!wrapper || !camera || !definition) {
      return { zoneId: null, placement: null };
    }

    const bounds = wrapper.getBoundingClientRect();

    if (bounds.width === 0 || bounds.height === 0) {
      return { zoneId: null, placement: null };
    }

    pointerRef.current.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -(((event.clientY - bounds.top) / bounds.height) * 2 - 1)
    );

    raycasterRef.current.setFromCamera(pointerRef.current, camera);
    const dropTarget = dropZoneTargetRef.current;

    if (!dropTarget) {
      return { zoneId: null, placement: null };
    }

    dropTarget.updateMatrixWorld(true);
    const intersections = raycasterRef.current.intersectObject(dropTarget, true);
    const hit = intersections.find((intersection) => intersection.point !== undefined);

    if (!hit) {
      return { zoneId: null, placement: null };
    }

    const dropPoint = hit.point;

    const zone =
      droppableZones.find((candidate) => {
        const withinX =
          dropPoint.x >= candidate.x - candidate.width / 2 &&
          dropPoint.x <= candidate.x + candidate.width / 2;
        const withinZ =
          dropPoint.z >= candidate.z - candidate.length / 2 &&
          dropPoint.z <= candidate.z + candidate.length / 2;

        return withinX && withinZ;
      }) ?? null;

    const snappedPoint = zone ? snapPointToZoneCenterline(zone, dropPoint) : null;
    const snappedVector = snappedPoint
      ? new Vector3(snappedPoint.x, dropPoint.y, snappedPoint.z)
      : null;

    return {
      zoneId: zone?.id ?? null,
      placement: zone && snappedVector
        ? resolveNonIntersectingPlacement(
            zone,
            definition,
            snappedVector,
            placements,
            measuredFootprints
          )
        : null
    };
  }

  function getDraggedEquipmentId(event: React.DragEvent<HTMLDivElement>) {
    return (
      event.dataTransfer.getData("text/equipment-id") ||
      event.dataTransfer.getData("text/plain")
    );
  }

  return (
    <div
      ref={sceneWrapperRef}
      className="builder-scene-shell"
      onDragOver={(event) => {
        const dragTypes = Array.from(event.dataTransfer.types ?? []);

        if (
          !dragTypes.includes("text/equipment-id") &&
          !dragTypes.includes("text/plain")
        ) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        const target = resolveDropTarget(event, draggingEquipment);
        setDragPreviewPlacement(target.placement);
      }}
      onDragLeave={() => setDragPreviewPlacement(null)}
      onDrop={(event) => {
        const definitionId = getDraggedEquipmentId(event);

        if (!definitionId) {
          return;
        }

        event.preventDefault();
        const target = resolveDropTarget(event, draggingEquipment);
        setDragPreviewPlacement(null);
        onEquipmentDrop(definitionId, target.zoneId, target.placement);
      }}
    >
      <Canvas
        camera={{ position: [7.8, 4.9, 7.1], fov: 34 }}
        dpr={[1, 1.5]}
        shadows
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ camera }) => {
          cameraRef.current = camera;
        }}
      >
        <color attach="background" args={["#f3f3f2"]} />
        <Environment preset="park" environmentIntensity={0.68} />
        <hemisphereLight intensity={0.52} color="#ffffff" groundColor="#cfcfc8" />
        <directionalLight
          position={[8, 11, 6]}
          intensity={1.65}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <group onPointerMissed={() => onPlacedSelect(null)}>
          <StageModel src={activeStageModelSrc} />
          <DropZoneModel
            src={dropZoneModelSrc}
            referenceSrc={activeStageModelSrc}
            onBoundsChange={onDropZoneBoundsChange}
            onTargetChange={(target) => {
              dropZoneTargetRef.current = target;
            }}
          />
          {droppableZones.map((zone) => (
            <DropZoneCenterLine key={zone.id} zone={zone} />
          ))}
          {draggingEquipment && dragPreviewPlacement ? (
            <DragPreviewEquipmentVisual
              definition={draggingEquipment}
              placement={dragPreviewPlacement}
              onFootprintChange={(footprint) =>
                handleFootprintChange(draggingEquipment.id, footprint)
              }
            />
          ) : null}

          {placements.map(({ item, definition, placement }) => {
            const isSelected = selectedPlacedId === item.id;

            return (
              <group
                key={item.id}
                position={[placement.x, placement.y, placement.z]}
                rotation={[0, placement.rotationY, 0]}
                onClick={(event) => {
                  event.stopPropagation();
                  onPlacedSelect(item.id);
                }}
              >
                <EquipmentVisual
                  definition={definition}
                  isSelected={isSelected}
                  onFootprintChange={(footprint) =>
                    handleFootprintChange(definition.id, footprint)
                  }
                />
                {isSelected && selectedPlaced?.item.id === item.id ? (
                  <ViewportControls
                    selectedPlaced={selectedPlaced}
                    isEditingSelected={isEditingSelected}
                    editableEquipmentOptions={editableEquipmentOptions}
                    measuredFootprint={measuredFootprints[definition.id]}
                    onDeletePlaced={onDeletePlaced}
                    onToggleViewportEdit={onToggleViewportEdit}
                    onViewportEquipmentChange={onViewportEquipmentChange}
                  />
                ) : null}
              </group>
            );
          })}
        </group>
        <GizmoHelper alignment="top-right" margin={[88, 88]}>
          <GizmoViewport
            axisColors={["#111111", "#6b7280", "#d97706"]}
            labelColor="#ffffff"
          />
        </GizmoHelper>
        <OrbitControls enablePan enableZoom minDistance={4.5} maxDistance={12} />
      </Canvas>
    </div>
  );
}

export default BuilderScene;
