import { useState } from 'react'
import { Modal, ScrollView, StyleSheet, View } from 'react-native'
import { colors, radius, spacing } from '../../theme'
import { Box } from './Box'
import { Button } from './Button'
import { Text } from './Text'

interface ErrorCardProps {
  title: string
  message: string
  primaryActionLabel: string
  onPrimaryAction: () => void
  detailsLabel?: string
  detailsTitle?: string
  details?: string | null
  closeLabel: string
}

export function ErrorCard({
  title,
  message,
  primaryActionLabel,
  onPrimaryAction,
  detailsLabel,
  detailsTitle,
  details,
  closeLabel,
}: ErrorCardProps) {
  const [isDetailsVisible, setIsDetailsVisible] = useState(false)
  const canShowDetails = Boolean(details?.trim().length)

  return (
    <>
      <Box
        backgroundColor="surface"
        borderRadius="lg"
        borderColor="borderSubtle"
        borderWidth={1}
        padding="lg"
        marginTop="sm"
      >
        <Text variant="label" color="error">
          {title}
        </Text>
        <Text marginTop="xs" variant="bodySm" color="textMuted">
          {message}
        </Text>

        <Box marginTop="md" gap="sm">
          <Button title={primaryActionLabel} variant="secondary" onPress={onPrimaryAction} />
          {canShowDetails && detailsLabel ? (
            <Button
              title={detailsLabel}
              variant="ghost"
              onPress={() => setIsDetailsVisible(true)}
            />
          ) : null}
        </Box>
      </Box>

      <Modal
        visible={isDetailsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDetailsVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text variant="label">{detailsTitle ?? title}</Text>
            <ScrollView style={styles.detailsScroll} showsVerticalScrollIndicator={false}>
              <Text marginTop="sm" variant="bodySm" color="textMuted">
                {details}
              </Text>
            </ScrollView>
            <Box marginTop="md">
              <Button
                title={closeLabel}
                variant="secondary"
                onPress={() => setIsDetailsVisible(false)}
              />
            </Box>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bg.overlay,
    justifyContent: 'flex-end',
  },
  card: {
    marginHorizontal: spacing[5],
    marginBottom: spacing[8],
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing[5],
    maxHeight: '80%',
  },
  detailsScroll: {
    maxHeight: 260,
  },
})
