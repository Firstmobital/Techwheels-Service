import * as SecureStore from 'expo-secure-store'

const AUTH_TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const USER_ID_KEY = 'user_id'

export const secureStorage = {
  async saveAuthToken(token: string) {
    try {
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token)
    } catch (error) {
      console.error('Failed to save auth token:', error)
    }
  },

  async getAuthToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(AUTH_TOKEN_KEY)
    } catch (error) {
      console.error('Failed to get auth token:', error)
      return null
    }
  },

  async saveRefreshToken(token: string) {
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token)
    } catch (error) {
      console.error('Failed to save refresh token:', error)
    }
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
    } catch (error) {
      console.error('Failed to get refresh token:', error)
      return null
    }
  },

  async saveUserId(userId: string) {
    try {
      await SecureStore.setItemAsync(USER_ID_KEY, userId)
    } catch (error) {
      console.error('Failed to save user ID:', error)
    }
  },

  async getUserId(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(USER_ID_KEY)
    } catch (error) {
      console.error('Failed to get user ID:', error)
      return null
    }
  },

  async clearAuthData() {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(AUTH_TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.deleteItemAsync(USER_ID_KEY),
      ])
    } catch (error) {
      console.error('Failed to clear auth data:', error)
    }
  },
}
