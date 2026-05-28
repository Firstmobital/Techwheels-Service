/**
 * Image stamping utility for web AutoDoc module
 * Uses HTML5 Canvas to add GPS information card to damage photos
 */

import type { GpsMetadata } from './gpsUtils'
import { formatGpsStampText } from './gpsUtils'

export interface StampOptions {
  cardHeight?: number // Preferred overlay card height in pixels, default: 150
  backgroundColor?: string // RGBA for card background, default: 'rgba(0, 0, 0, 0.56)'
  textColor?: string // Text color, default: 'white'
  fontSize?: number // Base font size in pixels, default: 24
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function fitLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text

  const ellipsis = '...'
  let trimmed = text
  while (trimmed.length > 0 && ctx.measureText(trimmed + ellipsis).width > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }
  return trimmed.length > 0 ? trimmed + ellipsis : ellipsis
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to decode image blob'))
    }
    image.src = objectUrl
  })
}

async function loadStaticMapPreview(lat: number, lng: number, width: number, height: number): Promise<HTMLImageElement | null> {
  const size = `${Math.max(120, Math.round(width))}x${Math.max(90, Math.round(height))}`
  const encodedCenter = `${lat},${lng}`

  const candidates = [
    `https://staticmap.openstreetmap.de/staticmap.php?center=${encodedCenter}&zoom=16&size=${size}&markers=${encodedCenter},red-pushpin`,
    `https://maps.wikimedia.org/img/osm-intl,16,${lng},${lat},${Math.max(120, Math.round(width))}x${Math.max(90, Math.round(height))}.png`,
  ]

  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: 'GET', mode: 'cors' })
      if (!res.ok) continue
      const blob = await res.blob()
      return await loadImageFromBlob(blob)
    } catch {
      // Try next provider.
    }
  }

  return null
}

/**
 * Stamp an image with GPS metadata using Canvas
 * Returns a Blob of the stamped JPEG image
 *
 * Spec requirements:
 * - Position: bottom area, full width with safe margin
 * - Readability: ensure contrast on bright images
 * - Include: lat/lng to 6 decimals, timezone, stage, panel
 */
