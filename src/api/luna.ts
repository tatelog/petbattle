interface LunaWorkerResponse {
  sha256?: unknown
  model?: unknown
  analysis?: unknown
}

export interface LunaResult {
  sha256: string
  model: 'gpt-5.6-luna'
  analysis: unknown
}

export function lunaWorkerConfigured(): boolean {
  return Boolean(import.meta.env.VITE_LUNA_WORKER_URL?.trim())
}

export async function requestLunaAnalysis(file: File, sha256: string): Promise<LunaResult> {
  const baseUrl = import.meta.env.VITE_LUNA_WORKER_URL?.trim()
  if (!baseUrl) throw new Error('Luna Worker URLが設定されていません')

  const imageDataUrl = await readAsDataUrl(file)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl, sha256 }),
      signal: controller.signal,
    })
    const body = (await response.json()) as LunaWorkerResponse & {
      error?: { message?: string }
    }
    if (!response.ok) {
      throw new Error(body.error?.message || `Luna解析に失敗しました（${response.status}）`)
    }
    if (body.sha256 !== sha256 || body.model !== 'gpt-5.6-luna' || !body.analysis) {
      throw new Error('Luna Workerの応答を検証できませんでした')
    }
    return { sha256, model: body.model, analysis: body.analysis }
  } finally {
    window.clearTimeout(timeout)
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('画像をData URLへ変換できませんでした'))
    reader.onerror = () => reject(reader.error ?? new Error('画像を読み取れませんでした'))
    reader.readAsDataURL(file)
  })
}
