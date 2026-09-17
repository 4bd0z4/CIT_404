import { io, type Socket } from 'socket.io-client'
import { getAccessToken } from './api'

let socket: Socket | null = null

/**
 * In dev the socket talks to the API server directly rather than through
 * the Vite proxy: Vite already owns a WebSocket on its own port for HMR,
 * and the proxied upgrade does not survive alongside it. The backend's
 * CORS list includes the dev origin for exactly this. In production the
 * app is served by the API server, so same-origin is correct.
 */
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : undefined)

/**
 * One socket per tab, authenticated with the same access token as the REST
 * calls. The server decides which rooms the connection may join, so a team
 * can only ever receive its own wallet updates.
 */
export function connectSocket(): Socket {
  if (socket?.connected) return socket

  socket = io(SOCKET_URL, {
    auth: { token: getAccessToken() },
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
  })

  // After a token refresh the old handshake credential is stale, so
  // re-arm it before every reconnect attempt.
  socket.io.on('reconnect_attempt', () => {
    if (socket) socket.auth = { token: getAccessToken() }
  })

  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
