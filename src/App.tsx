import { Suspense, lazy, useMemo, useState, type CSSProperties } from "react";
import modelCatalogData from "../models/models.json";

type EquipmentDefinition = {
  id: string;
  name: string;
  menuType: string;
  side: string;
  level: number;
  size: {
    length: number;
    width: number;
    height: number;
  };
  color: string;
  model3d?: {
    src: string;
    scale: number;
    yOffset?: number;
    rotationY?: number;
  };
};

type ZoneId =
  | "equipment-drop";

type Zone = {
  id: ZoneId;
  name: string;
  color: string;
  x: number;
  z: number;
  length: number;
  width: number;
  height: number;
  capacity: number;
};

type PlacedEquipment = {
  id: string;
  definitionId: string;
  zoneId: ZoneId;
  manualPlacement?: {
    x: number;
    z: number;
    rotationY: number;
  };
};

type PlacementView = {
  item: PlacedEquipment;
  definition: EquipmentDefinition;
  zone: Zone;
  placement: { x: number; y: number; z: number; rotationY: number };
};

type DropPlacement = {
  x: number;
  z: number;
  rotationY: number;
};

type ModelCatalogEntry = {
  "glb name": string;
  "menu type": string;
  level: number;
  side: string;
};

type EquipmentMenuGroup = {
  id: string;
  label: string;
  side: string;
  items: EquipmentDefinition[];
};

type ConfiguratorStepId =
  | "size"
  | "equipment-side"
  | "serving-side"
  | "addons-utility"
  | "trailer-customization";

type TrailerSize = {
  id: "size-16" | "size-30";
  label: string;
  description: string;
  accent: string;
  accentSoft: string;
  stageModels: Partial<Record<ConfiguratorStepId, string>>;
  dropZoneModels?: Partial<Record<ConfiguratorStepId, string>>;
};

const FLOOR_Y = 0.08;

const menuAccentPalette = [
  "#ffcb74",
  "#ff9966",
  "#78d4c2",
  "#8ecae6",
  "#96b8ff",
  "#c9a46d",
  "#f59e0b",
  "#f472b6",
  "#34d399",
  "#a78bfa"
];

const glbFileModules = import.meta.glob("../models/glb-files/*.glb", {
  eager: true,
  import: "default"
}) as Record<string, string>;

const glbAssetMap = Object.fromEntries(
  Object.entries(glbFileModules).map(([path, src]) => [path.split("/").pop() ?? path, src])
) as Record<string, string>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/\.glb$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatModelLabel(glbName: string) {
  return glbName
    .replace(/\.glb$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMenuAccent(menuType: string) {
  const menuIndex = Array.from(
    new Set(
      (modelCatalogData as ModelCatalogEntry[])
        .map((entry) => entry["menu type"])
        .filter(Boolean)
    )
  ).indexOf(menuType);

  return menuAccentPalette[(menuIndex >= 0 ? menuIndex : 0) % menuAccentPalette.length];
}

function getDefaultEquipmentSize(level: number) {
  if (level > 0) {
    return { length: 0.56, width: 0.48, height: 0.62 };
  }

  return { length: 0.92, width: 0.76, height: 1.02 };
}

const equipmentCatalog: EquipmentDefinition[] = (modelCatalogData as ModelCatalogEntry[])
  .filter((entry) => entry.side === "equipment")
  .flatMap((entry) => {
    const src = glbAssetMap[entry["glb name"]];

    if (!src) {
      return [];
    }

    return [
      {
        id: slugify(entry["glb name"]),
        name: formatModelLabel(entry["glb name"]),
        menuType: entry["menu type"],
        side: entry.side,
        level: entry.level,
        size: getDefaultEquipmentSize(entry.level),
        color: getMenuAccent(entry["menu type"]),
        model3d: {
          src,
          scale: entry.level > 0 ? 0.82 : 0.88,
          yOffset: 0
        }
      }
    ];
  });

const equipmentMenuGroups: EquipmentMenuGroup[] = Array.from(
  equipmentCatalog.reduce((groups, equipment) => {
    const key = `${equipment.side}:${equipment.menuType}`;
    const current = groups.get(key);

    if (current) {
      current.items.push(equipment);
      return groups;
    }

    groups.set(key, {
      id: slugify(key),
      label: equipment.menuType,
      side: equipment.side,
      items: [equipment]
    });
    return groups;
  }, new Map<string, EquipmentMenuGroup>())
)
  .map(([, group]) => ({
    ...group,
    items: [...group.items].sort((a, b) => a.name.localeCompare(b.name))
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

const trailerSizes: TrailerSize[] = [
  {
    id: "size-16",
    label: "16ft",
    description: "Compact trailer footprint for lean service builds and tighter parking spaces.",
    accent: "#dfeafe",
    accentSoft: "rgba(0, 83, 208, 0.08)",
    stageModels: {
      size: new URL("../models/base/16-base.glb", import.meta.url).href,
      "serving-side": new URL("../models/base/16-serving.glb", import.meta.url).href
    },
    dropZoneModels: {
      "equipment-side": new URL("../models/base/16-equipment-drop-zone.glb", import.meta.url).href
    }
  },
  {
    id: "size-30",
    label: "30ft",
    description: "Expanded trailer footprint for larger kitchen layouts and higher equipment density.",
    accent: "#f8ddd4",
    accentSoft: "rgba(218, 99, 75, 0.1)",
    stageModels: {
      size: new URL("../models/base/30-hot.glb", import.meta.url).href,
      "serving-side": new URL("../models/base/30-hot.glb", import.meta.url).href
    }
  }
];

const configuratorSteps = [
  { id: "size", label: "Size" },
  { id: "equipment-side", label: "equipment side" },
  { id: "serving-side", label: "serving side" },
  { id: "addons-utility", label: "Add-ons & utility" },
  { id: "trailer-customization", label: "trailer customization" }
] as const;

const BuilderScene = lazy(() => import("./BuilderScene"));

function buildZones(dropZoneBounds?: Partial<Zone>): Zone[] {
  return [
    {
      id: "equipment-drop",
      name: "Equipment Drop Zone",
      color: "#ffcb74",
      x: dropZoneBounds?.x ?? 0,
      z: dropZoneBounds?.z ?? 0,
      length: dropZoneBounds?.length ?? 2.2,
      width: dropZoneBounds?.width ?? 0.9,
      height: dropZoneBounds?.height ?? 2.5,
      capacity: Number.POSITIVE_INFINITY
    }
  ];
}

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
    () => {
      return placed
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
              y: FLOOR_Y,
              z: item.manualPlacement?.z ?? zone.z,
              rotationY: item.manualPlacement?.rotationY ?? 0
            }
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    },
    [equipmentMap, placed, zoneMap]
  );

  const selectedPlaced = useMemo(
    () => placements.find(({ item }) => item.id === selectedPlacedId) ?? null,
    [placements, selectedPlacedId]
  );
  const isEditingSelected = selectedPlacedId !== null && selectedPlacedId === editingPlacedId;

  const editableEquipmentOptions = useMemo(() => {
    if (!selectedPlaced) {
      return [];
    }

    return equipmentCatalog;
  }, [selectedPlaced]);

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
export type {
  EquipmentDefinition,
  PlacementView,
  PlacedEquipment,
  DropPlacement,
  Zone,
  ZoneId
};
