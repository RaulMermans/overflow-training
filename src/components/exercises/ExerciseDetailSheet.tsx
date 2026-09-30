import { useMemo } from 'react'
import { Image, Modal, StyleSheet, View } from 'react-native'
import { Box, Button, Card, Chip, Text } from '../ui'
import { useI18n } from '../../i18n/useI18n'
import type { TranslationKey } from '../../i18n'
import { resolveExerciseMetadata } from '../../exercises/metadata'
import { colors, radius, spacing } from '../../theme'

interface ExerciseDetailLike {
  name: string
  slug?: string | null
  muscle_group?: string | null
  equipment?: string | null
}

interface ExerciseDetailSheetProps {
  visible: boolean
  onClose: () => void
  exercise: ExerciseDetailLike | null
}

export function ExerciseDetailSheet({ visible, onClose, exercise }: ExerciseDetailSheetProps) {
  const { t } = useI18n()
  const translateWithFallback = (key: string, fallback: string): string => {
    const translated = t(key as TranslationKey)
    return translated === key ? fallback : translated
  }

  const metadata = useMemo(() => {
    if (!exercise) return null
    return resolveExerciseMetadata({
      slug: exercise.slug,
      muscleGroup: exercise.muscle_group,
      equipment: exercise.equipment,
    })
  }, [exercise])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            <Text variant="h3">{exercise?.name ?? t('detail.exercise')}</Text>
            <Button title={t('common.close')} variant="ghost" onPress={onClose} />
          </Box>

          <Card marginTop="md" padding="md">
            <Text variant="labelSm" color="textMuted">
              {t('exerciseDetail.muscles')}
            </Text>
            <Box marginTop="sm" flexDirection="row" flexWrap="wrap" gap="sm">
              {(metadata?.muscles ?? ['fullBody']).map((muscle) => (
                <Chip
                  key={`muscle-${muscle}`}
                  label={translateWithFallback(`exerciseDetail.muscle.${muscle}`, muscle)}
                  variant="neutral"
                />
              ))}
            </Box>

            {metadata?.equipment ? (
              <Box marginTop="md">
                <Text variant="labelSm" color="textMuted">
                  {t('exerciseDetail.equipment')}
                </Text>
                <Text marginTop="xs" variant="bodySm" color="textSecondary">
                  {translateWithFallback(
                    `exerciseDetail.equipmentValue.${metadata.equipment.toLowerCase()}`,
                    metadata.equipment,
                  )}
                </Text>
              </Box>
            ) : null}
          </Card>

          <Card marginTop="md" padding="md">
            <Text variant="labelSm" color="textMuted">
              {t('exerciseDetail.cues')}
            </Text>
            <Box marginTop="sm" gap="xs">
              {(metadata?.cues ?? []).map((cue) => (
                <Text key={`cue-${cue}`} variant="bodySm" color="textSecondary">
                  {`• ${translateWithFallback(`exerciseDetail.cue.${cue}`, cue)}`}
                </Text>
              ))}
            </Box>
          </Card>

          {metadata?.demoAsset ? (
            <Card marginTop="md" padding="none" overflow="hidden">
              <Image
                source={metadata.demoAsset}
                resizeMode="cover"
                accessibilityLabel={t('exerciseDetail.demo')}
                style={styles.demoImage}
              />
            </Card>
          ) : null}

          <Box marginTop="md">
            <Button title={t('exerciseDetail.close')} onPress={onClose} variant="secondary" />
          </Box>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg.secondary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing[4],
    maxHeight: '85%',
  },
  demoImage: {
    width: '100%',
    height: 190,
  },
})
