# Reachability (Range Test)

`ReferencePackBoundary.simulateReachability(theme, map, startPoint, options)` answers
"where can the player stand, starting from here, and how many moves does each place take?"

## How it works

The level is treated as a graph of **standable surfaces** (spans). A span is a run of
solid or one-way tops at one height with room for the 24×24 player body above it. Walls
and low ceilings split spans.

Edges are found by running short, human-shaped **input programs** through the
authoritative `createPlayerBehavior().step`. These are the inputs a person actually holds:

* approach an edge walking or running (64px run-up), then walk off, or jump with a held
  jump of 2/6/10/22 frames, then hold the direction, let go, or reverse after the apex;
* standing hops off an edge;
* aimed jumps from below and beside anything within jump reach above (ledges, one-way
  platforms, ceiling and side pipe mouths);
* from the clicked spot, the full arc fan, which is what the overlay's green cloud shows;
* with flight (`profile: 'raccoonFlight'`): flight from the clicked point with several
  lift and steering patterns, and full-runway takeoffs from spans long enough to charge
  P-speed.

Pipe hops run the real `createPipeTravelBehavior`, so arrival positions match gameplay.
The old search branched over every input on every frame and threw away the sustained
holds (run charge, jump height) that matter. The program search keeps exactly those.

## Result

* `spans[]`: `{id, x, y, w, kind, hop, source}`. `hop` is the move count from the start
  (`0` = where you stand, `null` = unreachable). `source` names the instance under the
  span.
* `edges[]`: `{from, to, kind: walk|jump|flight|pipe|ladder, needs: [run, fullJump, flight], landing}`.
  Ladder edges come from the real climb: board where a ladder reaches the surface, climb up or down, and get off every
  few steps by walking or jumping either side.
  For each kind, the cheapest known way between two spans. Pipe edges also carry `pipe`
  and `entry`.
* `pockets[]`: strongly connected groups of reachable spans with **no edge back out**.
  These are softlocks or deliberate one-way commitments. The level decides which; the
  tool only points.
* `goal`: `{reachable, hop}` when the map has a goal marker.
* `samples[]`: cells swept by the arcs from the clicked spot, for the overlay.
* `stats`: programs, steps, and `truncated` when `maxSteps` (default 600k) runs out.

Options: `profile`, `maxSteps`, `hops` (expansion depth limit), `horizon` (frames per
program), `cellSize`.

## Editor overlay (release build, Range Test)

Gold bar = where you stand. Mint = one move away. Violet, labelled with its move count =
further. Thin red = unreachable. Red bar inside a dashed red box = pocket. Dashed violet
lines = pipe routes (entry → landing).

## Command line

```
node scripts/reachability_report.js maps/breakout_caves.llmmap.txt
node scripts/reachability_report.js maps/demo.llmmap.txt --from 176,192 --profile raccoonFlight
node scripts/reachability_report.js MAP --json
```

## Known limits

* Enemies, coins, and block contents are ignored. This is geometry reachability.
* Moving platforms count at their authored position. Breakable or hidden blocks keep
  their initial collision state.
* The standing profile covers every form: all forms share one collision box and one
  jump. Flight is its own profile.
* Programs sample the input space. A trick that needs frame-perfect input mid-air may be
  missed. That's the same blind spot most players have.
