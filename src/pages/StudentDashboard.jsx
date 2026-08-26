import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiJson } from '../api/client.js'
import AppHeader from '../components/AppHeader.jsx'
import '../styles/StudentDashboard.css'

function formatRoomDate(room) {
  const raw = room.createdAt ?? room.created_at
  if (!raw) return ''

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function StudentDashboard() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')

  const loadRooms = useCallback(async () => {
    setError('')
    setLoading(true)

    try {
      const data = await apiJson('/room/mine')
      setRooms(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Не удалось загрузить доски')
      setRooms([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRooms()
  }, [loadRooms])

  const createRoom = async (event) => {
    event.preventDefault()

    const name = newRoomName.trim() || 'Новая доска'
    setCreating(true)
    setError('')

    try {
      const room = await apiJson('/room', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setNewRoomName('')
      navigate(`/board/${room.id}`)
    } catch (err) {
      setError(err.message || 'Не удалось создать доску')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="student-dashboard">
      <AppHeader title="Мои доски" />

      <main className="student-dashboard-main">
        <form className="student-create-form" onSubmit={createRoom}>
          <input
            className="student-create-input"
            type="text"
            placeholder="Название новой доски"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            disabled={creating}
          />
          <button type="submit" className="student-create-btn" disabled={creating}>
            {creating ? 'Создание...' : 'Новая доска'}
          </button>
        </form>

        {error && <p className="student-dashboard-error">{error}</p>}

        {loading ? (
          <p className="student-dashboard-status">Загрузка досок...</p>
        ) : rooms.length === 0 ? (
          <div className="student-dashboard-empty">
            <p>У вас пока нет досок</p>
            <span>Создайте первую доску, чтобы начать работу</span>
          </div>
        ) : (
          <ul className="student-room-list">
            {rooms.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  className="student-room-card"
                  onClick={() => navigate(`/board/${room.id}`)}
                >
                  <span className="student-room-name">{room.name || `Доска #${room.id}`}</span>
                  <span className="student-room-date">{formatRoomDate(room)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}