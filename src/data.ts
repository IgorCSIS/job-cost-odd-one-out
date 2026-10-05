/**
 * The made-up job book.
 *
 * Nothing in here came off a real invoice. The jobs, the towns, the hours and
 * every dollar figure are generated from a seed, which is what makes "Run
 * again" possible: a new seed is a new book of the same shape, so the odd job
 * moves without any of it ever becoming real data.
 *
 * Two of the money columns are deliberately near-copies of each other, because
 * that is the situation worth demonstrating. A small shop's books usually carry
 * the same spend twice: once off the job sheet and once off the supplier
 * invoice. Counting it twice makes everything look like it moves together,
 * which buries the line that actually does not fit.
 */

/** A trade the sample shop runs. */
export type Trade = "HVAC" | "Plumbing";

/** Which cost line was planted as the odd one, used only by the tests. */
export type PlantedLine = "permits" | "materials";

/** One closed job, with every cost line the demo shows. */
export interface Job {
  /** Stable row id, also the invoice label the table prints. */
  readonly id: string;
  /** What the work order says was done. Shown, never scored. */
  readonly work: string;
  readonly trade: Trade;
  readonly town: string;
  /** Billed hours on site, in quarter-hour steps. */
  readonly laborHours: number;
  /** Materials as typed off the job sheet, in dollars. */
  readonly materials: number;
  /** The same spend as it came off the supplier invoice, in dollars. */
  readonly parts: number;
  /** Permit and inspection fees, in dollars. */
  readonly permits: number;
  /** Round trip drive time, in minutes. */
  readonly driveMinutes: number;
  /** Labor plus materials plus permits, in dollars. Parts is not added. */
  readonly total: number;
}

/** A generated book, plus the line that was planted odd in it. */
export interface JobBook {
  readonly jobs: readonly Job[];
  /** Id of the job the generator put out of pattern. */
  readonly plantedId: string;
  /** Which line in that job was pushed out of band. */
  readonly plantedLine: PlantedLine;
}

/** How many closed jobs the table shows. */
export const JOB_COUNT = 24;

/** What the sample shop bills an hour, used to build the total. */
const LABOR_RATE = 128;

/**
 * East County towns the sample shop covers, with a typical drive from a yard in
 * El Cajon. The minutes are plausible for the map, not measured.
 *
 * The service area is kept tight on purpose. A shop that also ran two hours
 * into the desert would have a drive column so spread out that the far jobs
 * would genuinely be the odd ones, which is a different and much less
 * interesting demo than the one this page is about.
 */
const TOWNS: readonly { readonly name: string; readonly drive: number }[] = [
  { name: "El Cajon", drive: 14 },
  { name: "Santee", drive: 18 },
  { name: "La Mesa", drive: 18 },
  { name: "Lakeside", drive: 20 },
  { name: "Lemon Grove", drive: 22 },
  { name: "Spring Valley", drive: 22 },
  { name: "Alpine", drive: 28 },
  { name: "Jamul", drive: 30 },
];

/** Job descriptions, split by trade so a row reads like a real work order. */
const WORK: Readonly<Record<Trade, readonly string[]>> = {
  HVAC: [
    "AC repair",
    "Condenser replace",
    "Furnace tune-up",
    "Mini-split install",
    "Duct seal",
    "Thermostat swap",
    "Coil clean",
    "Blower motor",
  ],
  Plumbing: [
    "Water heater swap",
    "Slab leak repair",
    "Repipe section",
    "Main line clear",
    "Shower valve",
    "Hose bib replace",
    "Pressure regulator",
    "Toilet reset",
  ],
};

/**
 * A small seeded generator, so a seed always rebuilds the same book.
 *
 * Math.random would make "Run again" unreproducible, which would mean a bug
 * found once could never be looked at again. mulberry32 is a few lines, has no
 * dependency, and is plenty for made-up invoice numbers.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A shuffled roster that covers every town evenly across the book.
 *
 * Picking each job's town independently sounds fine and is not: now and then a
 * draw lands twenty jobs in two neighbouring towns, the drive column's spread
 * collapses, and the single far job becomes the genuinely odd one on that
 * column. The detector was right in those cases and the book was wrong. A real
 * shop's quarter covers its whole service area, so the roster does too.
 */
