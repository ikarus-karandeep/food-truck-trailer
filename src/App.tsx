import { Suspense, lazy, useMemo, useState } from "react";
import { Box3, Vector3 } from "three";

type Dimensions = {
  length: number;
  width: number;
  height: number;
};

type EquipmentDefinition = {
  id: string;
  name: string;
  size: {
    length: number;
    width: number;
    height: number;
  };
  allowedZones: ZoneId[];
  color: string;
  model3d?: {
    src: string;
    scale: number;
    yOffset?: number;
    rotationY?: number;
  };
};

type ZoneId =
  | "customer-window"
  | "cooking"
  | "prep"
  | "washing"
  | "refrigeration"
  | "walkway"
  | "entry";

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
  slot: number;
  parentId?: string;
};

type PlacementView = {
  item: PlacedEquipment;
  definition: EquipmentDefinition;
  zone: Zone;
  placement: { x: number; y: number; z: number; rotationY: number };
};

type ModelMetric = {
  width: number;
  height: number;
  length: number;
};

type ViewportZoneOption = {
  zoneId: ZoneId;
  label: string;
  disabled: boolean;
};

const FLOOR_Y = 0.08;
const COLLISION_PADDING = 0;

const FEET_TO_METERS = 0.3048;
const REFRIGERATION_ZONE_LENGTH = 16 * FEET_TO_METERS;
const REFRIGERATION_ZONE_WIDTH = 4.6 * FEET_TO_METERS;
const REFRIGERATION_ZONE_HEIGHT = 12 * FEET_TO_METERS;

const equipmentCatalog: EquipmentDefinition[] = [
  {
    id: "service-counter",
    name: "Service Counter",
    size: { length: 1.4, width: 0.6, height: 1.1 },
    allowedZones: ["customer-window"],
    color: "#ffcb74"
  },
  {
    id: "grill",
    name: "Flat Grill",
    size: { length: 1.0, width: 0.75, height: 0.95 },
    allowedZones: ["cooking"],
    color: "#ff7a59"
  },
  {
    id: "fryer",
    name: "Deep Fryer",
    size: { length: 0.7, width: 0.75, height: 0.95 },
    allowedZones: ["cooking"],
    color: "#ff9966"
  },
  {
    id: "prep-table",
    name: "Prep Table",
    size: { length: 1.2, width: 0.7, height: 0.9 },
    allowedZones: ["prep"],
    color: "#78d4c2"
  },
  {
    id: "sink",
    name: "3-Bay Sink",
    size: { length: 1.4, width: 0.7, height: 0.95 },
    allowedZones: ["washing"],
    color: "#8ecae6"
  },
  {
    id: "handwash",
    name: "Hand Wash Sink",
    size: { length: 0.55, width: 0.55, height: 0.9 },
    allowedZones: ["washing", "entry"],
    color: "#9dd9f3"
  },
  {
    id: "fridge",
    name: "Reach-In Fridge",
    size: { length: 0.9, width: 0.85, height: 1.9 },
    allowedZones: ["refrigeration"],
    color: "#96b8ff",
    model3d: {
      src: new URL("../models/refrigeration/TallRefrigerator.glb", import.meta.url).href,
      scale: 0.9,
      yOffset: 0
    }
  },
  {
    id: "freezer",
    name: "Undercounter Freezer",
    size: { length: 1.0, width: 0.75, height: 0.95 },
    allowedZones: ["refrigeration", "prep"],
    color: "#6f8cff",
    model3d: {
      src: new URL(
        "../models/refrigeration/UndercounterRefrigerator.glb",
        import.meta.url
      ).href,
      scale: 0.82,
      yOffset: 0
    }
  },
  {
    id: "sandwich-prep-fridge",
    name: "Sandwich Prep Fridge",
    size: { length: 1.2, width: 0.78, height: 1.25 },
    allowedZones: ["refrigeration", "prep"],
    color: "#86bdf7",
    model3d: {
      src: new URL(
        "../models/refrigeration/SandwichPrepRefrigerator.glb",
        import.meta.url
      ).href,
      scale: 0.8,
      yOffset: 0
    }
  },
  {
    id: "chest-freezer",
    name: "Chest Freezer",
    size: { length: 1.2, width: 0.8, height: 0.95 },
    allowedZones: ["refrigeration"],
    color: "#75aef7",
    model3d: {
      src: new URL("../models/refrigeration/ChestFreezer.glb", import.meta.url).href,
      scale: 0.82,
      yOffset: 0
    }
  },
  {
    id: "ice-maker",
    name: "Ice Maker",
    size: { length: 0.7, width: 0.75, height: 1.0 },
    allowedZones: ["refrigeration", "prep"],
    color: "#a3cfff",
    model3d: {
      src: new URL("../models/refrigeration/Icemaker.glb", import.meta.url).href,
      scale: 0.82,
      yOffset: 0
    }
  },
  {
    id: "soft-serve-freezer",
    name: "Soft Serve Freezer",
    size: { length: 0.9, width: 0.85, height: 1.55 },
    allowedZones: ["refrigeration"],
    color: "#5d8fed",
    model3d: {
      src: new URL("../models/refrigeration/SoftServeFreezer.glb", import.meta.url).href,
      scale: 0.82,
      yOffset: 0
    }
  },
  {
    id: "shelf",
    name: "Dry Storage Shelf",
    size: { length: 1.0, width: 0.45, height: 1.8 },
    allowedZones: ["prep", "entry"],
    color: "#c9a46d"
  },
  {
    id: "door-clearance",
    name: "Entry Clearance",
    size: { length: 0.9, width: 0.8, height: 0.1 },
    allowedZones: ["entry"],
    color: "#f4f1de"
  }
];

