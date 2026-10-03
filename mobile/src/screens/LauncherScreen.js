import React from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  Header,
  Screen,
  SecondaryButton,
} from '../components/Ui'
import { colors, radius } from '../theme'

function firstName(name) {
  return String(name || 'Usuário').trim().split(/\s+/)[0]
}

export default function LauncherScreen({
  user,
  onOpenActivities,
  onLogout,
}) {
  return (
    <Screen>
      <Header
        title="Warehouse"
        subtitle="Launcher operacional"
        right={
          <Pressable style={styles.avatar}>
            <Text style={styles.avatarText}>
              {firstName(user?.nome).slice(0, 1).toUpperCase()}
            </Text>
          </Pressable>
        }
      />

      <View style={styles.welcome}>
        <Text style={styles.hello}>Olá, {firstName(user?.nome)}</Text>
        <Text style={styles.meta}>
          {user?.turno ? `Turno ${user.turno} • ` : ''}
          {user?.perfil || 'Operação'}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>MÓDULOS</Text>

      <Pressable
        onPress={onOpenActivities}
        style={({ pressed }) => [
          styles.moduleCard,
          pressed && { transform: [{ scale: 0.985 }] },
        ]}
      >
        <View style={styles.moduleIcon}>
          <Text style={styles.moduleIconText}>AT</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.moduleTitle}>Atividades</Text>
          <Text style={styles.moduleDescription}>
            Lançamentos rápidos com evidência e aprovação.
          </Text>
        </View>

        <Text style={styles.arrow}>›</Text>
      </Pressable>

      <View style={styles.tip}>
        <Text style={styles.tipTitle}>Feito para a operação</Text>
        <Text style={styles.tipText}>
          O app mostra somente ações de campo. Gestão, relatórios e aprovações
          continuam na versão Web.
        </Text>
      </View>

      <View style={{ marginTop: 22 }}>
        <SecondaryButton title="Sair deste aparelho" onPress={onLogout} tone="danger" />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.blue,
    fontSize: 18,
    fontWeight: '900',
  },
  welcome: {
    marginBottom: 26,
  },
  hello: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  meta: {
    color: colors.muted,
    marginTop: 4,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 10,
  },
  moduleCard: {
    minHeight: 112,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
  },
  moduleIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  moduleIconText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
  },
  moduleTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  moduleDescription: {
    color: colors.muted,
    marginTop: 4,
    lineHeight: 18,
    fontSize: 13,
  },
  arrow: {
    color: colors.muted,
    fontSize: 34,
    marginLeft: 8,
  },
  tip: {
    marginTop: 18,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.blueSoft,
  },
  tipTitle: {
    color: colors.blue,
    fontWeight: '900',
  },
  tipText: {
    color: colors.navySoft,
    marginTop: 5,
    lineHeight: 19,
    fontSize: 13,
  },
})
