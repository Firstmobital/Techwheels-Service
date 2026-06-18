/**
 * Icon Wrapper Component
 * 
 * Centralized line icon system using lucide-react-native.
 * Replaces emoji usage and provides consistent iconography across the app.
 * 
 * Reference: design-refactor-bundle IMPLEMENTATION_PLAN.md guardrail #2
 * "Standardize iconography via a single line-icon wrapper; remove emoji icon usage."
 */

import React, { useMemo } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Calendar,
  Camera,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  CloudUpload,
  Code,
  Copy,
  Download,
  Edit,
  Eye,
  EyeOff,
  File,
  FileImage,
  FileText,
  Filter,
  Flag,
  FolderOpen,
  Grid,
  Heart,
  Home,
  Image,
  Info,
  List,
  Lock,
  LogOut,
  Map,
  MapPin,
  Menu,
  MessageSquare,
  Minus,
  MoreHorizontal,
  MoreVertical,
  Navigation,
  Package,
  Paperclip,
  PauseCircle,
  Phone,
  Plus,
  PlusCircle,
  Printer,
  RotateCw,
  Save,
  Search,
  Send,
  Settings,
  Share2,
  ShoppingCart,
  Sliders,
  Smartphone,
  Square,
  Star,
  Trash2,
  Truck,
  User,
  Users,
  Video,
  Wand2,
  Wifi,
  WifiOff,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
  type LucideProps,
} from 'lucide-react-native'

export type IconName =
  | 'alert-circle'
  | 'arrow-down'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'bell'
  | 'calendar'
  | 'camera'
  | 'check'
  | 'check-circle'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'clock'
  | 'cloud-upload'
  | 'code'
  | 'copy'
  | 'download'
  | 'edit'
  | 'eye'
  | 'eye-off'
  | 'file'
  | 'file-image'
  | 'file-text'
  | 'filter'
  | 'flag'
  | 'folder-open'
  | 'grid'
  | 'heart'
  | 'home'
  | 'image'
  | 'info'
  | 'list'
  | 'lock'
  | 'log-out'
  | 'map'
  | 'map-pin'
  | 'menu'
  | 'message-square'
  | 'minus'
  | 'more-horizontal'
  | 'more-vertical'
  | 'navigation'
  | 'package'
  | 'paperclip'
  | 'pause-circle'
  | 'phone'
  | 'presentation'
  | 'plus'
  | 'plus-circle'
  | 'printer'
  | 'rotate-cw'
  | 'save'
  | 'search'
  | 'send'
  | 'settings'
  | 'shield-check'
  | 'share-2'
  | 'shopping-cart'
  | 'sliders'
  | 'smartphone'
  | 'square'
  | 'star'
  | 'trash-2'
  | 'truck'
  | 'user'
  | 'users'
  | 'video'
  | 'wand-2'
  | 'wifi'
  | 'wifi-off'
  | 'x'
  | 'x-circle'
  | 'zoom-in'
  | 'zoom-out'

interface IconProps extends Omit<LucideProps, 'ref'> {
  name: IconName
  size?: number
  color?: string
  strokeWidth?: number
  testID?: string
}

// Icon name to component mapping
const iconMap: Record<IconName, React.ComponentType<LucideProps>> = {
  'alert-circle': AlertCircle,
  'arrow-down': ArrowDown,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  bell: Bell,
  calendar: Calendar,
  camera: Camera,
  check: Check,
  'check-circle': CheckCircle,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  clock: Clock,
  'cloud-upload': CloudUpload,
  code: Code,
  copy: Copy,
  download: Download,
  edit: Edit,
  eye: Eye,
  'eye-off': EyeOff,
  file: File,
  'file-image': FileImage,
  'file-text': FileText,
  filter: Filter,
  flag: Flag,
  'folder-open': FolderOpen,
  grid: Grid,
  heart: Heart,
  home: Home,
  image: Image,
  info: Info,
  list: List,
  lock: Lock,
  'log-out': LogOut,
  map: Map,
  'map-pin': MapPin,
  menu: Menu,
  'message-square': MessageSquare,
  minus: Minus,
  'more-horizontal': MoreHorizontal,
  'more-vertical': MoreVertical,
  navigation: Navigation,
  package: Package,
  paperclip: Paperclip,
  'pause-circle': PauseCircle,
  phone: Phone,
  presentation: FileText,
  plus: Plus,
  'plus-circle': PlusCircle,
  printer: Printer,
  'rotate-cw': RotateCw,
  save: Save,
  search: Search,
  send: Send,
  settings: Settings,
  'shield-check': CheckCircle,
  'share-2': Share2,
  'shopping-cart': ShoppingCart,
  sliders: Sliders,
  smartphone: Smartphone,
  square: Square,
  star: Star,
  'trash-2': Trash2,
  truck: Truck,
  user: User,
  users: Users,
  video: Video,
  'wand-2': Wand2,
  wifi: Wifi,
  'wifi-off': WifiOff,
  x: X,
  'x-circle': XCircle,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
}

/**
 * Icon component for rendering lucide-react-native line icons.
 * 
 * Usage:
 * ```tsx
 * <Icon name="check" size={24} color="#2a4cd0" />
 * <Icon name="camera" size={32} className="text-brand" />
 * ```
 */
export const Icon = React.forwardRef<React.ComponentType<any>, IconProps>(
  ({ name, size = 24, color, strokeWidth = 2, testID, ...rest }, ref) => {
    const Component = useMemo(() => iconMap[name], [name])

    if (!Component) {
      console.warn(`Icon "${name}" not found in icon map`)
      return null
    }

    return (
      <Component
        ref={ref}
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        testID={testID || `icon-${name}`}
        {...rest}
      />
    )
  }
)

Icon.displayName = 'Icon'

export default Icon
