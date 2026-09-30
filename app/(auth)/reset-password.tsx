import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { useAuth } from '../../src/auth/useAuth'
import { getInitialURLWithTimeout } from '../../src/auth/linkingTimeout'
import { parseResetParams } from '../../src/auth/resetPasswordLink'
import { Box, Button, Input, Pressable, Screen, Text } from '../../src/components/ui'
import { useI18n } from '../../src/i18n/useI18n'
import { colors } from '../../src/theme'
import { sanitizeErrorMessage } from '../../src/utils/errorMessages'

export default function ResetPasswordScreen() {
  const router = useRouter()
  const { exchangeCodeForSession, setSessionFromTokens, updatePassword } = useAuth()
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [linkLoading, setLinkLoading] = useState(true)
  const [error, setError] = useState('')
  const handledUrlRef = useRef<string | null>(null)

  const handleResetLink = useCallback(
    async (url: string | null) => {
      if (!url) {
        setError(t('auth.reset.openLink'))
        setLinkLoading(false)
        return
      }

      if (handledUrlRef.current === url) {
        setLinkLoading(false)
        return
      }

      handledUrlRef.current = url
      setError('')
      setLinkLoading(true)

      try {
        const { code, accessToken, refreshToken } = parseResetParams(url)

        if (code) {
          await exchangeCodeForSession(code)
          return
        }

        if (accessToken && refreshToken) {
          await setSessionFromTokens(accessToken, refreshToken)
          return
        }

        setError(t('auth.reset.invalidLink'))
      } catch (linkError: unknown) {
        setError(sanitizeErrorMessage(linkError))
      } finally {
        setLinkLoading(false)
      }
    },
    [exchangeCodeForSession, setSessionFromTokens, t],
  )

  useEffect(() => {
    const initialize = async () => {
      const initialUrl = await getInitialURLWithTimeout()
      await handleResetLink(initialUrl)
    }

    initialize()

    const subscription = Linking.addEventListener('url', (event) => {
      handleResetLink(event.url)
    })

    return () => {
      subscription.remove()
    }
  }, [handleResetLink])

  const handleSubmit = async () => {
    if (!password || !confirmPassword) {
      setError(t('auth.reset.errorMissing'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('auth.reset.errorMismatch'))
      return
    }

    setIsLoading(true)
    setError('')

    try {
      await updatePassword(password)
      router.replace('/')
    } catch (updateError: unknown) {
      setError(sanitizeErrorMessage(updateError))
    } finally {
      setIsLoading(false)
    }
  }

  const isSubmitting = isLoading || linkLoading

  return (
    <Screen scroll={false} horizontalPadding="none" bottomPadding="none" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <Box flex={1} justifyContent="center" paddingHorizontal="2xl">
          <Box alignItems="center" marginBottom="2xl">
            <Text variant="h1">{t('auth.reset.title')}</Text>
            <Text marginTop="sm" variant="body" color="textMuted" textAlign="center">
              {t('auth.reset.subtitle')}
            </Text>
          </Box>

          {linkLoading ? (
            <Box
              marginBottom="md"
              flexDirection="row"
              alignItems="center"
              justifyContent="center"
              gap="sm"
            >
              <ActivityIndicator color={colors.accent.primary} />
              <Text variant="bodySm" color="textMuted">
                {t('auth.reset.validating')}
              </Text>
            </Box>
          ) : null}

          {error ? (
            <Text marginBottom="md" variant="bodySm" color="error" textAlign="center">
              {error}
            </Text>
          ) : null}

          <Box marginBottom="md">
            <Input
              placeholder={t('auth.reset.newPassword')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!isSubmitting}
            />
          </Box>

          <Box marginBottom="lg">
            <Input
              placeholder={t('auth.reset.confirmPassword')}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!isSubmitting}
            />
          </Box>

          <Button
            title={t('auth.reset.submit')}
            onPress={handleSubmit}
            loading={isLoading}
            disabled={isSubmitting}
          />

          <Pressable
            onPress={() => router.replace('/(auth)/login')}
            disabled={isSubmitting}
            alignItems="center"
            marginTop="md"
            minHeight={44}
            justifyContent="center"
          >
            {({ pressed }) => (
              <Text variant="labelSm" color="accent" opacity={pressed ? 0.8 : 1}>
                {t('auth.reset.backToLogin')}
              </Text>
            )}
          </Pressable>
        </Box>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
