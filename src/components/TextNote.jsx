import { useEffect, useRef } from 'react'
import { WORLD_WIDTH, WORLD_HEIGHT } from '../constants/board.js'
import '../styles/TextNote.css'

export default function TextNote({
  item,
  camera,
  isSelected,
  autoFocus,
  draggable,
  onSelect,
  onTextChange,
  onTextCommit,
  onMoveStart,
  onMove,
  onMoveEnd,
  onContextMenu,
}) {
  const textareaRef = useRef(null)
  const dragRef = useRef(null)

  const zoom = camera.zoom > 0 ? camera.zoom : 0.01
  const left = (item.x * WORLD_WIDTH - camera.x) * zoom
  const top = (item.y * WORLD_HEIGHT - camera.y) * zoom
  const boxWidth = (item.width ?? 0.14) * WORLD_WIDTH * zoom
  const fontSize = (item.fontSize || 18) * zoom
  const isEditing = !item.locked && autoFocus

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return null
  }

  useEffect(() => {
    if (!autoFocus || !isEditing) return
    const timer = setTimeout(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }, 50)
    return () => clearTimeout(timer)
  }, [autoFocus, isEditing])

  const handleDragPointerDown = (e) => {
    if (!draggable) return
    if (isEditing && e.target.closest('textarea')) return
    if (e.button !== 0 && e.pointerType === 'mouse') return

    e.stopPropagation()
    e.preventDefault()
    textareaRef.current?.blur()
    onSelect?.()

    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    }
    onMoveStart?.()
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleDragPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return

    const dx = (e.clientX - drag.startClientX) / zoom / WORLD_WIDTH
    const dy = (e.clientY - drag.startClientY) / zoom / WORLD_HEIGHT

    if (Math.abs(dx) > 0.0005 || Math.abs(dy) > 0.0005) {
      drag.moved = true
    }

    onMove?.(dx, dy)
    drag.startClientX = e.clientX
    drag.startClientY = e.clientY
  }

  const handleDragPointerUp = (e) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return

    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)

    if (drag.moved) {
      onMoveEnd?.()
    }
  }

  const handleTextareaPointerDown = (e) => {
    e.stopPropagation()
    onSelect?.()
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect?.()
    onContextMenu?.(e.clientX, e.clientY)
  }

  return (
    <div
      className={`board-text-note${isSelected ? ' selected' : ''}${isEditing ? ' editing' : ' locked'}${draggable ? ' draggable' : ''}`}
      style={{
        left,
        top,
        width: isEditing ? Math.max(boxWidth, fontSize * 6) : undefined,
        maxWidth: Math.max(boxWidth, fontSize * 20),
      }}
      onPointerDown={handleDragPointerDown}
      onPointerMove={handleDragPointerMove}
      onPointerUp={handleDragPointerUp}
      onPointerCancel={handleDragPointerUp}
      onContextMenu={handleContextMenu}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="board-text-input"
          value={item.text}
          placeholder="Текст"
          rows={1}
          inputMode="text"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="on"
          spellCheck
          style={{ color: item.color, fontSize }}
          onChange={(e) => onTextChange?.(e.target.value)}
          onBlur={() => onTextCommit?.()}
          onPointerDown={handleTextareaPointerDown}
          onFocus={() => onSelect?.()}
        />
      ) : (
        <div
          className="board-text-static"
          style={{ color: item.color, fontSize }}
        >
          {item.text}
        </div>
      )}
    </div>
  )
}
