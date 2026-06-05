import { Html } from "@react-three/drei";
import type { EquipmentDefinition, PlacementView } from "../types";
import type { MeasuredFootprint } from "./types";

type ViewportControlsProps = {
  selectedPlaced: PlacementView;
  isEditingSelected: boolean;
  editableEquipmentOptions: EquipmentDefinition[];
  measuredFootprint?: MeasuredFootprint;
  canSwapLeft: boolean;
  canSwapRight: boolean;
  onDeletePlaced: (placedId: string) => void;
  onSwapPlaced: (placedId: string, direction: "left" | "right") => void;
  onToggleViewportEdit: (placedId: string) => void;
  onViewportEquipmentChange: (placedId: string, definitionId: string) => void;
  onControlsHoverChange: (hovered: boolean) => void;
};

export default function ViewportControls({
  selectedPlaced,
  isEditingSelected,
  editableEquipmentOptions,
  measuredFootprint,
  canSwapLeft,
  canSwapRight,
  onDeletePlaced,
  onSwapPlaced,
  onToggleViewportEdit,
  onViewportEquipmentChange,
  onControlsHoverChange
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
      <div
        className="viewport-controls"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerEnter={() => onControlsHoverChange(true)}
        onPointerLeave={() => onControlsHoverChange(false)}
        onPointerMove={() => onControlsHoverChange(true)}
        onMouseEnter={() => onControlsHoverChange(true)}
        onMouseLeave={() => onControlsHoverChange(false)}
        onMouseMove={() => onControlsHoverChange(true)}
      >
        <div className="viewport-actions">
          <button
            className="viewport-icon-button"
            onPointerDown={(event) => {
              event.stopPropagation();
              onSwapPlaced(item.id, "left");
            }}
            disabled={!canSwapLeft}
            title="Swap left"
          >
            &larr;
          </button>
          <button
            className="viewport-icon-button viewport-edit-button"
            onPointerDown={(event) => {
              event.stopPropagation();
              onToggleViewportEdit(item.id);
            }}
            title="Edit"
          >
            &#9998;
          </button>
          <button
            className="viewport-icon-button"
            onPointerDown={(event) => {
              event.stopPropagation();
              onSwapPlaced(item.id, "right");
            }}
            disabled={!canSwapRight}
            title="Swap right"
          >
            &rarr;
          </button>
        </div>
        <button
          className="viewport-icon-button viewport-delete-button"
          onPointerDown={(event) => {
            event.stopPropagation();
            onDeletePlaced(item.id);
          }}
          title="Delete"
          aria-label="Delete"
        >
          <span className="viewport-trash-icon" aria-hidden="true" />
        </button>
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
