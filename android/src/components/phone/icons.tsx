import React from 'react'
import {
  AppWindow as AppIcon,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Blocks,
  Bold,
  Bookmark,
  Boxes,
  Calendar,
  Camera,
  Check,
  CircleDot,
  Clipboard,
  ClipboardPaste,
  Clock,
  Code,
  Columns2,
  Command,
  Compass,
  Copy,
  CornerDownLeft,
  Disc,
  Download,
  Eye,
  FileText,
  Film,
  Flag,
  Folder,
  FolderOpen,
  Globe,
  Heart,
  House,
  Highlighter,
  Image as ImageIcon,
  Italic,
  KeyRound,
  Keyboard,
  Languages,
  Layers2,
  LayoutDashboard,
  LayoutGrid,
  LayoutList,
  Link,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  ListPlus,
  ListTree,
  Lock,
  LockKeyhole,
  Mail,
  MapPin,
  Maximize,
  MessageCircle,
  MessageSquare,
  Mic,
  MicOff,
  Minimize,
  Monitor,
  Moon,
  Navigation,
  Package,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Rocket,
  Rows2,
  Save,
  Scissors,
  Search,
  Send,
  Share2,
  SkipForward,
  Sparkles,
  Square,
  SquareStack,
  Star,
  Sun,
  Tag,
  Target,
  Terminal,
  ThumbsUp,
  Timer,
  Trash2,
  Trophy,
  Type,
  Undo,
  Video,
  Volume2,
  VolumeX,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { getCustomIcon } from '@/lib/custom-icons'

/**
 * 磁片图标
 * ------------------------------------------------------------
 * 内置图标是精选过的一份（不把 lucide 全量打进 bundle），
 * 另外支持用户上传自己的小图片（icon = `custom:<key>`，图片存在手机本地）。
 */

export type TileIconComponent = React.ComponentType<{
  size?: number
  strokeWidth?: number
  className?: string
  style?: React.CSSProperties
}>

/** 可供磁片选择的图标 */
export const ICON_CHOICES: { name: string; Icon: LucideIcon }[] = [
  { name: 'Mic', Icon: Mic },
  { name: 'MicOff', Icon: MicOff },
  { name: 'Send', Icon: Send },
  { name: 'Search', Icon: Search },
  { name: 'Copy', Icon: Copy },
  { name: 'ClipboardPaste', Icon: ClipboardPaste },
  { name: 'Clipboard', Icon: Clipboard },
  { name: 'Undo', Icon: Undo },
  { name: 'Redo2', Icon: Redo2 },
  { name: 'Camera', Icon: Camera },
  { name: 'Scissors', Icon: Scissors },
  { name: 'Play', Icon: Play },
  { name: 'Pause', Icon: Pause },
  { name: 'SkipForward', Icon: SkipForward },
  { name: 'Square', Icon: Square },
  { name: 'Volume2', Icon: Volume2 },
  { name: 'VolumeX', Icon: VolumeX },
  { name: 'Bell', Icon: Bell },
  { name: 'Heart', Icon: Heart },
  { name: 'Star', Icon: Star },
  { name: 'Bookmark', Icon: Bookmark },
  { name: 'Flag', Icon: Flag },
  { name: 'Zap', Icon: Zap },
  { name: 'Sparkles', Icon: Sparkles },
  { name: 'Rocket', Icon: Rocket },
  { name: 'Target', Icon: Target },
  { name: 'Trophy', Icon: Trophy },
  { name: 'Tag', Icon: Tag },
  { name: 'Command', Icon: Command },
  { name: 'Keyboard', Icon: Keyboard },
  { name: 'Monitor', Icon: Monitor },
  { name: 'Sun', Icon: Sun },
  { name: 'Moon', Icon: Moon },
  { name: 'Lock', Icon: Lock },
  { name: 'LockKeyhole', Icon: LockKeyhole },
  { name: 'KeyRound', Icon: KeyRound },
  { name: 'Eye', Icon: Eye },
  { name: 'Check', Icon: Check },
  { name: 'Plus', Icon: Plus },
  { name: 'House', Icon: House },
  { name: 'Timer', Icon: Timer },
  { name: 'Type', Icon: Type },
  { name: 'Languages', Icon: Languages },
  { name: 'Pencil', Icon: Pencil },
  { name: 'Highlighter', Icon: Highlighter },
  { name: 'LayoutGrid', Icon: LayoutGrid },
  { name: 'LayoutDashboard', Icon: LayoutDashboard },
  { name: 'LayoutList', Icon: LayoutList },
  { name: 'Rows2', Icon: Rows2 },
  { name: 'Columns2', Icon: Columns2 },
  { name: 'List', Icon: List },
  { name: 'ListChecks', Icon: ListChecks },
  { name: 'ListOrdered', Icon: ListOrdered },
  { name: 'ListPlus', Icon: ListPlus },
  { name: 'ListTree', Icon: ListTree },
  { name: 'Folder', Icon: Folder },
  { name: 'FolderOpen', Icon: FolderOpen },
  { name: 'Save', Icon: Save },
  { name: 'Download', Icon: Download },
  { name: 'RotateCcw', Icon: RotateCcw },
  { name: 'RefreshCw', Icon: RefreshCw },
  { name: 'Video', Icon: Video },
  { name: 'Film', Icon: Film },
  { name: 'FileText', Icon: FileText },
  { name: 'Code', Icon: Code },
  { name: 'Terminal', Icon: Terminal },
  { name: 'Globe', Icon: Globe },
  { name: 'Bold', Icon: Bold },
  { name: 'Italic', Icon: Italic },
  { name: 'Link', Icon: Link },
  { name: 'Link2', Icon: Link2 },
  { name: 'Share2', Icon: Share2 },
  { name: 'MessageCircle', Icon: MessageCircle },
  { name: 'MessageSquare', Icon: MessageSquare },
  { name: 'Mail', Icon: Mail },
  { name: 'Phone', Icon: Phone },
  { name: 'Calendar', Icon: Calendar },
  { name: 'Clock', Icon: Clock },
  { name: 'Image', Icon: ImageIcon },
  { name: 'MapPin', Icon: MapPin },
  { name: 'Compass', Icon: Compass },
  { name: 'Navigation', Icon: Navigation },
  { name: 'ArrowUp', Icon: ArrowUp },
  { name: 'ArrowDown', Icon: ArrowDown },
  { name: 'ArrowLeft', Icon: ArrowLeft },
  { name: 'ArrowRight', Icon: ArrowRight },
  { name: 'CornerDownLeft', Icon: CornerDownLeft },
  { name: 'Maximize', Icon: Maximize },
  { name: 'Minimize', Icon: Minimize },
  { name: 'Disc', Icon: Disc },
  { name: 'CircleDot', Icon: CircleDot },
  { name: 'ThumbsUp', Icon: ThumbsUp },
  { name: 'Trash2', Icon: Trash2 },
  // 磁片组 / 组合类
  { name: 'Boxes', Icon: Boxes },
  { name: 'Blocks', Icon: Blocks },
  { name: 'Package', Icon: Package },
  { name: 'Layers2', Icon: Layers2 },
  { name: 'SquareStack', Icon: SquareStack },
  { name: 'Workflow', Icon: Workflow },
]

/** 名称 → 图标组件（内置） */
const TILE_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  ICON_CHOICES.map(({ name, Icon }) => [name, Icon]),
)

