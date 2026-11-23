import { formatDay, formatMonth } from "../core/normalize";

export { formatDay, formatMonth };

export const fmt = (n: number) => n.toLocaleString("en-US");

export function plural(n: number, one: string, many = one + "s"): string {
  return `${fmt(n)} ${n === 1 ? one : many}`;
}

export function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${fmt(n)} times`;
}

export function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export function duration(days: number): string {
  if (days < 14) return plural(days, "day");
  if (days < 60) return plural(Math.round(days / 7), "week");
  if (days < 730) return plural(Math.round(days / 30.4), "month");
  return `${(days / 365.25).toFixed(1).replace(/\.0$/, "")} years`;
}

const WORDS = [
  "amber", "anchor", "apricot", "atlas", "banjo", "basil", "beacon", "biscuit", "bramble", "breeze",
  "cactus", "canyon", "cobalt", "comet", "cricket", "dune", "ember", "falcon", "fennel", "fjord",
  "garnet", "glacier", "harbor", "hazel", "juniper", "kettle", "lagoon", "lantern", "maple", "meadow",
  "nectar", "nimbus", "orchid", "otter", "pebble", "pepper", "pickle", "quartz", "quill", "raven",
  "saffron", "sequoia", "sparrow", "tangerine", "thistle", "tundra", "velvet", "walnut", "willow", "zephyr",
];

/** Three random words, e.g. "otter maple comet". */
export function suggestCodeWord(): string {
  const pick = () => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return WORDS[a[0] % WORDS.length];
  };
  return `${pick()} ${pick()} ${pick()}`;
}
