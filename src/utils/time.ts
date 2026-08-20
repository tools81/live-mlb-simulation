/** Formats an ISO datetime string as a local time, e.g. "7:05 PM". */
export function formatLocalTime(isoDateTime: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoDateTime))
}

/** Returns YYYY-MM-DD for the given Date in local time (matches the MLB schedule endpoint's date param). */
export function toDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Returns the last `count` date params ending today, most recent first. */
export function recentDateParams(count: number, today: Date = new Date()): string[] {
  const dates: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dates.push(toDateParam(d))
  }
  return dates
}
