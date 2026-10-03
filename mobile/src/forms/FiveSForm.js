import React, { useEffect, useState } from 'react'
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
  ErrorBox,
  Field,
  PrimaryButton,
  SectionTitle,
} from '../components/Ui'
import PhotoField from '../components/PhotoField'
import SearchPicker from '../components/SearchPicker'
import UserPicker from '../components/UserPicker'
import { colors } from '../theme'

export default function FiveSForm({ activity, onSuccess }) {
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState([])
  const [photos, setPhotos] = useState({})
  const [helpers, setHelpers] = useState([])
  const [observation, setObservation] = useState('')
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
      setError(err?.message || 'Não foi possível carregar o 5S.')
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    setError('')

    if (!selected.length) {
      setError('Selecione pelo menos uma área.')
      return
    }

    const missing = selected.find((key) => !photos[key]?.data)
    if (missing) {
      setError('Tire uma foto para cada área selecionada.')
      return
    }

    setSending(true)

    try {
      const response = await submitActivity(activity.rota, {
        ajudantes_usuario_ids: helpers,
        itens: selected.map((key) => ({
          opcao_chave: key,
          evidencia_foto: photos[key].data,
        })),
        observacao: observation,
      })

      onSuccess(response)
    } catch (err) {
      setError(err?.message || 'Não foi possível lançar o 5S.')
    } finally {
      setSending(false)
    }
  }

  return (
    <View>
      <ErrorBox message={error} />

      {loading ? (
        <Text style={styles.loading}>Carregando...</Text>
      ) : (
        <>
          <Card style={styles.block}>
            <SectionTitle
              title="1. Áreas executadas"
              subtitle="Pesquise e selecione somente as áreas que participaram deste 5S."
            />

            <SearchPicker
              options={(data?.opcoes || []).map((item) => ({
                value: item.chave,
                label: item.nome,
              }))}
              value={selected}
              onChange={setSelected}
              multiple
              placeholder="Pesquisar área..."
              hint="Digite parte do nome da área para localizar rapidamente."
            />
          </Card>

          {selected.length > 0 && (
            <Card style={styles.block}>
              <SectionTitle
                title="2. Evidências"
                subtitle="Uma foto por área selecionada."
              />

              {selected.map((key) => {
                const option = data?.opcoes?.find((item) => item.chave === key)

                return (
                  <PhotoField
                    key={key}
                    label={option?.nome || key}
                    value={photos[key]}
                    onChange={(photo) =>
                      setPhotos((current) => ({
                        ...current,
                        [key]: photo,
                      }))
                    }
                  />
                )
              })}
            </Card>
          )}

          <Card style={styles.block}>
            <SectionTitle
              title={selected.length > 0 ? '3. Participantes' : '2. Participantes'}
              subtitle="Você já entra automaticamente como principal."
            />

            <UserPicker
              users={data?.usuarios || []}
              selected={helpers}
              onChange={setHelpers}
              multiple
              label="Outros ajudantes"
            />

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
            title="✓ LANÇAR 5S"
            onPress={submit}
            loading={sending}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 12,
  },
  loading: {
    textAlign: 'center',
    color: colors.muted,
    paddingVertical: 30,
  },
})
