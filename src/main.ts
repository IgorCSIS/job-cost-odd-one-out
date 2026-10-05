/**
 * Wiring: build a book, draw it, and highlight what does not match.
 *
 * The DOM is built with createElement and textContent only. There is no
 * innerHTML anywhere in this file, which means no string of text can ever
 * become markup, no matter where it came from.
 */

import "./styles.css";
import { buildBook, JOB_COUNT, type Job } from "./data.ts";
import { findOddOne, SCORED_COLUMNS, type Finding } from "./detect.ts";
import { explain } from "./explain.ts";
import { formatValue, type ValueKind } from "./format.ts";

/** A column as the table draws it, which includes the ones left unscored. */
interface TableColumn {
  readonly key: keyof Job;
  readonly label: string;
  readonly kind: ValueKind | "text";
}

/**
 * The table's columns, in the order they are drawn.
 *
 * Job carries the work description too, so the row reads like a work order
 * without spending a tenth column on it. Total is drawn but never scored, for
 * the reason the disclosure gives.
 */
const TABLE_COLUMNS: readonly TableColumn[] = [
  { key: "trade", label: "Trade", kind: "text" },
  { key: "town", label: "Town", kind: "text" },
  { key: "laborHours", label: "Labor hours", kind: "hours" },
  { key: "materials", label: "Materials", kind: "money" },
  { key: "parts", label: "Parts", kind: "money" },
  { key: "permits", label: "Permits", kind: "money" },
  { key: "driveMinutes", label: "Drive time", kind: "minutes" },
  { key: "total", label: "Total", kind: "money" },
];

/** Query params this page will act on. Anything else is ignored, never echoed. */
const ALLOWED_PARAMS = new Set(["fail"]);

/** Grab an element by id, or fail loudly rather than limping on with null. */
function need<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`the page is missing #${id}`);
  }
  return element as T;
}

const els = {
  find: need<HTMLButtonElement>("find"),
  again: need<HTMLButtonElement>("again"),
  status: need<HTMLParagraphElement>("status"),
  head: need<HTMLTableSectionElement>("jobs-head"),
  body: need<HTMLTableSectionElement>("jobs-body"),
  scroll: need<HTMLDivElement>("table-scroll"),
  verdict: need<HTMLDivElement>("verdict"),
  verdictEmpty: need<HTMLParagraphElement>("verdict-empty"),
  verdictDuplicate: need<HTMLParagraphElement>("verdict-duplicate"),
  verdictOdd: need<HTMLParagraphElement>("verdict-odd"),
  spreadNote: need<HTMLParagraphElement>("spread-note"),
};

/** The book on screen right now, and the seed that built it. */
let jobs: readonly Job[] = [];
let seed = 0;

/** Keys of the columns the detector scored, for marking the folded pair. */
const SCORED_KEYS = new Set<string>(SCORED_COLUMNS.map((column) => column.key));

/** True when the visitor asked not to be animated. */
function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Set the live region's text and tone in one place. */
function setStatus(text: string, tone: "info" | "found" | "error"): void {
  els.status.textContent = text;
  els.status.dataset.tone = tone;
}

/** Make a cell, with its alignment class and its text already set. */
function cell(text: string, kind: TableColumn["kind"]): HTMLTableCellElement {
  const td = document.createElement("td");
  if (kind === "text") {
    td.className = "col-text";
  }
  td.textContent = text;
  return td;
}

/** Draw the header row. */
function drawHead(): void {
  els.head.textContent = "";
  const row = document.createElement("tr");

  const job = document.createElement("th");
  job.scope = "col";
  job.className = "col-text";
  job.textContent = "Job";
  row.appendChild(job);

  for (const column of TABLE_COLUMNS) {
    const th = document.createElement("th");
    th.scope = "col";
    // A header carries its column's alignment, or the numbers sit under a
    // right-aligned label while the words sit under a left-aligned one.
    if (column.kind === "text") {
      th.className = "col-text";
    }
    th.textContent = column.label;
    th.dataset.key = String(column.key);
    row.appendChild(th);
  }
  els.head.appendChild(row);
}

