export type DamagePhotoSlot = {
  id: string
  title: string
  instruction: string
  filePrefix: string
}

/** PRD §6.5 — guided customer damage photos (stored via upload broker as kind photo). */
export const DAMAGE_PHOTO_SLOTS: DamagePhotoSlot[] = [
  { id: 'photo_front', title: 'Front view', instruction: 'Full front of vehicle.', filePrefix: 'damage_front' },
  { id: 'photo_rear', title: 'Rear view', instruction: 'Full rear of vehicle.', filePrefix: 'damage_rear' },
  { id: 'photo_left', title: 'Left side', instruction: 'Full left profile.', filePrefix: 'damage_left' },
  { id: 'photo_right', title: 'Right side', instruction: 'Full right profile.', filePrefix: 'damage_right' },
  { id: 'photo_closeup', title: 'Damage close-up', instruction: 'Clear close photograph of damaged area.', filePrefix: 'damage_closeup' },
]

export function matchPhotoToSlot(fileName?: string | null): string | null {
  const name = String(fileName || '').toLowerCase()
  for (const slot of DAMAGE_PHOTO_SLOTS) {
    if (name.includes(slot.filePrefix)) return slot.id
  }
  return null
}
