/**
 * Turning a finding into sentences a shop owner would actually read.
 *
 * Everything here is built from numbers the detector measured. Nothing is
 * phrased more strongly than the measurement supports, and no sentence calls
 * the odd line a mistake. The page can say a line does not match the pattern,
 * because that is what was computed. Whether it is a typo, a real equipment
 * run, or a permit from a second agency is the owner's call, and the wording
 * leaves it to them.
 */

import type { Job } from "./data.ts";
import { type Finding, CLOSE_TOLERANCE } from "./detect.ts";
import { formatValue } from "./format.ts";

/** The sentences the page prints under the table. */
export interface Explanation {
  /** Which columns were telling the same story, and what was done about it. */
  readonly duplicateSentence: string;
  /** Which job and line stood out, and by how much. */
  readonly oddSentence: string;
  /** Short label for the highlighted row, for the summary card. */
  readonly headline: string;
}

/** Round a spread count to one decimal, without a pointless trailing zero. */
function spreadText(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** How both sentences refer to the odd row. */
function jobPhrase(job: Job): string {
  return `job ${job.id} in ${job.town}`;
}

/**
 * Build the explanation.
 *
 * The duplicate sentence leads, because the folding is the part that is not
 * obvious and the part that makes the rest trustworthy: without it every
 * column looks like it moves together and nothing stands out at all.
 */
export function explain(finding: Finding): Explanation {
  const { job, oddLine, duplicate, scoredCount, jobCount } = finding;

  const duplicateSentence =
    duplicate === null
      ? `No two of these ${scoredCount} columns were close enough to be one ` +
        `number recorded twice, so every one of them was counted.`
      : `${duplicate.a.label} and ${duplicate.b.label} were saying the same thing: on ` +
        `${duplicate.closeCount} of ${duplicate.jobCount} jobs they land within ` +
        `${Math.round(CLOSE_TOLERANCE * 100)}% of each other. Counting that spend twice ` +
        `would make the whole book look like it moves together, so the two were folded ` +
        `into one column, leaving ${scoredCount} to compare.`;

  const kind = oddLine.columns[0]?.kind ?? "money";
  const low = formatValue(oddLine.normalLow, kind);
  const high = formatValue(oddLine.normalHigh, kind);

  const oddSentence =
    `After that, ${jobPhrase(job)} sits farthest from the pack. Its ${oddLine.label} ` +
    `line is ${formatValue(oddLine.value, kind)}, where the other ${jobCount - 1} jobs ` +
    `run ${low} to ${high}. That puts it ${spreadText(oddLine.spreads)} spreads ` +
    `${oddLine.direction} the middle, and no other job's ${oddLine.label} line gets past ` +
    `${spreadText(oddLine.otherMaxSpreads)}.`;

  return {
    duplicateSentence,
    oddSentence,
    headline: `Job ${job.id}: ${job.work}, ${job.town}`,
  };
}
