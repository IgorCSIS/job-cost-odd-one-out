/**
 * How numbers are printed.
 *
 * One place, so the table, the summary card and the sentences underneath can
 * never disagree about what a figure looks like.
 */

/** The kinds of quantity the table holds. */
export type ValueKind = "money" | "hours" | "minutes";

/** Whole dollars with a thousands separator. No cents: the book is rounded. */
function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/** Print a value the way its column prints it. */
export function formatValue(value: number, kind: ValueKind): string {
  switch (kind) {
    case "money":
      return money(value);
    case "hours":
      // Quarter hours, so one decimal is enough and 6.0 reads better as 6.
      return Number.isInteger(value) ? `${value} h` : `${value.toFixed(2).replace(/0$/, "")} h`;
    case "minutes":
      return `${Math.round(value)} min`;
  }
}
