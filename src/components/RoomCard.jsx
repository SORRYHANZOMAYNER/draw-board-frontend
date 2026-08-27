import { useEffect, useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { apiJson } from '../api/client.js'
import { formatRoomDate } from '../lib/formatRoomDate.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export default function RoomCard({ room, onOpen, onRenamed }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(room.name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!editing) setName(room.name || '')
  }, [room.name, editing])

  const saveName = async (event) => {
    event.preventDefault()
    event.stopPropagation()

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Название не может быть пустым')
      return
    }

    setSaving(true)
    setError('')

    try {
      const updated = await apiJson(`/room/${room.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      })
      onRenamed?.(updated)
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Не удалось переименовать')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      className={cn('transition-shadow hover:shadow-md', !editing && 'cursor-pointer')}
      onClick={!editing ? () => onOpen?.(room) : undefined}
    >
      <CardHeader className="gap-3">
        {editing ? (
          <form className="space-y-2" onSubmit={saveName} onClick={(e) => e.stopPropagation()}>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} autoFocus />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>Сохранить</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Отмена</Button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="line-clamp-2">{room.name || `Доска #${room.id}`}</CardTitle>
              <CardDescription>{formatRoomDate(room)}</CardDescription>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setEditing(true) }}>
              <Pencil />
            </Button>
          </div>
        )}
      </CardHeader>
    </Card>
  )
}