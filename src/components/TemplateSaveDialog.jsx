import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MAX_TEMPLATE_NAME_LENGTH, MAX_TEMPLATES_PER_TEACHER } from '../constants/templates.js'

export default function TemplateSaveDialog({
  open,
  name,
  onNameChange,
  templateCount,
  saving,
  error,
  onCancel,
  onSave,
}) {
  if (!open) return null

  const atLimit = templateCount >= MAX_TEMPLATES_PER_TEACHER

  return (
    <div className="template-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="template-dialog"
        role="dialog"
        aria-labelledby="template-save-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="template-save-title" className="text-lg font-semibold">
          Сохранить шаблон
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Выделенная область будет сохранена для повторной вставки на доске.
        </p>
        <p className="mt-2 text-sm">
          Шаблонов: {templateCount} / {MAX_TEMPLATES_PER_TEACHER}
        </p>

        <div className="mt-4 space-y-2">
          <Label htmlFor="template-name">Название</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={MAX_TEMPLATE_NAME_LENGTH}
            disabled={saving || atLimit}
            autoFocus
            placeholder="Например: Формула"
          />
        </div>

        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {atLimit && (
          <Alert className="mt-3">
            <AlertDescription>
              Достигнут лимит {MAX_TEMPLATES_PER_TEACHER} шаблонов. Удалите старые, чтобы сохранить новый.
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Отмена
          </Button>
          <Button type="button" onClick={onSave} disabled={saving || atLimit || !name.trim()}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </div>
  )
}