/** Draw every row of the current book, unhighlighted. */
function drawBody(): void {
  els.body.textContent = "";
  for (const job of jobs) {
    const row = document.createElement("tr");
    row.dataset.jobId = job.id;

    const header = document.createElement("th");
    header.scope = "row";
    const id = document.createElement("span");
    id.className = "job-id";
    id.textContent = job.id;
    const work = document.createElement("span");
    work.className = "job-work";
    work.textContent = job.work;
    header.append(id, work);
    row.appendChild(header);

    for (const column of TABLE_COLUMNS) {
      const value = job[column.key];
      const text =
        column.kind === "text" ? String(value) : formatValue(Number(value), column.kind);
      const td = cell(text, column.kind);
      td.dataset.key = String(column.key);
      row.appendChild(td);
    }
    els.body.appendChild(row);
  }
}

/** Strip every highlight, so a second run never leaves the first one behind. */
function clearHighlight(): void {
  for (const row of Array.from(els.body.rows)) {
    row.classList.remove("is-odd");
    for (const td of Array.from(row.cells)) {
      td.classList.remove("is-odd-cell", "is-paired");
      const flag = td.querySelector(".odd-flag");
      if (flag !== null) {
        flag.remove();
      }
    }
  }
  for (const th of Array.from(els.head.rows[0]?.cells ?? [])) {
    th.classList.remove("is-paired");
  }
}

/** Put the page back to the state it loads in. */
function resetVerdict(): void {
  clearHighlight();
  els.verdict.dataset.state = "resting";
  els.verdictEmpty.hidden = false;
  els.verdictDuplicate.hidden = true;
  els.verdictOdd.hidden = true;
  els.spreadNote.hidden = true;
  els.find.className = "btn btn-primary";
  els.again.className = "btn btn-ghost";
}

/** Build a fresh book and draw it. Throws if the arithmetic cannot run. */
function load(nextSeed: number): void {
  seed = nextSeed;
  const book = buildBook(seed);
  if (book.jobs.length !== JOB_COUNT) {
    throw new Error("the generator returned the wrong number of jobs");
  }
  jobs = book.jobs;
  drawHead();
  drawBody();
}

/** Mark the odd row, the odd cell, and the pair that was folded. */
function highlight(finding: Finding): void {
  const oddKeys = new Set<string>(finding.oddLine.columns.map((column) => column.key));
  const pairKeys =
    finding.duplicate === null
      ? new Set<string>()
      : new Set<string>([finding.duplicate.a.key, finding.duplicate.b.key]);

  for (const th of Array.from(els.head.rows[0]?.cells ?? [])) {
    if (th.dataset.key !== undefined && pairKeys.has(th.dataset.key)) {
      th.classList.add("is-paired");
    }
  }

  for (const row of Array.from(els.body.rows)) {
    const isOdd = row.dataset.jobId === finding.job.id;
    if (isOdd) {
      row.classList.add("is-odd");
    }
    for (const td of Array.from(row.cells)) {
      const key = td.dataset.key;
      if (key === undefined || !SCORED_KEYS.has(key)) {
        continue;
      }
      if (pairKeys.has(key)) {
        td.classList.add("is-paired");
      }
      if (isOdd && oddKeys.has(key)) {
        td.classList.add("is-odd-cell");
      }
    }
    if (isOdd) {
      // A colour-only highlight is no highlight at all for anyone who cannot
      // see the colour, so the row says so in words as well.
      const header = row.cells[0];
      if (header !== undefined) {
        const flag = document.createElement("span");
        flag.className = "odd-flag";
        flag.textContent = "Odd one out";
        header.appendChild(flag);
      }
    }
  }
}

