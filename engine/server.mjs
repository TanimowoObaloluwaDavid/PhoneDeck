import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { AdbService } from './adb.mjs'
import { MirrorService } from './mirror.mjs'
import { parseNotifications, parsePackages, parseListing, prettyAppName } from './parse.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PUBLIC_DIR = path.join(__dirname, 'public')
const PORT = Number(process.env.PORT ?? 8787)

const STATE_DIR = path.join(process.env.LOCALAPPDATA ?? ROOT, 'PhoneDeck')
const STATE_FILE = path.join(STATE_DIR, 'state.json')

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveState(patch) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true })
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...loadState(), ...patch }, null, 2))
  } catch {
    /* state is a convenience, never fatal */
  }
}

const KEYCODES = {
  home: 3,
  back: 4,
  recents: 187,
  power: 26,
  'volume-up': 24,
  'volume-down': 25,
  wake: 224,
  sleep: 223,
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (candidate === 'adb') return candidate
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[candidates.length - 1]
}

const adbPath = firstExisting([
  process.env.ADB_PATH,
  path.join(ROOT, 'resources', 'bin', 'adb.exe'),
  path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'sdk', 'platform-tools', 'adb.exe'),
  'adb',
])

const serverJarPath = firstExisting([
  process.env.SCRCPY_SERVER,
  path.join(ROOT, 'resources', 'bin', 'scrcpy-server'),
  path.join(__dirname, 'bin', 'scrcpy-server'),
])

const adb = new AdbService(adbPath)
const mirror = new MirrorService({ adbService: adb, serverJarPath })

let activeSerial = null

/* ------------------------------------------------------------------ */
/* transport                                                          */
/* ------------------------------------------------------------------ */

const viewers = new Set()

function broadcastJson(payload) {
  const text = JSON.stringify(payload)
  for (const ws of viewers) {
    if (ws.readyState === 1) ws.send(text)
  }
}

function broadcastBinary(buffer) {
  for (const ws of viewers) {
    if (ws.readyState === 1) ws.send(buffer, { binary: true })
  }
}

/*
 * A viewer that shows up after the encoder started never sees the H.264
 * config or the keyframe it needs, so it would sit on a black screen
 * forever. Keep the last ones and replay them to every new viewer.
 */
let lastConfigPacket = null
let lastKeyframePacket = null

function clearVideoCache() {
  lastConfigPacket = null
  lastKeyframePacket = null
}

/** Video packets get a 2-byte header: [kind, keyframe]. */
function emit(payload) {
  if (payload.type === 'frame' || payload.type === 'config') {
    const source = payload.data
    const body = Buffer.from(source.buffer, source.byteOffset, source.byteLength)
    const header = Buffer.allocUnsafe(2)
    header[0] = payload.type === 'frame' ? 1 : 0
    header[1] = payload.type === 'frame' && payload.key ? 1 : 0
    const packet = Buffer.concat([header, body], header.length + body.length)

    if (payload.type === 'config') lastConfigPacket = packet
    else if (payload.key) lastKeyframePacket = packet

    broadcastBinary(packet)
    return
  }
  broadcastJson(payload)
}

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws) => {
  viewers.add(ws)
  ws.on('close', () => viewers.delete(ws))
  ws.on('error', () => viewers.delete(ws))
  ws.on('message', (raw, isBinary) => {
    if (isBinary) return
    handleInput(raw.toString()).catch(() => {})
  })
  if (mirror.state === 'streaming' && mirror.meta) {
    ws.send(JSON.stringify({ type: 'meta', ...mirror.meta }))
    // Replay the decoder setup so this viewer can decode right away.
    if (lastConfigPacket) ws.send(lastConfigPacket, { binary: true })
    if (lastKeyframePacket) ws.send(lastKeyframePacket, { binary: true })
  }
})

async function handleInput(raw) {
  let msg
  try {
    msg = JSON.parse(raw)
  } catch {
    return
  }
  try {
    switch (msg.t) {
      case 'touch':
        await mirror.touch(msg)
        break
      case 'scroll':
        await mirror.scroll(msg)
        break
      case 'text':
        await mirror.text(String(msg.text ?? ''))
        break
      case 'key': {
        const handled = await mirror.key({ code: msg.code, meta: Number(msg.meta) || 0 })
        if (!handled && activeSerial) {
          await adb.shell(activeSerial, `input keyevent ${Number(msg.code) || 0}`)
        }
        break
      }
      case 'action':
        await runAction(msg.name)
        break
      default:
        break
    }
  } catch (error) {
    broadcastJson({ type: 'warn', message: String(error?.message ?? error) })
  }
}

