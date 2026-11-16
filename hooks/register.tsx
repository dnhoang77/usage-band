import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Snap } from '../types'

const snap = atom({ plugin: 'usage-band', key: 'snap' } as const, null)
const nowAtom = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)

const STORE_KEY = 'last-snap'
const HOUR = 3600_000
const WINDOW: Record<string, { ms: number; name: string }> = {
  five_hour: { ms: 5 * HOUR, name: 'phiên 5h' },
  seven_day: { ms: 7 * 24 * HOUR, name: 'tuần 7n ' },
}
const BAR = 20

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

function pad(t: string, n: number): string {
  return t.length >= n ? t : t + ' '.repeat(n - t.length)
}

// Colour by what is LEFT: plenty green, getting low yellow, nearly out red.
function tone(left: number): 'success' | 'warning' | 'error' {
  return left <= 20 ? 'error' : left <= 50 ? 'warning' : 'success'
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
  if (l.percentUsed >= 100) return { text: `✖ hết · mở lại sau ${span(reset - now)}`, isRisk: true }
  if (l.percentUsed <= 0) return { text: '○ chưa dùng', isRisk: false }
  const elapsed = now - (reset - w.ms)
  if (elapsed <= 0) return { text: '', isRisk: false }
  const left = ((100 - l.percentUsed) / l.percentUsed) * elapsed
  return now + left >= reset
    ? { text: '✓ đủ dùng tới reset', isRisk: false }
    : { text: `▲ cạn sau ~${span(left)}`, isRisk: true }
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
  on('session.start', async ($, e, next) => {
    const stored = (await $.store.get(STORE_KEY)) as Snap | undefined
    if (stored && Array.isArray(stored.limits)) await update($, snap, () => stored)
    const now = await $.clock.now()
    await update($, nowAtom, () => now)
    const u = await $.session.usage()
    await save($, u.rateLimits)
    $.clock.every(30_000, () => {
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
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, snap)
    const now = (await read($, nowAtom)) || Date.now()
    const limits = (s?.limits ?? []).filter(l => WINDOW[l.kind])
    const minLeft = limits.reduce((m, l) => Math.min(m, 100 - l.percentUsed), 100)
    const isLive = limits.length > 0

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={isLive ? tone(minLeft) : 'subtle'}
        paddingX={1}
      >
        <Text mono wrap="truncate">
          <Text color="claude" bold>❯ claude</Text>
          <Text color="subtle">::</Text>
          <Text bold>hạn-mức</Text>
          <Text color="subtle">{'  │  tháng còn '}</Text>
          <Text bold>{daysLeftInMonth(now)}</Text>
          <Text color="subtle">{' ngày  │  '}</Text>
          <Text color={isLive ? 'success' : 'warning'}>●</Text>
          <Text color="subtle">
            {isLive ? ` cập nhật ${span(now - (s?.at ?? now))} trước` : ' chờ dữ liệu'}
          </Text>
        </Text>

        {!isLive && (
          <Text mono color="subtle" wrap="truncate">
            {'  '}gửi 1 tin nhắn để lấy số liệu hạn mức…
          </Text>
        )}

        {limits.map(l => {
          const left = Math.max(0, Math.min(100, 100 - l.percentUsed))
          const full = Math.round((left / 100) * BAR)
          const c = tone(left)
          const reset = l.resetsAt ? span(Date.parse(l.resetsAt) - now) : '?'
          const t = eta(l, now)
          return (
            <Text key={l.kind} mono tabular wrap="truncate">
              <Text color="subtle">{pad(WINDOW[l.kind]?.name ?? l.kind, 9)}</Text>
              <Text color={c}>{'━'.repeat(full)}</Text>
              <Text color="inactive">{'─'.repeat(BAR - full)}</Text>
              <Text color={c} bold>{' ' + String(Math.round(left)).padStart(3) + '%'}</Text>
              <Text color="subtle">{'  ↻ '}</Text>
              <Text>{pad(reset, 6)}</Text>
              <Text color="subtle">{'  '}</Text>
              <Text color={t.isRisk ? c : 'success'}>{t.text}</Text>
            </Text>
          )
        })}
      </Box>
    )
  })
}