const zoneOrder: ZoneId[] = [
  "customer-window",
  "cooking",
  "prep",
  "washing",
  "refrigeration",
  "walkway",
  "entry"
];

const BuilderScene = lazy(() => import("./BuilderScene"));

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isSoftServe(definitionId: string) {
  return definitionId === "soft-serve-freezer";
}

function isUndercounter(definitionId: string) {
  return definitionId === "freezer";
}

function getEffectiveSize(
  definition: EquipmentDefinition,
  modelMetrics: Record<string, ModelMetric>
) {
  return modelMetrics[definition.id] ?? {
    width: definition.size.width,
    height: definition.size.height,
    length: definition.size.length
  };
}

function countZoneOccupancy(items: PlacedEquipment[], zoneId: ZoneId) {
  return items.filter((item) => item.zoneId === zoneId && !item.parentId).length;
}

function normalizeZoneSlots(items: PlacedEquipment[], zoneId: ZoneId) {
  const baseItems = items
    .filter((item) => item.zoneId === zoneId && !item.parentId)
    .sort((a, b) => a.slot - b.slot);
  const slotMap = new Map(baseItems.map((item, slot) => [item.id, slot]));

  return items.map((item) => {
    if (item.zoneId !== zoneId) {
      return item;
    }

    if (item.parentId) {
      const parentSlot = slotMap.get(item.parentId);
      return { ...item, slot: parentSlot ?? item.slot };
    }

    return { ...item, slot: slotMap.get(item.id) ?? item.slot };
  });
}

