import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { AdbServerClient } from '@yume-chan/adb'
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp'

const execFileAsync = promisify(execFile)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Never let a hung adb/mDNS socket freeze the UI. */
function withTimeout(promise, ms, message) {
  promise.catch(() => {})
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

function splitAddress(address) {
  const index = String(address ?? '').lastIndexOf(':')
  if (index === -1) return { host: String(address ?? ''), port: 0 }
  return {
    host: String(address).slice(0, index),
    port: Number(String(address).slice(index + 1)) || 0,
  }
}

/**
 * Thin wrapper around the locally bundled adb.exe plus the ADB server client.
 * Everything talks to 127.0.0.1:5037 — nothing leaves the machine.
 */
export class AdbService {
  constructor(adbPath) {
    this.adbPath = adbPath
    this._client = null
    this._started = false
  }

  async ensureServer() {
    if (this._started) return
    await execFileAsync(this.adbPath, ['start-server'], {
      windowsHide: true,
      timeout: 30000,
    })
    this._started = true
  }

  get client() {
    if (!this._client) {
      this._client = new AdbServerClient(
        new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 }),
      )
    }
    return this._client
  }

  async devices() {
    await this.ensureServer()
    const list = await withTimeout(
      this.client.getDevices(['device', 'unauthorized', 'offline']),
      12000,
      'ADB did not answer',
    )
    return list.map((d) => ({
      serial: d.serial,
      state: d.state,
      model: d.model ?? null,
      product: d.product ?? null,
      device: d.device ?? null,
      transportId: d.transportId.toString(),
    }))
  }

  /** Every mDNS service the adb server can see, tagged by kind. */
  async mdnsServices() {
    await this.ensureServer()
    let services = []
    try {
      const supported = await withTimeout(
        this.client.mDns.check(),
        4000,
        'mDNS check timed out',
      )
      if (!supported) return []
      services = await withTimeout(
        this.client.mDns.getServices(),
        5000,
        'mDNS discovery timed out',
      )
    } catch {
      return []
    }
    return services
      .map(({ name, service, address }) => {
        const { host, port } = splitAddress(address)
        const kind = /pairing/i.test(service ?? '')
          ? 'pairing'
          : /connect/i.test(service ?? '')
            ? 'connect'
            : 'other'
        return { name, service, host, port, kind }
      })
      .filter((entry) => entry.host && entry.port)
  }

  /**
   * Pairs with the phone. When `address` is omitted the pairing service is
   * discovered over mDNS, so the user never types an IP or port.
   */
  async pair(address, code) {
    await this.ensureServer()
    let target = String(address ?? '').trim()

    if (!target) {
      const service = (await this.mdnsServices()).find((s) => s.kind === 'pairing')
      if (!service) {
        throw new Error(
          'No pairing service found. On the phone open Wireless debugging → "Pair device with pairing code".',
        )
      }
      target = `${service.host}:${service.port}`
    }

    await withTimeout(
      this.client.wireless.pair(target, String(code ?? '').trim()),
      35000,
      'Pairing timed out. Check the code shown on the phone and try again.',
    )
    return target
  }

  /** Pair, then immediately attach to the phone's mDNS connect service. */
  async pairAndConnect(code, address) {
    const pairedWith = await this.pair(address, code)
    await sleep(1200)

    let service = (await this.mdnsServices()).find((s) => s.kind === 'connect')
    for (let attempt = 0; attempt < 8 && !service; attempt += 1) {
      await sleep(700)
      service = (await this.mdnsServices()).find((s) => s.kind === 'connect')
    }

    if (!service) {
      throw new Error(
        'Paired. Now toggle Wireless debugging off and on, then press Rescan.',
      )
    }

    const addressToUse = `${service.host}:${service.port}`
    await this.connectWithRetry(addressToUse)
    return { address: addressToUse, pairedWith }
  }

  async connect(address) {
    await this.ensureServer()
    const target = String(address ?? '').trim()
    try {
      await withTimeout(
        this.client.wireless.connect(target),
        15000,
        `Could not reach ${target}`,
      )
    } catch (error) {
      const message = String(error?.message ?? error)
      if (!/already connected/i.test(message)) throw error
    }
    return target
  }

  async connectWithRetry(address, attempts = 4) {
    let lastError = null
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await this.connect(address)
      } catch (error) {
        lastError = error
        await sleep(900)
      }
    }
    throw lastError ?? new Error('Could not connect to the phone')
  }

  async disconnect(address) {
    await this.ensureServer()
    await this.client.wireless.disconnect(String(address ?? '').trim())
  }

  /** Try the last known address, then anything advertising a connect service. */
  async reconnect(savedAddress) {
    await this.ensureServer()

    const current = await this.devices()
    const attached = current.find((device) => device.state === 'device')
    if (attached) return { connected: true, address: attached.serial }

    const candidates = []
    // A saved mDNS name is not a connectable host:port; skip it.
    if (savedAddress && savedAddress.includes(':') && !savedAddress.includes('_adb-tls-connect')) {
      candidates.push(savedAddress)
    }
    for (const service of (await this.mdnsServices()).filter((s) => s.kind === 'connect')) {
      candidates.push(`${service.host}:${service.port}`)
    }

    for (const candidate of candidates) {
      try {
        await this.connect(candidate)
        await sleep(500)
        const devices = await this.devices()
        if (devices.some((device) => device.state === 'device')) {
          return { connected: true, address: candidate }
        }
      } catch {
        /* try the next candidate */
      }
    }

    return { connected: false }
  }

  /** Returns a serial that actually answers, preferring the requested one. */
  async healthySerial(preferred) {
    const devices = await this.devices()
    const ready = devices.filter((device) => device.state === 'device')
    const ordered = preferred
      ? [...ready.filter((device) => device.serial === preferred), ...ready.filter((device) => device.serial !== preferred)]
      : ready

    for (const device of ordered) {
      try {
        await this.raw(['-s', device.serial, 'shell', 'true'], 8000)
        return device.serial
      } catch {
        /* transport is dead, try the next */
      }
    }
    return null
  }

  /** Clears dead transports so a stale entry cannot block a fresh connection. */
  async repair() {
    await this.ensureServer()
    try {
      await this.raw(['reconnect', 'offline'], 12000)
    } catch {
      /* nothing to repair */
    }
    await sleep(400)

    const devices = await this.devices()
    for (const device of devices) {
      if (device.state === 'offline' && device.serial.includes(':')) {
        try {
          await this.disconnect(device.serial)
        } catch {
          /* already gone */
        }
      }
    }
    await sleep(400)
  }

  /** Best-effort read of the phone's Wi-Fi address. */
  async wifiIp(serial) {
    const probes = [
      ['ip -f inet addr show wlan0', /inet\s+(\d+\.\d+\.\d+\.\d+)\//],
      ['ip route get 8.8.8.8', /src\s+(\d+\.\d+\.\d+\.\d+)/],
      ['getprop dhcp.wlan0.ipaddress', /(\d+\.\d+\.\d+\.\d+)/],
    ]

    for (const [command, pattern] of probes) {
      try {
        const output = await this.shell(serial, command, 10000)
        const match = pattern.exec(output)
        if (match?.[1] && match[1] !== '0.0.0.0') return match[1]
      } catch {
        /* next probe */
      }
    }

    try {
      const output = await this.shell(serial, 'ip -f inet addr', 10000)
      const addresses = [...output.matchAll(/inet\s+(\d+\.\d+\.\d+\.\d+)/g)]
        .map((match) => match[1])
        .filter((ip) => !ip.startsWith('127.'))
      return addresses[0] ?? null
    } catch {
      return null
    }
  }

  /**
   * One-click setup: USB cable → switch adbd to TCP → connect over Wi-Fi.
   * No codes, no addresses.
   */
  async setupUsb(serial) {
    await this.ensureServer()
    const devices = await this.devices()

    let target = serial ? devices.find((device) => device.serial === serial) : null
    if (!target) {
      target =
        devices.find((device) => device.state === 'device' && !device.serial.includes(':')) ??
        devices.find((device) => device.state === 'device')
    }

    if (!target) {
      const pending = devices.find((device) => device.state === 'unauthorized')
      if (pending) {
        throw new Error('Tap "Allow" on the phone screen, then press the button again.')
      }
      throw new Error('No phone on USB. Plug in the cable and enable USB debugging.')
    }

    if (target.state !== 'device') {
      throw new Error(`Phone is ${target.state}. Check the cable and the Allow prompt.`)
    }

    const ip = await this.wifiIp(target.serial)
    if (!ip) {
      throw new Error('The phone is not on Wi-Fi. Join a network first, or use Wi-Fi pairing.')
    }

    try {
      await this.raw(['-s', target.serial, 'tcpip', '5555'], 30000)
    } catch {
      /* already in TCP mode */
    }
    await sleep(2000)

    const address = `${ip}:5555`
    await this.connectWithRetry(address)
    return { address }
  }

  async shell(serial, command, timeout = 25000) {
    const { stdout } = await execFileAsync(
      this.adbPath,
      ['-s', serial, 'shell', command],
      {
        windowsHide: true,
        timeout,
        maxBuffer: 32 * 1024 * 1024,
        encoding: 'utf8',
      },
    )
    return stdout
  }

  async raw(args, timeout = 120000) {
    const { stdout } = await execFileAsync(this.adbPath, args, {
      windowsHide: true,
      timeout,
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8',
    })
    return stdout
  }

  /** Binary-safe screenshot. Never use `adb shell` for this (CRLF corruption). */
  screenshot(serial) {
    return new Promise((resolve, reject) => {
      const proc = spawn(
        this.adbPath,
        ['-s', serial, 'exec-out', 'screencap', '-p'],
        { windowsHide: true },
      )
      const chunks = []
      proc.stdout.on('data', (c) => chunks.push(c))
      proc.stderr.on('data', () => {})
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0 && chunks.length) resolve(Buffer.concat(chunks))
        else reject(new Error(`screencap failed (exit ${code})`))
      })
    })
  }

  async info(serial) {
    const [model, version, size, battery] = await Promise.all([
      this.shell(serial, 'getprop ro.product.model').catch(() => ''),
      this.shell(serial, 'getprop ro.build.version.release').catch(() => ''),
      this.shell(serial, 'wm size').catch(() => ''),
      this.shell(serial, 'dumpsys battery').catch(() => ''),
    ])
    const sizeMatch = /Override size:\s*(\d+x\d+)/.exec(size) || /Physical size:\s*(\d+x\d+)/.exec(size)
    const [width, height] = (sizeMatch?.[1] ?? '0x0').split('x').map(Number)
    const level = /level:\s*(\d+)/.exec(battery)?.[1]
    return {
      serial,
      model: model.trim(),
      android: version.trim(),
      width,
      height,
      battery: level ? Number(level) : null,
    }
  }
}
