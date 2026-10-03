import React, { useMemo, useState } from 'react'
import {
  Pressable,
  ScrollView,
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
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

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

    return options
      .filter((option) => {
        const alreadySelected = selectedValues.some((selectedValue) =>
          sameValue(selectedValue, option.value),
        )

        if (alreadySelected) {
          return false
        }

        if (!q) {
          return true
        }

        return String(option.label || '')
          .toLocaleLowerCase('pt-BR')
          .includes(q)
      })
  }, [options, query, selectedValues])

  function select(optionValue) {
    if (multiple) {
      onChange([...selectedValues, optionValue])
    } else {
      onChange(optionValue)
    }

    setQuery('')
    setOpen(true)
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

  function handleBlur() {
    setTimeout(() => setOpen(false), 180)
  }

  return (
    <View style={styles.wrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      {!!hint && <Text style={styles.hint}>{hint}</Text>}

      <Field
        value={query}
        onChangeText={(value) => {
          setQuery(value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoCapitalize="words"
      />

      {open && (
        <View style={styles.results}>
          <View style={styles.resultsHead}>
            <Text style={styles.resultsHint}>
              {query.trim() ? 'Resultados' : 'Sugestões'}
            </Text>
            <Text style={styles.resultsCount}>
              {results.length}
            </Text>
          </View>

          {results.length > 0 ? (
            <ScrollView
              style={styles.resultsScroll}
              keyboardShouldPersistTaps="always"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              persistentScrollbar
            >
              {results.map((option) => (
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
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.empty}>
              {options.length
                ? 'Nenhum resultado encontrado.'
                : 'Nenhuma opção disponível.'}
            </Text>
          )}
        </View>
      )}

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
  results: {
    marginTop: -6,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.cardElevated,
  },
  resultsHead: {
    minHeight: 34,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.input,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultsHint: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  resultsCount: {
    color: colors.blue,
    fontSize: 11,
    fontWeight: '900',
  },
  resultsScroll: {
    maxHeight: 320,
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
  selectedArea: {
    marginTop: 1,
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
})
