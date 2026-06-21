import 'dotenv/config'
import http from 'node:http'
import { WebSocketServer } from 'ws'
import { setupWSConnection, getYDoc, docs } from 'y-websocket/bin/utils'

const HOST = process.env.HOST || '0.0.0.0'
const PORT = parseInt(process.env.PORT, 10) || 4444

// Track pending room cleanup timers (room name -> timeout ID)
const cleanupTimers = new Map()

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  // Parse room name from the URL path (e.g. /roomName)
  const roomName = req.url?.slice(1)?.split('?')[0] || 'default'

  console.log(`[connect] room="${roomName}" clients=${wss.clients.size}`)

  // Cancel any pending cleanup for this room
  if (cleanupTimers.has(roomName)) {
    clearTimeout(cleanupTimers.get(roomName))
    cleanupTimers.delete(roomName)
    console.log(`[cleanup-cancelled] room="${roomName}"`)
  }

  // Delegate to y-websocket's connection handler
  setupWSConnection(ws, req, { docName: roomName })

  ws.on('close', () => {
    console.log(`[disconnect] room="${roomName}" clients=${wss.clients.size}`)

    // Check if any remaining clients are in this room
    const doc = docs.get(roomName)
    if (doc && doc.conns && doc.conns.size === 0) {
      console.log(`[cleanup-scheduled] room="${roomName}" (5 min timeout)`)
      const timer = setTimeout(() => {
        const currentDoc = docs.get(roomName)
        if (currentDoc && currentDoc.conns && currentDoc.conns.size === 0) {
          currentDoc.destroy()
          docs.delete(roomName)
          console.log(`[cleanup-done] room="${roomName}" doc destroyed`)
        }
        cleanupTimers.delete(roomName)
      }, 5 * 60 * 1000) // 5 minutes
      cleanupTimers.set(roomName, timer)
    }
  })
})

// Add CORS headers on WebSocket upgrade
server.on('upgrade', (req, socket, head) => {
  // Allow upgrade from any origin
  socket.on('error', (err) => {
    console.error('[upgrade-error]', err.message)
  })
})

server.listen(PORT, HOST, () => {
  console.log(`[collab-server] listening on ${HOST}:${PORT}`)
})
