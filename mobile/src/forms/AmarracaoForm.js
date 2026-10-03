import React, { useEffect, useState } from 'react'
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
  Field,
  PrimaryButton,
  SectionTitle,
} from '../components/Ui'
import PhotoField from '../components/PhotoField'
import UserPicker from '../components/UserPicker'
import { colors } from '../theme'

export default function AmarracaoForm({ activity, onSuccess }) {
  const [data, setData] = useState(null)
  const [mapa, setMapa] = useState('')
  const [placa, setPlaca] = useState('')
  const [helper, setHelper] = useState(0)
  const [photo, setPhoto] = useState(null)
  const [observation, setObservation] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      setData(await loadActivity(activity.rota))
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar Amarração.')
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    setError('')

    if (!mapa.trim()) {
      setError('Informe o Mapa ou OP.')
      return
    }

    if (!placa.trim()) {
      setError('Informe a placa do cavalo.')
      return
    }

    if (!photo?.data) {
      setError('Tire uma foto da evidência.')
      return
    }

    setSending(true)

    try {
      const response = await submitActivity(activity.rota, {
        mapa_op: mapa,
        placa_cavalo: placa,
        ajudante_usuario_id: helper,
        evidencia_foto: photo.data,
        observacao: observation,
      })

      onSuccess(response)
    } catch (err) {
      setError(err?.message || 'Não foi possível lançar a Amarração.')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <Text style={{ textAlign: 'center', color: colors.muted }}>Carregando...</Text>
  }

  return (
    <View>
      <ErrorBox message={error} />

      <Card style={{ marginBottom: 12 }}>
        <SectionTitle
          title="Dados da amarração"
          subtitle="Preencha somente o necessário para registrar a atividade."
        />

        <Field
          label="Mapa / OP"
          value={mapa}
          onChangeText={setMapa}
          placeholder="Ex.: 123456"
          autoCapitalize="characters"
        />

        <Field
          label="Placa do cavalo"
          value={placa}
          onChangeText={setPlaca}
          placeholder="ABC1D23"
          autoCapitalize="characters"
          maxLength={10}
        />

        <UserPicker
          users={data?.usuarios || []}
          selected={helper}
          onChange={setHelper}
          label="Segundo ajudante"
        />

        <PhotoField value={photo} onChange={setPhoto} />

        <Field
          label="Observação"
          value={observation}
          onChangeText={setObservation}
          placeholder="Opcional"
          multiline
          maxLength={3000}
        />
      </Card>

      <PrimaryButton
        title="✓ LANÇAR AMARRAÇÃO"
        onPress={submit}
        loading={sending}
      />
    </View>
  )
}
