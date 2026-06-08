export type EquipmentDefinition = {
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
  price?: string;
  imageUrl?: string;
  sku?: string;
  model3d?: {
    src: string;
    scale: number;
    yOffset?: number;
    rotationY?: number;
  };
};

export type ZoneId = "equipment-drop" | "serving-drop";

export type Zone = {
  id: ZoneId;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  lineY: number;
  capacity: number;
};

export type PlacedEquipment = {
  id: string;
  definitionId: string;
  zoneId: ZoneId;
  manualPlacement?: {
    x: number;
    y: number;
    z: number;
    rotationY: number;
  };
  manualScale?: number;
};

export type PlacementView = {
  item: PlacedEquipment;
  definition: EquipmentDefinition;
  zone: Zone;
  placement: { x: number; y: number; z: number; rotationY: number; scale: number };
};

export type DropPlacement = {
  x: number;
  y: number;
  z: number;
  rotationY: number;
};

export type ModelCatalogEntry = {
  "glb name": string;
  "menu type": string;
  level: number;
  side: string;
};

export type EquipmentMenuGroup = {
  id: string;
  label: string;
  side: string;
  items: EquipmentDefinition[];
};

export type ConfiguratorStepId =
  | "size"
  | "size-specs"
  | "equipment-side"
  | "serving-side"
  | "addons-utility"
  | "trailer-customization";

export type TrailerSize = {
  id: "size-16" | "size-30";
  label: string;
  description: string;
  accent: string;
  accentSoft: string;
  stageModels: Partial<Record<ConfiguratorStepId, string>>;
  dropZoneModels?: Partial<Record<ConfiguratorStepId, string>>;
};
