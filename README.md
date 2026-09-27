# `use cache` background regeneration is cut off on Vercel after streaming

Minimal reproduction for a Next.js 16.3 issue: a stale `"use cache: remote"` entry read inside a Suspense boundary
during a streaming (PPR resume) render starts a background regeneration that is never registered with `waitUntil`,
so Vercel aborts its outgoing `fetch` calls when the invocation ends.

- Next.js 16.3.6, React 19.3.0, `cacheComponents: true`
- `app/p/[id]/page.js` — `await params` inside `<Suspense>` makes the child render at request time; it then awaits
  `getData()`, a `"use cache: remote"` function with `cacheLife("minutes")` that makes 10 sequential `fetch` calls
  and logs each step.

## Steps

1. Deploy to Vercel (Node.js runtime, Fluid compute).
2. Request `/p/1` (fills the entry).
3. Wait more than 60 seconds (entry is stale, not expired) and request `/p/10` — the stale value is served and a
   background regeneration starts.
4. Wait ~30 seconds and request `/p/11`.
5. Read the function logs for `[repro]` lines.

## Expected

Every `regeneration … start` is followed by `fetch 10/10 ok` and `done`.

## Actual (16.3.6)

Observed on a Vercel preview deployment (UTC; the log line is attached to the request that was running at the time):

```
21:03:07 /p/1   PRERENDER resuming  [repro] regeneration 2w82jd start … fetch 1/10 … fetch 10/10 ok … done   (first fill, inside the render)
21:04:28 /p/10  HIT resuming        [repro] regeneration 4m4v0e start 21:04:29.207Z                      (stale read → background regeneration)
21:05:01 /p/11  HIT resuming        [repro] regeneration 4m4v0e fetch 1/10 ok · fetch 2/10 ok             (continues only while the next request runs)
21:06:21 /p/20  HIT resuming        [repro] regeneration 4m4v0e fetch 3/10 ok · fetch 4/10 ok
21:06:56 /p/21  HIT resuming        [repro] regeneration 4m4v0e FAILED 21:06:57.604Z TypeError: fetch failed
21:08:15 /p/30  HIT resuming        [repro] regeneration ghku0q FAILED 21:08:15.767Z TypeError: fetch failed
```

None of the five background regenerations started after the first fill (`4m4v0e`, `mj41up`, `ghku0q`, `nv8ycy`, `hcocog`) reached `done`. Each one advanced a couple of
fetches at a time, only while a *later* request was running on the same instance, and two of them eventually failed
with `TypeError: fetch failed`. Their logs appear under unrelated requests. In a larger app (Supabase client) the same
pattern surfaced as `AbortError: This operation was aborted`, and a loader with an unawaited promise turned it into an
`unhandledRejection` that exited the function process.

## Cause (as far as we can tell)

- vercel/next.js#92636 changed the stale path in `use-cache-wrapper` from `await generateCacheEntry(...)` to a
  detached promise that is only pushed to `workStore.pendingRevalidateWrites`.
- For a streaming render, `app-render` calls `executeRevalidates(workStore)` right after `renderToStream` returns;
  `executeRevalidates` copies the current `pendingRevalidateWrites` into the promise handed to `waitUntil`.
- Regenerations (and the `saveToCacheHandler` / tiered-handler writes after them) pushed later, from a `"use cache"`
  read inside a Suspense boundary that resolves during streaming, are never registered with `waitUntil`.
