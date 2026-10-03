import React, { useState } from 'react'
import {
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  pickEvidencePhoto,
  takeEvidencePhoto,
} from '../photo'
import {
  PhotoPreview,
  SecondaryButton,
} from './Ui'
import { colors } from '../theme'

export default function PhotoField({
  label = 'Evidência',
  value,
  onChange,
}) {
  const [loading, setLoading] = useState(false)

  async function run(mode) {
    setLoading(true)

    try {
      const photo =
        mode === 'camera'
          ? await takeEvidencePhoto()
          : await pickEvidencePhoto()

      if (photo) {
        onChange(photo)
      }
    } catch (error) {
      Alert.alert('Evidência', error?.message || 'Não foi possível carregar a foto.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.status, value?.data && styles.statusOk]}>
          {value?.data ? '✓ pronta' : 'obrigatória'}
        </Text>
      </View>

      <PhotoPreview uri={value?.uri} />

      <View style={styles.actions}>
        <View style={styles.action}>
          <SecondaryButton
            title={loading ? 'Abrindo...' : 'Tirar foto'}
            onPress={() => run('camera')}
            compact
          />
        </View>
        <View style={styles.action}>
          <SecondaryButton
            title="Galeria"
            onPress={() => run('gallery')}
            compact
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  status: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '800',
  },
  statusOk: {
    color: colors.green,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  action: {
    flex: 1,
  },
})
