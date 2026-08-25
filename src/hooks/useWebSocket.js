import { useEffect, useRef, useCallback, useState } from 'react'
import SockJS from 'sockjs-client'
import { Client } from '@stomp/stompjs'
export function useWebSocket(roomId, onMessage) {
  const clientRef = useRef(null)
  const onMessageRef = useRef(onMessage)
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])
  useEffect(() => {
    setConnected(false)
    const socket = new SockJS('http://localhost:8080/ws')
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 3000,
      onConnect: () => {
        setConnected(true)
        client.subscribe(`/topic/room/${roomId}`, (message) => {
          const event = JSON.parse(message.body)
          onMessageRef.current?.(event)
        })
      },
      onDisconnect: () => setConnected(false),
      onStompError: () => setConnected(false),
    })
    client.activate()
    clientRef.current = client
    return () => {
      client.deactivate()
      clientRef.current = null
    }
  }, [roomId])
  const sendDraw = useCallback((event) => {
    const client = clientRef.current
    if (!client?.connected) {
      console.warn('WebSocket ещё не подключён')
      return false
    }
    client.publish({
      destination: `/app/room/${roomId}/draw`,
      body: JSON.stringify(event),
    })
    return true
  }, [roomId])
  return { sendDraw, connected }
}