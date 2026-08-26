import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiJson } from '../api/client.js'
import AppHeader from '../components/AppHeader.jsx'
import '../styles/TeacherDashboard.css'

function getStudentId(student) {
  if (student == null) return null
  const raw = student.id ?? student.userId
  if (raw == null || raw === '') return null
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeStudent(student) {
  const id = getStudentId(student)
  if (id == null) return null
  return { ...student, id }
}

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

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const searchTimerRef = useRef(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [selectedStudent, setSelectedStudent] = useState(null)
  const [rooms, setRooms] = useState([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [roomsError, setRoomsError] = useState('')

  const [newRoomName, setNewRoomName] = useState('')
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState('')

  const loadStudentRooms = useCallback(async (studentId) => {
    setRoomsError('')
    setRoomsLoading(true)

    if (studentId == null) {
      setRoomsError('Не удалось определить id ученика')
      setRooms([])
      setRoomsLoading(false)
      return
    }

    try {
      const data = await apiJson(`/room/students/${studentId}/rooms`)
      setRooms(Array.isArray(data) ? data : [])
    } catch (err) {
      setRoomsError(err.message || 'Не удалось загрузить доски ученика')
      setRooms([])
    } finally {
      setRoomsLoading(false)
    }
  }, [])

  const selectStudent = useCallback((student) => {
    const normalized = normalizeStudent(student)
    if (!normalized) {
      setRoomsError('Сервер вернул ученика без id')
      return
    }

    setSelectedStudent(normalized)
    setNewRoomName('')
    setActionError('')
    setRoomsError('')
    loadStudentRooms(normalized.id)
  }, [loadStudentRooms])

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }

    const query = searchQuery.trim()

    if (!query) {
      setSearchResults([])
      setSearchError('')
      setSearching(false)
      return
    }

    setSearching(true)
    setSearchError('')

    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await apiJson(`/room/students/search?q=${encodeURIComponent(query)}`)
        const students = (Array.isArray(data) ? data : [])
          .map(normalizeStudent)
          .filter(Boolean)
        setSearchResults(students)
      } catch (err) {
        setSearchError(err.message || 'Не удалось найти учеников')
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
      }
    }
  }, [searchQuery])

  const createRoomForStudent = async (event) => {
    event.preventDefault()

    const studentId = getStudentId(selectedStudent)
    if (studentId == null) return

    const name = newRoomName.trim() || 'Новый блокнот'
    setCreating(true)
    setActionError('')

    try {
      const room = await apiJson(`/room/students/${studentId}/rooms`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setNewRoomName('')
      await loadStudentRooms(studentId)
      navigate(`/board/${room.id}`)
    } catch (err) {
      setActionError(err.message || 'Не удалось создать блокнот')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="teacher-dashboard">
      <AppHeader title="Кабинет учителя" />

      <main className="teacher-dashboard-main">
        <section className="teacher-panel">
          <h2 className="teacher-panel-title">Поиск ученика</h2>
          <input
            className="teacher-search-input"
            type="text"
            placeholder="Введите имя ученика"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {searching && <p className="teacher-panel-status">Поиск...</p>}
          {searchError && <p className="teacher-panel-error">{searchError}</p>}

          {!searching && searchQuery.trim() && searchResults.length === 0 && !searchError && (
            <p className="teacher-panel-status">Ученики не найдены</p>
          )}

          {searchResults.length > 0 && (
            <ul className="teacher-student-list">
              {searchResults.map((student) => (
                <li key={student.id}>
                  <button
                    type="button"
                    className={`teacher-student-item${
                      selectedStudent?.id === student.id ? ' selected' : ''
                    }`}
                    onClick={() => selectStudent(student)}
                  >
                    {student.username}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="teacher-panel teacher-panel-wide">
          {!selectedStudent ? (
            <div className="teacher-empty-state">
              <p>Найдите ученика по имени</p>
              <span>После выбора вы увидите его доски и сможете создать новый блокнот</span>
            </div>
          ) : (
            <>
              <div className="teacher-selected-header">
                <h2 className="teacher-panel-title">Доски ученика: {selectedStudent.username}</h2>
              </div>

              <form className="teacher-create-form" onSubmit={createRoomForStudent}>
                <input
                  className="teacher-create-input"
                  type="text"
                  placeholder="Название блокнота"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  disabled={creating}
                />
                <button type="submit" className="teacher-create-btn" disabled={creating}>
                  {creating ? 'Создание...' : 'Создать блокнот'}
                </button>
              </form>

              {actionError && <p className="teacher-panel-error">{actionError}</p>}
              {roomsError && <p className="teacher-panel-error">{roomsError}</p>}

              {roomsLoading ? (
                <p className="teacher-panel-status">Загрузка досок...</p>
              ) : rooms.length === 0 ? (
                <div className="teacher-empty-state compact">
                  <p>У ученика пока нет досок</p>
                  <span>Создайте первый блокнот для него</span>
                </div>
              ) : (
                <ul className="teacher-room-list">
                  {rooms.map((room) => (
                    <li key={room.id}>
                      <button
                        type="button"
                        className="teacher-room-card"
                        onClick={() => navigate(`/board/${room.id}`)}
                      >
                        <span className="teacher-room-name">{room.name || `Доска #${room.id}`}</span>
                        <span className="teacher-room-date">{formatRoomDate(room)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
