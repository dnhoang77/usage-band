import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Snap } from '../types'

const snap = atom({ plugin: 'usage-band', key: 'snap' } as const, null)
const nowAtom = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)

const STORE_KEY = 'last-snap'
const HOUR = 3600_000
const WINDOW: Record<string, { ms: number; name: string }> = {
  five_hour: { ms: 5 * HOUR, name: 'Phiên 5 giờ' },
  seven_day: { ms: 7 * 24 * HOUR, name: 'Tuần 7 ngày' },
}

// Fixed dark palette: reads the same in the app's light and dark themes.
const C = {
  bg: '#0d1224',
  track: '#1c2440',
  text: '#e8eefc',
  dim: '#8590b0',
  claude: '#ff8a5b',
  ok: '#34f5a6',
}
type Tier = 'ok' | 'warn' | 'bad'
const PAL: Record<Tier, { from: string; to: string }> = {
  ok: { from: '#22d3ee', to: '#34f5a6' },
  warn: { from: '#ffd166', to: '#ff9f43' },
  bad: { from: '#ff4d6d', to: '#ff2bd6' },
}
// By what is LEFT: plenty, getting low, nearly out.
function tier(left: number): Tier {
  return left <= 20 ? 'bad' : left <= 50 ? 'warn' : 'ok'
}

