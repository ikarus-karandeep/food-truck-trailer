import { Suspense, lazy, useMemo, useState, type CSSProperties } from "react";
import { equipmentCatalog, equipmentMenuGroups } from "./catalog";
import { buildZones, configuratorSteps, trailerSizes } from "./configurator";
import type {
  ConfiguratorStepId,
  DropPlacement,
  EquipmentDefinition,
  PlacementView,
  PlacedEquipment,
  TrailerSize,
  Zone,
  ZoneId
} from "./types";

const BuilderScene = lazy(() => import("./BuilderScene"));

function App() {
  const [selectedStepId, setSelectedStepId] = useState<ConfiguratorStepId>("size");
  const [selectedTrailerSizeId, setSelectedTrailerSizeId] =
    useState<TrailerSize["id"]>("size-16");
  const [placed, setPlaced] = useState<PlacedEquipment[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [draggingEquipmentId, setDraggingEquipmentId] = useState<string | null>(null);
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
  const [editingPlacedId, setEditingPlacedId] = useState<string | null>(null);
  const [dropZoneBounds, setDropZoneBounds] = useState<Partial<Zone> | null>(null);

  const zones = useMemo(
    () => buildZones(selectedStepId === "equipment-side" ? dropZoneBounds ?? undefined : undefined),
    [dropZoneBounds, selectedStepId]
  );
  const zoneMap = useMemo(
    () => Object.fromEntries(zones.map((zone) => [zone.id, zone])) as Record<ZoneId, Zone>,
    [zones]
  );
  const equipmentMap = useMemo(
    () =>
      Object.fromEntries(equipmentCatalog.map((equipment) => [equipment.id, equipment])) as Record<
        string,
        EquipmentDefinition
      >,
    []
  );

  const selectedTrailerSize = useMemo(
    () =>
      trailerSizes.find((trailerSize) => trailerSize.id === selectedTrailerSizeId) ??
      trailerSizes[0],
    [selectedTrailerSizeId]
  );

  const placements = useMemo<PlacementView[]>(
    () =>
      placed
        .map((item) => {
          const definition = equipmentMap[item.definitionId];
          const zone = zoneMap[item.zoneId];

          if (!definition || !zone) {
            return null;
          }

          return {
            item,
            definition,
            zone,
            placement: {
              x: item.manualPlacement?.x ?? zone.x,
              y: item.manualPlacement?.y ?? zone.lineY,
              z: item.manualPlacement?.z ?? zone.z,
              rotationY: item.manualPlacement?.rotationY ?? 0,
              scale: item.manualScale ?? 1
            }
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    [equipmentMap, placed, zoneMap]
  );

  const selectedPlaced = useMemo(
    () => placements.find(({ item }) => item.id === selectedPlacedId) ?? null,
    [placements, selectedPlacedId]
  );
  const isEditingSelected = selectedPlacedId !== null && selectedPlacedId === editingPlacedId;

  const editableEquipmentOptions = useMemo(
    () => (selectedPlaced ? equipmentCatalog : []),
    [selectedPlaced]
  );

  function removePlaced(id: string) {
    setPlaced((current) => current.filter((item) => item.id !== id));
    setSelectedPlacedId((current) => (current === id ? null : current));
    setEditingPlacedId((current) => (current === id ? null : current));
  }

  function placeEquipmentInZone(
    definitionId: string,
    preferredZoneId: ZoneId | null,
    dropPlacement?: DropPlacement | null
  ) {
    if (!equipmentMap[definitionId] || !preferredZoneId || !dropPlacement) {
      return;
    }

    let createdId: string | null = null;

    setPlaced((current) => {
      createdId = `${definitionId}-${crypto.randomUUID()}`;

      return [
        ...current,
        {
          id: createdId,
          definitionId,
          zoneId: preferredZoneId,
          manualPlacement: dropPlacement
        }
      ];
    });

    if (!createdId) {
      return;
    }

    setSelectedEquipmentId(definitionId);
    setSelectedPlacedId(createdId);
    setEditingPlacedId(null);
  }

  function updatePlacedDefinition(id: string, definitionId: string) {
    setPlaced((current) => {
      const target = current.find((item) => item.id === id);

      if (!target || !equipmentMap[definitionId]) {
        return current;
      }

      return current.map((item) =>
        item.id === id
          ? {
              ...item,
              definitionId
            }
          : item
      );
    });
    setEditingPlacedId(id);
  }

  function updatePlacedScale(id: string, scale: number) {
    setPlaced((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              manualScale: scale
            }
          : item
      )
    );
  }

  function updatePlacedTransform(
    id: string,
    manualPlacement: PlacedEquipment["manualPlacement"],
    scale: number
  ) {
    setPlaced((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              manualPlacement,
              manualScale: scale
            }
          : item
      )
    );
  }

  const activeStageModelSrc = useMemo(
    () => selectedTrailerSize.stageModels[selectedStepId] ?? null,
    [selectedStepId, selectedTrailerSize]
  );
  const activeDropZoneModelSrc = useMemo(
    () => selectedTrailerSize.dropZoneModels?.[selectedStepId] ?? null,
    [selectedStepId, selectedTrailerSize]
  );
  const draggingEquipment = useMemo(
    () => (draggingEquipmentId ? equipmentMap[draggingEquipmentId] ?? null : null),
    [draggingEquipmentId, equipmentMap]
  );

  const totalItems = placements.length;
  const selectedItemLabel = selectedPlaced?.definition.name ?? "No item selected";
  const equipmentSideMenus = useMemo(
    () => equipmentMenuGroups.filter((group) => group.side === "equipment"),
    []
  );

  const inspectorCopy = useMemo(() => {
    switch (selectedStepId) {
      case "size":
        return {
          title: "Size",
          description: "Select the trailer size you want to configure.",
          info: "Choose between a compact 16ft build or a full 30ft kitchen layout."
        };
      case "equipment-side":
        return {
          title: "Equipment Side",
          description: "Drag equipment into the drop zone to build the layout.",
          info: `Showing ${equipmentCatalog.length} models across ${equipmentSideMenus.length} equipment menus.`
        };
      case "serving-side":
        return {
          title: "Serving Side",
          description: "Serving-side configuration will appear here.",
          info: "This step is not active yet."
        };
      case "addons-utility":
        return {
          title: "Add-ons & Utility",
          description: "Add-on and utility options will appear here.",
          info: "This step is not active yet."
        };
      case "trailer-customization":
        return {
          title: "Trailer Customization",
          description: "Trailer customization options will appear here.",
          info: "This step is not active yet."
        };
      default:
        return {
          title: "Configurator",
          description: "Select a step to continue configuring the trailer.",
          info: "Choose a menu from the bottom navigation."
        };
    }
  }, [equipmentSideMenus.length, selectedStepId]);

  function applyTrailerSize(trailerSize: TrailerSize) {
    setSelectedTrailerSizeId(trailerSize.id);
    setSelectedStepId("size");
    setSelectedEquipmentId(null);
    setSelectedPlacedId(null);
    setEditingPlacedId(null);
  }

  return (
    <div className="app-shell">
      <main className="experience-shell">
        <div className="brand-bar">
          <button className="back-button" type="button" aria-label="Go back">
            <span aria-hidden="true">&larr;</span>
          </button>
          <div className="brand-copy">
            <div className="brand-title-row">
              <span className="brand-mark">FT</span>
              <h1>FoodTrailers</h1>
            </div>
            <p>Powered by Ikarus Delta</p>
          </div>
        </div>

        <div className="experience-stage">
          <Suspense fallback={<div className="scene-loading">Loading 3D workspace...</div>}>
            <BuilderScene
              activeStageModelSrc={activeStageModelSrc}
              dropZoneModelSrc={activeDropZoneModelSrc}
              draggingEquipment={draggingEquipment}
              zones={zones}
              placements={placements}
              selectedPlaced={selectedPlaced}
              selectedPlacedId={selectedPlacedId}
              isEditingSelected={isEditingSelected}
              editableEquipmentOptions={editableEquipmentOptions}
              onPlacedSelect={(id) => {
                setSelectedPlacedId(id);
                if (id === null) {
                  setEditingPlacedId(null);
                }
              }}
              onDeletePlaced={removePlaced}
              onToggleViewportEdit={(id) =>
                setEditingPlacedId((current) => (current === id ? null : id))
              }
              onDropZoneBoundsChange={(bounds) => setDropZoneBounds(bounds)}
              onEquipmentDrop={(definitionId, zoneId, placement) => {
                placeEquipmentInZone(definitionId, zoneId, placement);
                setDraggingEquipmentId(null);
              }}
              onViewportEquipmentChange={updatePlacedDefinition}
              onPlacedScaleChange={updatePlacedScale}
              onPlacedTransformChange={updatePlacedTransform}
            />
          </Suspense>
        </div>

        <div className="stage-toolbar">
          <button className="toolbar-chip" type="button">
            {totalItems} items placed
          </button>
          <button className="toolbar-chip" type="button">
            {selectedTrailerSize.label} selected
          </button>
          <button className="toolbar-chip wide" type="button">
            {selectedItemLabel}
          </button>
        </div>

        <nav className="bottom-navigation" aria-label="Configurator steps">
          {configuratorSteps.map((step) => (
            <button
              key={step.id}
              type="button"
              className={`nav-step${selectedStepId === step.id ? " active" : ""}`}
              onClick={() => setSelectedStepId(step.id)}
            >
              {step.label}
            </button>
          ))}
        </nav>
      </main>

      <aside className="inspector-panel">
        <div className="inspector-scroll">
          <section className="title-block">
            <h2>{inspectorCopy.title}</h2>
            <p>{inspectorCopy.description}</p>
          </section>

          <section className="info-pill">
            <span className="info-pill__icon">i</span>
            <p>{inspectorCopy.info}</p>
          </section>

          {selectedStepId === "size" ? (
            <section className="trailer-card-list">
              {trailerSizes.map((trailerSize) => {
                const isActive = trailerSize.id === selectedTrailerSize.id;

                return (
                  <button
                    key={trailerSize.id}
                    type="button"
                    className={`trailer-card${isActive ? " active" : ""}`}
                    style={
                      {
                        "--card-accent": trailerSize.accent,
                        "--card-accent-soft": trailerSize.accentSoft
                      } as CSSProperties
                    }
                    onClick={() => applyTrailerSize(trailerSize)}
                  >
                    <div className="trailer-card__meta size-card__meta">
                      <span className="price-pill">{trailerSize.label}</span>
                    </div>
                    <div className="trailer-card__visual" aria-hidden="true">
                      <div className="trailer-card__mini-stage">
                        <span className="mini-trailer-body" />
                        <span className="mini-trailer-roof" />
                        <span className="mini-trailer-wheel wheel-a" />
                        <span className="mini-trailer-wheel wheel-b" />
                      </div>
                    </div>
                    <div className="trailer-card__body size-card__body">
                      <h3>{trailerSize.label}</h3>
                      <p>{trailerSize.description}</p>
                    </div>
                  </button>
                );
              })}
            </section>
          ) : null}

          {selectedStepId === "equipment-side" ? (
            <section className="control-section">
              <div className="section-heading">
                <h3>Equipment Menus</h3>
                <span>{equipmentSideMenus.length} categories</span>
              </div>
              <div className="menu-group-list">
                {equipmentSideMenus.map((group, index) => (
                  <details key={group.id} className="menu-group" open={index === 0}>
                    <summary>
                      <span>{group.label}</span>
                      <span>{group.items.length} models</span>
                    </summary>
                    <div className="equipment-list compact">
                      {group.items.map((equipment) => (
                        <button
                          key={equipment.id}
                          className={`equipment-card${
                            selectedEquipmentId === equipment.id ? " active" : ""
                          }`}
                          draggable
                          onDragStart={(event) => {
                            const dragImage = document.createElement("canvas");
                            dragImage.width = 1;
                            dragImage.height = 1;
                            event.dataTransfer.setData("text/equipment-id", equipment.id);
                            event.dataTransfer.setData("text/plain", equipment.id);
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setDragImage(dragImage, 0, 0);
                            setSelectedEquipmentId(equipment.id);
                            setDraggingEquipmentId(equipment.id);
                            setSelectedPlacedId(null);
                            setEditingPlacedId(null);
                          }}
                          onDragEnd={() => setDraggingEquipmentId(null)}
                          onClick={() => {
                            setSelectedPlacedId(null);
                            setEditingPlacedId(null);
                            setSelectedEquipmentId((current) =>
                              current === equipment.id ? null : equipment.id
                            );
                          }}
                        >
                          <span
                            className="equipment-dot"
                            style={{ backgroundColor: equipment.color }}
                          />
                          <div>
                            <strong>{equipment.name}</strong>
                            <p>{equipment.model3d ? equipment.model3d.src.split("/").pop() : ""}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          <details className="advanced-controls">
            <summary>
              <span>Advanced Builder Controls</span>
              <span className="advanced-controls__meta">
                {placed.length} items | {equipmentCatalog.length} models
              </span>
            </summary>

            <div className="advanced-controls__body">
              <section className="control-section">
                <div className="section-heading">
                  <h3>Build Summary</h3>
                  <span>{placed.length} items</span>
                </div>
                <div className="placed-list">
                  {placements.length === 0 ? (
                    <p className="empty-state">
                      Select a model from the generated equipment menus to prepare it for placement.
                    </p>
                  ) : (
                    placements.map(({ item, definition, zone }) => (
                      <div
                        key={item.id}
                        className={`placed-card${selectedPlacedId === item.id ? " active" : ""}`}
                      >
                        <div>
                          <strong>{definition.name}</strong>
                          <p>{zone.name}</p>
                        </div>
                        <div className="placed-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPlacedId(item.id);
                              setEditingPlacedId(item.id);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => removePlaced(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {selectedPlaced ? (
                <section className="control-section">
                  <div className="section-heading">
                    <h3>Edit Item</h3>
                    <span>selected</span>
                  </div>
                  <div className="editor-grid">
                    <label>
                      <span>Equipment</span>
                      <select
                        value={selectedPlaced.definition.id}
                        onChange={(event) =>
                          updatePlacedDefinition(selectedPlaced.item.id, event.target.value)
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
                </section>
              ) : null}
            </div>
          </details>
        </div>

        <div className="sticky-action-bar">
          <button type="button" className="summary-button">
            Build Summary
          </button>
          <button type="button" className="icon-action-button" aria-label="Save build">
            <span aria-hidden="true">[]</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

export default App;
