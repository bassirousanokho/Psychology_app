/** Side-by-side layout for overlapping blocks: lane index + lane count per cluster. */
export function layoutLanes(appts: { id: string; startTime: string; endTime: string }[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...appts].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const result = new Map<string, { lane: number; lanes: number }>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const c of cluster) result.set(c.id, { lane: c.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const a of sorted) {
    const start = new Date(a.startTime).getTime();
    const end = new Date(a.endTime).getTime();
    if (start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) lane = laneEnds.push(end) - 1;
    else laneEnds[lane] = end;
    cluster.push({ id: a.id, lane });
    clusterEnd = Math.max(clusterEnd === -Infinity ? end : clusterEnd, end);
  }
  flush();
  return result;
}

const MIN_VISIBLE_HOURS = 6;

/**
 * Hours shown in the week grid: the practice's working hours, extended to include
 * any session that starts earlier or ends later (local time).
 */
export function gridHours(
  workingHoursStart: string,
  workingHoursEnd: string,
  appts: { startTime: string; endTime: string }[],
): { start: number; end: number } {
  const [wsH] = workingHoursStart.split(":").map(Number);
  const [weH, weM] = workingHoursEnd.split(":").map(Number);
  let start = wsH;
  let end = weM > 0 ? weH + 1 : weH;

  for (const a of appts) {
    const s = new Date(a.startTime);
    const e = new Date(a.endTime);
    start = Math.min(start, s.getHours());
    // A session ending at 21:00 needs the 20:00 row; one ending 21:15 needs 21:00 too
    const endHour = e.getMinutes() > 0 ? e.getHours() + 1 : e.getHours();
    // Sessions crossing midnight are cut at the end of the day
    end = Math.max(end, e.getDate() !== s.getDate() ? 24 : endHour);
  }

  start = Math.max(0, start);
  end = Math.min(24, Math.max(end, start + MIN_VISIBLE_HOURS));
  if (end - start < MIN_VISIBLE_HOURS) start = Math.max(0, end - MIN_VISIBLE_HOURS);
  return { start, end };
}
