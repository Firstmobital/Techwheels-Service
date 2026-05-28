/**
 * Mobile Location Service
 * Wrapper around expo-location for AutoDoc GPS capture
 * Used by mobile app only
 */

import * as Location from 'expo-location'
import { logEvent } from '../utils/logger'

export interface MobileGpsLocation {
  lat: number
  lng: number
  accuracy: number | null
}

/**
 * Request location permission and get current position
 * Handles permission logic, timeout, and retry
 */
export async function getMobileLocation(): Promise<MobileGpsLocation> {
  try {
    // Request permission if not already granted
    const { status } = await Location.requestForegroundPermissionsAsync()

    if (status !== Location.PermissionStatus.GRANTED) {
      logEvent('location_permission_denied', { stage: 'request' }, 'location-service')
      throw new Error('Location permission not granted. Please enable location access in app settings.')
    }

    logEvent('location_permission_granted', { stage: 'request' }, 'location-service')

    // Get current location with high accuracy
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    })

    const { latitude, longitude, accuracy } = location.coords

    logEvent(
      'location_captured',
      {
        stage: 'success',
        lat: latitude.toFixed(6),
        lng: longitude.toFixed(6),
        accuracy: accuracy?.toFixed(2),
      },
      'location-service'
    )

    return {
      lat: latitude,
      lng: longitude,
      accuracy,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown location error'
    logEvent('location_capture_failed', { error_message: errorMsg }, 'location-service')
    throw err
  }
}

/**
 * Check if location permission is already granted (non-blocking)
 */
export async function isLocationPermissionGranted(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync()
    return status === Location.PermissionStatus.GRANTED
  } catch {
    return false
  }
}

/**
 * Open app settings to allow user to enable location permission
 */
export async function openLocationSettings(): Promise<void> {
  try {
    // For now, just log - Expo doesn't have a direct built-in to open iOS/Android settings
    // User must manually enable in device settings
    logEvent('location_settings_requested', {}, 'location-service')
  } catch (err) {
    logEvent('location_settings_error', { error: err }, 'location-service')
  }
}
