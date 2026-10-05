/**
 * Finding the line that does not match.
 *
 * Three steps, and none of them predict anything:
 *
 *   1. Put every cost column on the same footing, using the middle value and
 *      the typical distance from it rather than the average and the standard
 *      deviation. The average is dragged toward whatever is unusual, which is
 *      a problem when the unusual thing is what you are looking for.
 *   2. If two columns turn out to be carrying the same information, fold them
 *      into one. Keeping both would count that spend twice and make the whole
 *      book look like it moves together.
 *   3. Measure how far each job sits from the middle of the pack, and report
 *      the farthest one plus whichever of its lines put it there.
 *
 * That is linear algebra on a 24 by 5 table. It is not a forecast, it does not
 * learn, and it has no opinion about what a job should cost.
 */

import type { Job } from "./data.ts";

/** A numeric cost line the detector scores. */
export interface ColumnSpec {
  readonly key: NumericKey;
  readonly label: string;
  readonly kind: "money" | "hours" | "minutes";
}

/** The keys on Job that hold a number the detector may look at. */
export type NumericKey =
  | "laborHours"
  | "materials"
  | "parts"
  | "permits"
  | "driveMinutes";

/**
 * The scored columns.
 *
 * Total is shown in the table but deliberately left out here. It is labor plus
 * materials plus permits, so scoring it would count those three a second time
 * and guarantee that the biggest total wins no matter what is actually wrong.
 */
export const SCORED_COLUMNS: readonly ColumnSpec[] = [
  { key: "laborHours", label: "Labor hours", kind: "hours" },
  { key: "materials", label: "Materials", kind: "money" },
  { key: "parts", label: "Parts", kind: "money" },
  { key: "permits", label: "Permits", kind: "money" },
  { key: "driveMinutes", label: "Drive time", kind: "minutes" },
];

/**
 * How alike two columns have to be before the detector treats them as one
 * record of the same thing.
 *
 * The bar sits where it does because of what the two kinds of pair actually
 * measure on this book. A sweep of twenty thousand generated books puts the
 * pair that really is one spend recorded twice no lower than 0.97, and puts
 * the closest honest pair, labor hours against a materials column, no higher
 * than 0.90. This bar sits in that gap. Set it much lower and the detector
 * starts folding two genuinely different measurements that happen to move
 * together, which would be a false finding reported in confident language.
 */
const DUPLICATE_THRESHOLD = 0.95;

/** Scales a typical absolute deviation up to something comparable to a sigma. */
const MAD_TO_SIGMA = 1.4826;

/** What the detector concluded about a pair of columns saying the same thing. */
export interface DuplicatePair {
  readonly a: ColumnSpec;
  readonly b: ColumnSpec;
  /** How tightly the two move together, from 0 to 1. */
  readonly correlation: number;
  /**
   * Jobs where the two raw figures land within CLOSE_TOLERANCE of each other.
   *
   * Deliberately measured on the dollars and not on the scaled columns. The
   * scaled version of this count answers a different question than it appears
   * to: each column is divided by its own spread, that spread is a quantile
   * estimated off two dozen points, and two estimates can differ by a tenth
   * even when the columns are all but identical. The count then drops for
   * reasons that have nothing to do with the books. Comparing the raw figures
   * says the thing actually worth saying, which is that these two columns are
   * two records of one number, and a reader can check it against the table.
   */
  readonly closeCount: number;
  readonly jobCount: number;
}

/** How near two raw figures have to be to count as the same number. */
export const CLOSE_TOLERANCE = 0.05;

/** The odd line inside the odd job. */
export interface OddLine {
  /** The raw columns behind this line. One, or two when they were folded. */
  readonly columns: readonly ColumnSpec[];
  /** How the line reads in a sentence, for example "materials and parts". */
  readonly label: string;
  /** How many typical spreads this line sits from the middle of the pack. */
  readonly spreads: number;
  /** Whether the line is above the middle or below it. */
  readonly direction: "above" | "below";
  /** Lowest value this line takes across every other job. */
  readonly normalLow: number;
  /** Highest value this line takes across every other job. */
  readonly normalHigh: number;
  /** This job's own value, averaged when two columns were folded. */
  readonly value: number;
  /**
   * The farthest any other job's same line sits from the middle, in spreads.
   *
   * Kept separate from Finding.distance on purpose. Distance is measured across
   * every column at once, so comparing it to a single line's spreads would be
   * comparing two different things in one sentence. This is the same
   * measurement on the same line, which is the only honest way to say that
   * nothing else comes close.
   */
  readonly otherMaxSpreads: number;
}

