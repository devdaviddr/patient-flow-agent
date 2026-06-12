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
