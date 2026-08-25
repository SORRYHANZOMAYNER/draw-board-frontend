import '../styles/Toolbar.css'

function StickerIcon() {
  return (
    <svg
      className="toolbar-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M5 3h12a2 2 0 0 1 2 2v13.5L14.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
      />
      <path
        fill="currentColor"
        opacity="0.35"
        d="M19 5.5V15l-4.5-4.5H19V5.5Z"
      />
    </svg>
  )
}

const TOOLS = [
  { id: 'select', icon: '↖', title: 'Выбор' },
  { id: 'draw', icon: '✏', title: 'Рисовать' },
  { id: 'sticker', icon: <StickerIcon />, title: 'Стикер' },
  { id: 'image', icon: '🖼', title: 'Картинка', action: true },
]