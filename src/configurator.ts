import type { ConfiguratorStepId, TrailerSize, Zone, ZoneId } from "./types";

export const FLOOR_Y = 0.08;

export const trailerSizes: TrailerSize[] = [
  {
    id: "size-16",
    label: "16ft",
    description: "Compact trailer footprint for lean service builds and tighter parking spaces.",
    accent: "#dfeafe",
    accentSoft: "rgba(0, 83, 208, 0.08)",
    stageModels: {
      size: new URL("../models/base/16-base.glb", import.meta.url).href,
      "equipment-side": new URL("../models/base/16-equipment.glb", import.meta.url).href,
      "serving-side": new URL("../models/base/16-serving.glb", import.meta.url).href
    },
    dropZoneModels: {
      "equipment-side": new URL("../models/base/16-equipment-drop-zone.glb", import.meta.url)
        .href
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

export const configuratorSteps: Array<{ id: ConfiguratorStepId; label: string }> = [
  { id: "size", label: "Size" },
  { id: "equipment-side", label: "equipment side" },
  { id: "serving-side", label: "serving side" },
  { id: "addons-utility", label: "Add-ons & utility" },
  { id: "trailer-customization", label: "trailer customization" }
];

export function buildZones(dropZoneBounds?: Partial<Zone>): Zone[] {
  const zones: Zone[] = [
    {
      id: "equipment-drop",
      name: "Equipment Drop Zone",
      color: "#ffcb74",
      x: dropZoneBounds?.x ?? 0,
      y: dropZoneBounds?.y ?? FLOOR_Y,
      z: dropZoneBounds?.z ?? 0,
      length: dropZoneBounds?.length ?? 2.2,
      width: dropZoneBounds?.width ?? 0.9,
      height: dropZoneBounds?.height ?? 2.5,
      lineY: dropZoneBounds?.lineY ?? FLOOR_Y,
      capacity: Number.POSITIVE_INFINITY
    },
    {
      id: "serving-drop" as ZoneId,
      name: "Serving Drop Zone",
      color: "#78d4c2",
      x: dropZoneBounds?.x ?? 1.8,
      y: dropZoneBounds?.y ?? FLOOR_Y,
      z: dropZoneBounds?.z ?? 0,
      length: dropZoneBounds?.length ?? 2.2,
      width: dropZoneBounds?.width ?? 0.9,
      height: dropZoneBounds?.height ?? 2.5,
      lineY: dropZoneBounds?.lineY ?? FLOOR_Y,
      capacity: Number.POSITIVE_INFINITY
    }
  ];

  return zones;
}
