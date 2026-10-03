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
  Field,
  PrimaryButton,
  SectionTitle,
} from '../components/Ui'
import PhotoField from '../components/PhotoField'
import SearchPicker from '../components/SearchPicker'
import { colors } from '../theme'

export default function RepackForm({ activity, onSuccess }) {
  const [data, setData] = useState(null)
  const [typeKey, setTypeKey] = useState('')
  const [quantity, setQuantity] = useState('1')
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
      setError(err?.message || 'Não foi possível carregar Repack.')
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    setError('')

    if (!selectedType) {
      setError('Selecione o tipo do SKU recuperado.')
      return
    }

    if (Number(quantity || 0) <= 0) {
      setError('Informe a quantidade em caixas.')
      return
    }

    if (!photo?.data) {
      setError('Tire uma foto da evidência.')
      return
    }

    setSending(true)

    try {
      const response = await submitActivity(activity.rota, {
        tipo_sku: selectedType.chave,
        quantidade_caixas: Number(quantity),
        evidencia_foto: photo.data,
      })

      onSuccess(response)
    } catch (err) {
      setError(err?.message || 'Não foi possível lançar Repack.')
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

  const total =
    Number(selectedType?.valor_unitario || 0) * Number(quantity || 0)

  return (
    <View>
      <ErrorBox message={error} />

      <Card style={{ marginBottom: 12 }}>
        <SectionTitle
          title="1. SKU recuperado"
          subtitle="Toque no campo para ver os tipos ou digite para filtrar."
        />

        <SearchPicker
          options={(data?.tipos || []).map((item) => ({
            value: item.chave,
            label: item.nome,
          }))}
          value={typeKey}
          onChange={setTypeKey}
          placeholder="Escolher tipo do SKU..."
          hint={
            selectedType
              ? `R$ ${Number(selectedType.valor_unitario || 0).toFixed(2)} por caixa`
              : 'Escolha o tipo recuperado.'
          }
        />

        <Field
          label="Quantidade em caixas"
          value={quantity}
          onChangeText={(value) =>
            setQuantity(value.replace(/\D/g, '').slice(0, 6))
          }
          placeholder="1"
          keyboardType="number-pad"
        />

        {!!selectedType && (
          <Text style={{ color: colors.green, fontWeight: '900' }}>
            Total estimado: R$ {total.toFixed(2)}
          </Text>
        )}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <SectionTitle
          title="2. Evidência"
          subtitle="A foto é obrigatória."
        />
        <PhotoField value={photo} onChange={setPhoto} />
      </Card>

      <PrimaryButton
        title="✓ LANÇAR REPACK"
        onPress={submit}
        loading={sending}
        disabled={!selectedType}
      />
    </View>
  )
}