/** Everything the page needs to highlight a row and explain itself. */
export interface Finding {
  readonly job: Job;
  readonly oddLine: OddLine;
  /** Distance from the middle of the pack, in spreads. */
  readonly distance: number;
  /** The next farthest job's distance, for an honest "everything else" claim. */
  readonly runnerUpDistance: number;
  /** Null when no two columns were alike enough to fold. */
  readonly duplicate: DuplicatePair | null;
  /** How many columns were left after folding. */
  readonly scoredCount: number;
  /** How many jobs were scored, so the sentences can say "the other 23". */
  readonly jobCount: number;
}

/** Middle value of a list. Does not mutate the input. */
function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("median of an empty list");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] as number;
  }
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Typical distance from the middle, expressed on the same scale a standard
 * deviation would use.
 *
 * Falls back to the mean absolute deviation when more than half the column
 * holds the same value, and to 1 when the column does not vary at all. Without
 * those fallbacks a flat column divides by zero and every job comes back
 * infinitely odd.
 */
function spread(values: readonly number[]): number {
  const mid = median(values);
  const absolute = values.map((value) => Math.abs(value - mid));
  const mad = median(absolute) * MAD_TO_SIGMA;
  if (mad > 1e-9) {
    return mad;
  }
  const mean = absolute.reduce((sum, value) => sum + value, 0) / absolute.length;
  return mean > 1e-9 ? mean * MAD_TO_SIGMA : 1;
}

/**
 * Turn a column into its ranks, averaging ties.
 *
 * Used so the correlation below is measured on positions rather than amounts.
 */
function ranks(values: readonly number[]): number[] {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (
      j + 1 < order.length &&
      (order[j + 1] as { value: number }).value ===
        (order[i] as { value: number }).value
    ) {
      j += 1;
    }
    const shared = (i + j) / 2;
    for (let k = i; k <= j; k += 1) {
      result[(order[k] as { index: number }).index] = shared;
    }
    i = j + 1;
  }
  return result;
}

/**
 * How alike two columns are, measured on ranks rather than amounts.
 *
 * Ranks matter here. A straight correlation of the amounts is pulled toward 1
 * by any single extreme point, and an extreme point is exactly what this file
 * exists to find: one fat materials figure makes materials look like a near
 * copy of every column it is compared against, including labor hours. Ranking
 * first means one job can move a column's order by one place and no more, so
 * the pair that really is the same spend twice is the pair that wins.
 */
function correlate(rawLeft: readonly number[], rawRight: readonly number[]): number {
  const left = ranks(rawLeft);
  const right = ranks(rawRight);
  const n = left.length;
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / n;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let varLeft = 0;
  let varRight = 0;
  for (let i = 0; i < n; i += 1) {
    const dl = (left[i] as number) - meanLeft;
    const dr = (right[i] as number) - meanRight;
    covariance += dl * dr;
    varLeft += dl * dl;
    varRight += dr * dr;
  }
  const denominator = Math.sqrt(varLeft * varRight);
  return denominator > 1e-12 ? covariance / denominator : 0;
}

/** Pull one column out of the book as plain numbers. */
function columnOf(jobs: readonly Job[], key: NumericKey): number[] {
  return jobs.map((job) => job[key]);
}

/** Smallest and largest value in a list, named the way OddLine wants them. */
function normalBand(
  values: readonly number[],
): { normalLow: number; normalHigh: number } {
  return {
    normalLow: values.reduce((lowest, value) => Math.min(lowest, value), Infinity),
    normalHigh: values.reduce(
      (highest, value) => Math.max(highest, value),
      -Infinity,
    ),
  };
}

/**
 * Score the book and return the one job that sits farthest from the pack.
 *
 * Throws when handed fewer than four jobs, because a spread measured off three
 * numbers is not a pattern and calling it one would be the dishonest part.
 */
