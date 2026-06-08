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
    return { length: 0.45, width: 0.45, height: 0.5 };
  }

  return { length: 0.65, width: 0.65, height: 0.9 };
}

import equipmentDataRaw from "../models/equipment.json";

function getEquipmentMatch(glbName: string) {
  const normalizedGlb = glbName.toLowerCase().replace(/\.glb$/i, "").replace(/[-_]+/g, " ");
  // Extract numbers (like 24, 36) to ensure size matching
  const numbers = normalizedGlb.match(/\d+/g) || [];
  
  let bestMatch = null;
  let bestScore = -1;

  for (const eq of equipmentDataRaw as any[]) {
    const eqName = eq.name.toLowerCase();
    const eqCat = (eq.subcategory || "").toLowerCase();
    const eqSku = (eq.sku || "").toLowerCase();
    const eqText = `${eqName} ${eqSku} ${eqCat}`;
    
    // Check if the primary size number matches (first number in glb name)
    const primarySize = numbers[0];
    const secondarySize = numbers.length > 1 ? numbers[1] : null;

    if (primarySize && !eqText.includes(primarySize)) {
      continue;
    }

    // Calculate text overlap score
    const glbWords = normalizedGlb.split(" ").filter(w => isNaN(Number(w)) && w.length > 1);
    let score = 0;

    if (secondarySize && eqText.includes(secondarySize)) {
      score += 5;
    }

    for (const w of glbWords) {
      if (eqName.includes(w)) score += 3;
      if (eqCat.includes(w)) score += 2;
      if (eqSku.includes(w)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = eq;
    }
  }

  // If score is 0 and there are word characters, it's a poor match, but we'll accept best efforts.
  return bestMatch;
}

export const equipmentCatalog: EquipmentDefinition[] = (modelCatalogData as ModelCatalogEntry[])
  .filter((entry) => entry.side === "equipment" || entry.side === "serving")
  .flatMap((entry) => {
    const src = glbAssetMap[entry["glb name"]];

    if (!src) {
      return [];
    }

    const eqMatch = getEquipmentMatch(entry["glb name"]);
    const mappedName = eqMatch ? eqMatch.name : formatModelLabel(entry["glb name"]);
    const price = eqMatch ? eqMatch.price : "";
    const imageUrl = eqMatch ? (eqMatch.builder_image_url && eqMatch.builder_image_url !== "False" ? eqMatch.builder_image_url : eqMatch.image_url) : "";
    const sku = eqMatch ? eqMatch.sku : "";

    return [
      {
        id: slugify(entry["glb name"]),
        name: mappedName,
        menuType: entry["menu type"],
        side: entry.side,
        level: entry.level,
        size: getDefaultEquipmentSize(entry.level),
        color: getMenuAccent(entry["menu type"]),
        price,
        imageUrl,
        sku,
        model3d: {
          src,
          scale: 1,
          yOffset: 0
        }
      }
    ];
  });


const generatedMenuGroups: EquipmentMenuGroup[] = Array.from(
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

const servingSideMenuGroups: EquipmentMenuGroup[] = [
  {
    id: "serving-beverage-small-appliances",
    label: "Beverage & Small Appliances",
    side: "serving",
    items: equipmentCatalog
      .filter((equipment) => equipment.menuType === "Small Appliances")
      .sort((a, b) => a.name.localeCompare(b.name))
  },
  {
    id: "serving-1-compartment-sinks",
    label: "1-Compartment Sinks",
    side: "serving",
    items: equipmentCatalog
      .filter((equipment) => equipment.menuType === "One-Sinks")
      .sort((a, b) => a.name.localeCompare(b.name))
  },
  {
    id: "serving-3-compartment-sinks",
    label: "3-Compartment Sinks",
    side: "serving",
    items: equipmentCatalog
      .filter((equipment) => equipment.menuType === "Three-Sinks")
      .sort((a, b) => a.name.localeCompare(b.name))
  }
];

export const equipmentMenuGroups: EquipmentMenuGroup[] = [
  ...generatedMenuGroups.filter((group) => group.side !== "serving"),
  ...servingSideMenuGroups
];
