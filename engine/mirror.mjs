import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { AdbScrcpyClient, AdbScrcpyOptionsLatest } from '@yume-chan/adb-scrcpy'

const DEVICE_SERVER_PATH = '/data/local/tmp/scrcpy-server.jar'
const SERVER_VERSION = '3.3.3'

const TOUCH_ACTION = { down: 0, up: 1, move: 2 }

function withTimeout(promise, ms, message) {
  promise.catch(() => {})
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

/**
 * Owns one scrcpy session: pushes the server jar, starts the stream,
 * and exposes input injection.
 */
export class MirrorService {
  constructor({ adbService, serverJarPath }) {
    this.adbService = adbService
    this.serverJarPath = serverJarPath
    this.client = null
    this.adb = null
    this.controller = null
    this.state = 'idle'
    this.meta = null
    this.emit = () => {}
  }

  async start(serial, options, emit) {
    await this.stop()
    this.emit = emit
    this.state = 'starting'
    emit({ type: 'state', state: 'starting' })

    try {
      const adb = await withTimeout(
        this.adbService.client.createAdb({ serial }),
        15000,
        'The phone is not responding — it looks offline.',
      )
      this.adb = adb

      emit({ type: 'log', message: 'Uploading device agent…' })
      await withTimeout(
        AdbScrcpyClient.pushServer(
          adb,
          Readable.toWeb(createReadStream(this.serverJarPath)),
          DEVICE_SERVER_PATH,
        ),
        60000,
        'Could not upload the device agent. Is the phone still connected?',
      )

      const scrcpyOptions = new AdbScrcpyOptionsLatest(
        {
          video: true,
          audio: false,
          control: true,
          sendCodecMeta: true,
          videoCodec: 'h264',
          videoBitRate: Math.round((options.bitRateMbps ?? 8) * 1_000_000),
          maxSize: options.maxSize ?? 1280,
          maxFps: options.maxFps ?? 60,
          stayAwake: true,
          powerOn: true,
          clipboardAutosync: true,
          logLevel: 'error',
        },
        { version: SERVER_VERSION },
      )

      emit({ type: 'log', message: 'Starting video stream…' })
      const client = await withTimeout(
        AdbScrcpyClient.start(adb, DEVICE_SERVER_PATH, scrcpyOptions),
        25000,
        'The phone did not start streaming. Keep it unlocked and try again.',
      )
      this.client = client
      this.controller = client.controller ?? null

      const video = await withTimeout(
        client.videoStream,
        25000,
        'The video stream never arrived. Keep the phone unlocked and retry.',
      )
      this.meta = {
        serial,
        width: video.metadata.width ?? 0,
        height: video.metadata.height ?? 0,
        codec: 'h264',
      }
      emit({ type: 'meta', ...this.meta })

      video.stream
        .pipeTo(
          new WritableStream({
            write: (packet) => {
              if (packet.type === 'configuration') {
                emit({ type: 'config', data: packet.data })
              } else {
                emit({ type: 'frame', data: packet.data, key: Boolean(packet.keyframe) })
              }
            },
          }),
        )
        .catch((error) => {
          this.state = 'error'
          emit({ type: 'error', message: String(error?.message ?? error) })
        })

      // Surface the device agent's own output — it explains real failures.
      client.output
        .pipeTo(
          new WritableStream({
            write: (line) => {
              const text = String(line ?? '').trim()
              if (text) emit({ type: 'log', message: text })
            },
          }),
        )
        .catch(() => {})

      if (client.clipboard) {
        client.clipboard
          .pipeTo(new WritableStream({ write: () => {} }))
          .catch(() => {})
      }

      this.state = 'streaming'
      emit({ type: 'state', state: 'streaming' })
    } catch (error) {
      this.state = 'error'
      emit({ type: 'error', message: String(error?.message ?? error) })
      throw error
    }
  }

  async stop() {
    const client = this.client
    this.client = null
    this.controller = null
    this.state = 'idle'
    this.meta = null
    if (client) {
      try {
        await client.close()
      } catch {
        /* already gone */
      }
    }
  }

  async touch({ action, x, y, vw, vh }) {
    if (!this.controller) return
    const isUp = action === 'up'
    await this.controller.injectTouch({
      action: TOUCH_ACTION[action] ?? 2,
      pointerId: 0n,
      pointerX: Math.round(x),
      pointerY: Math.round(y),
      videoWidth: Math.round(vw),
      videoHeight: Math.round(vh),
      pressure: isUp ? 0 : 1,
      actionButton: 0,
      buttons: 0,
    })
  }

  async scroll({ x, y, vw, vh, dx, dy }) {
    if (!this.controller) return
    const clamp = (v) => Math.max(-1, Math.min(1, v))
    await this.controller.injectScroll({
      pointerX: Math.round(x),
      pointerY: Math.round(y),
      videoWidth: Math.round(vw),
      videoHeight: Math.round(vh),
      scrollX: clamp(dx),
      scrollY: clamp(dy),
      buttons: 0,
    })
  }

  async text(text) {
    if (!this.controller) return
    await this.controller.injectText(text)
  }

  /** Returns false when there is no live control channel. */
  async key({ code, meta = 0 }) {
    const value = Number(code)
    if (!Number.isFinite(value) || !this.controller) return false
    await this.controller.injectKeyCode({ action: 0, keyCode: value, repeat: 0, metaState: meta })
    await this.controller.injectKeyCode({ action: 1, keyCode: value, repeat: 0, metaState: meta })
    return true
  }

  async rotate() {
    await this.controller?.rotateDevice()
  }

  async notificationsPanel() {
    await this.controller?.expandNotificationPanel()
  }

  async resetVideo() {
    await this.controller?.resetVideo()
  }
}
