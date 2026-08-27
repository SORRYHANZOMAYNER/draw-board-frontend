import { useEffect, useState } from 'react'
import { Pencil, Check, X, Trash2 } from 'lucide-react'
import { apiJson } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatRoomDate } from '../lib/formatRoomDate.js'
import { isRoomOwner } from '../lib/roomAccess.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

export default function RoomCard({ room, onOpen, onRenamed, onDeleted, canDelete: canDeleteProp }) {
  const { user } = useAuth()
  const canDelete =
    canDeleteProp ?? (onDeleted != null || isRoomOwner(room, user))

  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState(room.name || '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!editing) {
      setName(room.name || '')
    }
  }, [room.name, editing])

  const startEdit = (event) => {
    event.stopPropagation()
    setError('')
    setName(room.name || '')
    setEditing(true)
  }

  const cancelEdit = (event) => {
    event?.stopPropagation()
    setEditing(false)
    setError('')
    setName(room.name || '')
  }

  const saveName = async (event) => {
    event.preventDefault()
    event.stopPropagation()

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Название не может быть пустым')
      return
    }

    if (trimmed === (room.name || '').trim()) {
      setEditing(false)
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

  const deleteRoom = async () => {
    setDeleting(true)
    setError('')

    try {
      await apiJson(`/room/${room.id}`, { method: 'DELETE' })
      setDeleteOpen(false)
      onDeleted?.(room)
    } catch (err) {
      setError(err.message || 'Не удалось удалить доску')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card
        className={cn(
          'transition-shadow hover:shadow-md',
          !editing && 'cursor-pointer'
        )}
        onClick={!editing ? () => onOpen?.(room) : undefined}
      >
        <CardHeader className="gap-3">
          {editing ? (
            <form className="space-y-2" onSubmit={saveName} onClick={(e) => e.stopPropagation()}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                autoFocus
                maxLength={100}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={saving}>
                  <Check data-icon="inline-start" />
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                  <X data-icon="inline-start" />
                  Отмена
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <CardTitle className="line-clamp-2">
                  {room.name || `Доска #${room.id}`}
                </CardTitle>
                <CardDescription>{formatRoomDate(room)}</CardDescription>
                {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
              </div>
              <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Переименовать доску"
                  onClick={startEdit}
                >
                  <Pencil />
                </Button>
                {canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Удалить доску"
                    disabled={deleting}
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardHeader>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить доску?</AlertDialogTitle>
            <AlertDialogDescription>
              «{room.name || `Доска #${room.id}`}» будет удалена вместе со всем содержимым.
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={deleteRoom}
            >
              {deleting ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
