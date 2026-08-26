import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Users } from 'lucide-react'
import { apiJson } from '../api/client.js'
import AppHeader from '../components/AppHeader.jsx'
import { formatRoomDate } from '../lib/formatRoomDate.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

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
    <div className="min-h-dvh bg-muted/30">
      <AppHeader title="Кабинет учителя" />

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[320px_1fr] sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="size-4" />
              Поиск ученика
            </CardTitle>
            <CardDescription>Введите имя и выберите ученика из списка</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="text"
              placeholder="Введите имя ученика"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {searching && (
              <p className="text-sm text-muted-foreground">Поиск...</p>
            )}

            {searchError && (
              <Alert variant="destructive">
                <AlertDescription>{searchError}</AlertDescription>
              </Alert>
            )}

            {!searching && searchQuery.trim() && searchResults.length === 0 && !searchError && (
              <p className="text-sm text-muted-foreground">Ученики не найдены</p>
            )}

            {searchResults.length > 0 && (
              <ul className="space-y-2">
                {searchResults.map((student) => (
                  <li key={student.id}>
                    <Button
                      type="button"
                      variant={selectedStudent?.id === student.id ? 'default' : 'outline'}
                      className="w-full justify-start"
                      onClick={() => selectStudent(student)}
                    >
                      {student.username}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[420px]">
          {!selectedStudent ? (
            <CardContent className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
              <Users className="size-12 text-muted-foreground/50" />
              <div className="space-y-1">
                <p className="font-medium">Найдите ученика по имени</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  После выбора вы увидите его доски и сможете создать новый блокнот
                </p>
              </div>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Доски ученика: {selectedStudent.username}</CardTitle>
                <CardDescription>Управление блокнотами ученика</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <form className="flex flex-col gap-3 sm:flex-row" onSubmit={createRoomForStudent}>
                  <Input
                    className="sm:flex-1"
                    type="text"
                    placeholder="Название блокнота"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    disabled={creating}
                  />
                  <Button type="submit" disabled={creating} className="sm:min-w-40">
                    <Plus data-icon="inline-start" />
                    {creating ? 'Создание...' : 'Создать блокнот'}
                  </Button>
                </form>

                {actionError && (
                  <Alert variant="destructive">
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                )}

                {roomsError && (
                  <Alert variant="destructive">
                    <AlertDescription>{roomsError}</AlertDescription>
                  </Alert>
                )}

                {roomsLoading ? (
                  <p className="text-sm text-muted-foreground">Загрузка досок...</p>
                ) : rooms.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <p className="font-medium">У ученика пока нет досок</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Создайте первый блокнот для него
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {rooms.map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        className={cn(
                          'rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent'
                        )}
                        onClick={() => navigate(`/board/${room.id}`)}
                      >
                        <p className="font-medium">{room.name || `Доска #${room.id}`}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatRoomDate(room)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </main>
    </div>
  )
}
