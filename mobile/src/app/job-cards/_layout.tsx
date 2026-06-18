import { Stack } from 'expo-router'

export default function JobCardsLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: '#1a1b21',
        headerStyle: {
          backgroundColor: '#ffffff',
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: '#f4f2ec',
        },
      }}
    />
  )
}