function buildZones(dimensions: Dimensions): Zone[] {
  const { length, width } = dimensions;
  const wallDepth = clamp(width * 0.28, 0.8, 1.2);
  const rearBand = clamp(length * 0.18, 1.2, 1.8);
  const frontBand = clamp(length * 0.24, 1.6, 2.4);
  const midBand = Math.max(length - frontBand - rearBand, 1.8);
  const leftX = -(width - wallDepth) / 2;
  const rightX = (width - wallDepth) / 2;
  const walkwayWidth = clamp(width * 0.24, 0.9, 1.2);
  const sideLaneWidth = Math.max((width - walkwayWidth) / 2, 0.8);
  const leftLaneX = -(walkwayWidth / 2 + sideLaneWidth / 2);
  const rightLaneX = walkwayWidth / 2 + sideLaneWidth / 2;
  const frontZ = -(length / 2) + frontBand / 2;
  const midZ = frontZ + frontBand / 2 + midBand / 2;
  const rearZ = length / 2 - rearBand / 2;

  return [
    {
      id: "customer-window",
      name: "Customer Window",
      color: "#ffcb74",
      x: leftX,
      z: frontZ,
      length: frontBand,
      width: wallDepth,
      height: dimensions.height,
      capacity: 2
    },
    {
      id: "cooking",
      name: "Cooking",
      color: "#ff7a59",
      x: rightX,
      z: frontZ,
      length: frontBand,
      width: wallDepth,
      height: dimensions.height,
      capacity: 3
    },
    {
      id: "prep",
      name: "Prep",
      color: "#78d4c2",
      x: leftLaneX,
      z: midZ,
      length: midBand,
      width: sideLaneWidth,
      height: dimensions.height,
      capacity: 3
    },
    {
      id: "refrigeration",
      name: "Refrigeration",
      color: "#96b8ff",
      x: rightLaneX,
      z: midZ,
      length: REFRIGERATION_ZONE_LENGTH,
      width: REFRIGERATION_ZONE_WIDTH,
      height: REFRIGERATION_ZONE_HEIGHT,
      capacity: 4
    },
    {
      id: "washing",
      name: "Washing",
      color: "#8ecae6",
      x: leftX,
      z: rearZ,
      length: rearBand,
      width: wallDepth,
      height: dimensions.height,
      capacity: 2
    },
    {
      id: "entry",
      name: "Entry",
      color: "#f4f1de",
      x: rightX,
      z: rearZ,
      length: rearBand,
      width: wallDepth,
      height: dimensions.height,
      capacity: 2
    },
    {
      id: "walkway",
      name: "Walkway",
      color: "#d7f171",
      x: 0,
      z: 0,
      length,
      width: walkwayWidth,
      height: dimensions.height,
      capacity: 1
    }
  ];
}

function getFloorPlacement(zone: Zone, slot: number, item: EquipmentDefinition) {
  if (zone.id === "walkway") {
    return { x: 0, y: FLOOR_Y, z: 0, rotationY: 0 };
  }

  const horizontal = zone.length >= zone.width;
  const cells = Math.max(zone.capacity, 1);
  const gap = 0.18;
  const start =
    (horizontal ? -zone.length / 2 : -zone.width / 2) +
    (horizontal ? item.size.length : item.size.width) / 2 +
    0.12;
  const step =
    ((horizontal ? zone.length : zone.width) -
      (horizontal ? item.size.length : item.size.width) -
      0.24) /
    Math.max(cells - 1, 1);
  const axisOffset = start + Math.min(slot, cells - 1) * Math.max(step, gap);

  return horizontal
    ? {
        x: zone.x,
        y: FLOOR_Y,
        z: zone.z - zone.length / 2 + axisOffset,
        rotationY: Math.PI / 2
      }
    : {
        x: zone.x - zone.width / 2 + axisOffset,
        y: FLOOR_Y,
        z: zone.z,
        rotationY: 0
      };
}

function findStackParent(
  items: PlacedEquipment[],
  definitions: Record<string, EquipmentDefinition>,
  zoneId: ZoneId
) {
  return items.find((item) => {
    if (item.zoneId !== zoneId || item.parentId) {
      return false;
    }

    const definition = definitions[item.definitionId];
    const alreadyHasChild = items.some((candidate) => candidate.parentId === item.id);
    return !!definition && isUndercounter(definition.id) && !alreadyHasChild;
  });
}

function createPlacementBox(
  definition: EquipmentDefinition,
  placement: PlacementView["placement"],
  modelMetrics: Record<string, ModelMetric>
) {
  const effectiveSize = getEffectiveSize(definition, modelMetrics);
  const rotated = Math.abs(Math.sin(placement.rotationY)) > 0.5;
  const xSize = (rotated ? effectiveSize.length : effectiveSize.width) + COLLISION_PADDING;
  const zSize = (rotated ? effectiveSize.width : effectiveSize.length) + COLLISION_PADDING;

  return new Box3(
    new Vector3(
      placement.x - xSize / 2,
      placement.y,
      placement.z - zSize / 2
    ),
    new Vector3(
      placement.x + xSize / 2,
      placement.y + effectiveSize.height,
      placement.z + zSize / 2
    )
  );
}

