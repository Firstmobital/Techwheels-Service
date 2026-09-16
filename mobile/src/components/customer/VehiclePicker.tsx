import { Text, TouchableOpacity, View } from 'react-native'
import type { CustomerVehicle } from '../../lib/api/customerAuth'

export function VehiclePicker({
  vehicles,
  selectedReg,
  onSelect,
}: {
  vehicles: CustomerVehicle[]
  selectedReg: string | null
  onSelect: (reg: string) => void
}) {
  if (vehicles.length <= 1) return null

  return (
    <View className="mb-4">
      <Text className="text-slate-500 text-xs font-semibold uppercase mb-2">Your vehicles</Text>
      <View className="flex-row flex-wrap gap-2">
        {vehicles.map((vehicle) => {
          const selected = vehicle.reg_number === selectedReg
          return (
            <TouchableOpacity
              key={vehicle.reg_number}
              onPress={() => onSelect(vehicle.reg_number)}
              className={`px-3 py-2 rounded-full border ${
                selected ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'
              }`}
            >
              <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-slate-700'}`}>
                {vehicle.reg_number}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}
