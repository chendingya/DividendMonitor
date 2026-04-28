type AssetAvatarProps = {
  name: string
  assetType: 'STOCK' | 'ETF' | 'FUND'
  size?: number
}

const PALETTE: Record<string, { bg: string; text: string }> = {
  STOCK: { bg: '#fff0ed', text: '#d4380d' },
  ETF: { bg: '#e6f4ff', text: '#1677ff' },
  FUND: { bg: '#f0fdf4', text: '#16a34a' }
}

function pickLabel(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return '--'
  // Take first two Chinese / CJK characters, or first 2 alphanumeric chars
  const match = cleaned.match(/^[一-鿿㐀-䶿]{1,2}/)
  if (match) return match[0]
  return cleaned.slice(0, 2).toUpperCase()
}

export function AssetAvatar({ name, assetType, size = 36 }: AssetAvatarProps) {
  const colors = PALETTE[assetType] ?? PALETTE.STOCK
  const label = pickLabel(name)

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        background: colors.bg,
        color: colors.text,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.36,
        fontWeight: 600,
        lineHeight: 1,
        flexShrink: 0,
        userSelect: 'none'
      }}
    >
      {label}
    </div>
  )
}
