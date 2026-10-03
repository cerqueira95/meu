import React from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { colors, radius } from '../theme'

export function Screen({
  children,
  scroll = true,
  contentStyle,
}) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.screenContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, { flex: 1 }, contentStyle]}>
      {children}
    </View>
  )

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function Header({
  title,
  subtitle,
  onBack,
  right,
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        {onBack ? (
          <Pressable style={styles.headerBack} onPress={onBack}>
            <Text style={styles.headerBackText}>‹</Text>
          </Pressable>
        ) : (
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>W</Text>
          </View>
        )}
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
        </View>
        {right || <View style={{ width: 42 }} />}
      </View>
    </View>
  )
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  secureTextEntry = false,
  autoCapitalize = 'sentences',
  multiline = false,
  maxLength,
}) {
  return (
    <View style={styles.fieldWrap}>
      {!!label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9FB3C8"
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        maxLength={maxLength}
      />
    </View>
  )
}

export function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  tone = 'green',
}) {
  const background =
    tone === 'red' ? colors.red : tone === 'blue' ? colors.blue : colors.green

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: background },
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading && { opacity: 0.88 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.primaryButtonText}>{title}</Text>
      )}
    </Pressable>
  )
}

export function SecondaryButton({
  title,
  onPress,
  tone = 'default',
  compact = false,
}) {
  const danger = tone === 'danger'

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        compact && styles.secondaryCompact,
        danger && { borderColor: '#F3B6B6', backgroundColor: colors.redSoft },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text
        style={[
          styles.secondaryButtonText,
          danger && { color: colors.red },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  )
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function SectionTitle({ title, subtitle }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  )
}

export function Chip({
  label,
  selected,
  onPress,
  disabled = false,
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        disabled && { opacity: 0.5 },
        pressed && !disabled && { opacity: 0.8 },
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  )
}

export function ErrorBox({ message }) {
  if (!message) return null

  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  )
}

export function SuccessBox({ title, message }) {
  return (
    <View style={styles.successBox}>
      <View style={styles.successIcon}>
        <Text style={styles.successIconText}>✓</Text>
      </View>
      <Text style={styles.successTitle}>{title}</Text>
      {!!message && <Text style={styles.successText}>{message}</Text>}
    </View>
  )
}

export function PhotoPreview({ uri }) {
  if (!uri) return null
  return <Image source={{ uri }} style={styles.photoPreview} />
}

export const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenContent: {
    padding: 18,
    paddingBottom: 36,
  },
  header: {
    marginBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  logoMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMarkText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '900',
  },
  headerBack: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackText: {
    color: colors.navy,
    fontSize: 34,
    lineHeight: 34,
    marginTop: -3,
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 13,
  },
  fieldWrap: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.input,
    paddingHorizontal: 15,
    color: colors.text,
    fontSize: 16,
  },
  inputMultiline: {
    minHeight: 104,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  secondaryButton: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryCompact: {
    minHeight: 42,
  },
  secondaryButtonText: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.muted,
    marginTop: 3,
    lineHeight: 19,
  },
  chip: {
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: {
    backgroundColor: colors.blueSoft,
    borderColor: '#9BC2E8',
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: colors.blue,
  },
  errorBox: {
    padding: 13,
    borderRadius: 14,
    backgroundColor: colors.redSoft,
    borderWidth: 1,
    borderColor: '#F5C2C2',
    marginBottom: 14,
  },
  errorText: {
    color: colors.red,
    fontWeight: '700',
    lineHeight: 19,
  },
  successBox: {
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIconText: {
    color: colors.green,
    fontSize: 40,
    fontWeight: '900',
  },
  successTitle: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
    textAlign: 'center',
  },
  successText: {
    color: colors.muted,
    marginTop: 8,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: '#E9EFF5',
    marginBottom: 10,
  },
})
