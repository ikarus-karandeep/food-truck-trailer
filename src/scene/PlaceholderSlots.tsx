import { useMemo } from "react";
import type { PlacementView, Zone } from "../types";
import type { MeasuredFootprint } from "./types";
import { PLACEHOLDER_HEIGHT } from "./types";
import { getZoneAxisInfo, getEquipmentAxisSize } from "./dropZone";

/** Minimum gap size worth showing a placeholder */
const MIN_GAP = 0.05;

type PlaceholderSlotsProps = {
  zones: Zone[];
  placements: PlacementView[];
  measuredFootprints: Record<string, MeasuredFootprint>;
};

type SlotRect = {
  key: string;
  position: [number, number, number];
  size: [number, number, number];
};

function computeFreeSegments(
  zone: Zone,
  placements: PlacementView[],
  measuredFootprints: Record<string, MeasuredFootprint>
): Array<{ start: number; end: number }> {
  const axis = getZoneAxisInfo(zone);

  // Collect occupied intervals from all ground-tier placements (level 0 + 1).
  // Level 2 items are stacked above them, so they should not reduce floor slots.
  const occupied = placements
    .filter(
      ({ item, definition }) =>
        item.zoneId === zone.id && (definition.level === 0 || definition.level === 1)
    )
    .map(({ item, definition, placement }) => {
      const halfSize =
        getEquipmentAxisSize(definition, item.id, zone, measuredFootprints) / 2;
      const center = axis.horizontal ? placement.z : placement.x;
      return { start: center - halfSize, end: center + halfSize };
    })
    .sort((a, b) => a.start - b.start);

  const free: Array<{ start: number; end: number }> = [];
  let cursor = axis.min;

  for (const interval of occupied) {
    if (interval.start > cursor + MIN_GAP) {
      free.push({ start: cursor, end: interval.start });
    }
    cursor = Math.max(cursor, interval.end);
  }

  if (cursor < axis.max - MIN_GAP) {
    free.push({ start: cursor, end: axis.max });
  }

  return free;
}

function segmentsToSlots(
  zone: Zone,
  freeSegments: Array<{ start: number; end: number }>
): SlotRect[] {
  const slots: SlotRect[] = [];
  const axis = getZoneAxisInfo(zone);
  const crossAxisSize = axis.horizontal ? zone.width : zone.length;

  for (let idx = 0; idx < freeSegments.length; idx++) {
    const seg = freeSegments[idx];
    const segLength = seg.end - seg.start;
    const center = (seg.start + seg.end) / 2;

    const position: [number, number, number] = axis.horizontal
      ? [zone.x, zone.lineY + PLACEHOLDER_HEIGHT / 2, center]
      : [center, zone.lineY + PLACEHOLDER_HEIGHT / 2, zone.z];

    const size: [number, number, number] = axis.horizontal
      ? [crossAxisSize, PLACEHOLDER_HEIGHT, segLength]
      : [segLength, PLACEHOLDER_HEIGHT, crossAxisSize];

    slots.push({
      key: `${zone.id}-seg-${idx}`,
      position,
      size
    });
  }

  return slots;
}

function PlaceholderBox({
  position,
  size
}: {
  position: [number, number, number];
  size: [number, number, number];
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#5a6268" metalness={1} roughness={0.6} />
    </mesh>
  );
}

export default function PlaceholderSlots({
  zones,
  placements,
  measuredFootprints
}: PlaceholderSlotsProps) {
  const slots = useMemo(() => {
    const result: SlotRect[] = [];

    for (const zone of zones) {
      const freeSegs = computeFreeSegments(zone, placements, measuredFootprints);
      result.push(...segmentsToSlots(zone, freeSegs));
    }

    return result;
  }, [zones, placements, measuredFootprints]);

  if (slots.length === 0) {
    return null;
  }

  return (
    <group>
      {slots.map((slot) => (
        <PlaceholderBox key={slot.key} position={slot.position} size={slot.size} />
      ))}
    </group>
  );
}