/** Bring the highlighted row into view inside the table's own scroller. */
function revealRow(jobId: string): void {
  const row = els.body.querySelector(`tr[data-job-id="${CSS.escape(jobId)}"]`);
  if (row === null) {
    return;
  }
  const behavior: ScrollBehavior = reducedMotion() ? "auto" : "smooth";
  row.scrollIntoView({ behavior, block: "center" });
}

/** Run the detector on the book that is already drawn, and report it. */
function findOdd(): void {
  const finding = findOddOne(jobs);
  const words = explain(finding);

  clearHighlight();
  highlight(finding);

  els.verdictEmpty.hidden = true;
  els.verdictDuplicate.textContent = words.duplicateSentence;
  els.verdictDuplicate.hidden = false;
  els.verdictOdd.textContent = words.oddSentence;
  els.verdictOdd.hidden = false;
  els.verdictOdd.className = "verdict-line lead";
  els.verdict.dataset.state = "found";
  els.spreadNote.hidden = false;

  setStatus(`${words.headline}. The ${finding.oddLine.label} line does not match.`, "found");

  // Run again becomes the primary action: it is what there is left to do, and
  // a finished state with no ember button on it looks broken.
  els.find.className = "btn btn-ghost";
  els.again.className = "btn btn-primary";

  revealRow(finding.job.id);
}

/** The one place a failure is turned into something the visitor can read. */
function fail(error: unknown): void {
  setStatus("Demo couldn't load. Try again.", "error");
  els.verdict.dataset.state = "error";
  els.verdictEmpty.hidden = false;
  els.verdictEmpty.textContent = "Demo couldn't load. Try again.";
  els.verdictDuplicate.hidden = true;
  els.verdictOdd.hidden = true;
  els.spreadNote.hidden = true;
  els.find.className = "btn btn-primary";
  els.again.className = "btn btn-ghost";
  // Worth a console line for whoever is looking, but the message above is the
  // only thing the page says out loud, and it never blames the visitor's data
  // because there is no visitor data here to blame.
  console.error("Job Cost Odd-One-Out could not run:", error);
}

/**
 * Pick the starting seed.
 *
 * `?fail=1` is a test hook that forces the error path, so the failure state can
 * be checked without breaking the build on purpose. It is matched against a
 * whitelist and never printed back onto the page.
 */
function startingSeed(): number {
  const params = new URLSearchParams(window.location.search);
  for (const key of params.keys()) {
    if (!ALLOWED_PARAMS.has(key)) {
      continue;
    }
    if (key === "fail" && params.get("fail") === "1") {
      return 0;
    }
  }
  // A seed from the clock, so two visitors do not compare notes on the same
  // book and conclude the answer is hard-coded.
  return (Date.now() % 2000000) + 1;
}

/** Draw a new book and reset everything that described the old one. */
function reshuffle(nextSeed: number): void {
  resetVerdict();
  load(nextSeed);
  setStatus(`${JOB_COUNT} different closed jobs loaded. Nothing has been checked yet.`, "info");
}

function start(): void {
  const first = startingSeed();
  if (first === 0) {
    // The forced-failure hook: build nothing, show the error path.
    fail(new Error("forced by the fail test hook"));
    return;
  }
  load(first);
  setStatus(`${JOB_COUNT} closed jobs loaded. Nothing has been checked yet.`, "info");
}

els.find.addEventListener("click", () => {
  try {
    if (jobs.length === 0) {
      load(startingSeed() || 1);
    }
    findOdd();
  } catch (error) {
    fail(error);
  }
});

els.again.addEventListener("click", () => {
  try {
    // Step the seed rather than re-rolling the clock, so a rapid double tap
    // cannot land on the same book twice and look like nothing happened.
    reshuffle(seed + 1 || 1);
  } catch (error) {
    fail(error);
  }
});

try {
  start();
} catch (error) {
  fail(error);
}
