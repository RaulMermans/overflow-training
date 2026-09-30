import { View, StyleSheet } from 'react-native'
import { colors } from '../../theme'

interface MiniChartProps {
  data: number[]
  height?: number
  color?: string
}

export default function MiniChart({
  data,
  height = 40,
  color = colors.accent.primary,
}: MiniChartProps) {
  if (!data || data.length === 0) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  return (
    <View style={[styles.container, { height }]}>
      {data.map((value, i) => {
        const barHeight = ((value - min) / range) * 100
        const isLast = i === data.length - 1
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: `${Math.max(barHeight, 10)}%`,
                backgroundColor: isLast ? color : `${color}60`,
              },
            ]}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    flex: 1,
    minHeight: 4,
    borderRadius: 2,
  },
})
