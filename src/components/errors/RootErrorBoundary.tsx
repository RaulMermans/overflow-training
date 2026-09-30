import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { captureException } from '../../lib/observability/crash'
import { useI18n } from '../../i18n/useI18n'
import { colors } from '../../theme'
import { sanitizeErrorMessage } from '../../utils/errorMessages'

interface RootErrorBoundaryProps {
  children: React.ReactNode
}

interface RootErrorBoundaryInnerProps {
  children: React.ReactNode
  renderFallback: (error: Error, reset: () => void) => React.ReactNode
}

interface RootErrorBoundaryInnerState {
  error: Error | null
}

class RootErrorBoundaryInner extends React.Component<
  RootErrorBoundaryInnerProps,
  RootErrorBoundaryInnerState
> {
  state: RootErrorBoundaryInnerState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryInnerState {
    return { error }
  }

  componentDidCatch(error: Error): void {
    captureException(error, { boundary: 'RootErrorBoundary' })
    const sanitizedMessage = sanitizeErrorMessage(error.message)
    const sanitizedStack = sanitizeErrorMessage(error.stack ?? 'no-stack')
    console.error('Unhandled root error:', sanitizedMessage, sanitizedStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return this.props.renderFallback(this.state.error, this.reset)
    }

    return this.props.children
  }
}

export function RootErrorBoundary({ children }: RootErrorBoundaryProps) {
  const { t } = useI18n()
  const router = useRouter()

  return (
    <RootErrorBoundaryInner
      renderFallback={(error, reset) => (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>{t('errors.boundary.title')}</Text>
            <Text style={styles.message}>{t('errors.boundary.message')}</Text>

            <View style={styles.actions}>
              <Pressable onPress={reset} style={styles.primaryAction} accessibilityRole="button">
                {({ pressed }) => (
                  <Text style={[styles.primaryActionText, pressed && styles.pressed]}>
                    {t('errors.boundary.tryAgain')}
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => router.replace('/')}
                style={styles.secondaryAction}
                accessibilityRole="button"
              >
                {({ pressed }) => (
                  <Text style={[styles.secondaryActionText, pressed && styles.pressed]}>
                    {t('errors.boundary.goHome')}
                  </Text>
                )}
              </Pressable>
            </View>

            {__DEV__ ? (
              <View style={styles.debugBox}>
                <Text style={styles.debugTitle}>{t('errors.boundary.debug')}</Text>
                <Text style={styles.debugText}>{sanitizeErrorMessage(error.message)}</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      )}
    >
      {children}
    </RootErrorBoundaryInner>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  actions: {
    marginTop: 8,
    gap: 10,
  },
  primaryAction: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 16,
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.inverse,
  },
  secondaryAction: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: 16,
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  debugBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 10,
    backgroundColor: colors.bg.secondary,
    padding: 12,
    gap: 6,
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
  },
  debugText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  pressed: {
    opacity: 0.8,
  },
})
