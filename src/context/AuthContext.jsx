import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  apiJson,
  clearToken,
  getToken,
  setToken,
  setUnauthorizedHandler,
} from '../api/client.js'
import { USER_STORAGE_KEY } from '../api/config.js'

const AuthContext = createContext(null)

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function storeUser(user) {
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(USER_STORAGE_KEY)
  }
}

function normalizeAuthResponse(data) {
  return {
    userId: data.userId,
    username: data.username,
    role: data.role,
  }
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => readStoredUser())
  const [token, setTokenState] = useState(() => getToken())
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    clearToken()
    storeUser(null)
    setTokenState(null)
    setUser(null)
    navigate('/login', { replace: true })
  }, [navigate])

  const applyAuth = useCallback((authResponse) => {
    const nextUser = normalizeAuthResponse(authResponse)
    setToken(authResponse.token)
    storeUser(nextUser)
    setTokenState(authResponse.token)
    setUser(nextUser)
    return nextUser
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await apiJson('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ username, password }),
    })

    return applyAuth(data)
  }, [applyAuth])

  const register = useCallback(async (username, password) => {
    const data = await apiJson('/api/auth/register', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ username, password }),
    })

    return applyAuth(data)
  }, [applyAuth])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      storeUser(null)
      setTokenState(null)
      setUser(null)
      navigate('/login', { replace: true })
    })
  }, [navigate])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const savedToken = getToken()

      if (!savedToken) {
        if (!cancelled) setLoading(false)
        return
      }

      try {
        const data = await apiJson('/api/auth/me')
        if (cancelled) return

        const nextUser = normalizeAuthResponse(data)
        storeUser(nextUser)
        setUser(nextUser)
        setTokenState(savedToken)
      } catch {
        if (cancelled) return
        clearToken()
        storeUser(null)
        setUser(null)
        setTokenState(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      isTeacher: user?.role === 'TEACHER',
      login,
      register,
      logout,
    }),
    [user, token, loading, login, register, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}