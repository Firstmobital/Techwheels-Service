import { Stack } from 'expo-router'

export default function HelpTicketsLayout() {
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
          backgroundColor: '#f8fafc',
        },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My tickets' }} />
      <Stack.Screen name="new" options={{ title: 'Raise a ticket' }} />
      <Stack.Screen name="[ticketId]" options={{ title: 'Ticket' }} />
    </Stack>
  )
}
