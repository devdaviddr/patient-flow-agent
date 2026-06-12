import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)

// Sim times are UTC — format in UTC so they aren't shifted to the viewer's timezone.
export function fmtDateTime(iso: string | undefined): string {
  return iso ? dayjs.utc(iso).format("DD-MM-YYYY HH:mm") : "—"
}

export function fmtTime(iso: string | undefined): string {
  return iso ? dayjs.utc(iso).format("HH:mm") : "—"
}

// Real wall-clock timestamps (assessment start / log lines) — shown in local time.
export function fmtClock(iso: string | undefined): string {
  return iso ? dayjs(iso).format("DD-MM-YYYY HH:mm:ss") : "—"
}
export function fmtClockTime(iso: string | undefined): string {
  return iso ? dayjs(iso).format("HH:mm:ss") : "—"
}

// Reformat ISO timestamps embedded in free text (e.g. the agent's rationale) to the
// app's DD-MM-YYYY HH:mm style, and strip the trailing Z from bare "11:20Z" times.
export function humanizeTimes(text: string): string {
  return text
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?/g, (m) =>
      dayjs.utc(m).format("DD-MM-YYYY HH:mm"),
    )
    .replace(/\b(\d{1,2}:\d{2})Z\b/g, "$1")
}
