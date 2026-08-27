import { API_BASE, TOKEN_STORAGE_KEY } from './config.js'

let unauthorizedHandler = () => {
  window.location.href = '/login'
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

export function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export async function apiFetch(path, options = {}) {
  const { auth = true, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers || {})

  if (!headers.has('Content-Type') && fetchOptions.body) {
    headers.set('Content-Type', 'application/json')
  }

  const token = auth ? getToken() : null
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  })

  if (response.status === 401 && auth && token) {
    clearToken()
    unauthorizedHandler()
    throw new Error('Unauthorized')
  }

  return response
}

const GENERIC_HTTP_ERRORS = new Set([
  'Bad Request',
  'Unauthorized',
  'Forbidden',
  'Not Found',
  'Method Not Allowed',
  'Conflict',
  'Internal Server Error',
])

export function getApiErrorMessage(data, status) {
  if (data == null) return null

  if (typeof data === 'string' && data.trim()) {
    return data.trim()
  }

  if (typeof data !== 'object') return null

  if (typeof data.detail === 'string' && data.detail.trim()) {
    return data.detail.trim()
  }

  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message.trim()
  }

  if (typeof data.error === 'string' && data.error.trim() && !GENERIC_HTTP_ERRORS.has(data.error.trim())) {
    return data.error.trim()
  }

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0]
    if (typeof first === 'string' && first.trim()) return first.trim()
    if (typeof first?.message === 'string' && first.message.trim()) return first.message.trim()
  }

  return null
}

export function getErrorMessage(error, fallback = 'Request failed') {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  return fallback
}

export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options)

  if (!response.ok) {
    let message = `Request failed: ${response.status}`

    try {
      const data = await response.json()
      message = getApiErrorMessage(data, response.status) ?? message
    } catch {
      // ignore parse errors
    }

    const error = new Error(message)
    error.status = response.status
    throw error
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}
