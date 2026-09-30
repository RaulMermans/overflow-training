import { useRef, useState } from 'react'
import {
  Alert,
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

export default function SignupScreen() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [invalidField, setInvalidField] = useState<
    'displayName' | 'email' | 'password' | 'confirmPassword' | null
  >(null)
  const [isLoading, setIsLoading] = useState(false)
  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)
  const confirmPasswordRef = useRef<TextInput>(null)
  const { signUp } = useAuth()
  const { t } = useI18n()
  const router = useRouter()

  const setFormError = (
    field: 'displayName' | 'email' | 'password' | 'confirmPassword' | null,
    message: string,
  ) => {
    setInvalidField(field)
    setErrorMessage(message)
  }

  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value)
    if (errorMessage) setErrorMessage('')
    if (invalidField === 'displayName') setInvalidField(null)
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

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value)
    if (errorMessage) setErrorMessage('')
    if (invalidField === 'confirmPassword') setInvalidField(null)
  }

  const handleSignup = async () => {
    if (!displayName || !email || !password || !confirmPassword) {
      if (!displayName) {
        setFormError('displayName', t('auth.signup.errorAllFields'))
      } else if (!email) {
        setFormError('email', t('auth.signup.errorAllFields'))
      } else if (!password) {
        setFormError('password', t('auth.signup.errorAllFields'))
      } else {
        setFormError('confirmPassword', t('auth.signup.errorAllFields'))
      }
      return
    }

    if (!isValidEmail(email)) {
      setFormError('email', t('auth.signup.errorEmail'))
      return
    }
    if (!isValidPassword(password)) {
      setFormError('password', t('auth.signup.errorPassword'))
      return
    }
    if (password !== confirmPassword) {
      setFormError('confirmPassword', t('auth.signup.errorMismatch'))
      return
    }

    setErrorMessage('')
    setInvalidField(null)
    setIsLoading(true)
    try {
      const result = await signUp(email, password, displayName)
      if (result.requiresEmailConfirmation) {
        Alert.alert(t('auth.signup.checkEmail'), t('auth.signup.checkEmailBody'))
        router.replace('/(auth)/login')
      } else {
        Alert.alert(t('auth.signup.welcome'), t('auth.signup.welcomeBody'))
        router.replace('/')
      }
    } catch (error: unknown) {
      setFormError(null, sanitizeErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Screen scroll horizontalPadding="none" bottomPadding="none" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <Box flex={1} justifyContent="center" paddingHorizontal="2xl" paddingVertical="2xl">
            <Box alignItems="center" marginBottom="2xl">
              <Text variant="h1">{t('auth.signup.title')}</Text>
              <Text marginTop="sm" variant="body" color="textMuted" textAlign="center">
                {t('auth.signup.subtitle')}
              </Text>
            </Box>

            <Box marginBottom="md">
              <Input
                testID="signup:displayNameInput"
                placeholder={t('auth.signup.displayName')}
                value={displayName}
                onChangeText={handleDisplayNameChange}
                invalid={invalidField === 'displayName'}
                autoCorrect={false}
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            </Box>

            <Box marginBottom="md">
              <Input
                ref={emailRef}
                testID="signup:emailInput"
                placeholder={t('auth.signup.email')}
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
                testID="signup:passwordInput"
                placeholder={t('auth.signup.password')}
                value={password}
                onChangeText={handlePasswordChange}
                invalid={invalidField === 'password'}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                secureTextEntry
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => confirmPasswordRef.current?.focus()}
              />
            </Box>

            <Box marginBottom="lg">
              <Input
                ref={confirmPasswordRef}
                testID="signup:confirmPasswordInput"
                placeholder={t('auth.signup.confirmPassword')}
                value={confirmPassword}
                onChangeText={handleConfirmPasswordChange}
                invalid={invalidField === 'confirmPassword'}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                secureTextEntry
                returnKeyType="go"
                onSubmitEditing={() => {
                  if (!isLoading) {
                    void handleSignup()
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
              testID="signup:submitButton"
              title={t('auth.signup.submit')}
              onPress={handleSignup}
              loading={isLoading}
              disabled={isLoading}
            />

            <Pressable
              onPress={() => router.back()}
              disabled={isLoading}
              alignItems="center"
              marginTop="md"
              minHeight={44}
              justifyContent="center"
            >
              {({ pressed }) => (
                <Text variant="bodySm" color="textMuted" opacity={pressed ? 0.8 : 1}>
                  {t('auth.signup.hasAccount')}
                  <Text variant="bodySm" color="accent">
                    {t('auth.signup.logIn')}
                  </Text>
                </Text>
              )}
            </Pressable>
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