export function findOddOne(jobs: readonly Job[]): Finding {
  if (jobs.length < 4) {
    throw new Error("findOddOne needs at least four jobs to have a pattern");
  }

  // Step one: scale every column by its own middle and spread.
  const raw = new Map<NumericKey, number[]>();
  const scaled = new Map<NumericKey, number[]>();
  for (const column of SCORED_COLUMNS) {
    const values = columnOf(jobs, column.key);
    const mid = median(values);
    const width = spread(values);
    raw.set(column.key, values);
    scaled.set(
      column.key,
      values.map((value) => (value - mid) / width),
    );
  }

  const read = (key: NumericKey): number[] => {
    const values = scaled.get(key);
    if (values === undefined) {
      throw new Error(`column ${key} was never scaled`);
    }
    return values;
  };

  // Step two: find the most alike pair, and fold it if it clears the bar.
  let duplicate: DuplicatePair | null = null;
  let best = DUPLICATE_THRESHOLD;
  for (let i = 0; i < SCORED_COLUMNS.length; i += 1) {
    for (let j = i + 1; j < SCORED_COLUMNS.length; j += 1) {
      const a = SCORED_COLUMNS[i] as ColumnSpec;
      const b = SCORED_COLUMNS[j] as ColumnSpec;
      const r = correlate(read(a.key), read(b.key));
      if (Math.abs(r) > best) {
        best = Math.abs(r);
        const left = raw.get(a.key) as number[];
        const right = raw.get(b.key) as number[];
        let close = 0;
        for (let k = 0; k < jobs.length; k += 1) {
          const x = left[k] as number;
          const y = right[k] as number;
          const scale = Math.max(Math.abs(x), Math.abs(y), 1e-9);
          if (Math.abs(x - y) / scale <= CLOSE_TOLERANCE) {
            close += 1;
          }
        }
        duplicate = {
          a,
          b,
          correlation: r,
          closeCount: close,
          jobCount: jobs.length,
        };
      }
    }
  }

  /*
   * Folding two near-identical columns into their average is the whole of the
   * reduction. Think of the pair as spanning a plane: almost all of the
   * variation lies along the direction where both rise together, and the
   * direction where they disagree is rounding. Averaging keeps the first and
   * throws away the second, which is exactly one direction dropped.
   */
  const folded: { columns: ColumnSpec[]; label: string; values: number[] }[] = [];
  for (const column of SCORED_COLUMNS) {
    if (duplicate !== null && column.key === duplicate.b.key) {
      continue;
    }
    if (duplicate !== null && column.key === duplicate.a.key) {
      const left = read(duplicate.a.key);
      const right = read(duplicate.b.key);
      folded.push({
        columns: [duplicate.a, duplicate.b],
        label: `${duplicate.a.label.toLowerCase()} and ${duplicate.b.label.toLowerCase()}`,
        values: left.map((value, k) => (value + (right[k] as number)) / 2),
      });
      continue;
    }
    folded.push({
      columns: [column],
      label: column.label.toLowerCase(),
      values: read(column.key),
    });
  }

  // Step three: distance from the middle of the pack, job by job.
  const distances = jobs.map((_job, row) => {
    let sumOfSquares = 0;
    for (const group of folded) {
      const value = group.values[row] as number;
      sumOfSquares += value * value;
    }
    return Math.sqrt(sumOfSquares);
  });

  let oddRow = 0;
  for (let row = 1; row < distances.length; row += 1) {
    if ((distances[row] as number) > (distances[oddRow] as number)) {
      oddRow = row;
    }
  }

  const runnerUp = distances
    .filter((_value, row) => row !== oddRow)
    .reduce((highest, value) => Math.max(highest, value), 0);

  // Which of that job's lines put it out there.
  let worst = folded[0] as (typeof folded)[number];
  for (const group of folded) {
    if (
      Math.abs(group.values[oddRow] as number) >
      Math.abs(worst.values[oddRow] as number)
    ) {
      worst = group;
    }
  }

  const oddJob = jobs[oddRow] as Job;
  const others = jobs.filter((_job, row) => row !== oddRow);
  const otherValues = worst.columns.flatMap((column) =>
    columnOf(others, column.key),
  );
  const ownValues = worst.columns.map((column) => oddJob[column.key]);
  const signed = worst.values[oddRow] as number;

  return {
    job: oddJob,
    oddLine: {
      columns: worst.columns,
      label: worst.label,
      spreads: Math.abs(signed),
      direction: signed >= 0 ? "above" : "below",
      ...normalBand(otherValues),
      value: ownValues.reduce((sum, value) => sum + value, 0) / ownValues.length,
      otherMaxSpreads: worst.values.reduce(
        (highest, value, row) =>
          row === oddRow ? highest : Math.max(highest, Math.abs(value)),
        0,
      ),
    },
    distance: distances[oddRow] as number,
    runnerUpDistance: runnerUp,
    duplicate,
    scoredCount: folded.length,
    jobCount: jobs.length,
  };
}
