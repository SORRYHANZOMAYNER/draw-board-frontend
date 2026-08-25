import { useNavigate } from 'react-router-dom'

export default function HomePage() {
  const navigate = useNavigate()

  const createRoom = async () => {
    try {
      const response = await fetch('http://localhost:8080/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Новая доска' }),
      })
      const room = await response.json()
      navigate(`/board/${room.id}`)
    } catch (error) {
      alert('Ошибка: бэкенд не запущен или CORS не настроен')
      console.error(error)
    }
  }

  return (
    <div style={{
      width: '100vw',
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      background: '#f0f0f0',
    }}>
      <h1 style={{ fontSize: 'clamp(24px, 6vw, 40px)', textAlign: 'center' }}>
        Интерактивная доска
      </h1>
      <button
        type="button"
        onClick={createRoom}
        style={{
          marginTop: 24,
          padding: '16px 32px',
          fontSize: 18,
          border: 'none',
          borderRadius: 8,
          background: '#2563eb',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        Создать доску
      </button>
    </div>
  )
}