import { Stack } from 'expo-router'
import { ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router'
import { useColorScheme } from 'react-native'
import { AuthProvider } from '@/context/AuthContext'

export default function RootLayout() {
  const colorScheme = useColorScheme()

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <Stack>
          <Stack.Screen
            name="(auth)"
            options={{
              headerShown: false,
              animationEnabled: true,
            }}
          />
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
              animationEnabled: true,
            }}
          />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  )
}
