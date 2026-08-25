import '../styles/Toolbar.css'
import stickerIcon from '../assets/sticky-note-plus.svg'  

const TOOLS = [
  { id: 'select', icon: '↖', title: 'Выбор' },
  { id: 'draw', icon: '✏', title: 'Рисовать' },
  {
    id: 'sticker',
    icon: <img src={stickerIcon} alt="" className="toolbar-icon-img" />,
    title: 'Стикер',
  },
  { id: 'image', icon: '🖼', title: 'Картинка', action: true },
]

const VIEW_TOOLS = [
  { id: 'zoom-in', icon: '+', title: 'Приблизить' },
  { id: 'zoom-out', icon: '−', title: 'Отдалить' },
  { id: 'reset', icon: '⌂', title: 'Сбросить вид' },
]

export default function Toolbar({
  mode,
  onModeChange,
  onZoomIn,
  onZoomOut,
  onResetView,
  onImageUpload,
}) {
  const handleToolClick = (tool) => {
    if (tool.action && tool.id === 'image') {
      onImageUpload?.()
      return
    }
    onModeChange?.(tool.id)
  }

  const handleViewClick = (tool) => {
    if (tool.id === 'zoom-in') onZoomIn?.()
    if (tool.id === 'zoom-out') onZoomOut?.()
    if (tool.id === 'reset') onResetView?.()
  }

  return (
    <aside className="toolbar" aria-label="Панель инструментов">
      <div className="toolbar-group">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`toolbar-btn${!tool.action && mode === tool.id ? ' active' : ''}`}
            title={tool.title}
            aria-label={tool.title}
            aria-pressed={!tool.action && mode === tool.id}
            onClick={() => handleToolClick(tool)}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        {VIEW_TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className="toolbar-btn"
            title={tool.title}
            aria-label={tool.title}
            onClick={() => handleViewClick(tool)}
          >
            <span className="toolbar-btn-label">{tool.icon}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}