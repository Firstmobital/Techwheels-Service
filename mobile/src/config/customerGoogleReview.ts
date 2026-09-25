import { Linking } from 'react-native'

/** Same default as `wa_agent_config.google_review_link` (post-service feedback). */
export const GOOGLE_BUSINESS_REVIEW_URL = 'https://g.page/r/CU9vMfH6HydcEBM/review'

export async function openGoogleBusinessReview(): Promise<boolean> {
  try {
    await Linking.openURL(GOOGLE_BUSINESS_REVIEW_URL)
    return true
  } catch {
    try {
      const supported = await Linking.canOpenURL(GOOGLE_BUSINESS_REVIEW_URL)
      if (!supported) return false
      await Linking.openURL(GOOGLE_BUSINESS_REVIEW_URL)
      return true
    } catch {
      return false
    }
  }
}
