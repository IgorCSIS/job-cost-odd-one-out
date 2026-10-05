# Job Cost Odd-One-Out

A demo for HVAC and plumbing owners in East County San Diego. A job closes, and
the question is whether anything on it looks wrong. This page shows two dozen
closed jobs and points at the one cost line that does not match the pattern.

**Live:** https://igorcsis.github.io/job-cost-odd-one-out/

Every job on the page is made up. They are generated in the browser from a
seed, there is no import, no upload and no account, and the page says so
directly under its own heading:

> Demo only. These jobs are made up. Nothing is connected to your books.

## What it does

Twenty four closed jobs for a sample shop, with labor hours, materials, parts,
permits, drive time and a total. Press **Find the odd one.** and the page
highlights one row, highlights the line inside that row that put it there, and
explains the result in two plain sentences. **Run again** builds a different
book, so the answer moves.

The interesting part is not the outlier. It is the pair of columns that hides
it. Materials comes off the job sheet and parts comes off the supplier invoice,
and on these books they are two records of the same spend. Count that spend
twice and every column looks like it moves together, which is the state most
small books are actually in.

## How the arithmetic works

Three steps, in `src/detect.ts`:

1. **Scale the columns.** Hours, dollars and minutes are not comparable as
   they are, so each column is measured against its own middle value and its
   own typical distance from that middle. The middle rather than the average,
   because an average is pulled toward whatever is unusual and the unusual
   thing is the thing being looked for.
2. **Drop the duplicate direction.** The most alike pair of columns is found,
   and if it clears the bar it is folded into one. Two near-identical columns
   span a plane where nearly all the variation lies along the direction they
   rise together and the rest is rounding. Averaging keeps the first and
   discards the second, which is one direction dropped.
3. **Flag the point farthest from the normal cluster.** With the columns on
   the same footing and the duplicate gone, each job's distance from the middle
   of the pack is measured, and the farthest one is reported along with
   whichever line contributed most of that distance.

That is linear algebra on a 24 by 5 table. It does not learn, it does not
forecast, and it has no opinion about what a job should cost. It can say a line
does not match the others. It cannot say whether that is a typo, a real
equipment run, or a permit from a second agency, and the copy does not pretend
otherwise.

Two details worth naming:

- **The alikeness test runs on ranks, not amounts.** A straight correlation of
  the amounts is dragged toward 1 by any single extreme point, and an extreme
  point is exactly what is being hunted. One fat materials figure makes
  materials look like a near copy of every column it is compared against,
  including labor hours. Ranking first caps how far one job can move a column.
- **Totals are never scored.** A total is labor plus materials plus permits, so
  scoring it would count those three a second time and the biggest job would
  win every run regardless of what was actually out of pattern. The column is
  drawn because an owner expects to see it, and left out of the arithmetic.

### The threshold

Two columns are folded when their rank correlation clears `0.95`
(`DUPLICATE_THRESHOLD` in `src/detect.ts`). The bar sits there because of what
was measured, not because it looked round. Across a sweep of twenty thousand
generated books:

| Pair | Worst case |
| --- | --- |
| Materials against parts, which really is one spend recorded twice | `0.97` |
| Labor hours against a materials column, the closest honest pair | `0.90` |

The bar sits in that gap. Set it much lower and the detector starts folding two
genuinely different measurements that happen to move together, which would be a
false finding delivered in confident language.

Over the same twenty thousand books the detector picked out the planted row and
the planted line on every one of them. That number is not printed on the page
and should not be: it describes synthetic books of a known shape, not anybody's
real accounts.

## Running it

```
npm install
npm run dev        # local dev server
npm run build      # typecheck, then bundle into dist/
npm run typecheck  # types only
```

`npm run build` runs `tsc --noEmit` before Vite, so a type error fails the
build rather than shipping. TypeScript is in strict mode with
`noUncheckedIndexedAccess`.

## Layout

```
index.html                              the page
src/main.ts                             wiring, table drawing, highlighting
src/detect.ts                           scale, fold, measure distance
src/data.ts                             the seeded synthetic job book
src/explain.ts                          findings turned into sentences
src/format.ts                           how dollars, hours and minutes print
src/styles.css                          the contractor lane, one accent
public/logo.svg, public/favicon.svg     four bars, one of them odd
vite.config.ts                          base path and the CSP concession
.github/workflows/deploy.yml            build, then publish dist to Pages
.github/workflows/no-ai-attribution.yml the attribution check
CONVENTIONS.md                          the rules anything writing here follows
```

## Security notes

The page declares a Content-Security-Policy in a meta tag as the first element
in `<head>`, with `default-src 'none'` and `connect-src 'none'`. The second one
is the one that matters: this page talks to nothing, so there is no endpoint a
cost figure could leak to, and the policy makes that a rule instead of a
promise.

Two honest limits:

- `frame-ancestors` cannot be set from a meta tag, only from a response header,
  and GitHub Pages does not let you set headers. So this page can be framed.
  There is nothing on it to clickjack, but the gap is real and worth naming
  rather than papering over.
- Because the policy has no `unsafe-inline`, Vite's module-preload polyfill is
  switched off in `vite.config.ts`. It is an inline script and would be blocked.

The DOM is built with `createElement` and `textContent` throughout. No file in
`src/` calls `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`,
`eval` or `new Function`. Those names appear in this repository only in
comments and rules saying they are not used, including this sentence.

One query parameter is read, `?fail=1`, which forces the error path so the
failure state can be checked without breaking the build on purpose. It is
matched against a whitelist and never printed back onto the page.

## Dependencies

None at runtime. TypeScript and Vite are build-time only, and the built site is
one HTML file, one stylesheet and one script, about 29 KB in total before
compression. No fonts are fetched; the page uses the system stack.

## The rest of the chain

Respond fast, follow up, win the job, ask for the review, then check the books:

- [Instant Lead Response](https://github.com/IgorCSIS/instant-lead-response)
- [Lead Follow-up](https://github.com/IgorCSIS/lead-followup)
- [Ridgeview Remodeling](https://github.com/IgorCSIS/ridgeview-remodeling-demo)
- [Review Ask](https://github.com/IgorCSIS/review-ask)
- Job Cost Odd-One-Out, this one

## License

MIT. See [LICENSE](LICENSE).
