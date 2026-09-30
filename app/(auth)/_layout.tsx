import { Stack } from 'expo-router'
import { colors } from '../../src/theme'
import { useI18n } from '../../src/i18n/useI18n'

export default function AuthLayout() {
  const { t } = useI18n()

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg.secondary },
        headerTintColor: colors.text.primary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg.primary },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ title: t('auth.header.signUp') }} />
      <Stack.Screen name="forgot-password" options={{ title: t('auth.header.resetPassword') }} />
      <Stack.Screen name="reset-password" options={{ title: t('auth.header.resetPassword') }} />
      <Stack.Screen name="login-callback" options={{ headerShown: false }} />
    </Stack>
  )
}
