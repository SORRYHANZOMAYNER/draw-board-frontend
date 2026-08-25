import StickerNote from './StickerNote.jsx'
import '../styles/StickerLayer.css'

export default function StickerLayer({
  stickers,
  camera,
  mode,
  selectedStickerId,
  focusStickerId,
  onSelectSticker,
  onStickerTextChange,
  onStickerTextCommit,
  onStickerMoveStart,
  onStickerMove,
  onStickerMoveEnd,
  onStickerContextMenu,
}) {
  const stickerList = [...stickers.values()]

  return (
    <div className="sticker-layer" aria-label="Стикеры">
      {stickerList.map((sticker) => (
        <StickerNote
          key={sticker.stickerId}
          sticker={sticker}
          camera={camera}
          isSelected={selectedStickerId === sticker.stickerId}
          autoFocus={focusStickerId === sticker.stickerId}
          draggable={mode === 'select'}
          onSelect={() => onSelectSticker?.(sticker.stickerId)}
          onTextChange={(text) => onStickerTextChange?.(sticker.stickerId, text)}
          onTextCommit={() => onStickerTextCommit?.(sticker.stickerId)}
          onMoveStart={() => onStickerMoveStart?.(sticker.stickerId)}
          onMove={(dx, dy) => onStickerMove?.(sticker.stickerId, dx, dy)}
          onMoveEnd={() => onStickerMoveEnd?.(sticker.stickerId)}
          onContextMenu={(x, y) => onStickerContextMenu?.(sticker.stickerId, x, y)}
        />
      ))}

      {mode === 'sticker' && (
        <div className="sticker-mode-hint">
          Нажмите на доску, чтобы добавить стикер
        </div>
      )}
    </div>
  )
}