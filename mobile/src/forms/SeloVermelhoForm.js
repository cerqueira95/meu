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
  SecondaryButton,
  SectionTitle,
} from '../components/Ui'
import PhotoField from '../components/PhotoField'
import SearchPicker from '../components/SearchPicker'
import { colors } from '../theme'

const EMPTY_ITEM = {
  embalagem: '',
  quantidade_plts: '',
  motivo_anomalia: '',
  motivo_outros: '',
}

export default function SeloVermelhoForm({ activity, onSuccess }) {
  const [data, setData] = useState(null)
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [photo, setPhoto] = useState(null)
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
      setError(err?.message || 'Não foi possível carregar Selo Vermelho.')
    } finally {
      setLoading(false)
    }
  }

  function updateItem(index, patch) {
    setItems((current) =>
      current.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    )
  }

  function removeItem(index) {
    setItems((current) => current.filter((_, position) => position !== index))
  }

  function addItem() {
    if (items.length < 20) {
      setItems((current) => [...current, { ...EMPTY_ITEM }])
    }
  }

  async function submit() {
    setError('')

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]

      if (!item.embalagem) {
        setError(`Selecione a embalagem do item ${i + 1}.`)
        return
      }

      if (Number(item.quantidade_plts || 0) <= 0) {
        setError(`Informe os PLTs do item ${i + 1}.`)
        return
      }

      if (!item.motivo_anomalia) {
        setError(`Selecione o motivo do item ${i + 1}.`)
        return
      }

      if (item.motivo_anomalia === 'OUTROS' && !item.motivo_outros.trim()) {
        setError(`Descreva o motivo do item ${i + 1}.`)
        return
      }
    }

    if (!photo?.data) {
      setError('Tire uma foto da evidência.')
      return
    }

    setSending(true)

    try {
      const response = await submitActivity(activity.rota, {
        itens: items.map((item) => ({
          ...item,
          quantidade_plts: Number(item.quantidade_plts || 0),
        })),
        evidencia_foto: photo.data,
      })

      onSuccess(response)
    } catch (err) {
      setError(err?.message || 'Não foi possível lançar Selo Vermelho.')
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

      {items.map((item, index) => (
        <Card key={index} style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemTitle}>Item {index + 1}</Text>
            {items.length > 1 && (
              <Pressable onPress={() => removeItem(index)}>
                <Text style={styles.remove}>REMOVER</Text>
              </Pressable>
            )}
          </View>

          <SearchPicker
            label="Embalagem"
            options={(data?.embalagens || []).map((value) => ({
              value,
              label: value,
            }))}
            value={item.embalagem}
            onChange={(value) => updateItem(index, { embalagem: value })}
            placeholder="Pesquisar embalagem..."
            hint="Digite para localizar e selecionar."
          />

          <Field
            label="Quantidade de PLTs"
            value={String(item.quantidade_plts)}
            onChangeText={(value) =>
              updateItem(index, {
                quantidade_plts: value.replace(/\D/g, '').slice(0, 5),
              })
            }
            placeholder="0"
            keyboardType="number-pad"
          />

          <SearchPicker
            label="Motivo da anomalia"
            options={(data?.motivos || []).map((value) => ({
              value,
              label: value,
            }))}
            value={item.motivo_anomalia}
            onChange={(value) =>
              updateItem(index, {
                motivo_anomalia: value,
                motivo_outros:
                  value === 'OUTROS' ? item.motivo_outros : '',
              })
            }
            placeholder="Pesquisar motivo..."
            hint="Digite para localizar e selecionar."
          />

          {item.motivo_anomalia === 'OUTROS' && (
            <Field
              label="Descreva o motivo"
              value={item.motivo_outros}
              onChangeText={(value) =>
                updateItem(index, { motivo_outros: value })
              }
              placeholder="Informe a anomalia"
              multiline
              maxLength={1200}
            />
          )}
        </Card>
      ))}

      <View style={{ marginBottom: 12 }}>
        <SecondaryButton
          title="+ ADICIONAR ITEM"
          onPress={addItem}
        />
      </View>

      <Card style={{ marginBottom: 12 }}>
        <SectionTitle
          title="Evidência"
          subtitle="Uma foto geral do retrabalho."
        />
        <PhotoField value={photo} onChange={setPhoto} />
      </Card>

      <PrimaryButton
        title="✓ LANÇAR SELO VERMELHO"
        onPress={submit}
        loading={sending}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  itemCard: {
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  remove: {
    color: colors.red,
    fontSize: 11,
    fontWeight: '900',
  },
})
