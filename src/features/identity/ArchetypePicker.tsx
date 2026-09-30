import type React from 'react'
import { Modal, FlatList, StyleSheet, View, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '../../components/ui/Text'
import { ArchetypeIcon } from '../../components/ui/ArchetypeIcon'
import { ARCHETYPES, getArchetypeById } from './archetypes'
import type { ArchetypeDefinition } from './archetypes'
import { colors, radii, space } from '../../theme/tokens'
import { useI18n } from '../../i18n/useI18n'

interface ArchetypePickerProps {
  visible: boolean
  selectedId?: string
  onSelect: (archetypeId: string) => void
  onClose: () => void
}

function ArchetypeOption({
  archetype,
  isSelected,
  onPress,
  t,
}: {
  archetype: ArchetypeDefinition
  isSelected: boolean
  onPress: () => void
  t: ReturnType<typeof useI18n>['t']
}): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="radio"
      accessibilityLabel={t(archetype.nameKey)}
      accessibilityState={{ selected: isSelected }}
      style={[
        styles.option,
        isSelected && {
          borderColor: archetype.borderColor,
          backgroundColor: archetype.bgColor,
        },
      ]}
    >
      <ArchetypeIcon archetypeId={archetype.id} size={48} selected={isSelected} />
      <View style={styles.optionText}>
        <Text
          variant="label"
          style={[styles.optionName, isSelected && { color: archetype.fgColor }]}
        >
          {t(archetype.nameKey)}
        </Text>
        <Text variant="bodySm" color="textMuted" style={styles.optionTagline}>
          {t(archetype.taglineKey)}
        </Text>
      </View>
      {isSelected ? (
        <Ionicons name="checkmark-circle" size={20} color={archetype.fgColor} />
      ) : (
        <View style={styles.unchecked} />
      )}
    </TouchableOpacity>
  )
}

export function ArchetypePicker({
  visible,
  selectedId,
  onSelect,
  onClose,
}: ArchetypePickerProps): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const { t } = useI18n()

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.sheet, { paddingTop: insets.top > 0 ? insets.top : space[4] }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="h3">{t('identity.pickerTitle')}</Text>
            <Text variant="bodySm" color="textMuted" style={styles.subtitle}>
              {t('identity.pickerSubtitle')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={22} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* Archetype list */}
        <FlatList
          data={ARCHETYPES}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space[8] }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <ArchetypeOption
              archetype={item}
              isSelected={item.id === (selectedId ?? getArchetypeById(selectedId).id)}
              onPress={() => {
                onSelect(item.id)
                onClose()
              }}
              t={t}
            />
          )}
        />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: space[5],
    paddingBottom: space[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    gap: space[4],
  },
  headerText: {
    flex: 1,
    gap: space[1],
  },
  subtitle: {
    marginTop: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  list: {
    paddingHorizontal: space[5],
    paddingTop: space[4],
  },
  separator: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginLeft: 72,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 72,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionName: {
    lineHeight: 20,
  },
  optionTagline: {
    lineHeight: 18,
  },
  unchecked: {
    width: 20,
    height: 20,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.border.default,
  },
})
