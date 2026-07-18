import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index'

const context = { waitUntil: vi.fn() }
const env = { OPENAI_API_KEY: 'test-key' }

afterEach(() => {
  vi.restoreAllMocks()
  context.waitUntil.mockClear()
})

describe('Luna Worker', () => {
  it('CORS preflightに応答する', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/analyze', { method: 'OPTIONS' }),
      env,
      context,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('非対応Data URLをOpenAIへ送らず拒否する', async () => {
    const openAI = vi.spyOn(globalThis, 'fetch')
    const response = await worker.fetch(
      new Request('https://example.test/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: 'data:image/gif;base64,R0lGODlh' }),
      }),
      env,
      context,
    )

    expect(response.status).toBe(400)
    expect(openAI).not.toHaveBeenCalled()
  })

  it('structured outputを検証し、essenceを合計16に正規化する', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    name: 'ルナ',
                    species: '月光獣',
                    element: 'light',
                    temperament: 'clever',
                    traits: ['radiant', 'arcane'],
                    essence: { physical: 2, magic: 6, defense: 2 },
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    // Magic-byte validation is intentional; the API never trusts the Data URL label.
    const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const imageDataUrl = `data:image/png;base64,${btoa(String.fromCharCode(...pngHeader))}`
    const response = await worker.fetch(
      new Request('https://example.test/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageDataUrl }),
      }),
      env,
      context,
    )
    const body = (await response.json()) as {
      analysis: { essence: { physical: number; magic: number; defense: number } }
    }

    expect(response.status).toBe(200)
    expect(body.analysis.essence).toEqual({ physical: 3, magic: 10, defense: 3 })
    expect(response.headers.get('etag')).toMatch(/^"[a-f0-9]{64}"$/)
  })
})
