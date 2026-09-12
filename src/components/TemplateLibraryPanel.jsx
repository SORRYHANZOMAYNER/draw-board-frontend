import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatRoomDate } from '../lib/formatRoomDate.js'
import { MAX_TEMPLATES_PER_TEACHER } from '../constants/templates.js'
import '../styles/TemplateLibraryPanel.css'

export default function TemplateLibraryPanel({
  open,
  items,
  total,
  loading,
  error,
  insertingId,
  onClose,
  onRefresh,
  onInsert,
  onDelete,
}) {
  if (!open) return null

  return (
    <aside className="template-library-panel" aria-label="Мои шаблоны">
      <div className="template-library-header">
        <div>
          <h3 className="text-base font-semibold">Мои шаблоны</h3>
          <p className="text-muted-foreground text-xs">
            {total} / {MAX_TEMPLATES_PER_TEACHER}
          </p>
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            Обновить
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mx-3 mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="template-library-list">
        {loading && items.length === 0 && (
          <p className="text-muted-foreground p-4 text-sm">Загрузка…</p>
        )}

        {!loading && items.length === 0 && (
          <p className="text-muted-foreground p-4 text-sm">
            Нет сохранённых шаблонов. Выделите область на доске и сохраните её как шаблон.
          </p>
        )}

        {items.map((item) => (
          <div key={item.id} className="template-library-item">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.name || 'Без названия'}</p>
              <p className="text-muted-foreground text-xs">
                {formatRoomDate(item) || '—'}
                {item.bounds?.width && item.bounds?.height
                  ? ` · ${Math.round(item.bounds.width * 1000) / 10} × ${Math.round(item.bounds.height * 1000) / 10}`
                  : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <Button
                type="button"
                size="sm"
                disabled={Boolean(insertingId)}
                onClick={() => onInsert(item)}
              >
                {insertingId === item.id ? '…' : 'Вставить'}
              </Button>
              {onDelete && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={Boolean(insertingId)}
                  onClick={() => onDelete(item)}
                >
                  Удалить
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
