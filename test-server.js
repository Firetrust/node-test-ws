const crypto = require('crypto')
const http = require('http')

const state = { count: 0, time: 0 }

const clients = []

const HEADER_SIZE = 2
const PAYLOAD_SIZE = 8

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')

  // Browsers sometimes send an OPTIONS request, we can ignore it with success.
  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Content-Type': 'text/json' })
    res.end()
    return
  }

  // API HTTP Request /count
  if (req.url === '/count') {
    state.count++
    res.writeHead(200, { 'Content-Type': 'text/json' })
    res.end(`${JSON.stringify(state)}\n`)
    return
  }

  // Invalid API Request
  res.writeHead(404)
  res.end('Not Found\n')
})

// Emitted each time a client requests an HTTP upgrade, it is part of
// the request header, will need to be manually checked in C.
server.on('upgrade', function (req, socket) {
  if (req.headers['upgrade'] !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request')
    return
  }

  // When initilising an upgrade to a WebSocket connection, the client includes
  // a Sec-WebSocket-Key header with a hash unique to that client.
  const key = req.headers['sec-websocket-key']
  // Hash is created by appending 258EAFA5-E914-47DA-95CA-C5AB0DC85B11 to the
  // key, generating a SHA-1 hash and base64 encoded.
  const hash = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'binary')
    .digest('base64')

  // Response headers.
  const responseHeaders = [
    'HTTP/1.1 101 Web Socket Protocol Handshake',
    'Upgrade: WebSocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${hash}`
  ]

  // Now we can complete the handshake, appending two crlf as per standard HTTP
  // response headers so that the browser recognises the end of the response.
  socket.write(responseHeaders.join('\r\n') + '\r\n\r\n')

  // Keep track of all our connected clients.
  clients.push(socket)

  // Exerfly doesn't need to handle any data sent from the client, so lets
  // just ignore message and control frame parsing.
  socket.on('data', (buf) => {
    const opCode = buf.readUInt8(0) & 0xF

    // 0x8 denotes a connection close.
    if (opCode !== 0x8) {
      return
    }

    // WebSocket connection closed by the client.
  })

  socket.on('end', () => {
    clients.splice(clients.indexOf(socket), 1)
  })
})

function response (angle, rpm, time) {
  const buf = Buffer.alloc(HEADER_SIZE + PAYLOAD_SIZE)
  // Write the header, fin `1` indiciates final fragment opcode `2` indicates binary data.
  buf.writeUInt8(0b10000010, 0)
  buf.writeUInt8(PAYLOAD_SIZE, 1)
  // Write the remaining buffer.
  buf.writeInt16LE(angle, 2)  // angle
  buf.writeUInt16LE(rpm, 4) // rpm
  buf.writeUInt32LE(time, 6) // time
  return buf
}

server.listen(3000, 'localhost', () => {
  console.log('Started Server...')
  // Simulate wheel, sending count to all connected clients.
  setInterval(() => {
    if (!clients.length) {
      return
    }
    const angle = Math.floor(Math.random() * 360) + -360
    const rpm = Math.floor(Math.random() * 65535)
    state.time++
    // console.log(`Angle: ${angle} RPM: ${rpm} Time: ${state.time}`)
    clients.forEach((socket) => {
      socket.write(response(angle, rpm, state.time))
    })
  }, 1000)
})
