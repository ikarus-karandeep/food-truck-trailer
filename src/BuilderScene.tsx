import {
  Clone,
  Environment,
  Html,
  OrbitControls,
  useGLTF
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Box3, Vector3 } from "three";
import type {
  Dimensions,
  EquipmentDefinition,
  ModelMetric,
  PlacementView,
  ViewportZoneOption,
  ZoneId
} from "./App";

type BuilderSceneProps = {
  activeStageModelSrc: string | null;
  dimensions: Dimensions;
  placements: PlacementView[];
  selectedPlaced: PlacementView | null;
  selectedPlacedId: string | null;
  isEditingSelected: boolean;
  editableEquipmentOptions: EquipmentDefinition[];
  viewportZoneOptions: ViewportZoneOption[];
  onPlacedSelect: (placedId: string | null) => void;
  onMoveEarlier: (placedId: string) => void;
  onMoveLater: (placedId: string) => void;
  onDeletePlaced: (placedId: string) => void;
  onToggleViewportEdit: (placedId: string) => void;
  onModelMetricsChange: (id: string, metric: ModelMetric) => void;
  onViewportEquipmentChange: (placedId: string, definitionId: string) => void;
  onViewportZoneChange: (placedId: string, zoneId: ZoneId) => void;
};

function StageModel({
  activeStageModelSrc
}: {
  activeStageModelSrc: string | null;
}) {
  if (!activeStageModelSrc) {
    return null;
  }

  return <LoadedStageModel src={activeStageModelSrc} />;
}

function LoadedStageModel({ src }: { src: string }) {
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

function EquipmentVisual({
  definition,
  isSelected
}: {
  definition: EquipmentDefinition;
  isSelected: boolean;
}) {
  const model = definition.model3d;

  if (!model) {
    return null;
  }

  return <ModeledEquipmentVisual definition={definition} isSelected={isSelected} />;
}

function ModeledEquipmentVisual({
  definition
}: {
  definition: EquipmentDefinition;
  isSelected: boolean;
}) {
  const model = definition.model3d;

  if (!model) {
    return null;
  }

  const gltf = useGLTF(model.src);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const metrics = useMemo(() => {
    const bounds = new Box3().setFromObject(scene);
    const center = bounds.getCenter(new Vector3());
    const rawSize = bounds.getSize(new Vector3());
    const scaledSize = rawSize.clone().multiplyScalar(model.scale);

    return {
      offset: {
        x: -center.x * model.scale,
        y: -bounds.min.y * model.scale + (model.yOffset ?? 0),
        z: -center.z * model.scale
      },
      size: scaledSize
    };
  }, [model.scale, model.yOffset, scene]);

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
  viewportZoneOptions,
  onMoveEarlier,
  onMoveLater,
  onDeletePlaced,
  onToggleViewportEdit,
  onViewportEquipmentChange,
  onViewportZoneChange
}: {
  selectedPlaced: PlacementView;
  isEditingSelected: boolean;
  editableEquipmentOptions: EquipmentDefinition[];
  viewportZoneOptions: ViewportZoneOption[];
  onMoveEarlier: (placedId: string) => void;
  onMoveLater: (placedId: string) => void;
  onDeletePlaced: (placedId: string) => void;
  onToggleViewportEdit: (placedId: string) => void;
  onViewportEquipmentChange: (placedId: string, definitionId: string) => void;
  onViewportZoneChange: (placedId: string, zoneId: ZoneId) => void;
}) {
  const { item, definition } = selectedPlaced;
  const controlHeight = definition.size.height + 0.35;

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
            onClick={() => onMoveEarlier(item.id)}
            disabled={!!item.parentId}
            title="Move earlier"
          >
            {"<"}
          </button>
          <button
            className="viewport-icon-button"
            onClick={() => onToggleViewportEdit(item.id)}
            title="Edit"
          >
            ED
          </button>
          <button
            className="viewport-icon-button"
            onClick={() => onMoveLater(item.id)}
            disabled={!!item.parentId}
            title="Move later"
          >
            {">"}
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
                disabled={!!item.parentId}
              >
                {editableEquipmentOptions.map((equipment) => (
                  <option key={equipment.id} value={equipment.id}>
                    {equipment.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Zone</span>
              <select
                value={item.zoneId}
                onChange={(event) =>
                  onViewportZoneChange(item.id, event.target.value as ZoneId)
                }
                disabled={!!item.parentId}
              >
                {viewportZoneOptions.map((zone) => (
                  <option key={zone.zoneId} value={zone.zoneId} disabled={zone.disabled}>
                    {zone.label}
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

function ModelMetricProbe({
  definition,
  onMetric
}: {
  definition: EquipmentDefinition;
  onMetric: (id: string, metric: ModelMetric) => void;
}) {
  const model = definition.model3d;

  if (!model) {
    return null;
  }

  const gltf = useGLTF(model.src);

  useEffect(() => {
    const scene = gltf.scene.clone(true);
    const bounds = new Box3().setFromObject(scene);
    const size = bounds.getSize(new Vector3()).multiplyScalar(model.scale);

    onMetric(definition.id, {
      width: size.x,
      height: size.y,
      length: size.z
    });
  }, [definition.id, gltf.scene, model.scale, onMetric]);

  return null;
}

function BuilderScene({
  activeStageModelSrc,
  placements,
  selectedPlaced,
  selectedPlacedId,
  isEditingSelected,
  editableEquipmentOptions,
  viewportZoneOptions,
  onPlacedSelect,
  onMoveEarlier,
  onMoveLater,
  onDeletePlaced,
  onToggleViewportEdit,
  onModelMetricsChange,
  onViewportEquipmentChange,
  onViewportZoneChange
}: BuilderSceneProps) {
  const measuredDefinitions = useMemo(
    () =>
      Array.from(
        new Map(
          placements
            .filter(({ definition }) => !!definition.model3d)
            .map(({ definition }) => [definition.id, definition])
        ).values()
      ),
    [placements]
  );

  return (
    <Canvas
      camera={{ position: [7.8, 4.9, 7.1], fov: 34 }}
      dpr={[1, 1.5]}
      shadows
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#f3f3f2"]} />
      <Environment preset="studio" environmentIntensity={0.72} />
      <hemisphereLight intensity={0.52} color="#ffffff" groundColor="#cfcfc8" />
      <directionalLight
        position={[8, 11, 6]}
        intensity={1.65}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      {measuredDefinitions.map((definition) => (
        <ModelMetricProbe
          key={`metric-${definition.id}`}
          definition={definition}
          onMetric={onModelMetricsChange}
        />
      ))}
      <group onPointerMissed={() => onPlacedSelect(null)}>
        <StageModel activeStageModelSrc={activeStageModelSrc} />

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
                <EquipmentVisual definition={definition} isSelected={isSelected} />
              {isSelected && selectedPlaced?.item.id === item.id ? (
                <ViewportControls
                  selectedPlaced={selectedPlaced}
                  isEditingSelected={isEditingSelected}
                  editableEquipmentOptions={editableEquipmentOptions}
                  viewportZoneOptions={viewportZoneOptions}
                  onMoveEarlier={onMoveEarlier}
                  onMoveLater={onMoveLater}
                  onDeletePlaced={onDeletePlaced}
                  onToggleViewportEdit={onToggleViewportEdit}
                  onViewportEquipmentChange={onViewportEquipmentChange}
                  onViewportZoneChange={onViewportZoneChange}
                />
              ) : null}
            </group>
          );
        })}
      </group>
      <OrbitControls enablePan enableZoom minDistance={4.5} maxDistance={12} />
    </Canvas>
  );
}

export default BuilderScene;