function boxesOverlap(a: Box3, b: Box3) {
  return !(
    a.max.x <= b.min.x ||
    a.min.x >= b.max.x ||
    a.max.y <= b.min.y ||
    a.min.y >= b.max.y ||
    a.max.z <= b.min.z ||
    a.min.z >= b.max.z
  );
}

function buildRefrigerationPlacementMap(
  zone: Zone,
  items: PlacedEquipment[],
  definitions: Record<string, EquipmentDefinition>,
  modelMetrics: Record<string, ModelMetric>
) {
  const placements = new Map<string, PlacementView["placement"]>();
  const occupiedBoxes: Box3[] = [];
  const floorItems = items
    .filter((item) => item.zoneId === "refrigeration" && !item.parentId)
    .sort((a, b) => a.slot - b.slot);

  floorItems.forEach((item) => {
    const definition = definitions[item.definitionId];
    if (!definition) {
      return;
    }

    const effectiveSize = getEffectiveSize(definition, modelMetrics);
    const zFootprint = effectiveSize.width + COLLISION_PADDING;
    const candidateStart = zone.z - zone.length / 2 + zFootprint / 2 + 0.18;
    const candidateEnd = zone.z + zone.length / 2 - zFootprint / 2 - 0.18;
    const scanStep = 0.05;
    let placement: PlacementView["placement"] | null = null;
    const previousBox = occupiedBoxes[occupiedBoxes.length - 1];
    const baseCandidateZ = previousBox
      ? previousBox.max.z + zFootprint / 2
      : candidateStart;

    for (let z = Math.max(baseCandidateZ, candidateStart); z <= candidateEnd; z += scanStep) {
      const candidate = {
        x: zone.x,
        y: FLOOR_Y,
        z,
        rotationY: Math.PI / 2
      };
      const candidateBox = createPlacementBox(definition, candidate, modelMetrics);
      const intersects = occupiedBoxes.some((box) => boxesOverlap(box, candidateBox));

      if (!intersects) {
        placement = candidate;
        occupiedBoxes.push(candidateBox);
        break;
      }
    }

    if (!placement) {
      const fallback = {
        x: zone.x,
        y: FLOOR_Y,
        z: Math.min(Math.max(baseCandidateZ, candidateStart), candidateEnd),
        rotationY: Math.PI / 2
      };
      placements.set(item.id, fallback);
      occupiedBoxes.push(createPlacementBox(definition, fallback, modelMetrics));
      return;
    }

    placements.set(item.id, placement);
  });

  items
    .filter((item) => item.zoneId === "refrigeration" && !!item.parentId)
    .forEach((item) => {
      const definition = definitions[item.definitionId];
      const parent = items.find((candidate) => candidate.id === item.parentId);

      if (!definition || !parent) {
        return;
      }

      const parentDefinition = definitions[parent.definitionId];
      const parentPlacement = placements.get(parent.id);

      if (!parentDefinition || !parentPlacement) {
        return;
      }

      placements.set(item.id, {
        x: parentPlacement.x,
        y:
          parentPlacement.y +
          getEffectiveSize(parentDefinition, modelMetrics).height,
        z: parentPlacement.z,
        rotationY: parentPlacement.rotationY
      });
    });

  return placements;
}

