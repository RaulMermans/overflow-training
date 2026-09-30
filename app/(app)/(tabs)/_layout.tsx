import { View } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, typography } from '../../../src/theme'
import { useI18n } from '../../../src/i18n/useI18n'

function TabIcon({
  name,
  color,
  size,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap
  color: string
  size: number
  focused: boolean
}) {
  return (
    <View style={{ alignItems: 'center', opacity: focused ? 1 : 0.75 }}>
      <Ionicons name={name} size={size} color={color} />
    </View>
  )
}

export default function TabsLayout() {
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const tabBarPaddingBottom = Math.max(insets.bottom, 12)
  const tabBarHeight = 58 + tabBarPaddingBottom

  return (
    <Tabs
      initialRouteName="workout"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg.secondary,
          borderTopColor: colors.border.default,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: tabBarPaddingBottom,
        },
        tabBarActiveTintColor: colors.accent.primary,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarLabelStyle: {
          fontSize: typography.micro.fontSize,
          fontWeight: typography.micro.fontWeight,
          letterSpacing: typography.micro.letterSpacing,
        },
        tabBarItemStyle: { minHeight: 44 },
      }}
    >
      <Tabs.Screen
        name="workout"
        options={{
          title: t('tabs.today'),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="today-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('tabs.calendar'),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="calendar-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t('tabs.progress'),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="stats-chart-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="person-circle-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
    </Tabs>
  )
}
