import {
  Environment,
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  TransformControls
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Group, OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import DropZoneModel from "./scene/DropZoneModel";
import { DragPreviewEquipmentVisual, EquipmentVisual } from "./scene/EquipmentVisual";
import StageModel from "./scene/StageModel";
import ViewportControls from "./scene/ViewportControls";
import {
  getZoneCenterlineEndpoints,
  resolveNonIntersectingPlacement,
  snapPointToZoneCenterline
} from "./scene/dropZone";
import type { MeasuredFootprint } from "./scene/types";
import type {
  DropPlacement,
  EquipmentDefinition,
  PlacementView,
  Zone,
  ZoneId
} from "./types";

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
  onDropZoneBoundsChange: (
    bounds: Pick<Zone, "x" | "y" | "z" | "length" | "width" | "height" | "lineY"> | null
  ) => void;
  onEquipmentDrop: (
    definitionId: string,
    zoneId: ZoneId | null,
    placement: DropPlacement | null
  ) => void;
  onViewportEquipmentChange: (placedId: string, definitionId: string) => void;
  onPlacedScaleChange: (placedId: string, scale: number) => void;
  onPlacedTransformChange: (
    placedId: string,
    manualPlacement: PlacementView["item"]["manualPlacement"],
    scale: number
  ) => void;
};

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

export default function BuilderScene({
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
  onViewportEquipmentChange,
  onPlacedScaleChange,
  onPlacedTransformChange
}: BuilderSceneProps) {
  const sceneWrapperRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<PerspectiveCamera | OrthographicCamera | null>(null);
  const orbitControlsRef = useRef<any>(null);
  const transformControlsRef = useRef<any>(null);
  const selectedModelGroupRef = useRef<Group | null>(null);
  const dropZoneTargetRef = useRef<Group | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const droppableZones = useMemo(() => zones, [zones]);
  const [dragPreviewPlacement, setDragPreviewPlacement] = useState<DropPlacement | null>(null);
  const [measuredFootprints, setMeasuredFootprints] = useState<Record<string, MeasuredFootprint>>(
    {}
  );
  const [transformMode, setTransformMode] = useState<"translate" | "scale">("translate");

  function handleFootprintChange(measuredId: string, footprint: MeasuredFootprint) {
    setMeasuredFootprints((current) => {
      const previous = current[measuredId];

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
        [measuredId]: footprint
      };
    });
  }

  useEffect(() => {
    const controls = transformControlsRef.current;
    const orbit = orbitControlsRef.current;

    if (!controls || !orbit) {
      return;
    }

    function handleDraggingChange(event: { value: boolean }) {
      if (!orbitControlsRef.current) {
        return;
      }

      orbitControlsRef.current.enabled = !event.value;
    }

    controls.addEventListener("dragging-changed", handleDraggingChange);

    return () => {
      controls.removeEventListener("dragging-changed", handleDraggingChange);
    };
  }, [selectedPlacedId]);

  useEffect(() => {
    if (!draggingEquipment) {
      setDragPreviewPlacement(null);
    }
  }, [draggingEquipment]);

  useEffect(() => {
    setTransformMode("translate");
  }, [selectedPlacedId]);

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
      placement:
        zone && snappedVector
          ? resolveNonIntersectingPlacement(
              zone,
              definition,
              definition.id,
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

        if (!dragTypes.includes("text/equipment-id") && !dragTypes.includes("text/plain")) {
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
            const measuredFootprint = measuredFootprints[item.id];

            return (
              <group
                key={item.id}
                ref={isSelected ? selectedModelGroupRef : undefined}
                position={[placement.x, placement.y, placement.z]}
                rotation={[0, placement.rotationY, 0]}
                scale={placement.scale}
                onClick={(event) => {
                  event.stopPropagation();
                  onPlacedSelect(item.id);
                }}
              >
                <EquipmentVisual
                  definition={definition}
                  scaleMultiplier={1}
                  onFootprintChange={(footprint) => handleFootprintChange(item.id, footprint)}
                />
                {isSelected && selectedPlaced?.item.id === item.id ? (
                  <ViewportControls
                    selectedPlaced={selectedPlaced}
                    isEditingSelected={isEditingSelected}
                    editableEquipmentOptions={editableEquipmentOptions}
                    transformMode={transformMode}
                    measuredFootprint={measuredFootprint}
                    onDeletePlaced={onDeletePlaced}
                    onSetTransformMode={setTransformMode}
                    onToggleViewportEdit={onToggleViewportEdit}
                    onViewportEquipmentChange={onViewportEquipmentChange}
                  />
                ) : null}
              </group>
            );
          })}

          {selectedPlaced ? (
            <TransformControls
              ref={transformControlsRef}
              object={selectedModelGroupRef.current ?? undefined}
              mode={transformMode}
              space="local"
              size={0.65}
              showX
              showY
              showZ
              onMouseDown={() => {
                if (orbitControlsRef.current) {
                  orbitControlsRef.current.enabled = false;
                }
              }}
              onObjectChange={(event: any) => {
                if (!event?.target?.object) {
                  return;
                }

                if (transformMode === "scale") {
                  const clampedScale = Math.max(
                    0.25,
                    Math.min(4, event.target.object.scale.x)
                  );
                  event.target.object.scale.setScalar(clampedScale);
                }
              }}
              onMouseUp={(event: any) => {
                if (orbitControlsRef.current) {
                  orbitControlsRef.current.enabled = true;
                }
                if (!event?.target?.object) {
                  return;
                }

                const nextScale = Math.max(0.25, Math.min(4, event.target.object.scale.x));
                const nextPlacement = {
                  x: event.target.object.position.x,
                  y: event.target.object.position.y,
                  z: event.target.object.position.z,
                  rotationY: selectedPlaced.placement.rotationY
                };

                onPlacedScaleChange(selectedPlaced.item.id, nextScale);
                onPlacedTransformChange(selectedPlaced.item.id, nextPlacement, nextScale);
              }}
            />
          ) : null}
        </group>
        <GizmoHelper alignment="top-right" margin={[88, 88]}>
          <GizmoViewport axisColors={["#111111", "#6b7280", "#d97706"]} labelColor="#ffffff" />
        </GizmoHelper>
        <OrbitControls
          ref={orbitControlsRef}
          enablePan
          enableZoom
          minDistance={4.5}
          maxDistance={12}
        />
      </Canvas>
    </div>
  );
}
