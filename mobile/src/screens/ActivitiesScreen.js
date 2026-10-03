import React, { useEffect, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { loadActivityCatalog } from '../api'
import {
  ErrorBox,
  Header,
  Screen,
} from '../components/Ui'
import { colors, radius } from '../theme'

const META = {
  '5s': { code: '5S', accent: '#0F766E' },
  amarracao: { code: 'AM', accent: '#9A3412' },
  selo_vermelho: { code: 'SV', accent: '#B91C1C' },
  separacao: { code: 'SP', accent: '#1D4ED8' },
}

export default function ActivitiesScreen({
  onBack,
  onOpenActivity,
}) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    setError('')

    try {
      const data = await loadActivityCatalog()
      setActivities(data?.atividades || [])
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar as atividades.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <Header
        title="Atividades"
        subtitle="Escolha o que você vai lançar"
        onBack={onBack}
      />

      <ErrorBox message={error} />

      {loading && (
        <Text style={styles.loading}>Carregando atividades...</Text>
      )}

      {!loading && activities.length === 0 && !error && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nenhuma atividade disponível</Text>
          <Text style={styles.emptyText}>
            Verifique seu perfil ou as configurações do Warehouse Web.
          </Text>
        </View>
      )}

      <View style={styles.grid}>
        {activities.map((item) => {
          const meta = META[item.chave] || {
            code: 'AT',
            accent: colors.navy,
          }

          return (
            <Pressable
              key={item.chave}
              onPress={() => onOpenActivity(item)}
              style={({ pressed }) => [
                styles.card,
                pressed && { opacity: 0.82 },
              ]}
            >
              <View
                style={[
                  styles.icon,
                  { backgroundColor: meta.accent },
                ]}
              >
                <Text style={styles.iconText}>{meta.code}</Text>
              </View>

              <Text style={styles.title}>{item.nome}</Text>
              <Text style={styles.description}>{item.descricao}</Text>

              <View style={styles.footer}>
                {Number.isFinite(Number(item.valor_unitario)) &&
                item.valor_unitario !== undefined ? (
                  <Text style={styles.value}>
                    R$ {Number(item.valor_unitario || 0).toFixed(2)}
                  </Text>
                ) : (
                  <Text style={styles.valueMuted}>
                    {item.tipos_ativos || ''} tipos
                  </Text>
                )}
                <Text style={styles.open}>ABRIR →</Text>
              </View>
            </Pressable>
          )
        })}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  loading: {
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 30,
  },
  empty: {
    padding: 24,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.muted,
    marginTop: 5,
    lineHeight: 19,
  },
  grid: {
    gap: 12,
  },
  card: {
    minHeight: 168,
    padding: 17,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  iconText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '900',
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  description: {
    color: colors.muted,
    marginTop: 4,
    lineHeight: 18,
    fontSize: 13,
    flex: 1,
  },
  footer: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: {
    color: colors.green,
    fontWeight: '900',
  },
  valueMuted: {
    color: colors.muted,
    fontWeight: '800',
  },
  open: {
    color: colors.blue,
    fontWeight: '900',
    fontSize: 12,
  },
})
