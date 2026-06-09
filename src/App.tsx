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
import { label } from "three/tsl";

function parsePrice(priceStr: string | undefined): number {
  if (!priceStr) return 0;
  return Number(priceStr.replace(/[^0-9.-]+/g, "")) || 0;
}

function App() {
  const [selectedStepId, setSelectedStepId] = useState<ConfiguratorStepId>("size");
  const [showBuildSummary, setShowBuildSummary] = useState(false);
  const [buildSummaryTab, setBuildSummaryTab] = useState<number>(3);
  const [selectedTrailerSizeId, setSelectedTrailerSizeId] =
    useState<TrailerSize["id"]>("size-16");
  // `displayedTrailerSizeId` controls which 3D model is shown in the scene.
  // We keep it separate so selecting a trailer *type* (picker card) doesn't
  // immediately swap the visual model — the model only changes when the
  // user confirms a size in the `size-specs` step.
  const [displayedTrailerSizeId, setDisplayedTrailerSizeId] =
    useState<TrailerSize["id"]>("size-16");
  const [hasChosenTrailerType, setHasChosenTrailerType] = useState<boolean>(false);
  // `selectedTrailerCardId` tracks which trailer card (type) the user selected
  // in the Trailer Type picker. It is separate from the committed size
  // (`selectedTrailerSizeId`) so changing the card does not change the model.
  const [selectedTrailerCardId, setSelectedTrailerCardId] =
    useState<TrailerSize["id"]>("size-16");
  const [placed, setPlaced] = useState<PlacedEquipment[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [draggingEquipmentId, setDraggingEquipmentId] = useState<string | null>(null);
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
  const [editingPlacedId, setEditingPlacedId] = useState<string | null>(null);
  const [dropZoneBoundsMap, setDropZoneBoundsMap] = useState<Record<string, Partial<Zone>>>({});
  const [showNoBaseModal, setShowNoBaseModal] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  // Pending Level-1 delete that has stacked Level-2 items
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    level1Id: string;
    level2Ids: string[];
    isQuantityRemove?: boolean; // came from removeOnePlaced (−button)
  } | null>(null);
  const [measuredFootprints, setMeasuredFootprints] = useState<
    Record<string, MeasuredFootprint>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [selectedCustomizationId, setSelectedCustomizationId] = useState<string>("no-wrap");

  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const buildParam = urlParams.get('build');
      if (buildParam) {
        const decoded = JSON.parse(atob(buildParam));
        if (decoded.selectedTrailerSizeId) {
          setSelectedTrailerSizeId(decoded.selectedTrailerSizeId);
          setDisplayedTrailerSizeId(decoded.selectedTrailerSizeId);
          setSelectedTrailerCardId(decoded.selectedTrailerSizeId);
        }
        if (decoded.placed && Array.isArray(decoded.placed)) {
          setPlaced(decoded.placed);
        }
      }
    } catch (e) {
      console.error("Failed to parse build configuration from URL", e);
    }
  }, []);

  function handleSaveBuild() {
  const stateToSave = {
    selectedTrailerSizeId,
    placed
  };
  try {
    const encoded = btoa(JSON.stringify(stateToSave));
    const newUrl = window.location.origin + window.location.pathname + '?build=' + encoded;
    navigator.clipboard.writeText(newUrl).then(() => {
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    });
  } catch (e) {
    console.error("Failed to save build to URL", e);
  }
}

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

  // Compute total price: base trailer price + equipment prices
  const totalPrice = useMemo(() => {
    const basePrice = 99999;
    const equipmentSum = placed.reduce((sum, item) => {
      const def = equipmentMap[item.definitionId];
      if (!def || !def.price) return sum;
      return sum + parsePrice(def.price);
    }, 0);
    return basePrice + equipmentSum;
  }, [placed, selectedTrailerSize, equipmentMap]);

  const selectedTrailerCard = useMemo(
    () => trailerSizes.find((t) => t.id === selectedTrailerCardId) ?? trailerSizes[0],
    [selectedTrailerCardId]
  );

  const displayedTrailerSize = useMemo(
    () => trailerSizes.find((t) => t.id === displayedTrailerSizeId) ?? trailerSizes[0],
    [displayedTrailerSizeId]
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
    levels: number[]  // all levels in this tier, compacted together
  ): PlacedEquipment[] {
    const zone = zoneMap[zoneId];
    if (!zone) return items;

    const horizontal = zone.length >= zone.width;

    const targetedItems = items.filter((item) => {
      const def = equipmentMap[item.definitionId];
      return def && item.zoneId === zoneId && levels.includes(def.level);
    });

    const allMeasured = targetedItems.every(item => !!measuredFootprints[item.id]);
    if (!allMeasured && targetedItems.length > 0) {
      return items;
    }

    const peers = items
      .map((item) => {
        const def = equipmentMap[item.definitionId];
        if (!def || item.zoneId !== zoneId || !levels.includes(def.level)) {
          return null;
        }
        const axisPos = horizontal
          ? (item.manualPlacement?.z ?? zone.z)
          : (item.manualPlacement?.x ?? zone.x);
        const footprint = measuredFootprints[item.id];
        // We know footprint exists because of the allMeasured check above
        const halfSize = (horizontal ? footprint!.length : footprint!.width) / 2;
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
      // Use zone defaults for dimensions we are not compacting along
      // ALWAYS track the zone's dynamic Y coordinate. The X/Z defaults depend on orientation.
      const baseX = currentPlacement?.x ?? zone.x;
      const baseY = zone.lineY; // Dynamically track the drop zone's height to prevent floating items after model load
      const baseZ = currentPlacement?.z ?? zone.z;
      const baseRotation = currentPlacement?.rotationY ?? (zone.id === "serving-drop" ? Math.PI : 0);

      return {
        ...item,
        manualPlacement: {
          x: horizontal ? baseX : newAxisPos,
          y: baseY,
          z: horizontal ? newAxisPos : baseZ,
          rotationY: baseRotation
        }
      };
    });
  }

  /** After ground-tier compaction, realign Level 2 items to sit on their Level 1 support. */
  function realignLevel2Items(items: PlacedEquipment[]): PlacedEquipment[] {
    return items.map((item) => {
      const def = equipmentMap[item.definitionId];
      if (!def || def.level !== 2) return item;

      const zone = zoneMap[item.zoneId as ZoneId];
      if (!zone) return item;

      const myX = item.manualPlacement?.x ?? zone.x;
      const myZ = item.manualPlacement?.z ?? zone.z;

      // Find the Level 1 item with the closest x/z in the same zone
      let bestSupport: PlacedEquipment | null = null;
      let bestDist = Infinity;

      items.forEach((other) => {
        const otherDef = equipmentMap[other.definitionId];
        if (!otherDef || other.zoneId !== item.zoneId || otherDef.level !== 1) return;
        const otherX = other.manualPlacement?.x ?? zone.x;
        const otherZ = other.manualPlacement?.z ?? zone.z;
        const dist = Math.abs(otherX - myX) + Math.abs(otherZ - myZ);
        if (dist < bestDist) {
          bestDist = dist;
          bestSupport = other;
        }
      });

      if (!bestSupport) return item; // No Level 1 support found, keep as-is

      const supportDef = equipmentMap[(bestSupport as PlacedEquipment).definitionId];
      const supportX = (bestSupport as PlacedEquipment).manualPlacement?.x ?? zone.x;
      const supportZ = (bestSupport as PlacedEquipment).manualPlacement?.z ?? zone.z;
      const supportY = (bestSupport as PlacedEquipment).manualPlacement?.y ?? zone.lineY;
      const supportHeight = supportDef?.size.height ?? 0.5;

      return {
        ...item,
        manualPlacement: {
          x: supportX,
          y: supportY + supportHeight,
          z: supportZ,
          rotationY: item.manualPlacement?.rotationY ?? 0
        }
      };
    });
  }

  function compactPlacedItems(
    remainingItems: PlacedEquipment[],
    deletedItem: PlacedEquipment
  ): PlacedEquipment[] {
    const deletedDefinition = equipmentMap[deletedItem.definitionId];
    if (!deletedDefinition) return remainingItems;
    // Level 0 and Level 1 are both ground-tier — always compact them together
    const levels = deletedDefinition.level <= 1 ? [0, 1] : [deletedDefinition.level];
    const compacted = compactItems(remainingItems, deletedItem.zoneId, levels);
    // After ground-tier items shift, realign Level 2 items to their new support positions
    return realignLevel2Items(compacted);
  }

  useEffect(() => {
    setPlaced((current) => {
      let updated = [...current];

      // Collect unique zones that have ground-tier items (level 0 or 1)
      const groundZones = new Set<string>();
      current.forEach((item) => {
        const def = equipmentMap[item.definitionId];
        if (def && item.zoneId && def.level <= 1) {
          groundZones.add(item.zoneId);
        }
      });

      // Compact ground tier (level 0 + 1 together) per zone
      groundZones.forEach((zoneId) => {
        updated = compactItems(updated, zoneId as ZoneId, [0, 1]);
      });

      // After ground compaction, realign Level 2 items to sit on top of
      // their nearest Level 1 support. This keeps them correctly stacked
      // when Level 1 positions shift, without accidentally resetting y to ground.
      updated = updated.map((item) => {
        const def = equipmentMap[item.definitionId];
        if (!def || def.level !== 2) return item;

        const zone = zoneMap[item.zoneId as ZoneId];
        if (!zone) return item;

        const myX = item.manualPlacement?.x ?? zone.x;
        const myZ = item.manualPlacement?.z ?? zone.z;

        // Find the Level 1 item with the closest x/z in the same zone
        let bestSupport: PlacedEquipment | null = null;
        let bestDist = Infinity;

        updated.forEach((other) => {
          const otherDef = equipmentMap[other.definitionId];
          if (!otherDef || other.zoneId !== item.zoneId || otherDef.level !== 1) return;
          const otherX = other.manualPlacement?.x ?? zone.x;
          const otherZ = other.manualPlacement?.z ?? zone.z;
          const dist = Math.abs(otherX - myX) + Math.abs(otherZ - myZ);
          if (dist < bestDist) {
            bestDist = dist;
            bestSupport = other;
          }
        });

        if (!bestSupport) return item; // No Level 1 support found, keep as-is

        const supportDef = equipmentMap[(bestSupport as PlacedEquipment).definitionId];
        const supportX = (bestSupport as PlacedEquipment).manualPlacement?.x ?? zone.x;
        const supportZ = (bestSupport as PlacedEquipment).manualPlacement?.z ?? zone.z;
        const supportY = (bestSupport as PlacedEquipment).manualPlacement?.y ?? zone.lineY;
        const supportHeight = supportDef?.size.height ?? 0.5;

        return {
          ...item,
          manualPlacement: {
            x: supportX,
            y: supportY + supportHeight,
            z: supportZ,
            rotationY: item.manualPlacement?.rotationY ?? 0
          }
        };
      });

      // Avoid state update if nothing changed
      const changed = updated.some(
        (item, idx) =>
          item.manualPlacement?.x !== current[idx].manualPlacement?.x ||
          item.manualPlacement?.z !== current[idx].manualPlacement?.z ||
          item.manualPlacement?.y !== current[idx].manualPlacement?.y
      );

      return changed ? updated : current;
    });
  }, [measuredFootprints, equipmentMap, zoneMap]);

  /** Find Level-2 ids stacked on a given placed item (by x/z proximity). */
  function findStackedLevel2Ids(all: PlacedEquipment[], baseItem: PlacedEquipment): string[] {
    const baseX = baseItem.manualPlacement?.x;
    const baseZ = baseItem.manualPlacement?.z;
    if (baseX === undefined || baseZ === undefined) return [];
    return all
      .filter((item) => {
        const def = equipmentMap[item.definitionId];
        if (def?.level !== 2) return false;
        const ix = item.manualPlacement?.x ?? 0;
        const iz = item.manualPlacement?.z ?? 0;
        return Math.abs(ix - baseX) < 0.01 && Math.abs(iz - baseZ) < 0.01;
      })
      .map((item) => item.id);
  }

  /** Actually delete a Level-1 item and its stacked Level-2 items. */
  function confirmDeleteWithCascade() {
    if (!deleteConfirmState) return;
    const { level1Id, level2Ids } = deleteConfirmState;
    const idsToRemove = new Set([level1Id, ...level2Ids]);

    setPlaced((current) => {
      const deletedItem = current.find((item) => item.id === level1Id);
      const remaining = current.filter((item) => !idsToRemove.has(item.id));
      if (!deletedItem) return remaining;
      return compactPlacedItems(remaining, deletedItem);
    });
    setSelectedPlacedId((cur) => (idsToRemove.has(cur ?? "") ? null : cur));
    setEditingPlacedId((cur) => (idsToRemove.has(cur ?? "") ? null : cur));
    setDeleteConfirmState(null);
  }

  function removePlaced(id: string) {
    // Peek at current placed without triggering a state update
    setPlaced((current) => {
      const deletedItem = current.find((item) => item.id === id);
      if (!deletedItem) return current.filter((item) => item.id !== id);

      const deletedDef = equipmentMap[deletedItem.definitionId];

      // If Level 1 has Level 2 on top → ask for confirmation instead
      if (deletedDef?.level === 1) {
        const stackedIds = findStackedLevel2Ids(current, deletedItem);
        if (stackedIds.length > 0) {
          // Schedule the modal to open after this setter returns
          setTimeout(() => setDeleteConfirmState({ level1Id: id, level2Ids: stackedIds }), 0);
          return current; // abort — do nothing yet
        }
      }

      // No stacked Level 2 — delete immediately
      const remaining = current.filter((item) => item.id !== id);
      return compactPlacedItems(remaining, deletedItem);
    });
    // Only clear selections when not blocked (if blocked, confirmDeleteWithCascade handles it)
    setSelectedPlacedId((cur) => (cur === id ? null : cur));
    setEditingPlacedId((cur) => (cur === id ? null : cur));
  }

  function removeOnePlaced(definitionId: string) {
    setPlaced((current) => {
      const reversed = [...current].reverse();
      const itemToRemove = reversed.find(i => i.definitionId === definitionId);
      if (!itemToRemove) return current;

      const removedDef = equipmentMap[itemToRemove.definitionId];

      // If Level 1 has Level 2 on top → ask for confirmation instead
      if (removedDef?.level === 1) {
        const stackedIds = findStackedLevel2Ids(current, itemToRemove);
        if (stackedIds.length > 0) {
          setTimeout(() =>
            setDeleteConfirmState({ level1Id: itemToRemove.id, level2Ids: stackedIds, isQuantityRemove: true }),
          0);
          return current; // abort
        }
      }

      const remaining = current.filter(i => i.id !== itemToRemove.id);
      return compactPlacedItems(remaining, itemToRemove);
    });
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

    const zonePlacements = placements.filter(({ zone: placedZone }) => placedZone.id === zone.id);

    if (definition.level === 2) {
      // --- LEVEL 2: stacks on top of a Level 1 item only ---
      // Level 0 items on the ground do NOT support Level 2.
      const supportPlacement =
        zonePlacements.find(({ definition: placedDef, placement }) => {
          if (placedDef.level !== 1) return false;
          // Ensure this Level 1 slot doesn't already have a Level 2 on top
          const alreadyStacked = zonePlacements.some(
            ({ definition: stackedDef, placement: stackedPlacement }) =>
              stackedDef.level === 2 &&
              stackedPlacement.x === placement.x &&
              stackedPlacement.z === placement.z
          );
          return !alreadyStacked;
        }) ?? null;

      if (!supportPlacement) {
        // No Level 1 base available — show a helpful modal
        setShowNoBaseModal(true);
        return;
      }

      const createdId = `${definitionId}-${crypto.randomUUID()}`;
      const lowerScale = supportPlacement.placement.scale;
      const lowerHeight = supportPlacement.definition.size.height;

      setPlaced((current) => [
        ...current,
        {
          id: createdId,
          definitionId,
          zoneId: supportPlacement.zone.id,
          manualPlacement: {
            x: supportPlacement.placement.x,
            y: supportPlacement.placement.y + lowerHeight * lowerScale,
            z: supportPlacement.placement.z,
            rotationY: supportPlacement.placement.rotationY
          }
        }
      ]);
      setSelectedEquipmentId(definitionId);
      setSelectedPlacedId(createdId);
      setEditingPlacedId(null);
      return;
    }

    // --- LEVEL 0 and LEVEL 1: both placed on the ground ---
    // They treat each other as obstacles so they never overlap on the ground.
    // Neither floats — they both land at zone.lineY.
    const startPoint =
      zone.length >= zone.width
        ? new Vector3(zone.x, zone.lineY, zone.z + zone.length / 2)
        : new Vector3(zone.x + zone.width / 2, zone.lineY, zone.z);

    // All ground-level items (level 0 AND level 1) are obstacles for each other
    const groundObstaclePlacements = placements.filter(
      ({ definition: placedDef }) => placedDef.level === 0 || placedDef.level === 1
    );

    const placement = resolveNonIntersectingPlacement(
      zone,
      definition,
      definition.id,
      startPoint,
      groundObstaclePlacements,
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

  // Use the displayed trailer selection to decide which GLB to show. This
  // prevents the model from changing immediately when the logical trailer
  // type is changed in the `size` picker; the display only updates when
  // `displayedTrailerSizeId` is updated (for example from the Size & Specs panel).
  const activeStageModelSrc = useMemo(
    () => displayedTrailerSize.stageModels[selectedStepId] ?? displayedTrailerSize.stageModels.size ?? null,
    [selectedStepId, displayedTrailerSize]
  );
  const activeDropZoneModelSrc = useMemo(
    () => displayedTrailerSize.dropZoneModels?.[selectedStepId] ?? null,
    [selectedStepId, displayedTrailerSize]
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
          title: "Trailer Type",
          description: "Choose the trailer type based on what you are going to use it for.",
          info: "This can be changed later based on your equipment selection."
        };
      case "size-specs":
        return {
          title: "Trailer Size & Specifications",
          description:
            "Choose trailer size to match your needs and equipments you need to keep.",
          info: "Start from maximum size and reduce it later to perfectly fit your equipments"
        };
      case "equipment-side":
        return {
          title: "Equipment",
          description: "Choose equipment that match your business needs.",
          info: `Showing ${equipmentCatalog.length} models across ${equipmentSideMenus.length} equipment menus.`
        };
      case "serving-side":
        return {
          title: "Serving",
          description: "Choose serving-side equipment for your customer-facing layout.",
          info: `Configure the service hatch and customer-facing equipment.`
        };
      case "addons-utility":
        return {
          title: "Add-ons & Utility",
          description: "Add-on and utility options will appear here.",
          info: "Choose a menu from the bottom navigation."
        };
      case "trailer-customization":
        return {
          title: "Trailer Customization",
          description: "Trailer customization options will appear here.",
          info: "Choose a menu from the bottom navigation."
        };
      default:
        return {
          title: "Configurator",
          description: "Select a step to continue configuring the trailer.",
          info: "Choose a menu from the bottom navigation."
        };
    }
  }, [equipmentSideMenus.length, selectedStepId]);

  // Loading Overlay Component
  const LoadingOverlay = () => (
    <div className={`loading-overlay ${isLoading ? "active" : ""}`}>
      <img src="/Images/loader.gif" alt="Loading..." />
      <p>Loading your food truck...</p>
    </div>
  );



  function applyTrailerSize(trailerSize: TrailerSize) {
    // When the user clicks a trailer card, only update the card selection.
    // Do not change the committed size or the displayed model here.
    setSelectedTrailerCardId(trailerSize.id);
    setHasChosenTrailerType(true);
    setSelectedEquipmentId(null);
    setSelectedPlacedId(null);
    setEditingPlacedId(null);
    // Reset all manual positions so items re-snap to the new zone's floor/center
    setPlaced((current) =>
      current.map((item) => ({
        ...item,
        manualPlacement: undefined,
        manualScale: undefined
      }))
    );
  }

  function renderEquipmentCatalogPanel(groups: typeof equipmentSideMenus, badgeLabel: string) {
    return (
      <section className="catalog-panel-list">
        {groups.map((group, index) => (
          <section key={group.id} className="catalog-category-panel">
            <div className="catalog-category-heading">
              <h3>{group.label}</h3>
              <span>{index === 0 ? badgeLabel : group.side === "serving" ? "Serve" : "Cook"}</span>
            </div>
            <div className="catalog-product-grid">
              {group.items.slice(0, 6).map((equipment) => {
                const placedCount = placed.filter(p => p.definitionId === equipment.id).length;
                return (
                <div
                  key={equipment.id}
                  className={`catalog-product-card${
                    selectedEquipmentId === equipment.id ? " active" : ""
                  }`}
                  style={{ "--equipment-color": equipment.color } as CSSProperties}
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
                  {/* <span className="catalog-more-link">more info</span> */}
                  <span className="catalog-product-visual" aria-hidden="true">
                    {equipment.imageUrl && equipment.imageUrl !== "False" ? (
                      <img src={equipment.imageUrl} alt={equipment.name} style={{ width: "90%", height: "90%" }} />
                    ) : (
                      <span
                        className="catalog-product-shape"
                        style={{ "--equipment-color": equipment.color } as CSSProperties}
                      />
                    )}
                  </span>
                  <strong>{equipment.price && equipment.price.trim() !== "" ? equipment.price : "$0.00"}</strong>
                  <span>{equipment.name}</span>

                  <div className="quantity-controls" onClick={e => e.stopPropagation()}>
                    <button type="button" className="quantity-btn" onClick={() => removeOnePlaced(equipment.id)}> <img src="Images/Minus.png" /> </button>
                    <span className="quantity-value">{placedCount}</span>
                    <button type="button" className="quantity-btn" onClick={() => placeEquipmentAtNextPosition(equipment.id)}><img src="Images/Plus.png" /></button>
                  </div>
                </div>
              )})}
            </div>
          </section>
        ))}
      </section>
    );
  }

  function renderAddonsPanel() {
    const addonGroups = [
      {
        id: "addons-audio",
        label: "Audio & Communication",
        items: [
          { id: "buzzer-kit", title: "Buzzer Kit", image: "/Images/env.png" },
          { id: "sound-system", title: "Sound system", image: "/Images/env.png" }
        ]
      },
      {
        id: "addons-exterior",
        label: "Exterior & Utility",
        items: [
          { id: "awning", title: "Awning", image: "/Images/env.png" },
          { id: "storage-box", title: "Storage Box", image: "/Images/env.png" }
        ]
      },
      {
        id: "addons-power",
        label: "Power & Generators",
        items: [
          { id: "generators", title: "Generators", image: "/Images/StoreandDispense.png" }
        ]
      },
      {
        id:"addons-power",
        label:"Security & Monitoring",
        items:[
          {id:"Security", title:"Security Camera Kit"}
        ]
      }
    ];

    return (
      <section className="addons-list">
        {/* <p className="addons-intro">Every food trailer has its distinct features and requirements. Add those extra touches that can elevate your trailer's functionality and security.</p> */}
        {addonGroups.map((group) => (
          <div key={group.id} className="addon-section">
            <div className="addon-section-heading">
              <h4>{group.label}</h4>
              {/* <div className="addon-section-meta">
                <button className="addon-toggle" aria-label="Expand">▾</button>
              </div> */}
            </div>

            <div className="addon-section-body">
              {group.items.map((item) => (
                <div key={item.id} className="addon-card">
                  <div className="addon-card-visual">
                    <img src="/Images/StoreandDispense.png" alt={item.title} />
                  </div>
                  <div className="addon-card-info">
                    <p>{item.title}</p>
                  </div>
                  <div className="addon-card-actions">
                    <button type="button" className="circle-btn"><img src="/Images/Plus.png" alt="add"/></button>
                    {/* <button type="button" className="circle-btn small">&#9998;</button>
                    <button type="button" className="circle-btn small danger"><img src="/Images/Delete.png" alt="delete"/></button> */}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    );
  }

  function renderTrailerCustomizationPanel() {
    const designExamples = [
      { id: "no-wrap", name: "No Wrap", image: "/Images/no-wrap.png" },
      { id: "coffee", name: "Coffee", image: "/Images/coffee.png" },
      { id: "taco", name: "Taco", image: "/Images/Taco.png" },
      { id: "sushi", name: "Sushi", image: "/Images/sushi.png" },
      { id: "burger", name: "Burger", image: "/Images/burger.png" },
      { id: "hot-dog", name: "Hot Dog", image: "/Images/hot-dog.png" },
      { id: "ice-cream", name: "Ice Cream", image: "/Images/ice-cream.png" },
      { id: "lemonade", name: "Lemonade", image: "/Images/lemonade.png" },
      { id: "bbq", name: "BBQ", image: "/Images/bbq.png" },
      { id: "bubble-tea", name: "Bubble Tea", image: "/Images/bubble_tea.png" },
      { id: "pizza", name: "Pizza", image: "/Images/pizza.png" },
      { id: "sandwich", name: "Sandwich", image: "/Images/sandwich.png" },
      { id: "shawarma", name: "Shawarma",image: "/Images/shawarma.png" },
      { id: "matcha", name: "Matcha", image: "/Images/matcha.png"},
      { id: "waffles", name: "Belgian Waffles", image: "/Images/Belgian-waffles.png" },
      { id: "donut", name: "Donut", image: "/Images/ice-cream.png" }
    ];

    return (
      <section className="trailer-customization-card">
        <div className="trailer-wrap-panel">
          {/* Food Trailer Wrap Included Section */}
          <div className="wrap-included-section">
            <h3 className="wrap-section-title">Food Trailer Wrap Included</h3>
            <p className="wrap-section-description">
              Your trailer is more than a kitchen - it's a moving billboard. Wrapping is key for branding and visual impact. Explore sample designs to see how different styles can boost visibility and attract customers.
            </p>
            
            <div className="wrap-features-grid">
              <div className="wrap-feature-card">
                <div className="wrap-feature-icon">
                  <img src="/Images/icon-custom-design-services.png" />
                </div>
                <strong>Custom Design Services</strong>
              </div>
              <div className="wrap-feature-card">
                <div className="wrap-feature-icon">3M</div>
                <strong>Quality 3M Vinyl Wraps</strong>
              </div>
              <div className="wrap-feature-card">
                <div className="wrap-feature-icon">
                  <img src="/Images/icon-protective-lamination.png" />
                </div>
                <strong>Protective Lamination</strong>
              </div>
            </div>
          </div>

          {/* Design Examples Section */}
          <div className="design-examples-section">
            <h3 className="wrap-section-title">Design Examples</h3>
            <p className="wrap-section-description">
              Take a look at sample designs, colors, and graphics to get inspired. These examples show how different styles can increase visibility, attract customers, and leave a lasting impression.
            </p>
            
            <div className="design-examples-grid">
              {designExamples.map((design) => (
                <button
                  key={design.id}
                  type="button"
                  className={`design-example-card${selectedCustomizationId === design.id ? " active" : ""}`}
                  onClick={() => setSelectedCustomizationId(design.id)}
                >
                  {/* <span className="design-example-icon">{design.image}</span> */}
                  <img src={design.image} className="design-example-icon"/>
                  <span className="design-example-name">{design.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const isSpecsPage = selectedStepId === "size-specs";
  const isCatalogPage = [
    "equipment-side",
    "serving-side",
    "addons-utility",
    "trailer-customization"
  ].includes(selectedStepId);

  return (
    <div
      className={`app-shell${selectedStepId === "size" ? " size-page" : ""}${
        isSpecsPage ? " specs-page" : ""
      }${
        isCatalogPage ? " catalog-page" : ""
      }`}
    >
      <main className="experience-shell">
        <div className="brand-bar">
          {/* <button className="back-button" type="button" aria-label="Go back" onClick={() => setSelectedStepId("size")}>
            <img src="Images/Back.png" />
          </button> */}
          <div className="brand-copy">
            <div className="brand-title-row">
              {/* <span className="brand-mark" aria-hidden="true" /> */}
              <img src="/Images/FoodTrailer.png" />
              <img src="/Images/ikarus.png"/>
            </div>
          </div>
        </div>

        <div className="experience-stage">
            <BuilderScene
              selectedStepId={selectedStepId}
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
              onLoadingChange={setIsLoading}
              showMeasurements={showMeasurements}
              selectedCustomizationId={selectedCustomizationId}
            />
        </div>

        {selectedStepId === "size" || isSpecsPage || isCatalogPage ? (
          <div className="stage-toolbar size-view-toolbar">
            <button className="toolbar-icon-chip" type="button" aria-label="Preview view">
              <img src="/Images/eye.png" className="w-10 h-10" />
            </button>
            <button className="toolbar-icon-chip" type="button" aria-label="Gallery view">
              <img src="/Images/env.png" className="w-10 h-10" />
            </button>
            <button 
              className={`toolbar-icon-chip ${showMeasurements ? "active" : ""}`} 
              type="button" 
              aria-label="Draw view"
              onClick={() => setShowMeasurements(current => !current)}
            >
              <img src="Images/measurement.png" className="w-10 h-10" />
            </button>
            <button className="view-overview-button" type="button">
              View In Your Driveway
            </button>
          </div>
        ) : (
          <div className="stage-toolbar">
            <button className="toolbar-chip" type="button">
              {totalItems} items placed
            </button>
            <button className="toolbar-chip" type="button">
              {selectedTrailerCard.label} selected
            </button>
            <button className="toolbar-chip wide" type="button">
              {selectedItemLabel}
            </button>
          </div>
        )}

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

      {/* No-base-model warning modal */}
      {showNoBaseModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="no-base-modal-title"
          onClick={() => setShowNoBaseModal(false)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">⚠️</div>
            <h3 id="no-base-modal-title">Base Model Required</h3>
            <p>
              This item must be placed on top of a <strong>base model (Level 1)</strong>.
              Please add a base model to the zone first, then add this item on top of it.
            </p>
            <button
              type="button"
              className="modal-dismiss-btn"
              onClick={() => setShowNoBaseModal(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Level-1 + stacked Level-2 delete confirmation modal */}
      {deleteConfirmState && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          onClick={() => setDeleteConfirmState(null)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">🗑️</div>
            <h3 id="delete-confirm-title">Remove Stacked Models?</h3>
            <p>
              This <strong>base model (Level 1)</strong> has{" "}
              <strong>{deleteConfirmState.level2Ids.length} item{deleteConfirmState.level2Ids.length > 1 ? "s" : ""}</strong>{" "}
              placed on top of it. Removing it will also delete the stacked model{deleteConfirmState.level2Ids.length > 1 ? "s" : ""}.
            </p>
            <div className="modal-action-row">
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={() => setDeleteConfirmState(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-confirm-btn"
                onClick={confirmDeleteWithCascade}
              >
                Remove All
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className="inspector-panel">
        <div className="inspector-header">

  <section className="title-block">
    <h2>{inspectorCopy.title}</h2>
    <p>{inspectorCopy.description}</p>
  </section>

  {inspectorCopy.info ? (
    <section className="info-pill">
      <span className="info-pill__icon">i</span>
      <p>{inspectorCopy.info}</p>
    </section>
  ) : null}
  {/* ── Step top-nav ── */}
  <div className="step-top-nav">
    <button
      type="button"
      className="step-nav-btn"
      disabled={configuratorSteps.findIndex(s => s.id === selectedStepId) === 0}
      onClick={() => {
        const idx = configuratorSteps.findIndex(s => s.id === selectedStepId);
        if (idx > 0) setSelectedStepId(configuratorSteps[idx - 1].id);
      }}
    >
      ← BACK
    </button>

    <span className="step-nav-label">
      {configuratorSteps.find(s => s.id === selectedStepId)?.label ?? ""}
    </span>

    <button
      type="button"
      className="step-nav-btn"
      disabled={configuratorSteps.findIndex(s => s.id === selectedStepId) === configuratorSteps.length - 1}
      onClick={() => {
        const idx = configuratorSteps.findIndex(s => s.id === selectedStepId);
        if (idx < configuratorSteps.length - 1) setSelectedStepId(configuratorSteps[idx + 1].id);
      }}
    >
      NEXT →
    </button>
  </div>
</div>
        <div className="inspector-scroll">
          {selectedStepId === "size" ? (
            <section className="trailer-card-list">
              {trailerSizes.map((trailerSize) => {
                const isActive = trailerSize.id === selectedTrailerCardId;
                const isLargeTrailer = trailerSize.id === "size-30";
                const cardTitle = isLargeTrailer ? "Hot Food Service" : "Store & Dispense";
                const cardDescription = isLargeTrailer
                  ? "Built for cooking-focused menus with room for heavier kitchen equipment."
                  : "Ideal for businesses focused on ice-creams, drinks and display.";
                const features = isLargeTrailer
                  ? ["High Capacity", "Cooking Ready", "Service Efficient"]
                  : ["Cold Storage", "Enhanced Insulation", "Energy Efficient"];

                return (
                  <div
                    key={trailerSize.id}
                    role="button"
                    tabIndex={0}
                    className={`trailer-card${isActive ? " active" : ""}`}
                    style={
                      {
                        "--card-accent": trailerSize.accent,
                        "--card-accent-soft": trailerSize.accentSoft
                      } as CSSProperties
                    }
                    onClick={() => applyTrailerSize(trailerSize)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") applyTrailerSize(trailerSize);
                    }}
                  >
                    <div className="trailer-card__meta size-card__meta">
                      <span className="price-pill">Base Price : $99,999</span>
                      <span className="more-link">more info</span>
                    </div>
                    <div className="trailer-card__visual" aria-hidden="true">
                      <div className="trailer-card__mini-stage">
                        <img src="/Images/StoreandDispense.png" alt="Store and Dispense" className="mini-trailer-image" />
                        {/* <span className="mini-trailer-body" />
                        <span className="mini-trailer-roof" /> */}
                        {/* <span className="mini-trailer-wheel wheel-a" />
                        <span className="mini-trailer-wheel wheel-b" /> */}
                      </div>
                    </div>
                    <div className="trailer-card__body size-card__body">
                      <h3>{cardTitle}</h3>
                      <p>{cardDescription}</p>
                    </div>
                    <div className="trailer-card__features">
                      <span>{isLargeTrailer ? "Hot service features:" : "Storing specific features:"}</span>
                      <ul>
                        {features.map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                      </ul>
                    </div>

                    {isActive ? (
                      <div className="trailer-card__footer">
                        <button
                          type="button"
                          className="continue-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStepId("size-specs");
                          }}
                        >
                          Continue <span className="continue-arrow">→</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}

          {selectedStepId === "size-specs" ? (
            <section className="specs-card">
              <div className="specs-card-heading">
                <h3>Trailer Size</h3>
              </div>
              <div className="size-option-list">
                {[
                  {
                    label: "16ft",
                    description: "Perfect for focused menus and mobile operations.",
                    trailerSizeId: "size-16" as TrailerSize["id"],
                    enabled: true
                  },
                  {
                    label: "18ft",
                    description: "More room for equipment without sacrificing mobility.",
                    enabled: false
                  },
                  {
                    label: "20ft",
                    description: "A versatile size for growing food businesses.",
                    enabled: false
                  },
                  {
                    label: "22ft",
                    description: "Balanced workspace for busy service periods.",
                    enabled: false
                  },
                  {
                    label: "24ft",
                    description: "Built for larger menus and higher customer demand.",
                    enabled: false
                  },
                  {
                    label: "26ft",
                    description: "Extra capacity for expanded kitchen operations.",
                    enabled: false
                  },
                  {
                    label: "30ft",
                    description: "Maximum room for high-volume service layouts.",
                    trailerSizeId: "size-30" as TrailerSize["id"],
                    enabled: true
                  }
                ].map((sizeOption) => {
                  const isActive =
                    sizeOption.enabled && sizeOption.trailerSizeId === selectedTrailerSizeId;

                  return (
                    <button
                      key={sizeOption.label}
                      type="button"
                      className={`size-option-card${isActive ? " active" : ""}`}
                      disabled={!sizeOption.enabled}
                      onClick={() => {
                        if (sizeOption.trailerSizeId) {
                          // Commit the chosen size — this controls selection and the scene model
                          setSelectedTrailerSizeId(sizeOption.trailerSizeId);
                          setDisplayedTrailerSizeId(sizeOption.trailerSizeId!);
                        }
                      }}
                    >
                      <span className="size-radio" aria-hidden="true" />
                      <span className="size-option-copy">
                        <strong>{sizeOption.label}</strong>
                        <span>{sizeOption.description}</span>
                      </span>
                      <strong className="size-option-price">$99,999</strong>
                      {isActive ? (
                        <div className="size-option-footer">
                          <button
                            type="button"
                            className="size-option-continue"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStepId("equipment-side");
                            }}
                          >
                            Continue with {sizeOption.label} <span className="continue-arrow">→</span>
                          </button>
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {selectedStepId === "equipment-side" ? (
            renderEquipmentCatalogPanel(equipmentSideMenus, "Store")
          ) : null}

          {selectedStepId === "serving-side" ? (
            renderEquipmentCatalogPanel(servingSideMenus, "Serve")
          ) : null}

          {selectedStepId === "addons-utility" ? (
            renderAddonsPanel()
          ) : null}

          {selectedStepId === "trailer-customization" ? (
            renderTrailerCustomizationPanel()
          ) : null}

          {/* <details className="advanced-controls">
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
          </details> */}
        </div>

        <div className="sticky-action-bar">
          <button
            type="button"
            className="summary-button"
            onClick={() => setShowBuildSummary(true)}
          >
            <img src="/Images/summary.png"/>
            {placed.length > 0 || totalPrice > 0 ? (
              <span>{`$${totalPrice.toLocaleString()}`}</span>
            ) : (
              <span>Summary</span>
            )}
          </button>

          <button
            type="button"
            className="summary-button"
          // onClick={handleContactUs} // or your function
          >
            <img src="/Images/Contact.png"/>
            Contact Us
          </button>

          <button
  type="button"
  className="icon-action-button"
  aria-label="Save build"
  onClick={handleSaveBuild}
>
  {isSaved ? (
    <svg
      width="22" height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : (
    <img src="public/images/Save.png" className="icon-action-button-img" />
  )}
</button>
        </div>
      </aside>

      {showBuildSummary ? (
        <div className="build-summary-overlay" onClick={() => setShowBuildSummary(false)}>
          <div className="build-summary-modal" onClick={e => e.stopPropagation()}>
            <div className="summary-header">
              <h2>Your Build</h2>
              <button className="summary-close" onClick={() => setShowBuildSummary(false)}>✕</button>
            </div>
            
            <div className="summary-trailer-card">
              <div className="summary-trailer-visual">
                  <div className="trailer-card__mini-stage" style={{ transform: "scale(0.55) translate(-10%, 10%)" }}>
                    <img src="/Images/StoreandDispense.png" alt="Store and Dispense" className="mini-trailer-image" />
                    {/* <span className="mini-trailer-body" /> */}
                    {/* <span className="mini-trailer-roof" /> */}
                    {/* <span className="mini-trailer-wheel wheel-a" />
                    <span className="mini-trailer-wheel wheel-b" /> */}
                  </div>
                </div>
              <div className="summary-trailer-info">
                 <span className="summary-trailer-type">{selectedTrailerCard.id === "size-30" ? "HOT FOOD SERVICE TRAILER" : "CONCESSION TRAILER"}</span>
                 <strong className="summary-trailer-price">${(selectedTrailerSize.id === "size-30" ? 99999 : 99999).toLocaleString()}</strong>
              </div>
            </div>

            <nav className="summary-tabs">
              {[ {id:1, label:"1. TYPE"}, {id:2, label:"2. SIZE"}, {id:3, label:"3. EQUIPMENTS"}, {id:4, label:"4. ADDITIONAL"} ].map(tab => (
                 <button 
                   key={tab.id} 
                   className={buildSummaryTab === tab.id ? "active" : ""}
                   onClick={() => setBuildSummaryTab(tab.id)}
                 >
                   {tab.label}
                 </button>
              ))}
            </nav>

            <div className="summary-tab-content">
              {buildSummaryTab === 1 && (
                 <div className="summary-equipments">
                    <div className="size-summary-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <h3 style={{ fontSize: '18px', margin: 0 }}>{selectedTrailerCard.id === "size-30" ? "Hot Food Service" : "Store & Dispense"}</h3>
                        <p style={{ margin: 0, color: 'var(--text-soft)' }}>
                          {selectedTrailerCard.id === "size-30" ? "Built for cooking-focused menus with room for heavier kitchen equipment." : "Ideal for businesses focused on ice-creams, drinks and display."}
                       </p>
                    </div>
                 </div>
              )}
              {buildSummaryTab === 2 && (
                 <div className="summary-equipments size-summary-tab">
                    <div className="size-summary-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                       <h3 style={{ fontSize: '18px', margin: 0 }}>{selectedTrailerSize.label} Trailer</h3>
                       <p style={{ margin: 0, color: 'var(--text-soft)' }}>
                          {selectedTrailerSize.id === "size-30" ? "Maximum room for high-volume service layouts." : 
                           selectedTrailerSize.id === "size-16" ? "Perfect for focused menus and mobile operations." :
                           "A versatile size for growing food businesses."}
                       </p>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                          <strong>Base Price</strong>
                          <strong>${(selectedTrailerSize.id === "size-30" ? 99999 : 99999).toLocaleString()}</strong>
                       </div>
                    </div>
                 </div>
              )}
              {buildSummaryTab === 3 && (
                <div className="summary-equipments">
                  {placements.length === 0 ? (
                    <p className="empty-state">No equipments added yet.</p>
                  ) : (() => {
                    const grouped = new Map();
                    for (const p of placements) {
                       const key = `${p.definition.id}-${p.zone.id}`;
                       if (!grouped.has(key)) {
                          grouped.set(key, { definition: p.definition, zone: p.zone, count: 0, items: [] });
                       }
                       const g = grouped.get(key);
                       g.count++;
                       g.items.push(p.item.id);
                    }
                    return Array.from(grouped.values()).map(({ definition, zone, count }) => (
                     <div key={`${definition.id}-${zone.id}`} className="summary-equipment-row">
                       <div className="summary-eq-visual" style={{ width: '48px', height: '48px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {definition.imageUrl && definition.imageUrl !== "False" ? (
                             <img src={definition.imageUrl} alt={definition.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          ) : (
                             <span className="catalog-product-shape" style={{ "--equipment-color": definition.color, transform: "scale(0.5)" } as React.CSSProperties} />
                          )}
                       </div>
                       <div className="summary-eq-info">
                          <strong>{definition.name.toUpperCase()}</strong>
                          <span style={{ fontSize: '0.85em', color: 'var(--text-soft)', marginTop: '2px', display: 'block' }}>Qty: {count}</span>
                       </div>
                       <div className="summary-eq-pills">
                          <span className="pill-outline">SIDE A</span>
                          <span className="pill-filled">{zone.id === "equipment-drop" ? "STORE" : "COOK"}</span>
                       </div>
                       <div className="summary-eq-price">
                          ${(parsePrice(definition.price) * count).toLocaleString()}
                       </div>
                       <div className="summary-eq-actions">
                          <button aria-label="Delete" onClick={() => removeOnePlaced(definition.id)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                          </button>
                       </div>
                     </div>
                   ));
                  })()}
                </div>
              )}
              {buildSummaryTab === 4 && (
                 <div className="summary-equipments">
                   <p className="empty-state">This section will be available soon.</p>
                 </div>
              )}
            </div>

            <div className="summary-footer">
              <div className="summary-totals">
                 {(() => {
                   const equipmentsTotal = placements.reduce((sum, { definition }) => sum + parsePrice(definition.price), 0);
                   const basePrice = selectedTrailerSize.id === "size-30" ? 99999 : 99999;
                   const total = basePrice + equipmentsTotal;
                   return (
                     <>
                       <div className="summary-row">
                         <span>Subtotal</span>
                         <span>${total.toLocaleString()}</span>
                       </div>
                       <div className="summary-row">
                         <span>Other Charges</span>
                         <span>-</span>
                       </div>
                       <div className="summary-total-row">
                         <strong>Total</strong>
                         <strong>${total.toLocaleString()}</strong>
                       </div>
                     </>
                   );
                 })()}
              </div>
              <button className="connect-dealer-btn">CONNECT WITH DEALER</button>
            </div>
          </div>
        </div>
      ) : null}
      <LoadingOverlay />
    </div>
  );
}

export default App;
