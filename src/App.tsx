import { useMemo, useState, useEffect, useCallback, type CSSProperties } from "react";
import { Vector3 } from "three";
import { equipmentCatalog, equipmentMenuGroups } from "./catalog";
import { buildZones, configuratorSteps, trailerSizes } from "./configurator";
import { resolveNonIntersectingPlacement } from "./scene/dropZone";
import type { MeasuredFootprint } from "./scene/types";
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

import BuilderScene from "./BuilderScene";

function App() {
  const [selectedStepId, setSelectedStepId] = useState<ConfiguratorStepId>("size");
  const [selectedTrailerSizeId, setSelectedTrailerSizeId] =
    useState<TrailerSize["id"]>("size-16");
  const [placed, setPlaced] = useState<PlacedEquipment[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [draggingEquipmentId, setDraggingEquipmentId] = useState<string | null>(null);
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
  const [editingPlacedId, setEditingPlacedId] = useState<string | null>(null);
  const [dropZoneBoundsMap, setDropZoneBoundsMap] = useState<Record<string, Partial<Zone>>>({});
  const [measuredFootprints, setMeasuredFootprints] = useState<
    Record<string, MeasuredFootprint>
  >({});

  const allZones = useMemo(() => buildZones(dropZoneBoundsMap), [dropZoneBoundsMap]);

  const zones = useMemo(() => {
    if (selectedStepId === "equipment-side") {
      return allZones.filter((z) => z.id === "equipment-drop");
    }
    if (selectedStepId === "serving-side") {
      return allZones.filter((z) => z.id === "serving-drop");
    }
    return [];
  }, [allZones, selectedStepId]);

  const zoneMap = useMemo(
    () => Object.fromEntries(allZones.map((zone) => [zone.id, zone])) as Record<ZoneId, Zone>,
    [allZones]
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


  const editableEquipmentOptions = useMemo(
    () => (selectedPlaced ? equipmentCatalog : []),
    [selectedPlaced]
  );

  function compactItems(
    items: PlacedEquipment[],
    zoneId: ZoneId,
    level: number
  ): PlacedEquipment[] {
    const zone = zoneMap[zoneId];
    if (!zone) return items;

    const horizontal = zone.length >= zone.width;

    const peers = items
      .map((item) => {
        const def = equipmentMap[item.definitionId];
        if (!def || item.zoneId !== zoneId || def.level !== level) {
          return null;
        }
        const axisPos = horizontal
          ? (item.manualPlacement?.z ?? zone.z)
          : (item.manualPlacement?.x ?? zone.x);
        const footprint = measuredFootprints[item.id];
        const halfSize = (footprint
          ? (horizontal ? footprint.length : footprint.width)
          : (horizontal ? def.size.length : def.size.width)) / 2;
        return { item, def, axisPos, halfSize };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => a.axisPos - b.axisPos);

    if (peers.length === 0) return items;

    const axisMax = horizontal
      ? zone.z + zone.length / 2
      : zone.x + zone.width / 2;

    let cursor = axisMax;
    const updatedPositions = new Map<string, number>();
    const PADDING = 0; // models sit flush (EquipmentVisual already deducts 0.01 from footprint)

    for (const peer of [...peers].reverse()) {
      const center = cursor - peer.halfSize;
      updatedPositions.set(peer.item.id, center);
      cursor = center - peer.halfSize - PADDING;
    }

    return items.map((item) => {
      const newAxisPos = updatedPositions.get(item.id);
      if (newAxisPos === undefined) return item;

      const currentPlacement = item.manualPlacement;
      return {
        ...item,
        manualPlacement: currentPlacement
          ? {
              ...currentPlacement,
              ...(horizontal ? { z: newAxisPos } : { x: newAxisPos })
            }
          : undefined
      };
    });
  }

  function compactPlacedItems(
    remainingItems: PlacedEquipment[],
    deletedItem: PlacedEquipment
  ): PlacedEquipment[] {
    const deletedDefinition = equipmentMap[deletedItem.definitionId];
    if (!deletedDefinition) return remainingItems;
    return compactItems(remainingItems, deletedItem.zoneId, deletedDefinition.level);
  }

  useEffect(() => {
    setPlaced((current) => {
      let updated = [...current];
      // Collect unique (zone, level) pairs to compact
      const pairs = new Set<string>();
      current.forEach((item) => {
        const def = equipmentMap[item.definitionId];
        if (def && item.zoneId) {
          pairs.add(`${item.zoneId}|${def.level}`);
        }
      });

      pairs.forEach((pair) => {
        const [zoneId, levelStr] = pair.split("|");
        updated = compactItems(updated, zoneId as ZoneId, parseInt(levelStr, 10));
      });

      // Avoid state update if nothing changed (shallow equal check on positions)
      const changed = updated.some(
        (item, idx) =>
          item.manualPlacement?.x !== current[idx].manualPlacement?.x ||
          item.manualPlacement?.z !== current[idx].manualPlacement?.z
      );

      return changed ? updated : current;
    });
  }, [measuredFootprints, equipmentMap, zoneMap]);
  function removePlaced(id: string) {
    setPlaced((current) => {
      const deletedItem = current.find((item) => item.id === id);
      const remaining = current.filter((item) => item.id !== id);

      if (!deletedItem) return remaining;

      return compactPlacedItems(remaining, deletedItem);
    });
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

  function placeEquipmentAtNextPosition(definitionId: string) {
    const definition = equipmentMap[definitionId];
    const zone = zones[0];

    if (!definition || !zone) {
      return;
    }

    // Only look for support items within the current active zone
    const zonePlacements = placements.filter(({ zone: placedZone }) => placedZone.id === zone.id);
    const lowerLevelPlacement =
      definition.level > 0
        ? zonePlacements.find(({ definition: placedDefinition, placement }) => {
            const alreadySupportsSameLevel = zonePlacements.some(
              ({ definition: stackedDefinition, placement: stackedPlacement }) =>
                stackedDefinition.level === definition.level &&
                stackedPlacement.x === placement.x &&
                stackedPlacement.z === placement.z
            );

            return placedDefinition.level === definition.level - 1 && !alreadySupportsSameLevel;
          }) ??
          zonePlacements.find(
            ({ definition: placedDefinition }) => placedDefinition.level === definition.level - 1
          ) ??
          null
        : null;

    if (definition.level > 0 && lowerLevelPlacement) {
      const createdId = `${definitionId}-${crypto.randomUUID()}`;
      const lowerScale = lowerLevelPlacement.placement.scale;
      // Use the logical slot height (definition.size.height) — NOT the raw 3D bounding-box
      // height — so level-1 items land just above the counter surface rather than at ceiling.
      const lowerHeight = lowerLevelPlacement.definition.size.height;

      setPlaced((current) => [
        ...current,
        {
          id: createdId,
          definitionId,
          zoneId: lowerLevelPlacement.zone.id,
          manualPlacement: {
            x: lowerLevelPlacement.placement.x,
            y: lowerLevelPlacement.placement.y + lowerHeight * lowerScale,
            z: lowerLevelPlacement.placement.z,
            rotationY: lowerLevelPlacement.placement.rotationY
          }
        }
      ]);
      setSelectedEquipmentId(definitionId);
      setSelectedPlacedId(createdId);
      setEditingPlacedId(null);
      return;
    }

    const startPoint =
      zone.length >= zone.width
        ? new Vector3(zone.x, zone.lineY, zone.z + zone.length / 2)
        : new Vector3(zone.x + zone.width / 2, zone.lineY, zone.z);
    const placement = resolveNonIntersectingPlacement(
      zone,
      definition,
      definition.id,
      startPoint,
      placements,
      measuredFootprints
    );

    if (!placement) {
      return;
    }

    const createdId = `${definitionId}-${crypto.randomUUID()}`;

    setPlaced((current) => [
      ...current,
      {
        id: createdId,
        definitionId,
        zoneId: zone.id,
        manualPlacement: placement
      }
    ]);
    setSelectedEquipmentId(definitionId);
    setSelectedPlacedId(createdId);
    setEditingPlacedId(null);
  }
  function updatePlacedDefinition(id: string, definitionId: string) {
    setMeasuredFootprints((current) => {
      const { [id]: _, ...rest } = current;
      return rest;
    });

    setPlaced((current) => {
      const target = current.find((item) => item.id === id);

      if (!target || !equipmentMap[definitionId]) {
        return current;
      }

      const updated = current.map((item) =>
        item.id === id
          ? {
              ...item,
              definitionId
            }
          : item
      );

      const changedItem = updated.find((item) => item.id === id);
      if (!changedItem) return updated;

      return compactPlacedItems(updated, changedItem);
    });
    setEditingPlacedId(id);
  }

  function swapPlacedWithNeighbor(id: string, direction: "left" | "right") {
    const currentPlacement = placements.find(({ item }) => item.id === id);

    if (!currentPlacement) {
      return;
    }

    const horizontal = currentPlacement.zone.length >= currentPlacement.zone.width;
    const sortedPeers = placements
      .filter(
        ({ item, definition, zone }) =>
          item.zoneId === currentPlacement.item.zoneId &&
          zone.id === currentPlacement.zone.id &&
          definition.level === currentPlacement.definition.level
      )
      .sort((a, b) => {
        const aAxis = horizontal ? a.placement.z : a.placement.x;
        const bAxis = horizontal ? b.placement.z : b.placement.x;

        return aAxis - bAxis;
      });
    const currentIndex = sortedPeers.findIndex(({ item }) => item.id === id);
    const neighborIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
    const neighbor = sortedPeers[neighborIndex];

    if (currentIndex < 0) {
      return;
    }

    if (!neighbor) {
      const endPoint =
        horizontal
          ? new Vector3(
              currentPlacement.zone.x,
              currentPlacement.zone.lineY,
              currentPlacement.zone.z +
                (direction === "left" ? -1 : 1) * (currentPlacement.zone.length / 2)
            )
          : new Vector3(
              currentPlacement.zone.x +
                (direction === "left" ? -1 : 1) * (currentPlacement.zone.width / 2),
              currentPlacement.zone.lineY,
              currentPlacement.zone.z
            );
      const nextPlacement = resolveNonIntersectingPlacement(
        currentPlacement.zone,
        currentPlacement.definition,
        currentPlacement.item.id,
        endPoint,
        placements.filter(
          ({ item, definition }) =>
            item.id !== id && definition.level === currentPlacement.definition.level
        ),
        measuredFootprints
      );

      if (!nextPlacement) {
        return;
      }

      setPlaced((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                manualPlacement: {
                  ...nextPlacement,
                  y: currentPlacement.placement.y,
                  rotationY: currentPlacement.placement.rotationY
                }
              }
            : item
        )
      );
      setSelectedPlacedId(id);
      setEditingPlacedId(null);
      return;
    }

    const currentManualPlacement = currentPlacement.item.manualPlacement ?? {
      x: currentPlacement.placement.x,
      y: currentPlacement.placement.y,
      z: currentPlacement.placement.z,
      rotationY: currentPlacement.placement.rotationY
    };
    const neighborManualPlacement = neighbor.item.manualPlacement ?? {
      x: neighbor.placement.x,
      y: neighbor.placement.y,
      z: neighbor.placement.z,
      rotationY: neighbor.placement.rotationY
    };

    setPlaced((current) =>
      current.map((item) => {
        if (item.id === currentPlacement.item.id) {
          return {
            ...item,
            manualPlacement: neighborManualPlacement
          };
        }

        if (item.id === neighbor.item.id) {
          return {
            ...item,
            manualPlacement: currentManualPlacement
          };
        }

        return item;
      })
    );
    setSelectedPlacedId(id);
    setEditingPlacedId(null);
  }

  const activeStageModelSrc = useMemo(
    () => selectedTrailerSize.stageModels[selectedStepId] ?? null,
    [selectedStepId, selectedTrailerSize]
  );
  const activeDropZoneModelSrc = useMemo(
    () => selectedTrailerSize.dropZoneModels?.[selectedStepId] ?? null,
    [selectedStepId, selectedTrailerSize]
  );

  // Stable callback so DropZoneModel's useEffect doesn't re-fire every render
  const handleDropZoneBoundsChange = useCallback(
    (bounds: Pick<Zone, "x" | "y" | "z" | "length" | "width" | "height" | "lineY"> | null) => {
      const currentZoneId =
        selectedStepId === "equipment-side" ? "equipment-drop" : "serving-drop";

      setDropZoneBoundsMap((current) => {
        const currentBounds = current[currentZoneId];
        if (!bounds) {
          if (!currentBounds || Object.keys(currentBounds).length === 0) {
            return current;
          }

          return {
            ...current,
            [currentZoneId]: {}
          };
        }
        if (
          bounds &&
          currentBounds &&
          bounds.x === currentBounds.x &&
          bounds.y === currentBounds.y &&
          bounds.z === currentBounds.z &&
          bounds.length === currentBounds.length &&
          bounds.width === currentBounds.width &&
          bounds.height === currentBounds.height &&
          bounds.lineY === currentBounds.lineY
        ) {
          return current;
        }
        return {
          ...current,
          [currentZoneId]: bounds ?? {}
        };
      });
    },
    [selectedStepId]
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

  const servingSideMenus = useMemo(
    () => equipmentMenuGroups.filter((group) => group.side === "serving"),
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
          description: "Click or drag equipment into the drop zone to build the layout.",
          info: `Showing ${equipmentCatalog.length} models across ${equipmentSideMenus.length} equipment menus.`
        };
      case "serving-side":
        return {
          title: "Serving Side",
          description: "Click or drag equipment onto the serving counter.",
          info: `Configure the service hatch and customer-facing equipment.`
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
            <BuilderScene
              activeStageModelSrc={activeStageModelSrc}
              dropZoneModelSrc={activeDropZoneModelSrc}
              draggingEquipment={draggingEquipment}
              zones={zones}
              placements={placements.filter((p) => p.zone.id === (selectedStepId === "equipment-side" ? "equipment-drop" : "serving-drop"))}
              editingPlacedId={editingPlacedId}
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
              onDropZoneBoundsChange={handleDropZoneBoundsChange}
              onEquipmentDrop={(definitionId, zoneId, placement) => {
                placeEquipmentInZone(definitionId, zoneId, placement);
                setDraggingEquipmentId(null);
              }}
              onViewportEquipmentChange={updatePlacedDefinition}
              onMeasuredFootprintsChange={setMeasuredFootprints}
              onSwapPlaced={swapPlacedWithNeighbor}
            />
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
                            placeEquipmentAtNextPosition(equipment.id);
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

          {selectedStepId === "serving-side" ? (
            <section className="control-section">
              <div className="section-heading">
                <h3>Serving Side Menus</h3>
                <span>{servingSideMenus.length} categories</span>
              </div>
              <div className="menu-group-list">
                {servingSideMenus.map((group, index) => (
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
                            placeEquipmentAtNextPosition(equipment.id);
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