function App() {
  const [dimensions, setDimensions] = useState<Dimensions>({
    length: 6.5,
    width: 2.4,
    height: 2.7
  });
  const [placed, setPlaced] = useState<PlacedEquipment[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
  const [editingPlacedId, setEditingPlacedId] = useState<string | null>(null);
  const [modelMetrics, setModelMetrics] = useState<Record<string, ModelMetric>>({});

  const zones = useMemo(() => buildZones(dimensions), [dimensions]);
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

  const selectedEquipment = useMemo(
    () =>
      equipmentCatalog.find((equipment) => equipment.id === selectedEquipmentId) ?? null,
    [selectedEquipmentId]
  );

  const placements = useMemo<PlacementView[]>(
    () => {
      const refrigerationPlacements = buildRefrigerationPlacementMap(
        zoneMap.refrigeration,
        placed,
        equipmentMap,
        modelMetrics
      );

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
            placement:
              item.zoneId === "refrigeration"
                ? refrigerationPlacements.get(item.id) ?? getFloorPlacement(zone, item.slot, definition)
                : getFloorPlacement(zone, item.slot, definition)
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    },
    [equipmentMap, modelMetrics, placed, zoneMap]
  );

  const selectedPlaced = useMemo(
    () => placements.find(({ item }) => item.id === selectedPlacedId) ?? null,
    [placements, selectedPlacedId]
  );

  const zoneCounts = useMemo(
    () =>
      zoneOrder.reduce<Record<ZoneId, number>>((accumulator, zoneId) => {
        accumulator[zoneId] = countZoneOccupancy(placed, zoneId);
        return accumulator;
      }, {} as Record<ZoneId, number>),
    [placed]
  );

  const selectedPlacedAllowedZones = useMemo(
    () => selectedPlaced?.definition.allowedZones ?? [],
    [selectedPlaced]
  );
  const isEditingSelected = selectedPlacedId !== null && selectedPlacedId === editingPlacedId;

  const editableEquipmentOptions = useMemo(() => {
    if (!selectedPlaced) {
      return [];
    }

    return equipmentCatalog.filter((equipment) =>
      equipment.allowedZones.some((zoneId) => {
        if (zoneId === selectedPlaced.item.zoneId) {
          return true;
        }

        return zoneCounts[zoneId] < zoneMap[zoneId].capacity;
      })
    );
  }, [selectedPlaced, zoneCounts, zoneMap]);

  const viewportZoneOptions = useMemo<ViewportZoneOption[]>(() => {
    if (!selectedPlaced) {
      return [];
    }

    return selectedPlacedAllowedZones.map((zoneId) => {
      const zone = zoneMap[zoneId];
      const count = zoneCounts[zoneId];

      return {
        zoneId,
        label: zone.name,
        disabled: zoneId !== selectedPlaced.item.zoneId && count >= zone.capacity
      };
    });
  }, [selectedPlaced, selectedPlacedAllowedZones, zoneCounts, zoneMap]);

  function updateDimension(key: keyof Dimensions, value: number) {
    setDimensions((current) => ({
      ...current,
      [key]: clamp(value, key === "height" ? 2.1 : 1.8, key === "length" ? 12 : 4)
    }));
  }

  function placeEquipment(equipmentId: string, zoneId: ZoneId) {
    const zone = zoneMap[zoneId];
    const equipment = equipmentMap[equipmentId];

    if (!zone || !equipment || !equipment.allowedZones.includes(zoneId)) {
      return;
    }

    setPlaced((current) => {
      if (zoneId === "refrigeration" && isSoftServe(equipmentId)) {
        const parent = findStackParent(current, equipmentMap, zoneId);

        if (parent) {
          const parentDefinition = equipmentMap[parent.definitionId];
          if (
            parentDefinition &&
            parentDefinition.size.height + equipment.size.height <= zone.height
          ) {
            return [
              ...current,
              {
                id: `${equipmentId}-${zoneId}-${crypto.randomUUID()}`,
                definitionId: equipmentId,
                zoneId,
                slot: parent.slot,
                parentId: parent.id
              }
            ];
          }
        }
      }

      const nextSlot = countZoneOccupancy(current, zoneId);

      if (nextSlot >= zone.capacity) {
        return current;
      }

      if (equipment.size.height > zone.height) {
        return current;
      }

      return [
        ...current,
        {
          id: `${equipmentId}-${zoneId}-${crypto.randomUUID()}`,
          definitionId: equipmentId,
          zoneId,
          slot: nextSlot
        }
      ];
    });
    setSelectedEquipmentId(null);
    setEditingPlacedId(null);
  }

  function removePlaced(id: string) {
    setPlaced((current) => {
      const removed = current.find((item) => item.id === id);

      if (!removed) {
        return current;
      }

      const remaining = current.filter((item) => item.id !== id && item.parentId !== id);
      return normalizeZoneSlots(remaining, removed.zoneId);
    });
    setSelectedPlacedId((current) => (current === id ? null : current));
    setEditingPlacedId((current) => (current === id ? null : current));
  }

  function movePlacedToZone(id: string, zoneId: ZoneId) {
    setPlaced((current) => {
      const target = current.find((item) => item.id === id);

      if (!target) {
        return current;
      }

      const definition = equipmentMap[target.definitionId];
      const zone = zoneMap[zoneId];

      if (!definition || !zone || !definition.allowedZones.includes(zoneId)) {
        return current;
      }

      if (target.parentId) {
        return current;
      }

      const zoneCount = countZoneOccupancy(
        current.filter((item) => item.id !== id && item.parentId !== id),
        zoneId
      );

      if (zoneId !== target.zoneId && zoneCount >= zone.capacity) {
        return current;
      }

      const updated = current.map((item) =>
        item.id === id || item.parentId === id
          ? {
              ...item,
              zoneId,
              slot: zoneId === target.zoneId ? target.slot : zoneCount
            }
          : item
      );

      return zoneId === target.zoneId
        ? normalizeZoneSlots(updated, zoneId)
        : normalizeZoneSlots(normalizeZoneSlots(updated, target.zoneId), zoneId);
    });
    setEditingPlacedId(null);
  }

  function movePlacedBySlot(id: string, direction: -1 | 1) {
    setPlaced((current) => {
      const target = current.find((item) => item.id === id);

      if (!target || target.parentId) {
        return current;
      }

      const sameZone = current
        .filter((item) => item.zoneId === target.zoneId && !item.parentId)
        .sort((a, b) => a.slot - b.slot);
      const index = sameZone.findIndex((item) => item.id === id);
      const swapIndex = index + direction;

      if (index < 0 || swapIndex < 0 || swapIndex >= sameZone.length) {
        return current;
      }

      const reordered = [...sameZone];
      [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
      const slotMap = new Map(reordered.map((item, slot) => [item.id, slot]));

      return current.map((item) => {
        if (item.zoneId !== target.zoneId) {
          return item;
        }

        if (item.parentId) {
          const parentSlot = slotMap.get(item.parentId);
          return { ...item, slot: parentSlot ?? item.slot };
        }

        return { ...item, slot: slotMap.get(item.id) ?? item.slot };
      });
    });
    setEditingPlacedId(null);
  }

  function updatePlacedDefinition(id: string, definitionId: string) {
    setPlaced((current) => {
      const target = current.find((item) => item.id === id);
      const definition = equipmentMap[definitionId];

      if (!target || !definition) {
        return current;
      }

      if (target.parentId) {
        return current;
      }

      if (definition.allowedZones.includes(target.zoneId)) {
        return current.map((item) =>
          item.id === id ? { ...item, definitionId } : item
        );
      }

      const fallbackZoneId = definition.allowedZones.find((zoneId) => {
        const zone = zoneMap[zoneId];
        const count = countZoneOccupancy(
          current.filter((item) => item.id !== id && item.parentId !== id),
          zoneId
        );
        return count < zone.capacity;
      });

      if (!fallbackZoneId) {
        return current;
      }

      const fallbackCount = countZoneOccupancy(
        current.filter((item) => item.id !== id && item.parentId !== id),
        fallbackZoneId
      );
      const updated = current.map((item) =>
        item.id === id || item.parentId === id
          ? {
              ...item,
              definitionId: item.id === id ? definitionId : item.definitionId,
              zoneId: fallbackZoneId,
              slot: fallbackCount
            }
          : item
      );

      return normalizeZoneSlots(normalizeZoneSlots(updated, target.zoneId), fallbackZoneId);
    });
    setEditingPlacedId(id);
  }

  const zoneActionHint = selectedPlaced
    ? "Click any compatible zone to move the selected item there."
    : "Click a highlighted zone to place the selected equipment.";

  return (
    <div className="app-shell">
      <aside className="control-panel">
        <div className="panel-section hero">
          <p className="eyebrow">Food Truck Builder</p>
          <h1>Lay out a compact kitchen in 3D.</h1>
          <p className="hero-copy">
            Adjust the truck shell, drag equipment into the right zone, and review a
            snap-to-fit interior layout in real time.
          </p>
        </div>

        <section className="panel-section">
          <div className="section-heading">
            <h2>Truck Size</h2>
            <span>meters</span>
          </div>
          <div className="input-grid">
            {(["length", "width", "height"] as const).map((key) => (
              <label key={key}>
                <span>{key}</span>
                <input
                  type="number"
                  min={key === "height" ? 2.1 : 1.8}
                  max={key === "length" ? 12 : 4}
                  step={0.1}
                  value={dimensions[key]}
                  onChange={(event) => updateDimension(key, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <h2>Equipment</h2>
            <span>drag or click</span>
          </div>
          <div className="equipment-list">
            {equipmentCatalog.map((equipment) => (
              <button
                key={equipment.id}
                className={`equipment-card${
                  selectedEquipmentId === equipment.id ? " active" : ""
                }`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/equipment-id", equipment.id);
                  setSelectedEquipmentId(equipment.id);
                  setSelectedPlacedId(null);
                  setEditingPlacedId(null);
                }}
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
                  <p>
                    {equipment.size.length}m x {equipment.size.width}m
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <h2>Zones</h2>
            <span>drop targets</span>
          </div>
          <div className="zone-list">
            {zoneOrder.map((zoneId) => {
              const zone = zoneMap[zoneId];
              const count = zoneCounts[zoneId];
              const canPlaceNew =
                !!selectedEquipment &&
                selectedEquipment.allowedZones.includes(zoneId) &&
                (zoneId !== "refrigeration" || !isSoftServe(selectedEquipment.id)
                  ? count < zone.capacity
                  : count < zone.capacity ||
                    !!findStackParent(placed, equipmentMap, zoneId));
              const canMoveSelected =
                !!selectedPlaced &&
                selectedPlacedAllowedZones.includes(zoneId) &&
                (selectedPlaced.item.zoneId === zoneId || count < zone.capacity);
              const isActionable = canPlaceNew || canMoveSelected;

              return (
                <button
                  key={zoneId}
                  className={`zone-card${isActionable ? " can-accept" : ""}${
                    selectedPlaced?.item.zoneId === zoneId ? " is-selected" : ""
                  }`}
                  onDragOver={(event) => {
                    if (canPlaceNew) {
                      event.preventDefault();
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const equipmentId = event.dataTransfer.getData("text/equipment-id");
                    if (equipmentId) {
                      placeEquipment(equipmentId, zoneId);
                    }
                  }}
                  onClick={() => {
                    if (selectedPlaced) {
                      movePlacedToZone(selectedPlaced.item.id, zoneId);
                      return;
                    }

                    if (selectedEquipment) {
                      placeEquipment(selectedEquipment.id, zoneId);
                    }
                  }}
                >
                  <span className="zone-swatch" style={{ backgroundColor: zone.color }} />
                  <div>
                    <strong>{zone.name}</strong>
                    <p>
                      {count}/{zone.capacity} floor slots
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="helper-copy">
            {zoneActionHint} Refrigeration bay: 16' x 4.6' x 12' with 4 floor slots and
            optional soft-serve stacking on an undercounter unit.
          </p>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <h2>Placed Items</h2>
            <span>{placed.length} total</span>
          </div>
          <div className="placed-list">
            {placements.length === 0 ? (
              <p className="empty-state">
                Start by dragging a piece of equipment into a compatible zone.
              </p>
            ) : (
              placements.map(({ item, definition, zone }) => (
                <div
                  key={item.id}
                  className={`placed-card${selectedPlacedId === item.id ? " active" : ""}`}
                >
                  <div>
                    <strong>{definition.name}</strong>
                    <p>
                      {zone.name}
                      {item.parentId ? " | stacked" : ""}
                    </p>
                  </div>
                  <div className="placed-actions">
                    <button
                      onClick={() => {
                        setSelectedPlacedId(item.id);
                        setEditingPlacedId(item.id);
                      }}
                    >
                      Edit
                    </button>
                    <button className="danger-button" onClick={() => removePlaced(item.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {selectedPlaced ? (
          <section className="panel-section">
            <div className="section-heading">
              <h2>Edit Item</h2>
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
                  disabled={!!selectedPlaced.item.parentId}
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
                  value={selectedPlaced.item.zoneId}
                  onChange={(event) =>
                    movePlacedToZone(selectedPlaced.item.id, event.target.value as ZoneId)
                  }
                  disabled={!!selectedPlaced.item.parentId}
                >
                  {selectedPlacedAllowedZones.map((zoneId) => {
                    const zone = zoneMap[zoneId];
                    const count = zoneCounts[zoneId];
                    const disabled =
                      zoneId !== selectedPlaced.item.zoneId && count >= zone.capacity;

                    return (
                      <option key={zoneId} value={zoneId} disabled={disabled}>
                        {zone.name}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>
            <div className="move-actions">
              <button
                onClick={() => movePlacedBySlot(selectedPlaced.item.id, -1)}
                disabled={!!selectedPlaced.item.parentId}
              >
                Move Earlier
              </button>
              <button
                onClick={() => movePlacedBySlot(selectedPlaced.item.id, 1)}
                disabled={!!selectedPlaced.item.parentId}
              >
                Move Later
              </button>
            </div>
            <div className="move-actions">
              <button onClick={() => setSelectedPlacedId(null)}>Done</button>
              <button
                className="danger-button"
                onClick={() => removePlaced(selectedPlaced.item.id)}
              >
                Delete Item
              </button>
            </div>
          </section>
        ) : null}
      </aside>

      <main className="scene-shell">
        <div className="scene-header">
          <div>
            <p className="eyebrow">3D Layout</p>
            <h2>
              {dimensions.length.toFixed(1)}m x {dimensions.width.toFixed(1)}m x{" "}
              {dimensions.height.toFixed(1)}m
            </h2>
          </div>
          <p>{zoneActionHint}</p>
        </div>
        <Suspense fallback={<div className="scene-loading">Loading 3D workspace...</div>}>
          <BuilderScene
            dimensions={dimensions}
            zones={zones}
            placements={placements}
            selectedEquipment={selectedEquipment}
            selectedPlaced={selectedPlaced}
            selectedPlacedId={selectedPlacedId}
            isEditingSelected={isEditingSelected}
            editableEquipmentOptions={editableEquipmentOptions}
            viewportZoneOptions={viewportZoneOptions}
            onZoneSelect={placeEquipment}
            onPlacedSelect={(id) => {
              setSelectedPlacedId(id);
              if (id === null) {
                setEditingPlacedId(null);
              }
            }}
            onMoveEarlier={(id) => movePlacedBySlot(id, -1)}
            onMoveLater={(id) => movePlacedBySlot(id, 1)}
            onDeletePlaced={removePlaced}
            onToggleViewportEdit={(id) =>
              setEditingPlacedId((current) => (current === id ? null : id))
            }
            onModelMetricsChange={(id, metric) =>
              setModelMetrics((current) =>
                current[id] &&
                current[id].width === metric.width &&
                current[id].height === metric.height &&
                current[id].length === metric.length
                  ? current
                  : { ...current, [id]: metric }
              )
            }
            onViewportEquipmentChange={updatePlacedDefinition}
            onViewportZoneChange={movePlacedToZone}
          />
        </Suspense>
      </main>
    </div>
  );
}

export default App;
export type {
  Dimensions,
  EquipmentDefinition,
  ModelMetric,
  PlacementView,
  PlacedEquipment,
  ViewportZoneOption,
  Zone,
  ZoneId
};
