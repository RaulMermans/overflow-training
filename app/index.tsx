import { useEffect, useState } from 'react'
import { Redirect } from 'expo-router'
import { View } from 'react-native'
import { useAuth } from '../src/auth/useAuth'
import { loadOnboardingCompleted } from '../src/lib/onboarding'
import { colors } from '../src/theme'

export default function Index() {
  const { user, loading } = useAuth()
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    if (!user) {
      setOnboardingCompleted(null)
      return
    }

    let isMounted = true
    setOnboardingCompleted(null)

    const loadOnboarding = async () => {
      const completed = await loadOnboardingCompleted(user.id)
      if (!isMounted) return
      setOnboardingCompleted(completed)
    }

    void loadOnboarding()

    return () => {
      isMounted = false
    }
  }, [user?.id])

  if (loading || (user && onboardingCompleted === null)) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg.primary,
        }}
      />
    )
  }

  if (user) {
    if (!onboardingCompleted) {
      return <Redirect href="/(app)/onboarding" />
    }

    return <Redirect href="/(app)/(tabs)/workout" />
  }

  return <Redirect href="/(auth)/login" />
}
