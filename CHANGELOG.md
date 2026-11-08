# Changelog

All notable changes to PhoneDeck are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-08

First public release.

### Added

- Live Android mirroring: 60 fps H.264 over WebSocket, decoded with WebCodecs.
- Mouse, wheel and keyboard input; clipboard paste; hardware buttons
  (back, home, recents, rotate, volume, power, screenshot).
- Notification shade, installed-app list with search and launch, `/sdcard` file browser,
  device info and stream-quality presets.
- Pairing flow: one-click USB setup, code-only Wi-Fi pairing, and automatic mDNS reconnect.
- Local engine on `127.0.0.1:8787` with a documented HTTP/WebSocket API.
- Bundled `adb.exe` and `scrcpy-server 3.3.3` — no Android SDK required.
- Electron shell with single-instance guard, work-area clamping and dark title bar.

### Fixed

- Viewers that joined after the encoder started received no SPS/PPS and stayed black;
  the engine now caches and replays the config and the last keyframe.
- Dead ADB transports left the UI stuck on “Connecting”; the engine now health-checks the
  serial, repairs stale transports and reports an actionable error.
- The video canvas was clipped instead of scaled; it now fits the stage while keeping the
  phone's aspect ratio, so input mapping stays exact.
- Narrow windows wrapped the stream buttons; buttons and serial labels now stay on one line.
- Long engine calls (mDNS, pairing, connect, scrcpy start) are bounded by timeouts.

### Known limits

- `FLAG_SECURE` windows (banking, DRM) render black.
- Call audio remains on the phone.
- iOS is not supported.
- ~10–15 % battery per hour while mirroring.
