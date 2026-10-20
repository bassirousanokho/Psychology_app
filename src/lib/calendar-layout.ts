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
