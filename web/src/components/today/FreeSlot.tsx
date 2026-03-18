import React from 'react';
import { formatDuration } from '../../lib/timeline';
import type { ChipCandidate } from '../../lib/timeline';

interface FreeSlotProps {
  durationMinutes: number;
  chips: ChipCandidate[];
  onChipTap: (item: ChipCandidate) => void;
}

export function FreeSlot({ durationMinutes, chips, onChipTap }: FreeSlotProps) {
  return (
    <div className="py-4 flex flex-col items-center gap-2">
      <span className="text-sm text-gray-400">
        空き {formatDuration(durationMinutes)}
      </span>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {chips.map(chip => (
            <button
              key={chip.id}
              className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 active:bg-gray-300 transition-colors"
              onClick={() => onChipTap(chip)}
            >
              {chip.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
