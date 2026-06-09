import {
  Environment,
  // GizmoHelper,
  // GizmoViewport,
  OrbitControls
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Group, OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import DropZoneModel from "./scene/DropZoneModel";
import { DragPreviewEquipmentVisual, EquipmentVisual } from "./scene/EquipmentVisual";
import StageModel from "./scene/StageModel";
import ViewportControls from "./scene/ViewportControls";
import {
  getEquipmentAxisSize,
  getZoneAxisInfo,
  resolveNonIntersectingPlacement,
  snapPointToZoneCenterline
} from "./scene/dropZone";
import type { MeasuredFootprint } from "./scene/types";
import type {
  ConfiguratorStepId,
  DropPlacement,
  EquipmentDefinition,
  PlacementView,
  Zone,
  ZoneId
} from "./types";

type BuilderSceneProps = {
  selectedStepId: ConfiguratorStepId;
  activeStageModelSrc: string | null;
  dropZoneModelSrc: string | null;
  draggingEquipment: EquipmentDefinition | null;
  zones: Zone[];
  placements: PlacementView[];
  editingPlacedId: string | null;
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
  onMeasuredFootprintsChange: (footprints: Record<string, MeasuredFootprint>) => void;
  onSwapPlaced: (placedId: string, direction: "left" | "right") => void;
  onLoadingChange: (loading: boolean) => void;
  showMeasurements?: boolean;
};



export default function BuilderScene({
  selectedStepId,
  activeStageModelSrc,
  dropZoneModelSrc,
  draggingEquipment,
  zones,
  placements,
  editingPlacedId,
  editableEquipmentOptions,
  onPlacedSelect,
  onDeletePlaced,
  onToggleViewportEdit,
  onDropZoneBoundsChange,
  onEquipmentDrop,
  onViewportEquipmentChange,
  onMeasuredFootprintsChange,
  onSwapPlaced,
  onLoadingChange,
  showMeasurements
}: BuilderSceneProps) {
  const sceneWrapperRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<PerspectiveCamera | OrthographicCamera | null>(null);
  const orbitControlsRef = useRef<any>(null);
  const dropZoneTargetRef = useRef<Group | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const hoverClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const droppableZones = useMemo(() => zones, [zones]);
  const [dragPreviewPlacement, setDragPreviewPlacement] = useState<DropPlacement | null>(null);
  const [measuredFootprints, setMeasuredFootprints] = useState<Record<string, MeasuredFootprint>>(
    {}
  );
  const [stageLoading, setStageLoading] = useState(false);
  const [dropZoneLoading, setDropZoneLoading] = useState(false);
  const [hoveredPlacedId, setHoveredPlacedId] = useState<string | null>(null);

  // Trigger major loading state when source models change
  useEffect(() => {
    if (activeStageModelSrc) setStageLoading(true);
  }, [activeStageModelSrc]);

  useEffect(() => {
    if (dropZoneModelSrc) setDropZoneLoading(true);
  }, [dropZoneModelSrc]);

  useEffect(() => {
    onLoadingChange(stageLoading || dropZoneLoading);
  }, [stageLoading, dropZoneLoading, onLoadingChange]);

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
    if (!draggingEquipment) {
      setDragPreviewPlacement(null);
    }
  }, [draggingEquipment]);

  useEffect(() => {
    onMeasuredFootprintsChange(measuredFootprints);
  }, [measuredFootprints, onMeasuredFootprintsChange]);

  useEffect(
    () => () => {
      if (hoverClearTimeoutRef.current) {
        clearTimeout(hoverClearTimeoutRef.current);
      }
    },
    []
  );

  function keepControlsVisible(placedId: string) {
    if (hoverClearTimeoutRef.current) {
      clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }

    setHoveredPlacedId((prev) => (prev === placedId ? prev : placedId));
  }

  function scheduleControlsHide(placedId: string) {
    if (hoverClearTimeoutRef.current) {
      clearTimeout(hoverClearTimeoutRef.current);
    }

    hoverClearTimeoutRef.current = setTimeout(() => {
      // Don't hide if this item is currently being edited
      if (editingPlacedId === placedId) {
        hoverClearTimeoutRef.current = null;
        return;
      }

      setHoveredPlacedId((current) => (current === placedId ? null : current));
      hoverClearTimeoutRef.current = null;
    }, 1200);
  }

  function getSwapAvailability(placementView: PlacementView) {
    const horizontal = placementView.zone.length >= placementView.zone.width;
    const axis = getZoneAxisInfo(placementView.zone);
    const itemHalf =
      getEquipmentAxisSize(
        placementView.definition,
        placementView.item.id,
        placementView.zone,
        measuredFootprints
      ) / 2;
    const currentAxis = horizontal ? placementView.placement.z : placementView.placement.x;
    const canMoveLeft = currentAxis > axis.min + itemHalf + 0.001;
    const canMoveRight = currentAxis < axis.max - itemHalf - 0.001;
    const peers = placements
      .filter(
        ({ item, definition, zone }) =>
          item.zoneId === placementView.item.zoneId &&
          zone.id === placementView.zone.id &&
          definition.level === placementView.definition.level
      )
      .sort((a, b) => {
        const aAxis = horizontal ? a.placement.z : a.placement.x;
        const bAxis = horizontal ? b.placement.z : b.placement.x;

        return aAxis - bAxis;
      });
    const index = peers.findIndex(({ item }) => item.id === placementView.item.id);

    return {
      canSwapLeft: index > 0 || canMoveLeft,
      canSwapRight: (index >= 0 && index < peers.length - 1) || canMoveRight
    };
  }

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
        camera={{ position: [15, 10, 15], fov: 34 }}
        dpr={[1, 1.5]}
        shadows
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ camera }) => {
          cameraRef.current = camera;
        }}
      >
        <color attach="background" args={["#f3f3f2"]} />
        <Environment files="/neutral.hdr" environmentIntensity={0.68} />
        <hemisphereLight intensity={0.52} color="#ffffff" groundColor="#cfcfc8" />
        <directionalLight
          position={[20, 30, 15]}
          intensity={1.65}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <group onPointerMissed={() => onPlacedSelect(null)}>
          <Suspense fallback={null}>
            <StageModel
              src={activeStageModelSrc}
              rotationY={activeStageModelSrc?.includes("16-serving") ? Math.PI : 0}
              onLoad={() => setStageLoading(false)}
              showMeasurements={showMeasurements}
            />
          </Suspense>
          <Suspense fallback={null}>
            <DropZoneModel
              src={dropZoneModelSrc}
              referenceSrc={activeStageModelSrc}
              rotationY={activeStageModelSrc?.includes("16-serving") ? Math.PI : 0}
              onBoundsChange={onDropZoneBoundsChange}
              onTargetChange={(target) => {
                dropZoneTargetRef.current = target;
              }}
              onLoad={() => setDropZoneLoading(false)}
            />
          </Suspense>

          {draggingEquipment && dragPreviewPlacement ? (
            <Suspense fallback={null}>
              <DragPreviewEquipmentVisual
                definition={draggingEquipment}
                placement={dragPreviewPlacement}
                onFootprintChange={(footprint) =>
                  handleFootprintChange(draggingEquipment.id, footprint)
                }
              />
            </Suspense>
          ) : null}

          {placements.map(({ item, definition, placement }) => {
            const isHovered = hoveredPlacedId === item.id;
            const measuredFootprint = measuredFootprints[item.id];
            const placementView = placements.find(({ item: candidate }) => candidate.id === item.id);
            const swapAvailability = placementView
              ? getSwapAvailability(placementView)
              : { canSwapLeft: false, canSwapRight: false };

            return (
              <group
                key={item.id}
                position={[placement.x, placement.y, placement.z]}
                rotation={[0, placement.rotationY, 0]}
                scale={placement.scale}
                onClick={(event) => {
                  event.stopPropagation();
                  onPlacedSelect(item.id);
                }}
                onPointerEnter={(event) => {
                  event.stopPropagation();
                  keepControlsVisible(item.id);
                }}
                onPointerLeave={(event) => {
                  event.stopPropagation();
                  scheduleControlsHide(item.id);
                }}
              >
                <Suspense fallback={null}>
                  <EquipmentVisual
                    definition={definition}
                    scaleMultiplier={1}
                    onFootprintChange={(footprint) => handleFootprintChange(item.id, footprint)}
                  />
                </Suspense>
                {isHovered && placementView ? (
                  <ViewportControls
                    selectedPlaced={placementView}
                    isEditingSelected={editingPlacedId === item.id}
                    editableEquipmentOptions={editableEquipmentOptions}
                    measuredFootprint={measuredFootprint}
                    canSwapLeft={swapAvailability.canSwapLeft}
                    canSwapRight={swapAvailability.canSwapRight}
                    onDeletePlaced={onDeletePlaced}
                    onSwapPlaced={onSwapPlaced}
                    onToggleViewportEdit={onToggleViewportEdit}
                    onViewportEquipmentChange={onViewportEquipmentChange}
                    onControlsHoverChange={(hovered) => {
                      if (hovered) {
                        keepControlsVisible(item.id);
                        return;
                      }

                      scheduleControlsHide(item.id);
                    }}
                  />
                ) : null}
              </group>
            );
          })}
        </group>
        {/* <GizmoHelper alignment="top-right" margin={[88, 88]}>
          <GizmoViewport axisColors={["#111111", "#6b7280", "#d97706"]} labelColor="#ffffff" />
        </GizmoHelper> */}
        <OrbitControls
          ref={orbitControlsRef}
          enablePan
          enableZoom
          enableRotate
          minAzimuthAngle={
            selectedStepId === "equipment-side" ? -0.35
            : selectedStepId === "serving-side" ? -0.35
            : -Infinity
          }
          maxAzimuthAngle={
            selectedStepId === "equipment-side" ? 0.35
            : selectedStepId === "serving-side" ? 0.35
            : Infinity
          }
          minPolarAngle={
            selectedStepId === "equipment-side" || selectedStepId === "serving-side"
              ? Math.PI / 2.8
              : 0
          }
          maxPolarAngle={
            selectedStepId === "equipment-side" || selectedStepId === "serving-side"
              ? Math.PI / 2
              : Math.PI
          }
          minDistance={2.5}
          maxDistance={40}
        />
      </Canvas>
    </div>
  );
}
