const UNITS: [RegExp, string][] = [
  [/_kph$/, "km/h"],
  [/_mps$/, "m/s"],
  [/_pct$/, "%"],
  [/_rpm$|^rpm$/, "rpm"],
  [/_c$/, "°C"],
  [/_m$/, "m"],
  [/_s$/, "s"],
  [/_mbar$/, "mbar"],
];

/** "throttle_pct" → { name: "Throttle", unit: "%" }. */
export function fieldLabel(f: string): { name: string; unit: string | null } {
  let unit: string | null = null;
  let base = f;
  for (const [re, u] of UNITS) {
    if (re.test(f)) {
      unit = u;
      base = f === "rpm" ? "rpm" : f.replace(re, "");
      break;
    }
  }
  const name = base.replace(/_/g, " ");
  return { name: name === "rpm" ? "RPM" : name.charAt(0).toUpperCase() + name.slice(1), unit };
}

export function fieldTitle(f: string): string {
  const l = fieldLabel(f);
  return l.unit ? `${l.name} (${l.unit})` : l.name;
}

const PREFERRED = ["speed", "throttle", "brake", "gear", "rpm", "drs"];

/** Default channels: the usual driving inputs that exist in the file, in a fixed order. */
export function defaultChannels(available: string[], n = 4): string[] {
  const out: string[] = [];
  for (const p of PREFERRED) {
    const f = available.find((x) => x === p || x.startsWith(`${p}_`));
    if (f && !out.includes(f)) out.push(f);
    if (out.length >= n) break;
  }
  return out;
}

/** Fields worth plotting (skip ids and timestamps). */
export function plottable(fields: string[]): string[] {
  return fields.filter((f) => !/(^|_)(ns|id|number)$/.test(f) && f !== "t" && f !== "driver_number");
}
