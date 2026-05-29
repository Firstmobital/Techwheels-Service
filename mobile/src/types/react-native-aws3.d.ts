declare module 'react-native-aws3' {
  export const RNS3: {
    put: (file: { uri: string; name: string; type: string }, options: unknown) => Promise<{ status: number; body?: unknown }>
  }
}
