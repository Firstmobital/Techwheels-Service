/**
 * Helper to compress JSON / text responses using Gzip when the client supports it
 * (via Accept-Encoding: gzip) and the payload exceeds the minimum size threshold.
 */

const MIN_COMPRESSION_THRESHOLD_BYTES = 1024 // 1 KB

export async function createCompressedJsonResponse(
  req: Request,
  data: unknown,
  init?: ResponseInit,
): Promise<Response> {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data)
  const rawBytes = new TextEncoder().encode(jsonString)
  const acceptEncoding = req.headers.get('accept-encoding') ?? ''

  const baseHeaders = new Headers(init?.headers)
  baseHeaders.set('content-type', 'application/json; charset=utf-8')
  baseHeaders.set('vary', 'Accept-Encoding')

  // Check if payload is large enough and client supports gzip
  if (rawBytes.byteLength >= MIN_COMPRESSION_THRESHOLD_BYTES && /\bgzip\b/i.test(acceptEncoding)) {
    try {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(rawBytes)
          controller.close()
        },
      })
      const compressionStream = new CompressionStream('gzip')
      const compressedStream = stream.pipeThrough(compressionStream)
      const compressedResponse = new Response(compressedStream)
      const compressedBytes = await compressedResponse.arrayBuffer()

      baseHeaders.set('content-encoding', 'gzip')
      baseHeaders.set('content-length', String(compressedBytes.byteLength))

      return new Response(compressedBytes, {
        status: init?.status ?? 200,
        headers: baseHeaders,
      })
    } catch {
      // Fallback to uncompressed on compression failure
    }
  }

  baseHeaders.set('content-length', String(rawBytes.byteLength))
  return new Response(rawBytes, {
    status: init?.status ?? 200,
    headers: baseHeaders,
  })
}
