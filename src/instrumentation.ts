// Runs once per server instance before any request is handled.
export function register() {
  // Dates are computed on the server ("today", portal booking hours, server-rendered
  // times). Cloud Run defaults to UTC, which shifts every time by several hours, so pin
  // the process to the practice time zone (Montréal by default) unless TZ is set.
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.TZ) {
    process.env.TZ = "America/Toronto";
  }
}
