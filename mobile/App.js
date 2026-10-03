import React, { useEffect, useState } from 'react'
import * as SplashScreen from 'expo-splash-screen'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  clearAuthToken,
  loadMe,
  login,
  setAuthToken,
} from './src/api'
import {
  loadToken,
  removeToken,
  saveToken,
} from './src/storage'
import LoginScreen from './src/screens/LoginScreen'
import LauncherScreen from './src/screens/LauncherScreen'
import ActivitiesScreen from './src/screens/ActivitiesScreen'
import ActivityScreen from './src/screens/ActivityScreen'
import WalletScreen from './src/screens/WalletScreen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { colors } from './src/theme'

SplashScreen.setOptions({
  duration: 450,
  fade: true,
})

function AppContent() {
  const [booting, setBooting] = useState(true)
  const [user, setUser] = useState(null)
  const [screen, setScreen] = useState({ name: 'launcher' })

  useEffect(() => {
    bootstrap()
  }, [])

  async function bootstrap() {
    try {
      const token = await loadToken()

      if (!token) {
        return
      }

      setAuthToken(token)
      const response = await loadMe()
      setUser(response?.usuario || null)
    } catch {
      await removeToken()
      clearAuthToken()
    } finally {
      setBooting(false)
    }
  }

  async function handleLogin(cpf, senha) {
    const response = await login(cpf, senha)
    const token = response?.quickAccess?.token

    if (!token) {
      throw new Error('O servidor não retornou o acesso do aplicativo.')
    }

    await saveToken(token)
    setAuthToken(token)
    setUser(response.usuario)
    setScreen({ name: 'launcher' })
  }

  async function handleLogout() {
    await removeToken()
    clearAuthToken()
    setUser(null)
    setScreen({ name: 'launcher' })
  }

  if (booting) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={styles.bootText}>Abrindo Warehouse...</Text>
      </View>
    )
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />
  }

  if (screen.name === 'activities') {
    return (
      <ActivitiesScreen
        onBack={() => setScreen({ name: 'launcher' })}
        onOpenActivity={(activity) =>
          setScreen({ name: 'activity', activity })
        }
      />
    )
  }

  if (screen.name === 'activity') {
    return (
      <ActivityScreen
        activity={screen.activity}
        onBack={() => setScreen({ name: 'activities' })}
      />
    )
  }

  if (screen.name === 'wallet') {
    return (
      <WalletScreen
        onBack={() => setScreen({ name: 'launcher' })}
      />
    )
  }

  return (
    <LauncherScreen
      user={user}
      onOpenActivities={() => setScreen({ name: 'activities' })}
      onOpenWallet={() => setScreen({ name: 'wallet' })}
      onLogout={handleLogout}
    />
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootText: {
    color: colors.muted,
    marginTop: 12,
    fontWeight: '700',
  },
})
