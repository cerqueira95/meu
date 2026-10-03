import { Artwork } from '../components/Artwork'
import React, { useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  Header,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SuccessBox,
} from '../components/Ui'
import FiveSForm from '../forms/FiveSForm'
import AmarracaoForm from '../forms/AmarracaoForm'
import SeloVermelhoForm from '../forms/SeloVermelhoForm'
import SeparacaoForm from '../forms/SeparacaoForm'
import RetornoRotaForm from '../forms/RetornoRotaForm'
import IntegralizacaoDevolucaoForm from '../forms/IntegralizacaoDevolucaoForm'
import RepackForm from '../forms/RepackForm'
import { colors, radius } from '../theme'

const COMPONENTS = {
  '5s': FiveSForm,
  amarracao: AmarracaoForm,
  selo_vermelho: SeloVermelhoForm,
  separacao: SeparacaoForm,
  retorno_rota: RetornoRotaForm,
  integralizacao_devolucao: IntegralizacaoDevolucaoForm,
  repack: RepackForm,
}

export default function ActivityScreen({
  activity,
  onBack,
}) {
  const [success, setSuccess] = useState(null)
  const [formKey, setFormKey] = useState(1)
  const Form = COMPONENTS[activity?.chave]

  function newLaunch() {
    setSuccess(null)
    setFormKey((value) => value + 1)
  }

  return (
    <Screen>
      <Header
        title={activity?.nome || 'Atividade'}
        subtitle="Lançamento operacional"
        onBack={onBack}
        right={<Artwork name={activity?.chave} size={48} />}
      />

      {success ? (
        <View style={styles.successCard}>
          <SuccessBox
            title="Atividade lançada!"
            message={success?.message || 'O lançamento foi enviado para aprovação.'}
          />

          <PrimaryButton
            title="✓ LANÇAR OUTRA"
            onPress={newLaunch}
          />

          <View style={{ height: 10 }} />

          <SecondaryButton
            title="VOLTAR ÀS ATIVIDADES"
            onPress={onBack}
          />
        </View>
      ) : Form ? (
        <Form
          key={formKey}
          activity={activity}
          onSuccess={setSuccess}
        />
      ) : (
        <View style={styles.successCard}>
          <Text style={styles.noForm}>
            Esta atividade ainda não possui formulário no aplicativo.
          </Text>
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  successCard: {
    padding: 18,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  noForm: {
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
})
