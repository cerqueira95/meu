import React, { useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Chip, Field } from './Ui'
import { colors, radius } from '../theme'

function sameValue(a, b) {
  return String(a) === String(b)
}

export default function SearchPicker({
  options = [],
  value,
  onChange,
  multiple = false,
  label,
  hint,
  placeholder = 'Pesquisar...',
  emptyValue = '',
  maxResults = 8,
}) {
  const [query, setQuery] = useState('')

  const selectedValues = multiple
    ? Array.isArray(value) ? value : []
    : value !== undefined && value !== null && value !== emptyValue
      ? [value]
      : []

  const selectedOptions = useMemo(
    () =>
      selectedValues
        .map((selectedValue) =>
          options.find((option) => sameValue(option.value, selectedValue)),
        )
        .filter(Boolean),
    [options, selectedValues],
  )

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR')

    if (!q) {
      return []
    }

    return options
      .filter((option) => {
        const alreadySelected = selectedValues.some((selectedValue) =>
          sameValue(selectedValue, option.value),
        )

        if (alreadySelected) {
          return false
        }

        return String(option.label || '')
          .toLocaleLowerCase('pt-BR')
          .includes(q)
      })
      .slice(0, maxResults)
  }, [options, query, selectedValues, maxResults])

  function select(optionValue) {
    if (multiple) {
      onChange([...selectedValues, optionValue])
    } else {
      onChange(optionValue)
    }

    setQuery('')
  }

  function remove(optionValue) {
    if (multiple) {
      onChange(
        selectedValues.filter(
          (selectedValue) => !sameValue(selectedValue, optionValue),
        ),
      )
      return
    }

    onChange(emptyValue)
  }

  const searching = Boolean(query.trim())

  return (
    <View style={styles.wrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      {!!hint && <Text style={styles.hint}>{hint}</Text>}

      <Field
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        autoCapitalize="words"
      />

      {selectedOptions.length > 0 && (
        <View style={styles.selectedArea}>
          <Text style={styles.selectedLabel}>
            {multiple ? 'Selecionados' : 'Selecionado'}
          </Text>
          <View style={styles.selectedChips}>
            {selectedOptions.map((option) => (
              <Chip
                key={String(option.value)}
                label={`${option.label}  ×`}
                selected
                onPress={() => remove(option.value)}
              />
            ))}
          </View>
        </View>
      )}

      {searching && (
        <View style={styles.results}>
          {results.length > 0 ? (
            results.map((option) => (
              <Pressable
                key={String(option.value)}
                onPress={() => select(option.value)}
                style={({ pressed }) => [
                  styles.resultRow,
                  pressed && styles.resultRowPressed,
                ]}
              >
                <Text style={styles.resultText}>{option.label}</Text>
                <Text style={styles.resultAdd}>+</Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.empty}>Nenhum resultado encontrado.</Text>
          )}
        </View>
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
    lineHeight: 17,
    marginTop: 3,
    marginBottom: 10,
  },
  selectedArea: {
    marginTop: -2,
    marginBottom: 7,
  },
  selectedLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  selectedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  results: {
    marginTop: -6,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.cardElevated,
  },
  resultRow: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultRowPressed: {
    backgroundColor: colors.blueSoft,
  },
  resultText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  resultAdd: {
    color: colors.blue,
    fontSize: 22,
    fontWeight: '500',
    marginLeft: 12,
  },
  empty: {
    color: colors.muted,
    padding: 14,
    fontSize: 13,
  },
})
