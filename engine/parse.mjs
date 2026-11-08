/** Parsers for `adb shell` text output. Heuristic by nature, but stable in practice. */

function cleanValue(raw) {
  let v = raw.trim()
  // dumpsys wraps values as: String (foo), SpannableString (foo), CharSequence (foo)
  const wrap = /^(?:String|SpannableString|CharSequence|StringBuilder)\s*\((.*)\)$/s.exec(v)
  if (wrap) v = wrap[1]
  return v.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
}

export function parseNotifications(text) {
  const out = []
  let current = null

  const commit = () => {
    if (!current) return
    if (current.title || current.text) {
      current.id = `${current.pkg}:${out.length}`
      out.push(current)
    }
    current = null
  }

  for (const line of text.split(/\r?\n/)) {
    if (/^\s*NotificationRecord\(/.test(line)) {
      commit()
      const pkg = /pkg=([^\s]+)/.exec(line)?.[1] ?? 'unknown'
      current = { id: '', pkg, title: '', text: '', sub: '', time: Date.now() }
      continue
    }
    if (!current) continue

    const field = /^\s*(android\.(?:title|text|bigText|subText))=/.exec(line)
    if (field) {
      const value = cleanValue(line.slice(line.indexOf('=') + 1))
      if (!value) continue
      if (field[1] === 'android.title') current.title = value
      else if (field[1] === 'android.text' || field[1] === 'android.bigText') {
        current.text = current.text || value
      } else if (field[1] === 'android.subText') current.sub = value
    }
  }
  commit()

  // Drop system noise we cannot act on.
  return out
    .filter((n) => n.pkg !== 'android' || n.title)
    .slice(0, 80)
}

export function parsePackages(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('package:'))
    .map((l) => l.slice('package:'.length))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

export function parseListing(text) {
  const entries = []
  for (const line of text.split(/\r?\n/)) {
    const name = line.trim()
    if (!name || name === '.' || name === '..') continue
    const isDir = name.endsWith('/')
    const clean = isDir ? name.slice(0, -1) : name
    if (!clean) continue
    entries.push({ name: clean, dir: isDir })
  }
  return entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
}

export function prettyAppName(pkg) {
  const last = pkg.split('.').filter(Boolean).pop() ?? pkg
  return last.charAt(0).toUpperCase() + last.slice(1)
}
