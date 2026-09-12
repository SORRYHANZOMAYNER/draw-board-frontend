import { WORLD_WIDTH, WORLD_HEIGHT } from '../constants/board.js'
import { MIN_SHAPE_SIZE } from '../constants/board.js'
import '../styles/TemplateGroupOverlay.css'

const HANDLES = ['tl', 'tr', 'bl', 'br']

function rectToScreen(rect, camera) {
  const zoom = camera.zoom > 0 ? camera.zoom : 0.01
  return {
    left: (rect.x * WORLD_WIDTH - camera.x) * zoom,
    top: (rect.y * WORLD_HEIGHT - camera.y) * zoom,
    width: rect.width * WORLD_WIDTH * zoom,
    height: rect.height * WORLD_HEIGHT * zoom,
  }
}

export default function TemplateGroupOverlay({
  instance,
  camera,
  onMoveStart,
  onMove,
  onMoveEnd,
  onResizeStart,
  onResize,
  onResizeEnd,
}) {
  if (!instance?.rect) return null

  const screen = rectToScreen(instance.rect, camera)
  if (screen.width < 4 || screen.height < 4) return null

  const handlePointerDownBody = (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    onMoveStart?.(e)
  }

  const handlePointerDownHandle = (corner) => (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    onResizeStart?.(corner, e)
  }

  return (
    <div
      className="template-group-overlay"
      aria-label="Выделенный шаблон"
      style={{
        left: screen.left,
        top: screen.top,
        width: screen.width,
        height: screen.height,
      }}
    >
      <div
        className="template-group-overlay-body"
        onPointerDown={handlePointerDownBody}
        onPointerMove={onMove}
        onPointerUp={onMoveEnd}
        onPointerCancel={onMoveEnd}
      />
      {HANDLES.map((corner) => (
        <button
          key={corner}
          type="button"
          className={`template-group-handle template-group-handle--${corner}`}
          aria-label="Изменить размер шаблона"
          onPointerDown={handlePointerDownHandle(corner)}
          onPointerMove={onResize}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
        />
      ))}
      <span className="template-group-label">{instance.name || 'Шаблон'}</span>
    </div>
  )
}

export function clampTemplateRect(rect) {
  return {
    x: Math.max(0, Math.min(1 - MIN_SHAPE_SIZE, rect.x)),
    y: Math.max(0, Math.min(1 - MIN_SHAPE_SIZE, rect.y)),
    width: Math.max(MIN_SHAPE_SIZE, Math.min(1 - rect.x, rect.width)),
    height: Math.max(MIN_SHAPE_SIZE, Math.min(1 - rect.y, rect.height)),
  }
}