export async function stampImageWithGps(
  imageFile: File | Blob,
  metadata: GpsMetadata,
  options: StampOptions = {}
): Promise<Blob> {
  const {
    cardHeight = 150,
    backgroundColor = 'rgba(0, 0, 0, 0.56)',
    textColor = 'white',
    fontSize = 24,
  } = options

  return new Promise((resolve, reject) => {
    // Load image into canvas
    const reader = new FileReader()

    reader.onload = async (e) => {
      try {
        const img = new Image()

        img.onload = async () => {
          // Create canvas matching original image size.
          // The location card is rendered as an in-image translucent overlay.
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            reject(new Error('Failed to get canvas context'))
            return
          }

          // Keep dimensions unchanged to preserve framing.
          canvas.width = img.width
          canvas.height = img.height

          // Draw original image
          ctx.drawImage(img, 0, 0)

          // Prepare text
          const stampText = formatGpsStampText(metadata)
          const lines = [stampText.line1, stampText.line2, stampText.line3, stampText.line4]

          // Add a bottom gradient for readability on bright photos.
          const gradientHeight = Math.max(220, Math.round(canvas.height * 0.28))
          const gradientTop = canvas.height - gradientHeight
          const gradient = ctx.createLinearGradient(0, gradientTop, 0, canvas.height)
          gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0.38)')
          ctx.fillStyle = gradient
          ctx.fillRect(0, gradientTop, canvas.width, gradientHeight)

          // Responsive overlay card sizing.
          const cardWidth = Math.max(360, Math.min(Math.round(canvas.width * 0.86), canvas.width - 32))
          const cardPaddingX = Math.max(14, Math.round(cardWidth * 0.03))
          const cardPaddingY = Math.max(10, Math.round(canvas.height * 0.012))
          const mapWidth = Math.max(120, Math.min(Math.round(cardWidth * 0.26), 210))
          const mapHeight = Math.max(96, Math.round(mapWidth * 0.72))
          const contentGap = Math.max(12, Math.round(cardWidth * 0.018))
          const textZoneWidth = cardWidth - (cardPaddingX * 2) - mapWidth - contentGap

          const titleSize = Math.max(18, Math.min(Math.round(canvas.width * 0.04), fontSize + 4))
          const bodySize = Math.max(13, Math.min(Math.round(canvas.width * 0.028), fontSize))
          const titleLineHeight = Math.round(titleSize * 1.2)
          const bodyLineHeight = Math.round(bodySize * 1.2)
          const badgeSize = Math.max(11, Math.round(bodySize * 0.72))

          const textBlockHeight = titleLineHeight + bodyLineHeight * 3
          const badgeHeight = Math.round(badgeSize * 1.7)
          const computedCardHeight = Math.max(
            cardHeight,
            cardPaddingY * 2 + Math.max(textBlockHeight + badgeHeight + 8, mapHeight),
          )

          const cardX = 16
          const cardY = canvas.height - computedCardHeight - 16
          const cardRadius = Math.max(10, Math.round(canvas.width * 0.012))

          // Draw translucent card background.
          drawRoundedRect(ctx, cardX, cardY, cardWidth, computedCardHeight, cardRadius)
          ctx.fillStyle = backgroundColor
          ctx.fill()

          // Subtle border for contrast.
          drawRoundedRect(ctx, cardX, cardY, cardWidth, computedCardHeight, cardRadius)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)'
          ctx.lineWidth = 1.25
          ctx.stroke()

          // Draw mini-map preview on the left, matching reference style.
          const mapX = cardX + cardPaddingX
          const mapY = cardY + Math.round((computedCardHeight - mapHeight) / 2)
          const mapRadius = Math.max(8, Math.round(mapWidth * 0.08))
          const mapPreview = await loadStaticMapPreview(metadata.lat, metadata.lng, mapWidth, mapHeight)

          drawRoundedRect(ctx, mapX, mapY, mapWidth, mapHeight, mapRadius)
          ctx.save()
          ctx.clip()
          if (mapPreview) {
            ctx.drawImage(mapPreview, mapX, mapY, mapWidth, mapHeight)
          } else {
            const fallbackGradient = ctx.createLinearGradient(mapX, mapY, mapX, mapY + mapHeight)
            fallbackGradient.addColorStop(0, 'rgba(255, 255, 255, 0.16)')
            fallbackGradient.addColorStop(1, 'rgba(255, 255, 255, 0.08)')
            ctx.fillStyle = fallbackGradient
            ctx.fillRect(mapX, mapY, mapWidth, mapHeight)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
            ctx.font = `600 ${Math.max(12, Math.round(bodySize * 0.82))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
            ctx.textBaseline = 'middle'
            const fallbackText = 'Map preview unavailable'
            const fallbackTextWidth = ctx.measureText(fallbackText).width
            ctx.fillText(fallbackText, mapX + Math.max(8, (mapWidth - fallbackTextWidth) / 2), mapY + mapHeight / 2)
          }
          ctx.restore()

          drawRoundedRect(ctx, mapX, mapY, mapWidth, mapHeight, mapRadius)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)'
          ctx.lineWidth = 1
          ctx.stroke()

          // Small location badge line.
          const badgeX = mapX + mapWidth + contentGap
          const badgeY = cardY + cardPaddingY
          ctx.font = `600 ${badgeSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
          const badgeText = 'LOCATION VERIFIED'
          const badgeTextWidth = ctx.measureText(badgeText).width
          const badgeWidth = badgeTextWidth + 16
          drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, Math.round(badgeHeight / 2))
          ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
          ctx.fill()
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
          ctx.textBaseline = 'middle'
          ctx.fillText(badgeText, badgeX + 8, badgeY + badgeHeight / 2)

          // Configure text
          ctx.fillStyle = textColor
          ctx.shadowColor = 'rgba(0, 0, 0, 0.42)'
          ctx.shadowBlur = 4
          ctx.textBaseline = 'top'

          // Calculate text layout.
          const textX = mapX + mapWidth + contentGap
          const textY = badgeY + badgeHeight + 8
          const textMaxWidth = textZoneWidth

          ctx.font = `700 ${titleSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
          const line1 = fitLine(ctx, lines[0], textMaxWidth)
          ctx.fillText(line1, textX, textY)

          ctx.font = `500 ${bodySize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
          lines.slice(1).forEach((line, index) => {
            const y = textY + titleLineHeight + index * bodyLineHeight
            const fitted = fitLine(ctx, line, textMaxWidth)
            ctx.fillText(fitted, textX, y)
          })

          // Reset shadow so it does not affect future drawing operations.
          ctx.shadowBlur = 0
          ctx.shadowColor = 'transparent'

          // Convert canvas to blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create stamped image blob'))
                return
              }
              resolve(blob)
            },
            'image/jpeg',
            0.92 // Quality 92% for good balance of size and quality
          )
        }

        img.onerror = () => {
          reject(new Error('Failed to load image for stamping'))
        }

        // Start loading image
        img.src = e.target?.result as string
      } catch (err) {
        reject(err)
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read image file'))
    }

    reader.readAsDataURL(imageFile)
  })
}

/**
 * Validate that a stamped image has reasonable quality
 * - Check file size is not too large
 * - Check dimensions are reasonable
 */
export async function validateStampedImage(blob: Blob, originalWidth: number): Promise<void> {
  const maxSizeMb = 15
  const sizeMb = blob.size / (1024 * 1024)

  if (sizeMb > maxSizeMb) {
    throw new Error(`Stamped image too large (${sizeMb.toFixed(1)}MB, max ${maxSizeMb}MB)`)
  }

  // Verify blob can be loaded as image
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // Check dimensions are reasonable (at least as wide as original)
      if (img.width < originalWidth * 0.8) {
        reject(new Error('Stamped image dimensions validation failed'))
        return
      }
      resolve()
    }
    img.onerror = () => {
      reject(new Error('Failed to validate stamped image'))
    }
    img.src = URL.createObjectURL(blob)
  })
}
