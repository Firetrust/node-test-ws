const crypto = require('crypto')
const http = require('http')

const state = { count: 0 }

const clients = []

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

  // When initilising an upgrade to a WebSocket connection, the client includes
  // a Sec-WebSocket-Protocol header with a comma-delimited string of protocols.
  const protocol = req.headers['sec-websocket-protocol']
  // If provided, we'll need to parse the header value.
  const protocols = !protocol ? [] : protocol.split(',').map(s => s.trim())
  // We'll just see if JSON is an option, and if so include it in the response.
  if (protocols.includes('json')) {
    responseHeaders.push('Sec-WebSocket-Protocol: json')
  }

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

function response (data) {
  // Convert the JSON object to a string and copy it into a buffer.
  const json = JSON.stringify(data)
  const jsonByteLength = Buffer.byteLength(json)
  // Note: We're not supporting > 65535 byte payloads for exerfly.
  const lengthByteCount = jsonByteLength < 126 ? 0 : 2
  const payloadLength = lengthByteCount === 0 ? jsonByteLength : 126
  const buf = Buffer.alloc(2 + lengthByteCount + jsonByteLength)
  // Write the first byte using opcode `1`.
  // This indicates message frame payload contains text data.
  buf.writeUInt8(0b10000001, 0)
  buf.writeUInt8(payloadLength, 1)
  // Write the length of the JSON payload to the second byte.
  let payloadOffset = 2
  if (lengthByteCount > 0) {
    buf.writeUInt16BE(jsonByteLength, 2)
    payloadOffset += lengthByteCount
  }
  // Write the JSON string to the buffer.
  buf.write(json, payloadOffset)
  return buf
}

server.listen(3000, 'localhost', () => {
  console.log('Started Server...')
  // Simulate wheel, sending count to all connected clients.
  setInterval(() => {
    if (!clients.length) {
      return
    }
    state.count++
    clients.forEach((socket) => {
      socket.write(response(state))
    })
  }, 1000)
})
