import { Pressable, Text } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useI18n } from '../../../src/i18n/useI18n'
import { colors, typography } from '../../../src/theme'

export default function RoutinesLayout() {
  const router = useRouter()
  const { t } = useI18n()

  const handleBackWithFallback = () => {
    if (router.canGoBack()) {
      router.back()
      return
    }

    router.replace('/(app)/(tabs)/workout')
  }

  const renderCloseButton = () => (
    <Pressable
      onPress={handleBackWithFallback}
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      hitSlop={8}
    >
      {({ pressed }) => (
        <Ionicons
          name="close"
          size={22}
          color={colors.text.secondary}
          style={{ opacity: pressed ? 0.8 : 1 }}
        />
      )}
    </Pressable>
  )

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.bg.secondary },
        headerTintColor: colors.text.primary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg.primary },
        headerTitle: '',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={handleBackWithFallback}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
              hitSlop={8}
            >
              {({ pressed }) => (
                <Text
                  style={{
                    ...typography.labelSm,
                    color: colors.text.secondary,
                    opacity: pressed ? 0.8 : 1,
                  }}
                >
                  {t('common.back')}
                </Text>
              )}
            </Pressable>
          ),
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          headerRight: renderCloseButton,
        }}
      />
      <Stack.Screen
        name="new"
        options={{
          presentation: 'modal',
          headerBackVisible: false,
          headerRight: renderCloseButton,
        }}
      />
    </Stack>
  )
}
