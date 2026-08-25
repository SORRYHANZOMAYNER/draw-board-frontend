import '../styles/ContextMenu.css'

export default function ContextMenu({ x, y, onDelete, onClose }) {
  return (
    <>
      <button
        type="button"
        className="context-menu-backdrop"
        aria-label="Закрыть меню"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose?.()
        }}
      />
      <div
        className="context-menu"
        style={{ left: x, top: y }}
        role="menu"
      >
        <button type="button" className="context-menu-item" role="menuitem" onClick={onDelete}>
          Удалить
        </button>
      </div>
    </>
  )
}