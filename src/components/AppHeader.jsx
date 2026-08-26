import { useAuth } from '../context/AuthContext.jsx'
import '../styles/AppHeader.css'

export default function AppHeader({ title = 'Интерактивная доска' }) {
  const { user, logout, isTeacher } = useAuth()

  return (
    <header className="app-header">
      <div className="app-header-main">
        <h1 className="app-header-title">{title}</h1>
        {user && (
          <p className="app-header-greeting">
            {isTeacher ? 'Учитель' : 'Ученик'}: {user.username}
          </p>
        )}
      </div>

      {user && (
        <button type="button" className="app-header-logout" onClick={logout}>
          Выйти
        </button>
      )}
    </header>
  )
}