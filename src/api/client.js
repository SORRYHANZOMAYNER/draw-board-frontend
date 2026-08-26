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

export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options)

  if (!response.ok) {
    let message = `Request failed: ${response.status}`

    try {
      const data = await response.json()
      if (data?.message) message = data.message
      else if (data?.error) message = data.error
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