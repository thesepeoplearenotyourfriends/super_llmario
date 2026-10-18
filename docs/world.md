# World (explore)

An endless world in every direction, generated as you arrive. Pick **World (explore)** in the
release build's map picker. There's no goal: you wander, and home is where you started.

## How it works

- **Screens.** The world is a grid of 40×24-cell screens (640×384 px). Each screen is a pure
  function of `(seed, screen x, screen y)` (`worldScreen` in the engine boundary). Nothing is
  stored: come back to a screen and it's rebuilt identically.
- **Regions.** Each run of 4 screens in a row picks a character: **plain** (long continuous ground, mostly solid
  floors: the breather), **broken** (holes, wide openings, gappy floors bridged by one-way platforms, the odd air screen),
  **open** (mostly air screens) or **deep** (rock with tunnels, from 2 rows below home down). Plain is the most common;
  districts shift the mix (Meadow plainer, Warren more broken and open), and so does height (more open sky up high).
- **Screens** are **ground** (a height profile filled solid to the screen bottom, drawn as terraces), **air** (no ground,
  just one-way platforms: a zigzag from the bottom middle to a ledge under the top middle, plus steps out to each side) or
  **rock** (solid, with a 4-row tunnel from side to side that grows taller where it steps). A floor is **solid**, a
  **hole** (cols 17–22), **wide** (cols 11–28), **gappy** (three gaps, each bridged) or open **air**.
- **Edges.** Where two screens meet side by side, the ground is at one shared height (low row 20, mid 15 or high 10).
  Between different heights ground ramps in steps of at most 4 rows; between equal ones it may be flat, a hill or a
  valley. Edges next to an opening, home or a plot stay low.
- **Ways back up.** Ground under an opening is flat and takes a climbing room whose ledge sits under the opening; air
  screens climb bottom to top; rock has a floor on top. Home (0,0) has no openings.
- **Rooms** fill flat low ground: ASCII sketches of the 40×20 space above the floor in `world/rooms/*.llmroom.txt` (see
  below), picked by weighted hash and sometimes mirrored. Climbing rooms go only under openings. The room compiler records
  which openings a room tolerates (nothing standing on the floor across them). Shaped ground gets simple content: coins,
  an enemy, a prize block.
- **Districts.** Each 8×3-screen patch gets a character from a short list: Meadow (few holes,
  lots of hills), Warren (riddled with holes, climbing rooms, wave goombas), Pipeworks (pipe
  rooms, koopas instead of goombas), Thorns (spikies instead of goombas), Brickyard (block
  rooms). A district shifts the region mix, multiplies the odds of rooms carrying its
  favoured tags, and swaps enemies. Home's own enemies are never swapped. The status bar names the
  district you're in. The list is `WORLD_DISTRICTS` in the engine boundary.
- **Biomes by depth.** Sky, ground, caves, castle, with boundaries that shift every 8 screens.
  A glance at the ground style tells you roughly how deep you are. Biomes nudge room odds too:
  sky favours `sky` rooms, caves `pipes`, castle `blocks`.
- **Rolling window.** The engine plays a 3×3-screen window (`worldWindowMap`, an ordinary
  reference map) and rebuilds it when you're a little way into another screen, which takes
  about one frame. You, your speed and held buttons, nearby enemies, a held shell and
  emerging pickups carry across. Taken coins and used or broken blocks are remembered by
  stable instance ID for the session, even after their screen leaves the window. Dying
  respawns you where you last entered a screen.
- **Capture.** While exploring, the **Editor** button opens the current window as an
  ordinary map, starting where you stand: "that would make a good level", then refine it.
- **Status bar** shows the seed and your offset from home in screens (`⌂ →3 ↑2`). Pause →
  **New world** rolls a random seed.

## Writing a room

```
@room kind=ascent weight=2 tags=climb
@llmario-ascii 3
@cell 16
@note Zigzag up through one-way shelves to the ledge under the hole above.

<exactly 40 columns × 20 rows of ASCII v3 glyphs>

@at …   @place …   @pipe …   (any ASCII v3 directive)
```

- `kind=plain`: any screen whose top has no hole. `kind=ascent`: used only under a hole (so a climb always leads
  somewhere), and must climb from the floor to a
  one-way ledge at **row 2 spanning cols 15–24** (under the hole above, cols 17–22).
- `weight=N`: pick frequency. `tags=a,b`: what districts and biomes look for (`hills`,
  `blocks`, `pipes`, `spiky`, `climb`, `sky`; new tags are fine, they just aren't favoured
  anywhere until a district names them). `home`: exactly one room, always at (0,0).
- `solidfloor`: the generator never cuts a hole under this room (for rooms with something
  standing over the middle of the floor). The compiler refuses a room without it that stands
  anything but enemies or pickups on the floor across cols 17–22.
- Row 19 stands on the floor band, so don't draw the floor. Keep the floor walkable end to
  end, including hopping a 6-cell hole at cols 17–22 unless the room is `solidfloor`.

`tests/world.test.js` runs the reachability checker on every room in a neighbourhood: flat
floors either side, a floor with a hole above for ascent rooms, and an ascent room below
when its own floor has a hole. The floor must run both ways, the hole must work up and down,
and there must be no pockets. A room that fails can't ship.
`node scripts/world_rooms.js` prints the compiled rooms. The release build runs the same
module.

