import { useEffect, useState } from 'react'
import { ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../src/auth/useAuth'
import { getInitialURLWithTimeout } from '../../src/auth/linkingTimeout'
import {
  hasHandledAuthCallbackCode,
  markAuthCallbackCodeHandled,
  parseAuthCallbackParams,
} from '../../src/auth/resetPasswordLink'
import { Box, Button, Pressable, Screen, Text } from '../../src/components/ui'
import { useI18n } from '../../src/i18n/useI18n'
import { colors } from '../../src/theme'
import { sanitizeErrorMessage } from '../../src/utils/errorMessages'

export default function LoginCallbackScreen() {
  const router = useRouter()
  const { code: codeParam } = useLocalSearchParams<{ code?: string }>()
  const { exchangeCodeForSession, setSessionFromTokens, signInWithGoogle } = useAuth()
  const { t } = useI18n()
  const [linkLoading, setLinkLoading] = useState(true)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!codeParam) return

    let cancelled = false

    void (async () => {
      if (hasHandledAuthCallbackCode(codeParam)) {
        if (!cancelled) {
          setLinkLoading(false)
          router.replace('/')
        }
        return
      }

      markAuthCallbackCodeHandled(codeParam)
      setError('')
      setLinkLoading(true)

      try {
        await exchangeCodeForSession(codeParam)
        if (!cancelled) {
          router.replace('/')
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(sanitizeErrorMessage(err))
        }
      } finally {
        if (!cancelled) {
          setLinkLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [codeParam, exchangeCodeForSession, router])

  useEffect(() => {
    if (codeParam) return

    let cancelled = false

    void (async () => {
      setError('')
      setLinkLoading(true)

      try {
        const initialUrl = await getInitialURLWithTimeout()

        if (!initialUrl) {
          if (!cancelled) {
            setError(t('auth.oauth.callbackTimeout'))
          }
          return
        }

        const { code, accessToken, refreshToken } = parseAuthCallbackParams(initialUrl)

        if (code) {
          if (hasHandledAuthCallbackCode(code)) {
            if (!cancelled) {
              router.replace('/')
            }
            return
          }

          markAuthCallbackCodeHandled(code)
          await exchangeCodeForSession(code)
          if (!cancelled) {
            router.replace('/')
          }
          return
        }

        if (accessToken && refreshToken) {
          await setSessionFromTokens(accessToken, refreshToken)
          if (!cancelled) {
            router.replace('/')
          }
          return
        }

        if (!cancelled) {
          setError(t('auth.oauth.invalidLink'))
        }
      } catch (linkError: unknown) {
        if (!cancelled) {
          setError(sanitizeErrorMessage(linkError))
        }
      } finally {
        if (!cancelled) {
          setLinkLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [codeParam, exchangeCodeForSession, router, setSessionFromTokens, t])

  const showFallback = !linkLoading && error

  return (
    <Screen scroll={false} horizontalPadding="none" bottomPadding="none" edges={['top', 'bottom']}>
      <Box flex={1} justifyContent="center" alignItems="center" paddingHorizontal="2xl">
        <Box alignItems="center" marginBottom="2xl">
          <Text variant="h1">{t('auth.oauth.title')}</Text>
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
              {t('auth.oauth.validating')}
            </Text>
          </Box>
        ) : null}

        {error ? (
          <Text marginBottom="md" variant="bodySm" color="error" textAlign="center">
            {error}
          </Text>
        ) : null}

        {showFallback ? (
          <Box width="100%" gap="sm">
            <Button
              title={t('auth.oauth.retryGoogle')}
              isLoading={googleLoading}
              disabled={googleLoading}
              onPress={async () => {
                setGoogleLoading(true)
                setError('')
                try {
                  await signInWithGoogle()
                } catch (err: unknown) {
                  setError(sanitizeErrorMessage(err))
                } finally {
                  setGoogleLoading(false)
                }
              }}
            />
            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              alignItems="center"
              marginTop="xs"
              minHeight={44}
              justifyContent="center"
            >
              {({ pressed }) => (
                <Text variant="labelSm" color="accent" opacity={pressed ? 0.8 : 1}>
                  {t('auth.oauth.backToLogin')}
                </Text>
              )}
            </Pressable>
          </Box>
        ) : null}
      </Box>
    </Screen>
  )
}
