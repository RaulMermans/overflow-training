import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../src/auth/useAuth'
import { Box, Button, Input, Pressable, Screen, Text } from '../../src/components/ui'
import { useI18n } from '../../src/i18n/useI18n'
import { sanitizeErrorMessage } from '../../src/utils/errorMessages'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { resetPassword } = useAuth()
  const { t } = useI18n()
  const router = useRouter()

  const handleReset = async () => {
    if (!email) {
      Alert.alert(t('common.error'), t('auth.forgot.errorMissing'))
      return
    }

    setIsLoading(true)
    try {
      await resetPassword(email)
      Alert.alert(t('auth.forgot.checkInbox'), t('auth.forgot.checkInboxBody'))
      router.replace('/(auth)/login')
    } catch (error: unknown) {
      Alert.alert(t('auth.forgot.errorFailed'), sanitizeErrorMessage(error))
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
        <Box flex={1} justifyContent="center" paddingHorizontal="2xl">
          <Box alignItems="center" marginBottom="2xl">
            <Text variant="h1">{t('auth.forgot.title')}</Text>
            <Text marginTop="sm" variant="body" color="textMuted" textAlign="center">
              {t('auth.forgot.subtitle')}
            </Text>
          </Box>

          <Box marginBottom="lg">
            <Input
              placeholder={t('auth.forgot.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!isLoading}
            />
          </Box>

          <Button
            title={t('auth.forgot.submit')}
            onPress={handleReset}
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
              <Text variant="labelSm" color="accent" opacity={pressed ? 0.8 : 1}>
                {t('auth.forgot.backToLogin')}
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
