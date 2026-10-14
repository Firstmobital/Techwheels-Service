import { Component, type ErrorInfo, type ReactNode } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type Props = {
  children: ReactNode
  screenName: string
  onRetry?: () => void
}

type State = { error: Error | null }

/** Catches render crashes so staff screens show retry UI instead of a white screen. */
export class StaffRenderErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.screenName}] render crash`, error, info.componentStack)
  }

  private retry = () => {
    this.setState({ error: null })
    this.props.onRetry?.()
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={styles.root}>
          <View style={styles.box}>
            <Text style={styles.title}>{this.props.screenName} could not open</Text>
            <Text style={styles.msg} numberOfLines={4}>
              {this.state.error.message || 'Something went wrong while showing this screen.'}
            </Text>
            <TouchableOpacity style={styles.btn} onPress={this.retry}>
              <Text style={styles.btnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )
    }
    return this.props.children
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f2ec', justifyContent: 'center', padding: 20 },
  box: { backgroundColor: '#fff', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#e7e3d9' },
  title: { fontSize: 17, fontWeight: '800', color: '#1a1b21', marginBottom: 8 },
  msg: { fontSize: 13, color: '#4b4e59', marginBottom: 16 },
  btn: { backgroundColor: '#2a4cd0', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
