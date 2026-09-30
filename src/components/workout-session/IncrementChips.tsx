import type { UnitsPreference } from '../../lib/profilePreferences'
import { Box } from '../ui/Box'
import { Chip } from '../ui/Chip'
import { getWeightDecrementLabel, getWeightIncrementLabel } from './setEntry'

interface IncrementChipsProps {
  units: UnitsPreference
  disabled: boolean
  canCopyLast: boolean
  showWeightIncrement?: boolean
  showCopyLast?: boolean
  onDecrementRep: () => void
  onDecrementWeight: () => void
  onIncrementRep: () => void
  onIncrementWeight: () => void
  onCopyLast: () => void
}

export function IncrementChips({
  units,
  disabled,
  canCopyLast,
  showWeightIncrement = true,
  showCopyLast = true,
  onDecrementRep,
  onDecrementWeight,
  onIncrementRep,
  onIncrementWeight,
  onCopyLast,
}: IncrementChipsProps) {
  return (
    <Box marginTop="sm" flexDirection="row" flexWrap="wrap" gap="sm">
      <Chip label="-1 rep" variant="neutral" onPress={onDecrementRep} disabled={disabled} />
      <Chip label="+1 rep" variant="accent" onPress={onIncrementRep} disabled={disabled} />
      {showWeightIncrement ? (
        <>
          <Chip
            label={getWeightDecrementLabel(units)}
            variant="neutral"
            onPress={onDecrementWeight}
            disabled={disabled}
          />
          <Chip
            label={getWeightIncrementLabel(units)}
            variant="accent"
            onPress={onIncrementWeight}
            disabled={disabled}
          />
        </>
      ) : null}
      {showCopyLast ? (
        <Chip
          label="Copy last"
          variant="neutral"
          onPress={onCopyLast}
          disabled={disabled || !canCopyLast}
        />
      ) : null}
    </Box>
  )
}
