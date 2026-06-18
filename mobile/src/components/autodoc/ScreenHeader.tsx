import React from 'react'
import { Text, TouchableOpacity, View, type ReactNode } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Icon } from '../ui/Icon'

export interface ScreenHeaderProps {
  title: string
  eyebrow?: string
  onBack?: () => void
  rightNode?: ReactNode
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, eyebrow, onBack, rightNode }) => {
  return (
    <SafeAreaView
      edges={['top']}
      style={{
        backgroundColor: '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: '#e7e3d9',
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <TouchableOpacity
              onPress={onBack}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#d9d4c7',
                backgroundColor: '#ffffff',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Icon name="chevron-left" size={18} color="#1a1b21" />
            </TouchableOpacity>

            <View style={{ flexShrink: 1 }}>
              {eyebrow ? (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: '#82858f',
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    marginBottom: 2,
                  }}
                >
                  {eyebrow}
                </Text>
              ) : null}
              <Text style={{ fontSize: 19, fontWeight: '700', color: '#1a1b21' }} numberOfLines={1}>
                {title}
              </Text>
            </View>
          </View>

          {rightNode ? <View>{rightNode}</View> : null}
        </View>
      </View>
    </SafeAreaView>
  )
}

export default ScreenHeader