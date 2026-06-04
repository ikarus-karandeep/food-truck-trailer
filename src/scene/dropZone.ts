import { Vector3 } from "three";
import type { EquipmentDefinition, PlacementView, Zone } from "../types";
import type { MeasuredFootprint } from "./types";

export function getZoneCenterlineEndpoints(zone: Zone) {
  const lineY = zone.lineY;

  if (zone.length >= zone.width) {
    return [
      new Vector3(zone.x, lineY, zone.z - zone.length / 2),
      new Vector3(zone.x, lineY, zone.z + zone.length / 2)
    ] as const;
  }

  return [
    new Vector3(zone.x - zone.width / 2, lineY, zone.z),
    new Vector3(zone.x + zone.width / 2, lineY, zone.z)
  ] as const;
}

export function getZoneAxisInfo(zone: Zone) {
  const horizontal = zone.length >= zone.width;

  return {
    horizontal,
    min: horizontal ? zone.z - zone.length / 2 : zone.x - zone.width / 2,
    max: horizontal ? zone.z + zone.length / 2 : zone.x + zone.width / 2
  };
}

export function getEquipmentAxisSize(
  definition: EquipmentDefinition,
  measuredId: string,
  zone: Zone,
  measuredFootprints: Record<string, MeasuredFootprint>
) {
  const measured = measuredFootprints[measuredId];

  if (measured) {
    return zone.length >= zone.width ? measured.length : measured.width;
  }

  return zone.length >= zone.width ? definition.size.length : definition.size.width;
}

export function snapPointToZoneCenterline(zone: Zone, point: Vector3) {
  if (zone.length >= zone.width) {
    return {
      x: zone.x,
      z: Math.min(zone.z + zone.length / 2, Math.max(zone.z - zone.length / 2, point.z))
    };
  }

  return {
    x: Math.min(zone.x + zone.width / 2, Math.max(zone.x - zone.width / 2, point.x)),
    z: zone.z
  };
}

export function resolveNonIntersectingPlacement(
  zone: Zone,
  definition: EquipmentDefinition,
  measuredId: string,
  point: Vector3,
  placements: PlacementView[],
  measuredFootprints: Record<string, MeasuredFootprint>
) {
  const axis = getZoneAxisInfo(zone);
  const itemHalf = getEquipmentAxisSize(definition, measuredId, zone, measuredFootprints) / 2;
  const candidate = axis.horizontal ? point.z : point.x;
  const gap = 0;
  const occupied = placements
    .filter(({ item }) => item.zoneId === zone.id)
    .map(({ item, definition: placedDefinition, placement }) => {
      const placedHalf = getEquipmentAxisSize(
        placedDefinition,
        item.id,
        zone,
        measuredFootprints
      ) / 2;
      const center = axis.horizontal ? placement.z : placement.x;

      return {
        start: center - placedHalf - gap,
        end: center + placedHalf + gap
      };
    })
    .sort((a, b) => a.start - b.start);

  const freeSegments: Array<{ start: number; end: number }> = [];
  let cursor = axis.min;

  for (const interval of occupied) {
    if (interval.start > cursor) {
      freeSegments.push({ start: cursor, end: interval.start });
    }

    cursor = Math.max(cursor, interval.end);
  }

  if (cursor < axis.max) {
    freeSegments.push({ start: cursor, end: axis.max });
  }

  const nearestFit =
    freeSegments
      .map((segment) => {
        const minCenter = segment.start + itemHalf;
        const maxCenter = segment.end - itemHalf;

        if (minCenter > maxCenter) {
          return null;
        }

        const center = Math.min(maxCenter, Math.max(minCenter, candidate));
        return { center, distance: Math.abs(center - candidate) };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => a.distance - b.distance)[0] ?? null;

  if (!nearestFit) {
    return null;
  }

  return axis.horizontal
    ? {
        x: zone.x,
        y: zone.lineY,
        z: nearestFit.center,
        rotationY: 0
      }
    : {
        x: nearestFit.center,
        y: zone.lineY,
        z: zone.z,
        rotationY: 0
      };
}