## Promoting a capture into a room

Found a good screen? Press **Editor**, fix it up, save the map, then:

```
node scripts/world_room_from_map.js capture.llmmap.txt --header "kind=plain tags=hills" -o world/rooms/my_room.llmroom.txt
node --test tests/world.test.js
```

The screen defaults to the one you were standing in (the map's start marker); `--screen CX,CY`
picks another. The floor band is left out because the generator owns it. Anything spilling out
of the 40×20 interior, or a pipe wired to somewhere outside the screen, is refused with a
reason. The room compiler's rules (such as `solidfloor`) are checked before anything is
written, and the tests then put the room through the reachability checks. Captured enemies
keep their exact type, so a koopa captured in Pipeworks stays a koopa everywhere.

## Plots: your edits to the world

In the interface the unit is a **screen** (one 40×24-cell section of the world).

- **Flow.** Exploring, press **Editor**: it opens at the screen you're standing on. Edit. Press
  **Back to game**; if anything changed, *"Save changes to N screens? Save / Discard / Cancel"*.
  The window rebuilds and your edits are there. Find another spot, repeat: the new edit is
  appended to the same file.
- **Storage is by position, not by plot.** The file holds edited screens keyed by screen
  coordinates, with their objects at true world positions, plus an explicit list of edited
  screen coordinates (an emptied screen must stay empty, not regenerate). A saved screen
  replaces generation there completely, floor band included. An object belongs to the screen
  its anchor is in, and every saved screen is complete on its own: terrain and static white
  platforms that cross a screen seam are cut into one piece per screen when saved (and when a
  world file loads), and play stitches touching ground pieces of one style back together, so
  neither tall walls nor seams in the grass give it away.
- **A plot is a named view**, not a container: a name plus the rectangle of screens you were
  looking at. Plots own nothing and may overlap. **Edit ▸ Plots** lists them and switches the
  editor between them; the editor shows one plot at a time, so unrelated plots never look like
  neighbours. Deleting a plot removes the bookmark only.
- **Saved means changed.** A screen is saved only if it differs from what the generator would
  make there (compare at save time, so edit-then-undo saves nothing). Looking around saves
  nothing. The same comparison greys out **Restore original**.
- **Side panel.** For plots, the *Map area* section (pixel left/top/width/height, Fit map)
  becomes *Plot area*: `3 × 2 screens` and **Add screen ← ↑ → ↓**, each adding one whole
  screen; undo removes it again. Revealed screens show what the game
  would show: saved content if that screen was edited (by any plot), generation otherwise.
  Dotted lines mark every screen; saved screens are outlined in gold.
  The world has no top or bottom, so nothing greys out.
- **Restore original** (Edit menu): puts the screen you last pointed at back the way the world
  made it, after a confirm; one undo step. *Restore all screens in this plot* too. Both are
  greyed out when there's nothing to restore.
- **Where generated meets saved,** the generator closes its doors on that edge (no generated
  hole drops into a plot, no generated room expects a climb the plot didn't build). A plot's
  own edges are the author's call; a reachability check at save time warns, never blocks.
- **The file** is an ordinary `.llmmap.txt` with a `world:{seed, screens, plots}` header
  (`worldPlotFile` / `worldPlots` in the engine boundary). It lives in browser storage while
  you play, one working copy per world (`super_llmario_world_plots_v1:seed:1987`, or
  `…:file:NAME` for a packed world file). **File ▸ Save world file** downloads it; dropped in
  `/maps`, it shows up in the picker as *World · Name*, and the browser's working copy of it,
  once there is one, wins over the packed starting point.
- **ASCII sketch of a plot** (side panel ▸ ASCII sketch). The export starts with `@note` lines
  naming each screen (`A1 B1 / A2 B2`, `*` for saved), its column and row range, and the edge
  rules, so a person or a language model can be asked to "redo B2" with the neighbours as
  context. Paste the reply over it and **Apply**: the sketch must keep the plot's exact size
  (`@world`), and the status line then reports any place inside the plot you can't get back
  from, checked from where you stood.
- **Saving.** In a plot, **File ▸ Save plot to world** (Ctrl+S) saves into the world straight
  away; *Save as standalone map…* writes an ordinary map copy, which plays as a sealed level
  on its own. Back to game compares against the world, so it still offers to save anything
  that isn't saved there. The game's **Load map** opens a world file (one with the `world`
  header) as that world, plots and all.
- **Help.** A *Plots (World)* section in the editor's **?** modal.
- **Screens vs plots.** Screens are the unit of storage; a plot is the unit of editing. Add
  screen into a screen that belongs to another plot shows just that screen and says which plot
  it's part of; Edit ▸ Plots opens that plot whole.
- **Not yet:** renaming or deleting a plot (new plots are named after where they are, such
  as *Plot →3 ↓1*); in the editor, terrain still shows its end caps at screen seams; Pause ▸
  New world starts a fresh seed with that seed's own plots, if any.

## Not in this version

- **Persistence of coins and blocks** across reloads. Session memory is in-memory only;
  plots are what persists.
- **Moving-platform positions** across rebuilds. The current rooms only use static
  platforms.
- **The standalone engine has no World.** Rooms are packed by the release build, like maps.