/** 电脑端前台应用图标 */
export const APP_ICONS: Record<string, LucideIcon> = {
  微信: MessageCircle,
  终端: Terminal,
  Notion: FileText,
  Safari: Globe,
  'VS Code': Code,
  'Final Cut Pro': Film,
}

/** 自定义上传的图标：`custom:<key>` */
function customIcon(name: string): TileIconComponent {
  const key = name.slice('custom:'.length)
  const dataUrl = getCustomIcon(key)
  return ({ size = 16, className, style }) =>
    dataUrl ? (
      <img
        src={dataUrl}
        width={size}
        height={size}
        alt=""
        draggable={false}
        className={className}
        style={{ borderRadius: 4, objectFit: 'cover', ...style }}
      />
    ) : (
      <Copy size={size} className={className} style={style} />
    )
}

/** 取磁片图标：支持内置图标名和 `custom:` 自定义图片 */
export function tileIcon(name: string): TileIconComponent {
  if (name.startsWith('custom:')) return customIcon(name)
  // 旧数据里磁片组用的是 Layers（这个版本没有），统一换成 Boxes
  if (name === 'Layers') return Boxes
  return TILE_ICONS[name] ?? Copy
}

/** 取应用图标，找不到时退回通用 App 图标 */
export function appIcon(name: string): LucideIcon {
  return APP_ICONS[name] ?? AppIcon
}
