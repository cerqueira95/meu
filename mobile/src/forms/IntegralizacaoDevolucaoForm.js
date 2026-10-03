import React, { useEffect, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  loadActivity,
  submitActivity,
} from '../api'
import {
  Card,
  ErrorBox,
  Field,
  PrimaryButton,
  SectionTitle,
} from '../components/Ui'
import PhotoField from '../components/PhotoField'
import UserPicker from '../components/UserPicker'
import { colors, radius } from '../theme'

export default function IntegralizacaoDevolucaoForm({
  activity,
  onSuccess,
}) {
  const [data, setData] = useState(null)
  const [helpers, setHelpers] = useState([])
  const [integralizacao100, setIntegralizacao100] = useState(true)
  const [reason, setReason] = useState('')
  const [photo, setPhoto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')

    try {
      setData(await loadActivity(activity.rota))
    } catch (err) {
      setError(
        err?.message ||
          'Não foi possível carregar Integralização da Devolução.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    setError('')

    if (!integralizacao100 && !reason.trim()) {
      setError('Informe o motivo da integralização parcial.')
      return
    }

    if (!photo?.data) {
      setError('Tire uma foto da evidência.')
      return
    }

    setSending(true)

    try {
      const response = await submitActivity(activity.rota, {
        ajudantes_usuario_ids: helpers,
        integralizacao_100: integralizacao100,
        motivo_nao_integralizado: reason,
        evidencia_foto: photo.data,
      })

      onSuccess(response)
    } catch (err) {
      setError(
        err?.message ||
          'Não foi possível lançar Integralização da Devolução.',
      )
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <Text style={{ textAlign: 'center', color: colors.muted }}>
        Carregando...
      </Text>
    )
  }

  const unitValue = Number(data?.atividade?.valor_unitario || 0)
  const effectiveValue = integralizacao100 ? unitValue : unitValue * 0.5

  return (
    <View>
      <ErrorBox message={error} />

      <Card style={{ marginBottom: 12 }}>
        <SectionTitle
          title="1. Participantes"
          subtitle="Você já entra automaticamente como principal."
        />

        <UserPicker
          users={data?.usuarios || []}
          selected={helpers}
          onChange={setHelpers}
          multiple
          label="Outros ajudantes"
        />
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <SectionTitle
          title="2. Integralização"
          subtitle={`Valor estimado por pessoa: R$ ${effectiveValue.toFixed(2)}`}
        />

        <View style={styles.choiceRow}>
          <Pressable
            onPress={() => {
              setIntegralizacao100(true)
              setReason('')
            }}
            style={({ pressed }) => [
              styles.choice,
              integralizacao100 && styles.choiceActive,
              pressed && { opacity: 0.84 },
            ]}
          >
            <Text
              style={[
                styles.choiceTitle,
                integralizacao100 && styles.choiceTitleActive,
              ]}
            >
              100%
            </Text>
            <Text style={styles.choiceText}>
              Integralização completa
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setIntegralizacao100(false)}
            style={({ pressed }) => [
              styles.choice,
              !integralizacao100 && styles.choiceWarning,
              pressed && { opacity: 0.84 },
            ]}
          >
            <Text
              style={[
                styles.choiceTitle,
                !integralizacao100 && { color: colors.orange },
              ]}
            >
              Parcial
            </Text>
            <Text style={styles.choiceText}>
              Ficou pendência
            </Text>
          </Pressable>
        </View>

        {!integralizacao100 && (
          <Field
            label="Motivo da não integralização 100%"
            value={reason}
            onChangeText={setReason}
            placeholder="Explique o que ficou pendente..."
            multiline
            maxLength={2000}
          />
        )}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <SectionTitle
          title="3. Evidência"
          subtitle="A foto é obrigatória."
        />
        <PhotoField value={photo} onChange={setPhoto} />
      </Card>

      <PrimaryButton
        title="✓ LANÇAR INTEGRALIZAÇÃO"
        onPress={submit}
        loading={sending}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  choiceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  choice: {
    flex: 1,
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    padding: 14,
    justifyContent: 'center',
  },
  choiceActive: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
  },
  choiceWarning: {
    borderColor: colors.orange,
    backgroundColor: colors.orangeSoft,
  },
  choiceTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  choiceTitleActive: {
    color: colors.green,
  },
  choiceText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
})
