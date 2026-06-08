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
      "equipment-side": new URL("../models/base/16-equipment-drop-zone.glb", import.meta.url).href,
      "serving-side": new URL("../models/base/16-serving-drop-zone.glb", import.meta.url).href
    }
  },
  {
    id: "size-30",
    label: "30ft",
    description: "Expanded trailer footprint for larger kitchen layouts and higher equipment density.",
    accent: "#f8ddd4",
    accentSoft: "rgba(218, 99, 75, 0.1)",
    stageModels: {
      size: new URL("../models/base/30-base.glb", import.meta.url).href,
      "equipment-side": new URL("../models/base/30-equipment.glb", import.meta.url).href,
      "serving-side": new URL("../models/base/30-serving.glb", import.meta.url).href
    },
    dropZoneModels: {
      "equipment-side": new URL("../models/base/30-dropzone.glb", import.meta.url).href,
      "serving-side": new URL("../models/base/30-dropzone-serving.glb", import.meta.url).href,

    }
  }
];

export const configuratorSteps: Array<{ id: ConfiguratorStepId; label: string }> = [
  { id: "size", label: "Trailer Type" },
  { id: "size-specs", label: "Size & Specs" },
  { id: "equipment-side", label: "Equipment Side" },
  { id: "serving-side", label: "Serving Side" },
  { id: "addons-utility", label: "Add-ons & Utility" },
  { id: "trailer-customization", label: "Trailer Customization" }
];

export function buildZones(dropZoneBoundsMap?: Record<string, Partial<Zone>>): Zone[] {
  const servingLineY =
    dropZoneBoundsMap?.["serving-drop"]?.lineY ??
    dropZoneBoundsMap?.["serving-drop"]?.y ??
    0.535;

  const zones: Zone[] = [
    {
      id: "equipment-drop",
      name: "Equipment Drop Zone",
      color: "#ffcb74",
      x: dropZoneBoundsMap?.["equipment-drop"]?.x ?? 0,
      y: dropZoneBoundsMap?.["equipment-drop"]?.y ?? FLOOR_Y,
      z: dropZoneBoundsMap?.["equipment-drop"]?.z ?? 0,
      length: dropZoneBoundsMap?.["equipment-drop"]?.length ?? 2.2,
      width: dropZoneBoundsMap?.["equipment-drop"]?.width ?? 0.9,
      height: dropZoneBoundsMap?.["equipment-drop"]?.height ?? 2.5,
      lineY: dropZoneBoundsMap?.["equipment-drop"]?.lineY ?? FLOOR_Y,
      capacity: Number.POSITIVE_INFINITY
    },
    {
      id: "serving-drop" as ZoneId,
      name: "Serving Drop Zone",
      color: "#78d4c2",
      x: dropZoneBoundsMap?.["serving-drop"]?.x ?? -0.27,
      y: dropZoneBoundsMap?.["serving-drop"]?.y ?? 0.535,
      z: dropZoneBoundsMap?.["serving-drop"]?.z ?? -0.064,
      length: dropZoneBoundsMap?.["serving-drop"]?.length ?? 0.59,
      width: dropZoneBoundsMap?.["serving-drop"]?.width ?? 3.34,
      height: dropZoneBoundsMap?.["serving-drop"]?.height ?? 2.5,
      lineY: servingLineY,
      capacity: Number.POSITIVE_INFINITY
    }
  ];

  return zones;
}
