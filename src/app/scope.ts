import type {
  IceServersResponse,
  ModelStatusResponse,
  PipelineSchemasResponse,
  PipelineStatusResponse,
  WebRTCOfferResponse,
} from '../types'

interface ApiRequestOptions extends RequestInit {
  logRequest?: boolean
  logResponse?: boolean
}

export interface StatusSnapshot {
  pipelineStatus: PipelineStatusResponse
  modelStatus: ModelStatusResponse
}

function trimBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '')
}

function resolveBaseUrl(baseUrl: string) {
  const normalizedBaseUrl = trimBaseUrl(baseUrl)
  if (normalizedBaseUrl) {
    return normalizedBaseUrl
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '')
  }

  throw new Error('Base URL is required.')
}

export function stringifyPayload(payload: unknown) {
  return typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
}

export async function apiRequest<T = unknown>(
  baseUrl: string,
  path: string,
  options: ApiRequestOptions = {},
): Promise<{ status: number; body: T }> {
  const normalizedBaseUrl = resolveBaseUrl(baseUrl)
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${normalizedBaseUrl}${path}`, {
    headers,
    ...options,
  })

  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${stringifyPayload(body)}`)
  }

  return {
    status: response.status,
    body: body as T,
  }
}

export async function fetchSchemas(baseUrl: string) {
  return apiRequest<PipelineSchemasResponse>(baseUrl, '/api/v1/pipelines/schemas')
}

export async function fetchPipelineStatus(baseUrl: string) {
  return apiRequest<PipelineStatusResponse>(baseUrl, '/api/v1/pipeline/status')
}

export async function fetchModelStatus(baseUrl: string, pipelineId: string) {
  return apiRequest<ModelStatusResponse>(
    baseUrl,
    `/api/v1/models/status?pipeline_id=${encodeURIComponent(pipelineId)}`,
  )
}

export async function fetchStatusSnapshot(baseUrl: string, pipelineId: string): Promise<StatusSnapshot> {
  const [pipelineStatusResponse, modelStatusResponse] = await Promise.all([
    fetchPipelineStatus(baseUrl),
    fetchModelStatus(baseUrl, pipelineId),
  ])

  return {
    pipelineStatus: pipelineStatusResponse.body,
    modelStatus: modelStatusResponse.body,
  }
}

export async function startModelDownload(baseUrl: string, pipelineId: string) {
  return apiRequest<{ message?: string }>(baseUrl, '/api/v1/models/download', {
    method: 'POST',
    body: JSON.stringify({ pipeline_id: pipelineId }),
  })
}

export async function loadPipeline(
  baseUrl: string,
  pipelineId: string,
  loadParams: Record<string, unknown>,
) {
  return apiRequest<{ message?: string }>(baseUrl, '/api/v1/pipeline/load', {
    method: 'POST',
    body: JSON.stringify({
      pipeline_ids: [pipelineId],
      load_params: loadParams,
    }),
  })
}

export async function waitForPipelineLoaded(
  baseUrl: string,
  pipelineId: string,
  timeoutMs = 300000,
  intervalMs = 2000,
) {
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const response = await fetchPipelineStatus(baseUrl)
    const status = response.body

    if (status.status === 'loaded' && status.pipeline_id === pipelineId) {
      return status
    }

    if (status.status === 'error') {
      throw new Error(status.error || 'Pipeline failed to load.')
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('Timed out waiting for pipeline to load.')
}

export async function fetchIceServers(baseUrl: string) {
  return apiRequest<IceServersResponse>(baseUrl, '/api/v1/webrtc/ice-servers')
}

export async function createWebRtcOffer(
  baseUrl: string,
  payload: Record<string, unknown>,
) {
  return apiRequest<WebRTCOfferResponse>(baseUrl, '/api/v1/webrtc/offer', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function patchIceCandidate(
  baseUrl: string,
  sessionId: string,
  candidate: RTCIceCandidate,
) {
  return apiRequest(baseUrl, `/api/v1/webrtc/offer/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      candidates: [
        {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        },
      ],
    }),
  })
}
