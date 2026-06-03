import { Suspense, lazy, useMemo, useState, type CSSProperties } from "react";
import modelCatalogData from "../models/models.json";
import { Box3, Vector3 } from "three";

type Dimensions = {
  length: number;
  width: number;
  height: number;
};

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
  dimensions: Dimensions;
  stageModels: Partial<Record<ConfiguratorStepId, string>>;
};

const FLOOR_Y = 0.08;
const COLLISION_PADDING = 0;

const FEET_TO_METERS = 0.3048;
const REFRIGERATION_ZONE_LENGTH = 16 * FEET_TO_METERS;
const REFRIGERATION_ZONE_WIDTH = 4.6 * FEET_TO_METERS;
const REFRIGERATION_ZONE_HEIGHT = 12 * FEET_TO_METERS;

const CONFIGURABLE_ZONE_IDS: ZoneId[] = [
  "customer-window",
  "cooking",
  "prep",
  "washing",
  "refrigeration",
  "entry"
];

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
        allowedZones: CONFIGURABLE_ZONE_IDS,
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

const zoneOrder: ZoneId[] = [
  "customer-window",
  "cooking",
  "prep",
  "washing",
  "refrigeration",
  "walkway",
  "entry"
];

const trailerSizes: TrailerSize[] = [
  {
    id: "size-16",
    label: "16ft",
    description: "Compact trailer footprint for lean service builds and tighter parking spaces.",
    accent: "#dfeafe",
    accentSoft: "rgba(0, 83, 208, 0.08)",
    dimensions: { length: 4.88, width: 2.5, height: 2.9 },
    stageModels: {
      size: new URL("../models/base/16-base.glb", import.meta.url).href,
      "equipment-side": new URL("../models/base/16-equipment.glb", import.meta.url).href,
      "serving-side": new URL("../models/base/16-serving.glb", import.meta.url).href
    }
  },
  {
    id: "size-30",
    label: "30ft",
    description: "Expanded trailer footprint for larger kitchen layouts and higher equipment density.",
    accent: "#f8ddd4",
    accentSoft: "rgba(218, 99, 75, 0.1)",
    dimensions: { length: 9.1, width: 2.5, height: 3.0 },
    stageModels: {
      size: new URL("../models/base/30-hot.glb", import.meta.url).href,
      "equipment-side": new URL("../models/base/30-hot.glb", import.meta.url).href,
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
  const [selectedStepId, setSelectedStepId] = useState<ConfiguratorStepId>("size");
  const [selectedTrailerSizeId, setSelectedTrailerSizeId] =
    useState<TrailerSize["id"]>("size-16");
  const [dimensions, setDimensions] = useState<Dimensions>(trailerSizes[0].dimensions);
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

  const selectedTrailerSize = useMemo(
    () =>
      trailerSizes.find((trailerSize) => trailerSize.id === selectedTrailerSizeId) ??
      trailerSizes[0],
    [selectedTrailerSizeId]
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

  const activeStageModelSrc = useMemo(
    () =>
      selectedTrailerSize.stageModels[selectedStepId] ??
      selectedTrailerSize.stageModels.size ??
      null,
    [selectedStepId, selectedTrailerSize]
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
          description: "Browse equipment menus generated from your model catalog.",
          info: `Showing ${equipmentCatalog.length} models across ${equipmentSideMenus.length} equipment menus.`
        };
      case "serving-side":
        return {
          title: "Serving Side",
          description: "Serving-side menus have not been added to models.json yet.",
          info: "Add serving-side entries to the catalog and they can be rendered here the same way."
        };
      case "addons-utility":
        return {
          title: "Add-ons & Utility",
          description: "This step is ready for utility-specific menu groups when you add them.",
          info: "Use models.json as the source of truth for future add-on categories."
        };
      case "trailer-customization":
        return {
          title: "Trailer Customization",
          description: "Customization options can be driven from the same catalog structure later.",
          info: "The 3D stage remains linked to the current trailer size while the catalog expands."
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
    setDimensions(trailerSize.dimensions);
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
              dimensions={dimensions}
              placements={placements}
              selectedPlaced={selectedPlaced}
              selectedPlacedId={selectedPlacedId}
              isEditingSelected={isEditingSelected}
              editableEquipmentOptions={editableEquipmentOptions}
              viewportZoneOptions={viewportZoneOptions}
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
                      <span className="more-link">
                        {trailerSize.dimensions.length.toFixed(2)}m length
                      </span>
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

          {selectedStepId !== "size" && selectedStepId !== "equipment-side" ? (
            <section className="control-section">
              <div className="section-heading">
                <h3>Catalog Status</h3>
                <span>{selectedStepId}</span>
              </div>
              <p className="empty-state">
                No menu groups are currently defined for this step in <code>models/models.json</code>.
              </p>
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
                          <p>
                            {zone.name}
                            {item.parentId ? " | stacked" : ""}
                          </p>
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
                      type="button"
                      onClick={() => movePlacedBySlot(selectedPlaced.item.id, -1)}
                      disabled={!!selectedPlaced.item.parentId}
                    >
                      Move Earlier
                    </button>
                    <button
                      type="button"
                      onClick={() => movePlacedBySlot(selectedPlaced.item.id, 1)}
                      disabled={!!selectedPlaced.item.parentId}
                    >
                      Move Later
                    </button>
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
  Dimensions,
  EquipmentDefinition,
  ModelMetric,
  PlacementView,
  PlacedEquipment,
  ViewportZoneOption,
  Zone,
  ZoneId
};
