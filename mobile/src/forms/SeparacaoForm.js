import React, { useEffect, useMemo, useState } from 'react'
import {
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
  Chip,
  ErrorBox,
  Field,
  PrimaryButton,
  SectionTitle,
} from '../components/Ui'
import PhotoField from '../components/PhotoField'
import UserPicker from '../components/UserPicker'
import { colors } from '../theme'

export default function SeparacaoForm({ activity, onSuccess }) {
  const [data, setData] = useState(null)
  const [typeKey, setTypeKey] = useState('')
  const [quantity, setQuantity] = useState('')
  const [mapa, setMapa] = useState('')
  const [placa, setPlaca] = useState('')
  const [helper, setHelper] = useState(0)
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
    try {
      const response = await loadActivity(activity.rota)
      setData(response)
      if (response?.tipos?.length === 1) {
        setTypeKey(response.tipos[0].chave)
      }
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar Separação.')
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    setError('')

    if (!selectedType) {
      setError('Escolha o tipo de separação.')
      return
    }

    if (selectedType.tipo_calculo === 'por_plt' && Number(quantity || 0) <= 0) {
      setError('Informe a quantidade de PLTs.')
      return
    }

    if (selectedType.exige_mapa && !mapa.trim()) {
      setError('Informe o número do mapa.')
      return
    }

    if (selectedType.exige_placa && !placa.trim()) {
      setError('Informe a placa do veículo.')
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
        ajudante_usuario_id: helper,
        numero_mapa: mapa,
        placa_veiculo: placa,
        quantidade_plt: Number(quantity || 0),
        evidencia_foto: photo.data,
      })

      onSuccess(response)
    } catch (err) {
      setError(err?.message || 'Não foi possível lançar Separação.')
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
          title="1. Tipo"
          subtitle="O formulário muda automaticamente conforme a atividade."
        />

        <View style={styles.chips}>
          {(data?.tipos || []).map((item) => (
            <Chip
              key={item.chave}
              label={item.nome}
              selected={typeKey === item.chave}
              onPress={() => {
                setTypeKey(item.chave)
                setQuantity('')
                setMapa('')
                setPlaca('')
              }}
            />
          ))}
        </View>
      </Card>

      {!!selectedType && (
        <Card style={{ marginBottom: 12 }}>
          <SectionTitle
            title="2. Dados do lançamento"
            subtitle={
              selectedType.valor_unitario !== undefined
                ? `Valor unitário: R$ ${Number(selectedType.valor_unitario || 0).toFixed(2)}`
                : ''
            }
          />

          {selectedType.tipo_calculo === 'por_plt' && (
            <Field
              label="Quantidade de PLTs"
              value={quantity}
              onChangeText={(value) =>
                setQuantity(value.replace(/\D/g, '').slice(0, 5))
              }
              placeholder="0"
              keyboardType="number-pad"
            />
          )}

          {selectedType.exige_mapa && (
            <Field
              label="Número do mapa"
              value={mapa}
              onChangeText={setMapa}
              placeholder="Informe o mapa"
              autoCapitalize="characters"
            />
          )}

          {selectedType.exige_placa && (
            <Field
              label="Placa do veículo"
              value={placa}
              onChangeText={setPlaca}
              placeholder="ABC1D23"
              autoCapitalize="characters"
              maxLength={10}
            />
          )}

          <UserPicker
            users={data?.usuarios || []}
            selected={helper}
            onChange={setHelper}
            label="Segundo ajudante"
          />

          <PhotoField value={photo} onChange={setPhoto} />
        </Card>
      )}

      <PrimaryButton
        title="✓ LANÇAR SEPARAÇÃO"
        onPress={submit}
        loading={sending}
        disabled={!selectedType}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})
