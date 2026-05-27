import {
  Clone,
  Edges,
  Environment,
  Html,
  OrbitControls,
  Text,
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
  Zone,
  ZoneId
} from "./App";

type BuilderSceneProps = {
  dimensions: Dimensions;
  zones: Zone[];
  placements: PlacementView[];
  selectedEquipment: EquipmentDefinition | null;
  selectedPlaced: PlacementView | null;
  selectedPlacedId: string | null;
  isEditingSelected: boolean;
  editableEquipmentOptions: EquipmentDefinition[];
  viewportZoneOptions: ViewportZoneOption[];
  onZoneSelect: (equipmentId: string, zoneId: ZoneId) => void;
  onPlacedSelect: (placedId: string | null) => void;
  onMoveEarlier: (placedId: string) => void;
  onMoveLater: (placedId: string) => void;
  onDeletePlaced: (placedId: string) => void;
  onToggleViewportEdit: (placedId: string) => void;
  onModelMetricsChange: (id: string, metric: ModelMetric) => void;
  onViewportEquipmentChange: (placedId: string, definitionId: string) => void;
  onViewportZoneChange: (placedId: string, zoneId: ZoneId) => void;
};

function EquipmentVisual({
  definition,
  isSelected
}: {
  definition: EquipmentDefinition;
  isSelected: boolean;
}) {
  const model = definition.model3d;

  if (!model) {
    return (
      <group position={[0, definition.size.height / 2, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry
            args={[definition.size.width, definition.size.height, definition.size.length]}
          />
          <meshStandardMaterial color={definition.color} />
          {isSelected ? <Edges color="#0f172a" /> : null}
        </mesh>
      </group>
    );
  }

  return <ModeledEquipmentVisual definition={definition} isSelected={isSelected} />;
}

function ModeledEquipmentVisual({
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
      {isSelected ? (
        <mesh
          castShadow
          receiveShadow
          position={[0, metrics.size.y / 2 + (model.yOffset ?? 0), 0]}
        >
          <boxGeometry
            args={[
              metrics.size.x + 0.04,
              metrics.size.y + 0.04,
              metrics.size.z + 0.04
            ]}
          />
          <meshStandardMaterial color="#0f172a" wireframe transparent opacity={0.8} />
        </mesh>
      ) : null}
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
            ←
          </button>
          <button
            className="viewport-icon-button"
            onClick={() => onToggleViewportEdit(item.id)}
            title="Edit"
          >
            ✎
          </button>
          <button
            className="viewport-icon-button"
            onClick={() => onMoveLater(item.id)}
            disabled={!!item.parentId}
            title="Move later"
          >
            →
          </button>
          <button
            className="viewport-icon-button viewport-delete-button"
            onClick={() => onDeletePlaced(item.id)}
            title="Delete"
          >
            🗑
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
  dimensions,
  zones,
  placements,
  selectedEquipment,
  selectedPlaced,
  selectedPlacedId,
  isEditingSelected,
  editableEquipmentOptions,
  viewportZoneOptions,
  onZoneSelect,
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
      camera={{ position: [6.5, 5.5, 6.5], fov: 42 }}
      dpr={[1, 1.5]}
      shadows
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#f3efe7"]} />
      <Environment preset="warehouse" environmentIntensity={0.9} />
      <hemisphereLight intensity={0.45} color="#fff8ee" groundColor="#b9b3a7" />
      <directionalLight
        position={[5, 8, 3]}
        intensity={1.5}
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
        <gridHelper args={[16, 16, "#d0cabf", "#e7e1d6"]} position={[0, -0.01, 0]} />

        <mesh receiveShadow position={[0, -0.03, 0]}>
          <boxGeometry args={[dimensions.width + 0.4, 0.06, dimensions.length + 0.4]} />
          <meshStandardMaterial color="#d8d2c4" />
        </mesh>

        <mesh receiveShadow>
          <boxGeometry args={[dimensions.width, 0.08, dimensions.length]} />
          <meshStandardMaterial color="#fbf7f0" />
        </mesh>

        <mesh position={[0, dimensions.height / 2, -dimensions.length / 2]}>
          <boxGeometry args={[dimensions.width, dimensions.height, 0.04]} />
          <meshStandardMaterial
            color="#fef8ee"
            metalness={0.05}
            roughness={0.92}
            transparent
            opacity={0.32}
          />
        </mesh>
        <mesh position={[0, dimensions.height / 2, dimensions.length / 2]}>
          <boxGeometry args={[dimensions.width, dimensions.height, 0.04]} />
          <meshStandardMaterial
            color="#fef8ee"
            metalness={0.05}
            roughness={0.92}
            transparent
            opacity={0.32}
          />
        </mesh>
        <mesh position={[-dimensions.width / 2, dimensions.height / 2, 0]}>
          <boxGeometry args={[0.04, dimensions.height, dimensions.length]} />
          <meshStandardMaterial
            color="#fef8ee"
            metalness={0.05}
            roughness={0.92}
            transparent
            opacity={0.32}
          />
        </mesh>
        <mesh position={[dimensions.width / 2, dimensions.height / 2, 0]}>
          <boxGeometry args={[0.04, dimensions.height, dimensions.length]} />
          <meshStandardMaterial
            color="#fef8ee"
            metalness={0.05}
            roughness={0.92}
            transparent
            opacity={0.32}
          />
        </mesh>

        {zones.map((zone) => {
          const canAccept = selectedEquipment?.allowedZones.includes(zone.id) ?? false;

          return (
            <group key={zone.id}>
              <mesh
                position={[zone.x, 0.045, zone.z]}
                rotation={[-Math.PI / 2, 0, 0]}
                onClick={() => {
                  onPlacedSelect(null);
                  if (selectedEquipment) {
                    onZoneSelect(selectedEquipment.id, zone.id);
                  }
                }}
              >
                <planeGeometry args={[zone.width, zone.length]} />
                <meshStandardMaterial
                  color={zone.color}
                  transparent
                  opacity={canAccept ? 0.55 : 0.28}
                />
              </mesh>
              <mesh position={[zone.x, 0.05, zone.z]}>
                <boxGeometry args={[zone.width, 0.02, zone.length]} />
                <meshStandardMaterial color={zone.color} transparent opacity={0.08} />
                <Edges color={canAccept ? "#0f172a" : "#7a6d5c"} />
              </mesh>
              <Text
                position={[zone.x, 0.08, zone.z]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.18}
                color="#1f2937"
                maxWidth={Math.max(zone.width, zone.length) - 0.2}
              >
                {zone.name}
              </Text>
            </group>
          );
        })}

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
              <Text
                position={[0, definition.size.height + 0.16, 0]}
                fontSize={0.11}
                color="#1f2937"
                anchorX="center"
                anchorY="middle"
                maxWidth={definition.size.length}
              >
                {definition.name}
              </Text>
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
      <OrbitControls enablePan enableZoom />
    </Canvas>
  );
}

export default BuilderScene;
