/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override where the Socket.IO client connects. Empty means same-origin. */
  readonly VITE_SOCKET_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
