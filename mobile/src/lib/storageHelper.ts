import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

export const safeStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return await AsyncStorage.getItem(key)
      }
      return await SecureStore.getItemAsync(key)
    } catch {
      try {
        return await AsyncStorage.getItem(key)
      } catch {
        return null
      }
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.setItem(key, value)
        return
      }
      await SecureStore.setItemAsync(key, value)
    } catch {
      try {
        await AsyncStorage.setItem(key, value)
      } catch {
        // Ignore
      }
    }
  },
  async deleteItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.removeItem(key)
        return
      }
      await SecureStore.deleteItemAsync(key)
    } catch {
      try {
        await AsyncStorage.removeItem(key)
      } catch {
        // Ignore
      }
    }
  },
}
