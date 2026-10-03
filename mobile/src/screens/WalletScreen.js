import { Artwork } from '../components/Artwork'
import React, { useEffect, useMemo, useState } from 'react'
import DateTimePicker from '@react-native-community/datetimepicker'
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { loadWalletSummary } from '../api'
import {
  Card,
  ErrorBox,
  Header,
  PrimaryButton,
  Screen,
} from '../components/Ui'
import { colors, radius } from '../theme'

function pad(value) {
  return String(value).padStart(2, '0')
}

function todayIso() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function monthStartIso() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
}

function isoToDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  return new Date(year, Math.max(0, month - 1), day || 1, 12, 0, 0)
}

function dateToIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatDate(value) {
  const date = isoToDate(value)
  return date.toLocaleDateString('pt-BR')
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function DateField({ label, value, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dateField,
        pressed && { opacity: 0.82 },
      ]}
    >
      <Text style={styles.dateLabel}>{label}</Text>
      <View style={styles.dateValueRow}>
        <Text style={styles.dateValue}>{formatDate(value)}</Text>
        <Text style={styles.calendarIcon}>▣</Text>
      </View>
    </Pressable>
  )
}

export default function WalletScreen({ onBack }) {
  const [start, setStart] = useState(monthStartIso())
  const [end, setEnd] = useState(todayIso())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picker, setPicker] = useState(null)
  const [pickerValue, setPickerValue] = useState(new Date())

  useEffect(() => {
    load(start, end)
  }, [])

  const operador = Boolean(data?.usuario?.operador)

  const periodLabel = useMemo(
    () => `${formatDate(start)} a ${formatDate(end)}`,
    [start, end],
  )

  async function load(targetStart = start, targetEnd = end) {
    setError('')

    if (targetStart > targetEnd) {
      setError('A data inicial não pode ser maior que a data final.')
      return
    }

    setLoading(true)

    try {
      const response = await loadWalletSummary(targetStart, targetEnd)
      setData(response)
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Não foi possível carregar a carteira neste período.',
      )
    } finally {
      setLoading(false)
    }
  }

  function openPicker(type) {
    const value = type === 'start' ? start : end
    setPickerValue(isoToDate(value))
    setPicker(type)
  }

  function onPickerChange(event, selectedDate) {
    if (Platform.OS === 'android') {
      setPicker(null)

      if (event?.type === 'set' && selectedDate) {
        applyPickedDate(selectedDate)
      }
      return
    }

    if (selectedDate) {
      setPickerValue(selectedDate)
    }
  }

  function applyPickedDate(date = pickerValue) {
    const value = dateToIso(date)

    if (picker === 'start') {
      setStart(value)
    } else if (picker === 'end') {
      setEnd(value)
    }

    setPicker(null)
  }

  return (
    <Screen>
      <Header
        title="Carteira"
        subtitle="Resumo da remuneração no período"
        onBack={onBack}
        right={<Artwork name="wallet" size={48} />}
      />

      <Card style={styles.filterCard}>
        <Text style={styles.filterTitle}>Intervalo de datas</Text>
        <Text style={styles.filterHint}>
          Escolha o período que deseja consultar.
        </Text>

        <View style={styles.dateRow}>
          <View style={styles.dateColumn}>
            <DateField
              label="Data inicial"
              value={start}
              onPress={() => openPicker('start')}
            />
          </View>

          <View style={styles.dateColumn}>
            <DateField
              label="Data final"
              value={end}
              onPress={() => openPicker('end')}
            />
          </View>
        </View>

        <PrimaryButton
          title="CONSULTAR PERÍODO"
          onPress={() => load()}
          loading={loading}
          tone="blue"
        />
      </Card>

      <ErrorBox message={error} />

      {!error && (
        <>
          <Card style={styles.totalCard}>
            <Text style={styles.totalLabel}>VALOR TOTAL</Text>
            <Text style={styles.totalValue}>
              {loading ? '...' : money(data?.totais?.total)}
            </Text>
            <Text style={styles.totalPeriod}>{periodLabel}</Text>
          </Card>

          {!operador && !loading && (
            <View style={styles.breakdownRow}>
              <Card style={styles.breakdownCard}>
                <View style={styles.breakdownIcon}>
                  <Text style={styles.breakdownIconText}>W</Text>
                </View>
                <Text style={styles.breakdownLabel}>WMS (Rateio)</Text>
                <Text style={styles.breakdownValue}>
                  {money(data?.totais?.wms_rateio)}
                </Text>
              </Card>

              <Card style={styles.breakdownCard}>
                <View style={[styles.breakdownIcon, styles.escalonadaIcon]}>
                  <Text style={styles.escalonadaIconText}>E</Text>
                </View>
                <Text style={styles.breakdownLabel}>Escalonada</Text>
                <Text style={styles.breakdownValue}>
                  {money(data?.totais?.escalonada)}
                </Text>
              </Card>
            </View>
          )}

          {!loading && (
            <View style={styles.note}>
              <Text style={styles.noteTitle}>
                {operador ? 'Carteira do operador' : 'Resumo da carteira'}
              </Text>
              <Text style={styles.noteText}>
                {operador
                  ? 'Para operador, o aplicativo mostra somente o valor total do período selecionado.'
                  : 'O aplicativo mostra somente WMS (Rateio), Escalonada e o valor total. O extrato completo continua disponível na Web.'}
              </Text>
            </View>
          )}
        </>
      )}

      {!!picker && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onPickerChange}
        />
      )}

      {!!picker && Platform.OS === 'ios' && (
        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => setPicker(null)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setPicker(null)}
          >
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>
                {picker === 'start' ? 'Data inicial' : 'Data final'}
              </Text>

              <DateTimePicker
                value={pickerValue}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                themeVariant="dark"
                locale="pt-BR"
                onChange={onPickerChange}
              />

              <PrimaryButton
                title="CONFIRMAR DATA"
                onPress={() => applyPickedDate()}
                tone="blue"
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  filterCard: {
    marginBottom: 12,
  },
  filterTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  filterHint: {
    color: colors.muted,
    marginTop: 3,
    marginBottom: 14,
    fontSize: 13,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  dateColumn: {
    flex: 1,
  },
  dateField: {
    minHeight: 74,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    padding: 12,
    justifyContent: 'center',
  },
  dateLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dateValueRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateValue: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  calendarIcon: {
    color: colors.blue,
    fontSize: 15,
    marginLeft: 5,
  },
  totalCard: {
    minHeight: 178,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft,
  },
  totalLabel: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  totalValue: {
    color: colors.white,
    fontSize: 38,
    fontWeight: '900',
    marginTop: 8,
  },
  totalPeriod: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  breakdownCard: {
    flex: 1,
    minHeight: 140,
  },
  breakdownIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
    borderWidth: 1,
    borderColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  breakdownIconText: {
    color: colors.blue,
    fontWeight: '900',
  },
  escalonadaIcon: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.green,
  },
  escalonadaIconText: {
    color: colors.green,
    fontWeight: '900',
  },
  breakdownLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  breakdownValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  note: {
    padding: 15,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteTitle: {
    color: colors.text,
    fontWeight: '900',
  },
  noteText: {
    color: colors.muted,
    marginTop: 5,
    lineHeight: 19,
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
  },
})
