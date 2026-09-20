declare module 'expo-sharing' {
  export interface SharingOptions {
    mimeType?: string
    dialogTitle?: string
    UTI?: string
  }
  export function isAvailableAsync(): Promise<boolean>
  export function shareAsync(url: string, options?: SharingOptions): Promise<void>
}

declare module 'expo-splash-screen' {
  export function preventAutoHideAsync(): Promise<boolean>
  export function hideAsync(): Promise<boolean>
  export function hide(): void
  export function setOptions(options: any): void
}

declare module '*.css' {
  const content: any
  export default content
}

