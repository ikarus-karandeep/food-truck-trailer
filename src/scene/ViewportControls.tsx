import { Html } from "@react-three/drei";
import type { EquipmentDefinition, PlacementView } from "../types";
import type { MeasuredFootprint } from "./types";

type ViewportControlsProps = {
  selectedPlaced: PlacementView;
  isEditingSelected: boolean;
  editableEquipmentOptions: EquipmentDefinition[];
  transformMode: "translate" | "scale";
  measuredFootprint?: MeasuredFootprint;
  onDeletePlaced: (placedId: string) => void;
  onSetTransformMode: (mode: "translate" | "scale") => void;
  onToggleViewportEdit: (placedId: string) => void;
  onViewportEquipmentChange: (placedId: string, definitionId: string) => void;
};

export default function ViewportControls({
  selectedPlaced,
  isEditingSelected,
  editableEquipmentOptions,
  transformMode,
  measuredFootprint,
  onDeletePlaced,
  onSetTransformMode,
  onToggleViewportEdit,
  onViewportEquipmentChange
}: ViewportControlsProps) {
  const { item, definition } = selectedPlaced;
  const controlHeight = (measuredFootprint?.height ?? definition.size.height) + 0.08;

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
            onClick={() => onSetTransformMode("translate")}
            title="Move"
            aria-pressed={transformMode === "translate"}
          >
            MV
          </button>
          <button
            className="viewport-icon-button"
            onClick={() => onSetTransformMode("scale")}
            title="Scale"
            aria-pressed={transformMode === "scale"}
          >
            SC
          </button>
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
                onChange={(event) => onViewportEquipmentChange(item.id, event.target.value)}
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
