import { useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { useTheme } from '@shopify/restyle'
import { BottomCTA, Box, Button, Pressable, Screen, Text } from '../../components/ui'
import type { Theme } from '../../theme/restyleTheme'

interface OnboardingPrimaryAction {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
}

interface OnboardingSecondaryAction {
  label: string
  onPress: () => void
  disabled?: boolean
}

interface OnboardingScaffoldProps {
  children: ReactNode
  stepIndex: number
  stepCount: number
  stepLabel: string
  primaryAction: OnboardingPrimaryAction
  backAction?: OnboardingSecondaryAction | null
  skipAction?: OnboardingSecondaryAction | null
}

export function OnboardingScaffold({
  children,
  stepIndex,
  stepCount,
  stepLabel,
  primaryAction,
  backAction,
  skipAction,
}: OnboardingScaffoldProps) {
  const theme = useTheme<Theme>()
  const keyboardDismissMode = Platform.OS === 'ios' ? 'interactive' : 'on-drag'
  const [footerHeight, setFooterHeight] = useState<number>(theme.spacing['4xl'])

  return (
    <Screen
      scroll={false}
      horizontalPadding="none"
      bottomPadding="none"
      edges={['top']}
      backgroundColor="backgroundSecondary"
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Box flex={1}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: footerHeight }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={keyboardDismissMode}
            showsVerticalScrollIndicator={false}
          >
            <Box paddingHorizontal="xl" paddingTop="3xl" paddingBottom="4xl">
              <Text variant="stepLabel" style={{ textTransform: 'uppercase' }} marginBottom="sm">
                {stepLabel}
              </Text>
              <Box
                flexDirection="row"
                gap="xs"
                marginBottom="2xl"
                accessible
                accessibilityLabel={stepLabel}
              >
                {Array.from({ length: stepCount }, (_, i) => (
                  <Box
                    key={i}
                    width={i === stepIndex ? 16 : 6}
                    height={6}
                    borderRadius="full"
                    backgroundColor={i === stepIndex ? 'accentSecondary' : 'surfaceElevated'}
                  />
                ))}
              </Box>
              <Box gap="xl">{children}</Box>
            </Box>
          </ScrollView>

          <BottomCTA
            onLayout={(event) => {
              const nextHeight = Math.ceil(event.nativeEvent.layout.height)
              if (nextHeight !== footerHeight) {
                setFooterHeight(nextHeight)
              }
            }}
          >
            <Box flex={1} gap="sm">
              <Button
                title={primaryAction.label}
                variant="cta"
                onPress={primaryAction.onPress}
                disabled={primaryAction.disabled}
                loading={primaryAction.loading}
              />

              <Box flexDirection="row" alignItems="center">
                {backAction ? (
                  <Pressable
                    onPress={backAction.onPress}
                    disabled={backAction.disabled}
                    alignItems="center"
                    justifyContent="center"
                    minHeight={44}
                    flex={1}
                    accessibilityRole="button"
                    accessibilityLabel={backAction.label}
                  >
                    {({ pressed }) => (
                      <Text variant="labelSm" color="textMuted" opacity={pressed ? 0.8 : 1}>
                        {backAction.label}
                      </Text>
                    )}
                  </Pressable>
                ) : (
                  <Box flex={1} />
                )}

                {skipAction ? (
                  <Pressable
                    onPress={skipAction.onPress}
                    disabled={skipAction.disabled}
                    alignItems="center"
                    justifyContent="center"
                    minHeight={44}
                    flex={1}
                    accessibilityRole="button"
                    accessibilityLabel={skipAction.label}
                  >
                    {({ pressed }) => (
                      <Text variant="labelSm" color="textMuted" opacity={pressed ? 0.8 : 1}>
                        {skipAction.label}
                      </Text>
                    )}
                  </Pressable>
                ) : (
                  <Box flex={1} />
                )}
              </Box>
            </Box>
          </BottomCTA>
        </Box>
      </KeyboardAvoidingView>
    </Screen>
  )
}
