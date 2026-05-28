/**
 * Image stamping utility for web AutoDoc module
 * Uses HTML5 Canvas to add GPS information card to damage photos
 */

import { GpsMetadata, formatGpsStampText } from './gpsUtils'

export interface StampOptions {
  cardHeight?: number // Height of bottom card in pixels, default: 120
  backgroundColor?: string // RGBA for card background, default: 'rgba(0, 0, 0, 0.8)'
  textColor?: string // Text color, default: 'white'
  fontSize?: number // Base font size in pixels, default: 14
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
    cardHeight = 120,
    backgroundColor = 'rgba(0, 0, 0, 0.8)',
    textColor = 'white',
    fontSize = 14,
  } = options

  return new Promise((resolve, reject) => {
    // Load image into canvas
    const reader = new FileReader()

    reader.onload = async (e) => {
      try {
        const img = new Image()

        img.onload = () => {
          // Create canvas with stamped area
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            reject(new Error('Failed to get canvas context'))
            return
          }

          // Set canvas size to match image + card height
          canvas.width = img.width
          canvas.height = img.height + cardHeight

          // Draw original image
          ctx.drawImage(img, 0, 0)

          // Draw semi-transparent background card
          ctx.fillStyle = backgroundColor
          ctx.fillRect(0, img.height, img.width, cardHeight)

          // Add border/accent line
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(0, img.height)
          ctx.lineTo(img.width, img.height)
          ctx.stroke()

          // Prepare text
          const stampText = formatGpsStampText(metadata)

          // Configure text
          ctx.fillStyle = textColor
          ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
          ctx.textBaseline = 'top'

          // Calculate layout with safe margins
          const marginLeft = 12
          const marginTop = 8
          const lineHeight = fontSize + 3

          // Draw text lines
          const lines = [stampText.line1, stampText.line2, stampText.line3, stampText.line4]
          lines.forEach((line, index) => {
            const y = img.height + marginTop + index * lineHeight
            ctx.fillText(line, marginLeft, y)
          })

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
