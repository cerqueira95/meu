import React, { useEffect, useMemo, useState } from 'react'
import {
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
  PrimaryButton,
  SectionTitle,
} from '../components/Ui'
import PhotoField from '../components/PhotoField'
import SearchPicker from '../components/SearchPicker'
import UserPicker from '../components/UserPicker'
import { colors } from '../theme'

export default function RetornoRotaForm({ activity, onSuccess }) {
  const [data, setData] = useState(null)
  const [typeKey, setTypeKey] = useState('')
  const [helpers, setHelpers] = useState([])
  const [photo, setPhoto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const selectedType = useMemo(
    () => data?.tipos?.find((item) => item.chave === typeKey),
    [data, typeKey],
  )

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')

    try {
      const response = await loadActivity(activity.rota)
      setData(response)

      if (response?.tipos?.length === 1) {
        setTypeKey(response.tipos[0].chave)
      }
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar Retorno de Rota.')
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    setError('')

    if (!selectedType) {
      setError('Selecione a atividade realizada.')
      return
    }

    if (!photo?.data) {
      setError('Tire uma foto da evidência.')
      return
    }

    setSending(true)

    try {
      const response = await submitActivity(activity.rota, {
        tipo_atividade: selectedType.chave,
        ajudantes_usuario_ids: helpers,
        evidencia_foto: photo.data,
      })

      onSuccess(response)
    } catch (err) {
      setError(err?.message || 'Não foi possível lançar Retorno de Rota.')
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

  return (
    <View>
      <ErrorBox message={error} />

      <Card style={{ marginBottom: 12 }}>
        <SectionTitle
          title="1. Atividade realizada"
          subtitle="Toque no campo para ver as opções ou digite para filtrar."
        />

        <SearchPicker
          options={(data?.tipos || []).map((item) => ({
            value: item.chave,
            label: item.nome,
          }))}
          value={typeKey}
          onChange={setTypeKey}
          placeholder="Escolher atividade..."
          hint={
            selectedType
              ? `Valor: R$ ${Number(selectedType.valor_unitario || 0).toFixed(2)} por pessoa`
              : 'Molho AG, Devolução, Troca ou Separação de Chapatex.'
          }
        />
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <SectionTitle
          title="2. Participantes"
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
          title="3. Evidência"
          subtitle="A foto é obrigatória."
        />
        <PhotoField value={photo} onChange={setPhoto} />
      </Card>

      <PrimaryButton
        title="✓ LANÇAR RETORNO DE ROTA"
        onPress={submit}
        loading={sending}
        disabled={!selectedType}
      />
    </View>
  )
}
