import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'warehouse_quick_access_token'

export function saveToken(token) {
  return SecureStore.setItemAsync(TOKEN_KEY, String(token || ''))
}

export function loadToken() {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export function removeToken() {
  return SecureStore.deleteItemAsync(TOKEN_KEY)
}
