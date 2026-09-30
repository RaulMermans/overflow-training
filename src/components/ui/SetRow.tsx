import { useEffect, useRef } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@shopify/restyle'
import { colors, motion } from '../../theme'
import { hapticLight } from '../../lib/feedback'
import { shouldAnimate, useReducedMotion } from '../../lib/motion'
import type { UnitsPreference } from '../../lib/profilePreferences'
import type { Theme } from '../../theme/restyleTheme'
import { Box } from './Box'
import { Button } from './Button'
import { Input } from './Input'
import { Pressable } from './Pressable'
import { Text } from './Text'

interface SetDraft {
  reps: string
  weight: string
}

interface DisplaySetRowProps {
  variant?: 'display'
  index: number
  reps: number
  weight: number
  onEdit: () => void
  onDelete: () => void
  disabled?: boolean
  deleting?: boolean
  didComplete?: boolean
}

interface EntrySetRowProps {
  variant: 'entry'
  draft: SetDraft
  onDraftChange: (field: 'reps' | 'weight', value: string) => void
  onAddSet: () => void
  canAdd: boolean
  adding?: boolean
  disabled?: boolean
  units: UnitsPreference
}

type SetRowProps = DisplaySetRowProps | EntrySetRowProps

export function SetRow(props: SetRowProps) {
  const theme = useTheme<Theme>()
  const reducedMotion = useReducedMotion()
  const scale = useRef(new Animated.Value(1)).current
  const flashOpacity = useRef(new Animated.Value(0)).current
  const checkOpacity = useRef(new Animated.Value(0)).current
  const prevDidComplete = useRef(false)

  const didComplete = props.variant === 'entry' ? false : Boolean(props.didComplete)

  useEffect(() => {
    if (!shouldAnimate(reducedMotion)) {
      prevDidComplete.current = didComplete
      scale.setValue(1)
      flashOpacity.setValue(0)
      checkOpacity.setValue(didComplete ? 1 : 0)
      return
    }

    if (didComplete && !prevDidComplete.current) {
      hapticLight(reducedMotion ?? false)

      // Enhanced scale pulse: 0.97 → 1.04 → 1.0
      scale.setValue(0.97)
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.04,
          duration: motion.duration.setPulse,
          easing: motion.easing.easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: motion.duration.setPulse,
          easing: motion.easing.easeOut,
          useNativeDriver: true,
        }),
      ]).start()

      // Background flash: animate opacity 0.15 → 0 on a solid-color View so we
      // can use the native driver (backgroundColor interpolation cannot use it).
      flashOpacity.setValue(0.15)
      Animated.timing(flashOpacity, {
        toValue: 0,
        duration: motion.duration.slower,
        easing: motion.easing.easeOut,
        useNativeDriver: true,
      }).start()

      // Check icon fade-in
      checkOpacity.setValue(0)
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: motion.duration.fast,
        easing: motion.easing.easeOut,
        useNativeDriver: true,
      }).start()
    }

    if (!didComplete && prevDidComplete.current) {
      // Fade out check icon when didComplete clears
      Animated.timing(checkOpacity, {
        toValue: 0,
        duration: motion.duration.fast,
        easing: motion.easing.easeOut,
        useNativeDriver: true,
      }).start()
    }

    prevDidComplete.current = didComplete
  }, [didComplete, reducedMotion, scale, flashOpacity, checkOpacity])

  if (props.variant === 'entry') {
    const { draft, onDraftChange, onAddSet, canAdd, adding, disabled, units } = props

    return (
      <Box borderBottomWidth={1} borderBottomColor="borderSubtle" paddingVertical="sm">
        <Box flexDirection="row" alignItems="center">
          <Box width={40} alignItems="center">
            <Text variant="micro" color="textMuted">
              NEW
            </Text>
          </Box>
          <Box flex={1}>
            <Input
              placeholder="Reps"
              keyboardType="number-pad"
              value={draft.reps}
              onChangeText={(value) => onDraftChange('reps', value)}
              editable={!disabled && !adding}
            />
          </Box>
          <Box flex={1} marginLeft="sm">
            <Input
              placeholder={`Weight (${units})`}
              keyboardType="decimal-pad"
              value={draft.weight}
              onChangeText={(value) => onDraftChange('weight', value)}
              editable={!disabled && !adding}
            />
          </Box>
          <Box width={88} marginLeft="sm">
            <Button
              testID="workoutSession:addSetButton"
              title={adding ? 'Adding…' : 'Add'}
              variant="ghost"
              onPress={onAddSet}
              loading={adding}
              disabled={disabled || adding || !canAdd}
            />
          </Box>
        </Box>
      </Box>
    )
  }

  const { index, reps, weight, onEdit, onDelete, disabled, deleting } = props

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Animated.View style={[styles.flashOverlay, { opacity: flashOpacity }]} />
      <Box
        borderBottomWidth={1}
        borderBottomColor="borderSubtle"
        paddingVertical="sm"
        flexDirection="row"
        alignItems="center"
        minHeight={44}
      >
        <Box width={40} alignItems="center" flexDirection="row" justifyContent="center">
          <Animated.View style={{ opacity: checkOpacity, marginRight: 2 }}>
            <Ionicons name="checkmark-circle" size={14} color={colors.semantic.success} />
          </Animated.View>
          <Text variant="tabular" color="textMuted">
            {index}
          </Text>
        </Box>
        <Box flex={1} alignItems="center">
          <Text variant="tabular">{reps}</Text>
        </Box>
        <Box flex={1} alignItems="center">
          <Text variant="tabular">{weight}</Text>
        </Box>
        <Box flexDirection="row" alignItems="center" marginLeft="sm">
          <Pressable onPress={onEdit} disabled={disabled} accessibilityRole="button" hitSlop={8}>
            {({ pressed }) => (
              <Box minWidth={44} minHeight={44} alignItems="flex-start" justifyContent="center">
                <Text variant="labelSm" color="accent" opacity={pressed || disabled ? 0.6 : 1}>
                  Edit
                </Text>
              </Box>
            )}
          </Pressable>
          <Box width={12} />
          <Pressable onPress={onDelete} disabled={disabled} accessibilityRole="button" hitSlop={8}>
            {({ pressed }) => (
              <Box
                minWidth={44}
                minHeight={44}
                justifyContent="center"
                alignItems="flex-end"
                opacity={pressed || disabled ? 0.6 : 1}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={theme.colors.error} />
                ) : (
                  <Text variant="labelSm" color="error">
                    Delete
                  </Text>
                )}
              </Box>
            )}
          </Pressable>
        </Box>
      </Box>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.semantic.success,
    borderRadius: 4,
  },
})
