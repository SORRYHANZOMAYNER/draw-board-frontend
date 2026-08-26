import { useEffect, useRef, useCallback, useState } from 'react'
import SockJS from 'sockjs-client'
import { Client } from '@stomp/stompjs'
import { WS_BASE } from '../api/config.js'
import { getToken } from '../api/client.js'

export function useWebSocket(roomId, onMessage) {
  const clientRef = useRef(null)
  const onMessageRef = useRef(onMessage)
  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState(null)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    setConnected(false)
    setConnectionError(null)

    const token = getToken()
    if (!token) {
      setConnectionError('Требуется авторизация для подключения к доске')
      return
    }

    const wsUrl = `${WS_BASE}?token=${encodeURIComponent(token)}`
    const socket = new SockJS(wsUrl)
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 3000,
      onConnect: () => {
        setConnected(true)
        setConnectionError(null)
        client.subscribe(`/topic/room/${roomId}`, (message) => {
          const event = JSON.parse(message.body)
          onMessageRef.current?.(event)
        })
      },
      onDisconnect: () => setConnected(false),
      onStompError: (frame) => {
        setConnected(false)
        const message = frame.headers?.message
        setConnectionError(message || 'Ошибка WebSocket-соединения')
      },
      onWebSocketClose: () => setConnected(false),
      onWebSocketError: () => {
        setConnected(false)
        setConnectionError('Не удалось подключиться к серверу')
      },
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

  return { sendDraw, connected, connectionError }
}