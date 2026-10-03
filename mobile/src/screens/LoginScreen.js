import { BrandMark } from '../components/Artwork'
import React, { useState } from 'react'
import {
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  ErrorBox,
  Field,
  PrimaryButton,
  Screen,
} from '../components/Ui'
import { colors, radius } from '../theme'

function digits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11)
}

function maskCpf(value) {
  const d = digits(value)

  if (d.length <= 3) return d
  if (d.length <= 6) return d.replace(/(\d{3})(\d+)/, '$1.$2')
  if (d.length <= 9) return d.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3')
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
}

export default function LoginScreen({ onLogin }) {
  const [cpf, setCpf] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')

    if (digits(cpf).length !== 11 || !senha) {
      setError('Informe seu CPF completo e sua senha.')
      return
    }

    setLoading(true)

    try {
      await onLogin(digits(cpf), senha)
    } catch (err) {
      setError(err?.message || 'Não foi possível entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <Image source={require('../../assets/brand/login-hero.png')} style={styles.hero} resizeMode="cover" accessible={false} />
      <View style={styles.brand}>
        <BrandMark size={84} />
        <Text style={styles.title}>Warehouse</Text>
        <Text style={styles.subtitle}>Operação na palma da mão</Text>
      </View>

      <View style={styles.loginCard}>
        <Text style={styles.loginTitle}>Entrar</Text>
        <Text style={styles.loginHint}>
          Use o mesmo CPF e senha do Warehouse Web.
        </Text>

        <ErrorBox message={error} />

        <Field
          label="CPF"
          value={cpf}
          onChangeText={(value) => setCpf(maskCpf(value))}
          placeholder="000.000.000-00"
          keyboardType="number-pad"
          autoCapitalize="none"
          maxLength={14}
        />

        <Field
          label="Senha"
          value={senha}
          onChangeText={setSenha}
          placeholder="Sua senha"
          secureTextEntry
          autoCapitalize="none"
        />

        <PrimaryButton
          title="ENTRAR"
          onPress={submit}
          loading={loading}
          tone="blue"
        />
      </View>

      <Text style={styles.server}>
        Servidor oficial do Warehouse
      </Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 16,
  },
  hero: {
    width: '100%',
    height: 150,
    borderRadius: radius.lg,
    marginBottom: 18,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 22,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    marginTop: 8,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 14,
  },
  loginCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  loginTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  loginHint: {
    color: colors.muted,
    marginTop: 4,
    marginBottom: 18,
    lineHeight: 19,
  },
  server: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    marginTop: 20,
  },
})
