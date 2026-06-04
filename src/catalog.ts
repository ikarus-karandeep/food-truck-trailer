import modelCatalogData from "../models/models.json";
import type {
  EquipmentDefinition,
  EquipmentMenuGroup,
  ModelCatalogEntry
} from "./types";

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

export const equipmentCatalog: EquipmentDefinition[] = (modelCatalogData as ModelCatalogEntry[])
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

export const equipmentMenuGroups: EquipmentMenuGroup[] = Array.from(
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