// 3g05p · 2n14g · 42p
function span(ms: number): string {
  if (ms <= 0) return '0p'
  const m = Math.round(ms / 60_000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  if (d > 0) return `${d}n${String(h).padStart(2, '0')}g`
  if (h > 0) return `${h}g${String(mm).padStart(2, '0')}p`
  return `${mm}p`
}

function daysLeftInMonth(now: number): number {
  const d = new Date(now)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return last - d.getDate()
}

// When the window hits 100% at the pace used so far in it.
function eta(l: Limit, now: number): { text: string; isRisk: boolean } {
  const w = WINDOW[l.kind]
  if (!l.resetsAt || !w) return { text: '', isRisk: false }
  const reset = Date.parse(l.resetsAt)
  if (l.percentUsed >= 100) return { text: `Hết lượt · mở lại sau ${span(reset - now)}`, isRisk: true }
  if (l.percentUsed <= 0) return { text: 'Chưa dùng', isRisk: false }
  const elapsed = now - (reset - w.ms)
  if (elapsed <= 0) return { text: '', isRisk: false }
  const left = ((100 - l.percentUsed) / l.percentUsed) * elapsed
  return now + left >= reset
    ? { text: 'Đủ dùng tới reset', isRisk: false }
    : { text: `Cạn sau ~${span(left)}`, isRisk: true }
}

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

type Row = { name: string; left: number; reset: string; eta: { text: string; isRisk: boolean } }

function rows(s: Snap | null, now: number): Row[] {
  return (s?.limits ?? [])
    .filter(l => WINDOW[l.kind])
    .map(l => ({
      name: WINDOW[l.kind]?.name ?? l.kind,
      left: Math.max(0, Math.min(100, 100 - l.percentUsed)),
      reset: l.resetsAt ? span(Date.parse(l.resetsAt) - now) : '?',
      eta: eta(l, now),
    }))
}

// The card's size in CSS pixels; the Svg element is given it too, or the
// desktop's frame draws it at a small default size.
function cardSize(n: number): { W: number; H: number } {
  return { W: 760, H: 40 + Math.max(1, n) * 40 + 8 }
}

// The desktop card: one calm SVG. Bars glide in once, a soft light sweeps
// along each bar, and the live dot breathes.
function card(list: Row[], now: number, syncedAgo: string | null, isFirst: boolean): string {
  const { W, H } = cardSize(list.length)
  const ROW = 40
  const TOP = 40
  const BX = 150
  const BW = 300
  const font = `font-family="Segoe UI, Inter, system-ui, sans-serif"`
  const worst = list.reduce((m, r) => Math.min(m, r.left), 100)
  const frame = list.length ? PAL[tier(worst)].from : C.dim

  const defs: string[] = [
    `<linearGradient id="sweep" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".5" stop-color="#fff" stop-opacity=".35"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>`,
    `<linearGradient id="edge" x1="0" x2="1">
      <stop offset="0" stop-color="${frame}" stop-opacity=".9"/>
      <stop offset="1" stop-color="${C.claude}" stop-opacity=".5"/>
    </linearGradient>`,
  ]

  const body = list.map((r, i) => {
    const p = PAL[tier(r.left)]
    const y = TOP + i * ROW
    const fw = Math.max(6, (r.left / 100) * BW)
    defs.push(
      `<linearGradient id="g${i}" x1="0" x2="1"><stop offset="0" stop-color="${p.from}"/><stop offset="1" stop-color="${p.to}"/></linearGradient>`,
      `<clipPath id="c${i}"><rect x="${BX}" y="${y + 6}" width="${fw}" height="10" rx="5"/></clipPath>`,
    )
    const grow = isFirst
      ? `<animate attributeName="width" from="0" to="${fw}" dur="1.1s" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1" fill="freeze"/>`
      : ''
    const delay = (i * 0.6).toFixed(1)
    const sub = r.eta.isRisk ? r.eta.text : `reset ${r.reset} · ${r.eta.text}`
    return `
      <text x="20" y="${y + 15}" fill="${C.text}" font-size="13" font-weight="600" ${font}>${esc(r.name)}</text>
      <rect x="${BX}" y="${y + 6}" width="${BW}" height="10" rx="5" fill="${C.track}"/>
      <rect x="${BX}" y="${y + 6}" width="${fw}" height="10" rx="5" fill="url(#g${i})">${grow}</rect>
      <g clip-path="url(#c${i})">
        <rect x="${BX - 120}" y="${y + 4}" width="120" height="14" fill="url(#sweep)">
          <animate attributeName="x" from="${BX - 120}" to="${BX + BW}" dur="3.2s" begin="${delay}s" repeatCount="indefinite"/>
        </rect>
      </g>
      <text x="${BX + BW + 18}" y="${y + 17}" fill="${p.to}" font-size="20" font-weight="700" ${font}>${Math.round(r.left)}<tspan font-size="12" fill="${C.dim}" font-weight="500">% còn</tspan></text>
      <text x="${BX + BW + 92}" y="${y + 15}" fill="${r.eta.isRisk ? p.to : C.dim}" font-size="12" ${font}>${esc(sub)}</text>`
  })

  if (list.length === 0) {
    body.push(
      `<text x="20" y="${TOP + 15}" fill="${C.dim}" font-size="13" ${font}>Gửi 1 tin nhắn để nạp số liệu hạn mức…
        <animate attributeName="opacity" values=".4;1;.4" dur="2.4s" repeatCount="indefinite"/></text>`,
    )
  }

  const status = syncedAgo === null ? 'đang chờ' : `cập nhật ${syncedAgo} trước`
  const d = new Date(now)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMinYMid meet" style="display:block">
  <defs>${defs.join('')}</defs>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="${C.bg}" stroke="url(#edge)" stroke-width="1.2"/>
  <text x="20" y="25" font-size="12" font-weight="700" letter-spacing="2" ${font}><tspan fill="${C.claude}">CLAUDE</tspan><tspan fill="${C.dim}">  ·  HẠN MỨC</tspan></text>
  <circle cx="${W - 230}" cy="21" r="4" fill="${syncedAgo === null ? '#ffd166' : C.ok}">
    <animate attributeName="opacity" values="1;.35;1" dur="2.4s" repeatCount="indefinite"/>
  </circle>
  <text x="${W - 220}" y="25" fill="${C.dim}" font-size="12" ${font}>${esc(status)}  ·  T${d.getMonth() + 1} còn ${daysLeftInMonth(now)} ngày</text>
  ${body.join('')}
</svg>`
}

async function save($: EngineInterface, limits: readonly Limit[]): Promise<void> {
  if (limits.length === 0) return
  const now = await $.clock.now()
  const s: Snap = { limits: limits.map(l => ({ ...l })), at: now }
  await update($, snap, () => s)
  await update($, nowAtom, () => now)
  await $.store.set(STORE_KEY, s)
}

export const register: Register = on => {
  // The bars glide in on the first drawing only, not on each minute's redraw.
  let hasGrown = false

  on('session.start', async ($, e, next) => {
    const stored = (await $.store.get(STORE_KEY)) as Snap | undefined
    if (stored && Array.isArray(stored.limits)) await update($, snap, () => stored)
    const now = await $.clock.now()
    await update($, nowAtom, () => now)
    const u = await $.session.usage()
    await save($, u.rateLimits)
    $.clock.every(60_000, () => {
      void $.clock.now().then(t => update($, nowAtom, () => t))
    })
    await $.command.register({ name: 'usage-band', description: 'Ẩn/hiện thanh hạn mức Claude' })
    return next(e)
  })

  on('command.run', { command: 'usage-band' }, async $ => {
    const v = await update($, isHidden, h => !h)
    return { text: v ? 'Đã ẩn thanh hạn mức.' : 'Đã hiện thanh hạn mức.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await save($, e.rateLimits)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)
    const s = await read($, snap)
    const now = (await read($, nowAtom)) || Date.now()
    const list = rows(s, now)
    const synced = list.length ? span(now - (s?.at ?? now)) : null

    if (e.surface !== 'terminal') {
      const els = $.ui.resolve(e)
      if ('Svg' in els) {
        const { Box, Svg } = els
        const isFirst = !hasGrown
        hasGrown = true
        const alt = list.length
          ? list.map(r => `${r.name}: còn ${Math.round(r.left)}%, reset sau ${r.reset}`).join('; ')
          : 'Hạn mức Claude: đang chờ số liệu'
        return (
          <Box>
            <Svg
              source={card(list, now, synced, isFirst)}
              alt={alt}
              width={cardSize(list.length).W}
              height={cardSize(list.length).H}
              isInteractive
            />
          </Box>
        )
      }
    }

    // Terminal: the same facts, quiet text.
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
        <Text>
          <Text color="claude" bold>CLAUDE · HẠN MỨC</Text>
          <Text dimColor>{`  ${synced ? `cập nhật ${synced} trước` : 'đang chờ'} · tháng còn ${daysLeftInMonth(now)} ngày`}</Text>
        </Text>
        {list.length === 0 && <Text dimColor>Gửi 1 tin nhắn để nạp số liệu hạn mức…</Text>}
        {list.map(r => {
          const n = Math.round((r.left / 100) * 20)
          const c = r.left <= 20 ? 'error' : r.left <= 50 ? 'warning' : 'success'
          return (
            <Text key={r.name}>
              <Text dimColor>{r.name.padEnd(12)}</Text>
              <Text color={c}>{'━'.repeat(n)}</Text>
              <Text dimColor>{'─'.repeat(20 - n)}</Text>
              <Text color={c} bold>{` ${Math.round(r.left)}%`}</Text>
              <Text dimColor>{`  ${r.eta.isRisk ? r.eta.text : `reset ${r.reset}`}`}</Text>
            </Text>
          )
        })}
      </Box>
    )
  })
}
