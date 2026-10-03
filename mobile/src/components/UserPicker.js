import React, { useMemo, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Chip, Field } from './Ui'
import { colors } from '../theme'

export default function UserPicker({
  users = [],
  selected,
  onChange,
  multiple = false,
  label = 'Segundo ajudante',
}) {
  const [query, setQuery] = useState('')

  const selectedIds = multiple
    ? Array.isArray(selected) ? selected : []
    : selected ? [selected] : []

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR')
    const base = q
      ? users.filter((item) =>
          String(item.nome || '').toLocaleLowerCase('pt-BR').includes(q),
        )
      : users

    return base.slice(0, 8)
  }, [users, query])

  function toggle(id) {
    if (multiple) {
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter((value) => value !== id))
      } else {
        onChange([...selectedIds, id])
      }
      return
    }

    onChange(selected === id ? 0 : id)
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>
        Opcional. Pesquise pelo nome e toque para selecionar.
      </Text>

      <Field
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar funcionário..."
        autoCapitalize="words"
      />

      <View style={styles.chips}>
        {filtered.map((item) => (
          <Chip
            key={item.id}
            label={item.nome}
            selected={selectedIds.includes(item.id)}
            onPress={() => toggle(item.id)}
          />
        ))}
      </View>

      {multiple && selectedIds.length > 0 && (
        <Text style={styles.selectedText}>
          {selectedIds.length} ajudante(s) selecionado(s)
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
    marginBottom: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  selectedText: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
})
