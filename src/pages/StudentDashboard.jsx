import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, LayoutGrid } from 'lucide-react'
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
    <div className="min-h-dvh bg-muted/30">
      <AppHeader title="Мои доски" />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Новая доска</CardTitle>
            <CardDescription>Создайте блокнот и начните рисовать</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={createRoom}>
              <Input
                className="sm:flex-1"
                type="text"
                placeholder="Название новой доски"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                disabled={creating}
              />
              <Button type="submit" disabled={creating} className="sm:min-w-36">
                <Plus data-icon="inline-start" />
                {creating ? 'Создание...' : 'Новая доска'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <p className="text-center text-sm text-muted-foreground">Загрузка досок...</p>
        ) : rooms.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <LayoutGrid className="size-10 text-muted-foreground/60" />
              <p className="font-medium">У вас пока нет досок</p>
              <p className="text-sm text-muted-foreground">
                Создайте первую доску, чтобы начать работу
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <Card
                key={room.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/board/${room.id}`)}
              >
                <CardHeader>
                  <CardTitle className="line-clamp-2">
                    {room.name || `Доска #${room.id}`}
                  </CardTitle>
                  <CardDescription>{formatRoomDate(room)}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
