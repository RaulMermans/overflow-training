import { useRef, useState } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../src/auth/useAuth'
import { Box, Button, Input, Pressable, Screen, Text } from '../../src/components/ui'
import { useI18n } from '../../src/i18n/useI18n'
import { isValidEmail, isValidPassword } from '../../src/utils/authValidation'
import { sanitizeErrorMessage } from '../../src/utils/errorMessages'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [invalidField, setInvalidField] = useState<'email' | 'password' | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const passwordRef = useRef<TextInput>(null)
  const { signIn, signInWithGoogle } = useAuth()
  const { t } = useI18n()
  const router = useRouter()

  const setFormError = (field: 'email' | 'password' | null, message: string) => {
    setInvalidField(field)
    setErrorMessage(message)
  }

  const handleEmailChange = (value: string) => {
    setEmail(value)
    if (errorMessage) setErrorMessage('')
    if (invalidField === 'email') setInvalidField(null)
  }

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    if (errorMessage) setErrorMessage('')
    if (invalidField === 'password') setInvalidField(null)
  }

  const handleLogin = async () => {
    if (!email || !password) {
      setFormError(email ? 'password' : 'email', t('auth.login.errorMissing'))
      return
    }
    if (!isValidEmail(email)) {
      setFormError('email', t('auth.login.errorEmail'))
      return
    }
    if (!isValidPassword(password)) {
      setFormError('password', t('auth.login.errorPassword'))
      return
    }

    setErrorMessage('')
    setInvalidField(null)
    setIsLoading(true)
    try {
      await signIn(email, password)
      router.replace('/')
    } catch (error: unknown) {
      setFormError(null, sanitizeErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Screen scroll={false} horizontalPadding="none" bottomPadding="none" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <Box flex={1} justifyContent="center" paddingHorizontal="2xl">
            <Box alignItems="center" marginBottom="3xl">
              <Text variant="display">{t('auth.login.title')}</Text>
              <Text marginTop="sm" variant="body" color="textMuted" textAlign="center">
                {t('auth.login.subtitle')}
              </Text>
            </Box>

            <Box>
              <Box marginBottom="md">
                <Input
                  testID="login:emailInput"
                  placeholder={t('auth.login.email')}
                  value={email}
                  onChangeText={handleEmailChange}
                  invalid={invalidField === 'email'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </Box>

              <Box marginBottom="md">
                <Input
                  ref={passwordRef}
                  testID="login:passwordInput"
                  placeholder={t('auth.login.password')}
                  value={password}
                  onChangeText={handlePasswordChange}
                  invalid={invalidField === 'password'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  textContentType="password"
                  secureTextEntry
                  returnKeyType="go"
                  onSubmitEditing={() => {
                    if (!isLoading) {
                      void handleLogin()
                    }
                  }}
                />
              </Box>

              {errorMessage ? (
                <Text marginBottom="md" variant="bodySm" color="error">
                  {errorMessage}
                </Text>
              ) : null}

              <Button
                testID="login:submitButton"
                title={t('auth.login.submit')}
                onPress={handleLogin}
                isLoading={isLoading}
                disabled={isLoading || isGoogleLoading}
              />

              <Box marginTop="sm">
                <Button
                  title={t('auth.login.google')}
                  onPress={async () => {
                    setIsGoogleLoading(true)
                    try {
                      await signInWithGoogle()
                    } catch (error: unknown) {
                      setFormError(null, sanitizeErrorMessage(error))
                    } finally {
                      setIsGoogleLoading(false)
                    }
                  }}
                  isLoading={isGoogleLoading}
                  disabled={isLoading || isGoogleLoading}
                />
              </Box>

              <Pressable
                onPress={() => router.push('/(auth)/forgot-password')}
                disabled={isLoading || isGoogleLoading}
                alignItems="center"
                marginTop="md"
                minHeight={44}
                justifyContent="center"
              >
                {({ pressed }) => (
                  <Text variant="labelSm" color="accent" opacity={pressed ? 0.8 : 1}>
                    {t('auth.login.forgotPassword')}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => router.push('/(auth)/signup')}
                disabled={isLoading || isGoogleLoading}
                alignItems="center"
                marginTop="sm"
                minHeight={44}
                justifyContent="center"
              >
                {({ pressed }) => (
                  <Text variant="bodySm" color="textMuted" opacity={pressed ? 0.8 : 1}>
                    {t('auth.login.noAccount')}
                    <Text variant="bodySm" color="accent">
                      {t('auth.login.signUp')}
                    </Text>
                  </Text>
                )}
              </Pressable>
            </Box>
          </Box>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
