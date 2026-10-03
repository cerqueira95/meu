import * as ImagePicker from 'expo-image-picker'
import {
  manipulateAsync,
  SaveFormat,
} from 'expo-image-manipulator'

async function compress(uri, width, quality) {
  return manipulateAsync(
    uri,
    [{ resize: { width } }],
    {
      compress: quality,
      format: SaveFormat.JPEG,
      base64: true,
    },
  )
}

async function normalizePhoto(asset) {
  let result = await compress(asset.uri, 1080, 0.42)
  let data = result.base64 ? `data:image/jpeg;base64,${result.base64}` : ''

  if (data.length > 880000) {
    result = await compress(asset.uri, 760, 0.3)
    data = result.base64 ? `data:image/jpeg;base64,${result.base64}` : ''
  }

  if (!data || data.length > 900000) {
    throw new Error(
      'A foto ficou muito grande. Tente novamente mais perto da evidência.',
    )
  }

  return {
    uri: result.uri,
    data,
  }
}

export async function takeEvidencePhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync()

  if (!permission.granted) {
    throw new Error('Autorize o acesso à câmera para registrar a evidência.')
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.7,
  })

  if (result.canceled || !result.assets?.[0]) {
    return null
  }

  return normalizePhoto(result.assets[0])
}

export async function pickEvidencePhoto() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.7,
  })

  if (result.canceled || !result.assets?.[0]) {
    return null
  }

  return normalizePhoto(result.assets[0])
}
