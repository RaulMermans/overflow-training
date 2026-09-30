import { Stack } from 'expo-router'
import { colors } from '../../src/theme'

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg.secondary },
        headerTintColor: colors.text.primary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg.primary },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="checkins/index" options={{ headerShown: false }} />
      <Stack.Screen name="checkins/compare" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="routines" options={{ headerShown: false }} />
      <Stack.Screen
        name="workout-session"
        options={{ title: 'Workout Session', headerShown: false }}
      />
      <Stack.Screen name="workouts/[id]" options={{ title: 'Workout Detail' }} />
      <Stack.Screen
        name="progress/exercise/[exerciseId]"
        options={{ title: 'Exercise Progress' }}
      />
      <Stack.Screen name="trophies" options={{ headerShown: false }} />
    </Stack>
  )
}
