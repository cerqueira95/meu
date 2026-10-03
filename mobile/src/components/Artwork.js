import React from 'react'
import { Image } from 'react-native'

const icons = {
  activities: require('../../assets/brand/activities.png'),
  wallet: require('../../assets/brand/wallet.png'),
  '5s': require('../../assets/brand/5s.png'),
  amarracao: require('../../assets/brand/amarracao.png'),
  selo_vermelho: require('../../assets/brand/selo_vermelho.png'),
  separacao: require('../../assets/brand/separacao.png'),
  retorno_rota: require('../../assets/brand/retorno_rota.png'),
  integralizacao_devolucao: require('../../assets/brand/integralizacao_devolucao.png'),
  repack: require('../../assets/brand/repack.png'),
}

export function Artwork({ name, size = 64 }) {
  return <Image source={icons[name] || icons.activities} style={{ width: size, height: size }} resizeMode="contain" accessible={false} />
}

export function BrandMark({ size = 48 }) {
  return <Image source={require('../../assets/brand/icon.png')} style={{ width: size, height: size, borderRadius: size * 0.24 }} resizeMode="contain" accessible={false} />
}
