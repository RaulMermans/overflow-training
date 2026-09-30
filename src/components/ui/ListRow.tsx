import type { ReactNode } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@shopify/restyle'
import type { Theme } from '../../theme/restyleTheme'
import { Box } from './Box'
import { Pressable, type PressableProps } from './Pressable'
import { Text } from './Text'

type ListRowVariant = 'default' | 'destructive'

interface ListRowProps extends Omit<PressableProps, 'children'> {
  label?: string
  value?: string | number
  subtitle?: string
  rightContent?: ReactNode
  showChevron?: boolean
  variant?: ListRowVariant
  valueVariant?: 'labelSm' | 'tabular'
  // Backward-compatible aliases
  title?: string
  rightMeta?: string | number
  destructive?: boolean
}

export function ListRow({
  label,
  value,
  subtitle,
  rightContent,
  showChevron = true,
  variant,
  valueVariant = 'labelSm',
  title,
  rightMeta,
  destructive,
  disabled,
  accessibilityLabel,
  ...props
}: ListRowProps) {
  const theme = useTheme<Theme>()
  const resolvedLabel = label ?? title ?? ''
  const resolvedValue = value ?? rightMeta
  const resolvedVariant: ListRowVariant = variant ?? (destructive ? 'destructive' : 'default')

  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? resolvedLabel}
      {...props}
    >
      {({ pressed }) => (
        <Box
          minHeight={44}
          paddingVertical="md"
          paddingHorizontal="md"
          borderBottomWidth={1}
          borderBottomColor="borderSubtle"
          flexDirection="row"
          alignItems="center"
          opacity={disabled ? 0.5 : pressed ? 0.85 : 1}
          style={{ transform: [{ scale: pressed && !disabled ? 0.985 : 1 }] }}
        >
          <Box flex={1} minWidth={0}>
            <Text
              variant="body"
              color={resolvedVariant === 'destructive' ? 'error' : 'textPrimary'}
              numberOfLines={subtitle ? 2 : 3}
              ellipsizeMode="tail"
              style={{ flexShrink: 1 }}
            >
              {resolvedLabel}
            </Text>
            {subtitle ? (
              <Text
                marginTop="xs"
                variant="bodySm"
                color="textMuted"
                numberOfLines={2}
                ellipsizeMode="tail"
                style={{ flexShrink: 1 }}
              >
                {subtitle}
              </Text>
            ) : null}
          </Box>
          {resolvedValue ? (
            <Box marginLeft="md" maxWidth="48%" minWidth={0}>
              <Text
                variant={valueVariant}
                color="textMuted"
                numberOfLines={subtitle ? 2 : 3}
                ellipsizeMode="tail"
                textAlign="right"
                style={{ flexShrink: 1 }}
              >
                {String(resolvedValue)}
              </Text>
            </Box>
          ) : null}
          {rightContent ? (
            <Box marginLeft="md" minWidth={0}>
              {rightContent}
            </Box>
          ) : null}
          {showChevron ? (
            <Box marginLeft="sm" width={16} alignItems="center">
              <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
            </Box>
          ) : null}
        </Box>
      )}
    </Pressable>
  )
}