async function runAction(name) {
  if (!activeSerial) return
  if (name === 'rotate') return mirror.rotate()
  if (name === 'notifications') return mirror.notificationsPanel()
  if (name === 'reset-video') return mirror.resetVideo()
  const code = KEYCODES[name]
  if (code) await adb.shell(activeSerial, `input keyevent ${code}`)
}

/* ------------------------------------------------------------------ */
/* http helpers                                                       */
/* ------------------------------------------------------------------ */

function json(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(text)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 4 * 1024 * 1024) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

function serveStatic(res, filePath) {
  const full = path.join(PUBLIC_DIR, path.normalize(filePath).replace(/^([/\\])+/, ''))
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(full)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  fs.createReadStream(full).pipe(res)
}

function requireSerial(query, body) {
  const serial = body?.serial ?? query?.get('serial') ?? activeSerial
  if (!serial) throw new Error('no device selected')
  return serial
}

/* ------------------------------------------------------------------ */
/* routes                                                             */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  const route = url.pathname
  const method = req.method ?? 'GET'

  try {
    if (method === 'GET' && (route === '/' || route === '/index.html')) {
      return serveStatic(res, 'index.html')
    }
    if (method === 'GET' && route.startsWith('/static/')) {
      return serveStatic(res, route.slice('/static/'.length))
    }

    if (method === 'GET' && route === '/health') {
      return json(res, 200, {
        ok: true,
        port: PORT,
        adbPath,
        serverJarFound: fs.existsSync(serverJarPath),
        mirror: mirror.state,
      })
    }

    if (method === 'GET' && route === '/devices') {
      const devices = (await adb.devices()).map((device) => ({
        ...device,
        mdns: device.serial.includes('._adb-tls-connect._tcp'),
        wireless: device.serial.includes(':'),
      }))
      return json(res, 200, { devices })
    }

    if (method === 'GET' && route === '/mdns') {
      return json(res, 200, { services: await adb.mdnsServices() })
    }

    if (method === 'GET' && route === '/discover') {
      const services = await adb.mdnsServices()
      return json(res, 200, {
        pairing: services.filter((service) => service.kind === 'pairing'),
        connect: services.filter((service) => service.kind === 'connect'),
        lastAddress: loadState().lastAddress ?? null,
      })
    }

    if (method === 'POST' && route === '/pair') {
      const body = await readBody(req)
      const code = String(body.code ?? '').trim()
      if (!/^\d{4,8}$/.test(code)) {
        throw new Error('Enter the 6-digit code shown on the phone.')
      }
      const address = String(body.address ?? '').trim()
      const result = await adb.pairAndConnect(code, address)
      activeSerial = result.address
      saveState({ lastAddress: result.address })
      return json(res, 200, { ok: true, ...result })
    }

    if (method === 'POST' && route === '/setup/usb') {
      const body = await readBody(req)
      const result = await adb.setupUsb(String(body.serial ?? '').trim())
      activeSerial = result.address
      saveState({ lastAddress: result.address })
      return json(res, 200, { ok: true, ...result })
    }

    if (method === 'POST' && route === '/reconnect') {
      const result = await adb.reconnect(loadState().lastAddress)
      if (result.connected) saveState({ lastAddress: result.address })
      return json(res, 200, result)
    }

    if (method === 'POST' && route === '/connect') {
      const body = await readBody(req)
      const address = await adb.connect(String(body.address ?? ''))
      saveState({ lastAddress: address })
      return json(res, 200, { ok: true, address })
    }

    if (method === 'POST' && route === '/disconnect') {
      const body = await readBody(req)
      await adb.disconnect(String(body.address ?? ''))
      return json(res, 200, { ok: true })
    }

    if (method === 'GET' && route === '/info') {
      const serial = requireSerial(url.searchParams, null)
      return json(res, 200, await adb.info(serial))
    }

    if (method === 'POST' && route === '/mirror/start') {
      const body = await readBody(req)
      let serial = requireSerial(url.searchParams, body)

      let healthy = await adb.healthySerial(serial)
      if (!healthy) {
        // A dead transport makes the whole app look "stuck on connecting".
        await adb.repair()
        healthy = await adb.healthySerial(serial)
      }
      if (!healthy) {
        throw new Error(
          'The phone is offline. Keep it awake and turn Wireless debugging on, then press Rescan.',
        )
      }

      serial = healthy
      activeSerial = serial
      saveState({ lastAddress: serial })
      clearVideoCache()

      const session = {
        maxSize: Number(body.maxSize ?? 1280),
        bitRateMbps: Number(body.bitRateMbps ?? 8),
        maxFps: Number(body.maxFps ?? 60),
      }
      // Fire and forget: the caller subscribes to /ws for progress.
      mirror.start(serial, session, emit).catch((error) => {
        console.error('[mirror]', String(error?.message ?? error))
      })
      return json(res, 200, { ok: true, serial })
    }

    if (method === 'POST' && route === '/mirror/stop') {
      await mirror.stop()
      clearVideoCache()
      emit({ type: 'state', state: 'idle' })
      return json(res, 200, { ok: true })
    }

    if (method === 'GET' && route === '/mirror/state') {
      return json(res, 200, { state: mirror.state, meta: mirror.meta, serial: activeSerial })
    }

    if (method === 'GET' && route === '/notifications') {
      const serial = requireSerial(url.searchParams, null)
      const text = await adb.shell(serial, 'dumpsys notification --noredact')
      return json(res, 200, { notifications: parseNotifications(text) })
    }

    if (method === 'GET' && route === '/apps') {
      const serial = requireSerial(url.searchParams, null)
      const text = await adb.shell(serial, 'pm list packages -3', 60000)
      const packages = parsePackages(text)
      return json(res, 200, {
        apps: packages.map((pkg) => ({ package: pkg, label: prettyAppName(pkg) })),
      })
    }

    if (method === 'POST' && route === '/apps/launch') {
      const body = await readBody(req)
      const serial = requireSerial(url.searchParams, body)
      const pkg = String(body.package ?? '')
      if (!/^[\w.]+$/.test(pkg)) throw new Error('invalid package name')
      await adb.shell(
        serial,
        `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`,
      )
      return json(res, 200, { ok: true })
    }

    if (method === 'GET' && route === '/files') {
      const serial = requireSerial(url.searchParams, null)
      const target = url.searchParams.get('path') || '/sdcard'
      if (!target.startsWith('/')) throw new Error('absolute path required')
      const text = await adb.shell(serial, `ls -1ap "${target.replace(/"/g, '')}"`)
      return json(res, 200, { path: target, entries: parseListing(text) })
    }

    if (method === 'GET' && route === '/screenshot') {
      const serial = requireSerial(url.searchParams, null)
      const png = await adb.screenshot(serial)
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' })
      return res.end(png)
    }

    if (method === 'POST' && route === '/keyevent') {
      const body = await readBody(req)
      const serial = requireSerial(url.searchParams, body)
      const key = String(body.key ?? '')
      if (KEYCODES[key]) {
        await adb.shell(serial, `input keyevent ${KEYCODES[key]}`)
        return json(res, 200, { ok: true })
      }
      const numeric = Number(body.code)
      if (!Number.isFinite(numeric)) throw new Error('unknown key')
      await adb.shell(serial, `input keyevent ${numeric}`)
      return json(res, 200, { ok: true })
    }

    if (method === 'POST' && route === '/action') {
      const body = await readBody(req)
      const serial = requireSerial(url.searchParams, body)
      activeSerial = serial
      await runAction(String(body.name ?? ''))
      return json(res, 200, { ok: true })
    }

    json(res, 404, { error: 'not found' })
  } catch (error) {
    json(res, 500, { error: String(error?.message ?? error) })
  }
})

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (pathname !== '/ws') {
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
})

server.listen(PORT, '127.0.0.1', () => {
  // Machine-readable first line so the Flutter shell can confirm startup.
  process.stdout.write(`${JSON.stringify({ ready: true, port: PORT, adbPath })}\n`)
})

const shutdown = async () => {
  try {
    await mirror.stop()
  } catch {
    /* noop */
  }
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