function townRoster(rnd: () => number, count: number): { name: string; drive: number }[] {
  const roster: { name: string; drive: number }[] = [];
  while (roster.length < count) {
    roster.push(...TOWNS);
  }
  roster.length = count;
  for (let i = roster.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const a = roster[i] as { name: string; drive: number };
    const b = roster[j] as { name: string; drive: number };
    roster[i] = b;
    roster[j] = a;
  }
  return roster;
}

/** Pick one item, with the generator rather than Math.random. */
function pick<T>(rnd: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rnd() * items.length)];
  if (item === undefined) {
    throw new Error("pick called with an empty list");
  }
  return item;
}

/** Round to a whole dollar. */
function dollars(value: number): number {
  return Math.round(value);
}

/**
 * Build one book of closed jobs.
 *
 * The normal pattern is deliberately tight: materials tracks labor hours,
 * parts tracks materials, permits sits in a narrow band, and drive time comes
 * from the town. Then exactly one job gets one line pushed well outside that,
 * the way a real book goes wrong: a second jurisdiction's permit fee typed
 * onto the first line, or an equipment run logged as a routine repair.
 */
export function buildBook(seed: number): JobBook {
  const rnd = makeRandom(seed);
  const jobs: Job[] = [];

  // Invoice numbers run in order from a per-seed starting point, so the column
  // reads like a work order log instead of random noise.
  const firstInvoice = 4100 + Math.floor(rnd() * 800);
  const towns = townRoster(rnd, JOB_COUNT);

  for (let i = 0; i < JOB_COUNT; i += 1) {
    const trade: Trade = rnd() < 0.55 ? "HVAC" : "Plumbing";
    const town = towns[i] as { name: string; drive: number };
    const work = pick(rnd, WORK[trade]);

    const laborHours = Math.round((2.5 + rnd() * 7) * 4) / 4;
    /*
     * Materials leans on hours but is not decided by them, which is how the
     * trade actually works: a three hour call can hang a water heater, and a
     * long slab leak can be almost all labor. Keeping the two only loosely
     * tied also keeps them from looking like the duplicate pair, which would
     * be a false finding, because hours and materials are two genuinely
     * different measurements that happen to move together.
     */
    const materials = dollars(130 + laborHours * 44 + rnd() * 640);
    /*
     * The supplier invoice and the job sheet are two records of one spend, so
     * they agree to within rounding and a restocking line. This is the pair
     * the detector is meant to catch.
     */
    const parts = dollars(materials * (0.985 + rnd() * 0.03));
    const permits = dollars(40 + rnd() * 58);
    const driveMinutes = Math.round(town.drive + (rnd() - 0.5) * 8);

    jobs.push({
      id: `${firstInvoice + i * 3}`,
      work,
      trade,
      town: town.name,
      laborHours,
      materials,
      parts,
      permits,
      driveMinutes,
      total: dollars(laborHours * LABOR_RATE + materials + permits),
    });
  }

  // Keep the planted row away from the first and last couple of rows, so it is
  // never the row a phone happens to show first.
  const oddIndex = 3 + Math.floor(rnd() * (JOB_COUNT - 6));
  const plantedLine: PlantedLine = rnd() < 0.5 ? "permits" : "materials";
  const base = jobs[oddIndex];
  if (base === undefined) {
    throw new Error("the generator picked a row that does not exist");
  }

  if (plantedLine === "permits") {
    // A permit line carrying a second agency's fee as well as the city's.
    const permits = dollars(300 + rnd() * 110);
    jobs[oddIndex] = {
      ...base,
      permits,
      total: dollars(base.laborHours * LABOR_RATE + base.materials + permits),
    };
  } else {
    /*
     * Equipment, booked to a job logged as a routine call. A flat band rather
     * than a multiple of this row, because the thing that makes it odd is the
     * size of the spend against the rest of the book, not against its own
     * hours. Both records move together: the invoice really was that big.
     */
    const materials = dollars(2400 + rnd() * 1300);
    const parts = dollars(materials * (0.985 + rnd() * 0.03));
    jobs[oddIndex] = {
      ...base,
      materials,
      parts,
      total: dollars(base.laborHours * LABOR_RATE + materials + base.permits),
    };
  }

  return { jobs, plantedId: base.id, plantedLine };
}
