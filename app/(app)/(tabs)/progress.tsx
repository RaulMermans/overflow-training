import { Box, Screen, Text } from '../../../src/components/ui'
import { ENABLE_PROGRESS_V2 } from '../../../src/config/featureFlags'
import ProgressScreenV2 from '../../../src/features/progress-v2/ProgressScreenV2'
import { useI18n } from '../../../src/i18n/useI18n'

/**
 * Progress tab router.
 *
 * When ENABLE_PROGRESS_V2 = true  → renders the analytics-backed Progress v2.
 * When ENABLE_PROGRESS_V2 = false → renders a safe placeholder (OTA kill-switch).
 *
 * Rollback: flip the flag to false and push an OTA update via expo-updates.
 * See: docs/progress_v2_release_checklist.md § Rollback
 */
export default function ProgressTab() {
  const { t } = useI18n()

  if (ENABLE_PROGRESS_V2) {
    return <ProgressScreenV2 />
  }

  return (
    <Screen scroll={false} horizontalPadding="none" bottomPadding="none">
      <Box flex={1} justifyContent="center" alignItems="center">
        <Text variant="body" color="textMuted">
          {t('progress.v2.comingSoon')}
        </Text>
      </Box>
    </Screen>
  )
}
