import TextNote from './TextNote.jsx'
import '../styles/TextLayer.css'

export default function TextLayer({
  texts,
  camera,
  mode,
  ignorePointer = false,
  selectedTextId,
  focusTextId,
  onSelectText,
  onTextChange,
  onTextCommit,
  onTextMoveStart,
  onTextMove,
  onTextMoveEnd,
  onTextContextMenu,
}) {
  const textList = [...texts.values()]

  return (
    <div className={`text-layer${ignorePointer ? ' text-layer--pass-through' : ''}`} aria-label="Текст на доске">
      {textList.map((item) => (
        <TextNote
          key={item.textId}
          item={item}
          camera={camera}
          isSelected={selectedTextId === item.textId}
          autoFocus={focusTextId === item.textId}
          draggable={mode === 'select' && item.locked}
          onSelect={() => onSelectText?.(item.textId)}
          onTextChange={(text) => onTextChange?.(item.textId, text)}
          onTextCommit={() => onTextCommit?.(item.textId)}
          onMoveStart={() => onTextMoveStart?.(item.textId)}
          onMove={(dx, dy) => onTextMove?.(item.textId, dx, dy)}
          onMoveEnd={() => onTextMoveEnd?.(item.textId)}
          onContextMenu={(x, y) => onTextContextMenu?.(item.textId, x, y)}
        />
      ))}

      {mode === 'text' && (
        <div className="text-mode-hint">
          Нажмите на доску, чтобы добавить текст
        </div>
      )}
    </div>
  )
}
