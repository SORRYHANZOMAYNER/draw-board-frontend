import { useState } from 'react'
import '../styles/Toolbar.css'
import { DRAW_COLORS, SHAPE_TOOLS } from '../constants/board.js'

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

function PaletteIcon({ color }) {
  return (
    <svg
      className="toolbar-icon toolbar-palette-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 3c-4.97 0-9 3.582-9 8 0 2.21 1.79 4 4 4h1.35c.77 0 1.4.63 1.4 1.4 0 .77-.63 1.4-1.4 1.4H7c-2.76 0-5-2.24-5-5 0-5.52 4.48-10 10-10s10 4.48 10 10c0 2.76-2.24 5-5 5h-.65c-.77 0-1.4-.63-1.4-1.4 0-.77.63-1.4 1.4-1.4H17c1.66 0 3-1.34 3-3 0-4.418-3.582-8-8-8Z"
      />
      <circle cx="8.5" cy="10.5" r="1.2" fill="#dc2626" />
      <circle cx="11.5" cy="8" r="1.2" fill="#2563eb" />
      <circle cx="14.5" cy="10.5" r="1.2" fill="#16a34a" />
      <circle cx="12" cy="13" r="1.2" fill="#ca8a04" />
      <circle
        className="toolbar-palette-current"
        cx="17.5"
        cy="14.5"
        r="2.2"
        fill={color}
        stroke="#fff"
        strokeWidth="1.2"
      />
    </svg>
  )
}

function EraserIcon() {
  return (
    <svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8.6 8.6 5.4 11.8l6.8 6.8 3.2-3.2-6.8-6.8Zm2.1-2.1 8.5 8.5-1.4 1.4-8.5-8.5 1.4-1.4ZM4 20h9.8l-2.3-2.3L4 17.7V20Z"
      />
    </svg>
  )
}

function RegionSelectIcon() {
  return (
    <svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="4 3"
      />
    </svg>
  )
}

function TextIcon() {
  return (
    <span className="toolbar-text-icon" aria-hidden="true">
      T
    </span>
  )
}

function ShapesIcon() {
  return (
    <svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 20 12 12 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function ShapeToolIcon({ type }) {
  switch (type) {
    case 'line':
      return (
        <svg className="toolbar-shape-icon" viewBox="0 0 24 24" aria-hidden="true">
          <line x1="5" y1="19" x2="19" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'rect':
      return (
        <svg className="toolbar-shape-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
    case 'triangle':
      return (
        <svg className="toolbar-shape-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5 19 19H5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )
    case 'ellipse':
      return (
        <svg className="toolbar-shape-icon" viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="12" cy="12" rx="8" ry="6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
    case 'cylinder':
      return (
        <svg className="toolbar-shape-icon" viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="12" cy="7" rx="7" ry="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M5 7v10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M5 17c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
    default:
      return null
  }
}

function IncognitoIcon() {
  return (
    <svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5Zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
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

const VIEW_TOOLS = [
  { id: 'zoom-in', icon: '+', title: 'Приблизить' },
  { id: 'zoom-out', icon: '−', title: 'Отдалить' },
  { id: 'reset', icon: '⌂', title: 'Сбросить вид' },
]

export default function Toolbar({
  mode,
  strokeColor,
  shapeType,
  onStrokeColorChange,
  onShapeTypeChange,
  onModeChange,
  onZoomIn,
  onZoomOut,
  onResetView,
  onImageUpload,
  onClearAllRequest,
  isTeacher = false,
  incognitoMode = false,
  onIncognitoToggle,
}) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shapesOpen, setShapesOpen] = useState(false)

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

  const togglePalette = () => {
    setPaletteOpen((open) => !open)
    setShapesOpen(false)
  }

  const toggleShapes = () => {
    setShapesOpen((open) => !open)
    setPaletteOpen(false)
  }

  const handleColorSelect = (color) => {
    onStrokeColorChange?.(color)
    onModeChange?.('draw')
    setPaletteOpen(false)
  }

  const handleShapeSelect = (shapeId) => {
    onShapeTypeChange?.(shapeId)
    onModeChange?.('shape')
    setShapesOpen(false)
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
            {tool.id === 'draw' ? (
              <span className="toolbar-draw-icon" style={{ color: strokeColor }}>
                ✏
              </span>
            ) : (
              tool.icon
            )}
          </button>
        ))}

        <button
          type="button"
          className={`toolbar-btn${mode === 'text' ? ' active' : ''}`}
          title="Текст"
          aria-label="Текст"
          aria-pressed={mode === 'text'}
          onClick={() => onModeChange?.('text')}
        >
          <TextIcon />
        </button>

        <div className="toolbar-palette-wrap">
          <button
            type="button"
            className={`toolbar-btn${shapesOpen || mode === 'shape' ? ' active' : ''}`}
            title="Фигуры"
            aria-label="Фигуры"
            aria-expanded={shapesOpen}
            aria-haspopup="true"
            onClick={toggleShapes}
          >
            <ShapesIcon />
          </button>

          {shapesOpen && (
            <div className="toolbar-shapes-popup" role="menu" aria-label="Выбор фигуры">
              {SHAPE_TOOLS.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  role="menuitemradio"
                  className={`toolbar-shape-btn${shapeType === shape.id ? ' active' : ''}`}
                  title={shape.title}
                  aria-label={shape.title}
                  aria-checked={shapeType === shape.id}
                  onClick={() => handleShapeSelect(shape.id)}
                >
                  <ShapeToolIcon type={shape.id} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="toolbar-palette-wrap">
          <button
            type="button"
            className={`toolbar-btn${paletteOpen ? ' active' : ''}`}
            title="Палитра цветов"
            aria-label="Палитра цветов"
            aria-expanded={paletteOpen}
            aria-haspopup="true"
            onClick={togglePalette}
          >
            <PaletteIcon color={strokeColor} />
          </button>

          {paletteOpen && (
            <div className="toolbar-palette-popup" role="menu" aria-label="Выбор цвета">
              {DRAW_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="menuitemradio"
                  className={`toolbar-color-swatch${strokeColor === color ? ' active' : ''}`}
                  title={`Цвет ${color}`}
                  aria-label={`Цвет ${color}`}
                  aria-checked={strokeColor === color}
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorSelect(color)}
                />
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="toolbar-btn"
          title="Очистить доску"
          aria-label="Очистить доску"
          onClick={onClearAllRequest}
        >
          <EraserIcon />
        </button>

        <button
          type="button"
          className={`toolbar-btn${mode === 'region-clear' ? ' active' : ''}`}
          title="Выделить область"
          aria-label="Выделить область"
          aria-pressed={mode === 'region-clear'}
          onClick={() => onModeChange?.('region-clear')}
        >
          <RegionSelectIcon />
        </button>

        {isTeacher && (
          <button
            type="button"
            className={`toolbar-btn toolbar-btn--incognito${incognitoMode ? ' active' : ''}`}
            title={incognitoMode ? 'Выключить режим инкогнито' : 'Режим инкогнито'}
            aria-label={incognitoMode ? 'Выключить режим инкогнито' : 'Режим инкогнито'}
            aria-pressed={incognitoMode}
            onClick={onIncognitoToggle}
          >
            <IncognitoIcon />
          </button>
        )}
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
