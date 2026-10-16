# World (explore)

An endless world in every direction, generated as you arrive. Pick **World (explore)** in the
release build's map picker. There's no goal: you wander, and home is where you started.

## How it works

- **Screens.** The world is a grid of 40×24-cell screens (640×384 px). Each screen is a pure
  function of `(seed, screen x, screen y)` (`worldScreen` in the engine boundary). Nothing is
  stored: come back to a screen and it's rebuilt identically.
- **Floors and doors.** The generator owns every screen's bottom 4 rows, the floor band, so
  screens always meet at the same floor height and run on sideways forever. A vertical door
  is a 6-cell hole in a floor, decided by hashing that edge's coordinates. The screen below a
  hole always gets an **ascent room** whose top ledge sits right under the hole, so every
  hole goes both ways. Home (0,0) has no holes.
- **Rooms** fill the 40×20 interior above the floor band. They're ASCII v3 sketches in
  `world/rooms/*.llmroom.txt` (see below). A room is picked per screen by weighted hash, and
  sometimes mirrored.
- **Districts.** Each 8×3-screen patch gets a character from a short list: Meadow (few holes,
  lots of hills), Warren (riddled with holes, climbing rooms, wave goombas), Pipeworks (pipe
  rooms, koopas instead of goombas), Thorns (spikies instead of goombas), Brickyard (block
  rooms). A district sets the hole chance, multiplies the odds of rooms carrying its favoured
  tags, and swaps enemies. Home's own enemies are never swapped. The status bar names the
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

- `kind=plain`: any screen whose top has no hole. `kind=ascent`: must climb from the floor to a
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

## Planned: plots

The agreed design for keeping your edits to the world. Not built yet. In the interface the unit
is a **screen** (one 40×24-cell section of the world).

- **Flow.** Exploring, press **Editor**: it opens at the screen you're standing on. Edit. Press
  **Back to game**; if anything changed, *"Save changes to N screens? Save / Discard / Cancel"*.
  The window rebuilds and your edits are there. Find another spot, repeat: the new edit is
  appended to the same file.
- **Storage is by position, not by plot.** The file holds edited screens keyed by screen
  coordinates, with their objects at true world positions, plus an explicit list of edited
  screen coordinates (an emptied screen must stay empty, not regenerate). A saved screen
  replaces generation there completely, floor band included. An object belongs to the screen
  its anchor is in.
- **A plot is a named view**, not a container: a name plus the rectangle of screens you were
  looking at. Plots own nothing and may overlap. **Edit ▸ Plots** lists them and switches the
  editor between them; the editor shows one plot at a time, so unrelated plots never look like
  neighbours. Deleting a plot removes the bookmark only.
- **Saved means changed.** A screen is saved only if it differs from what the generator would
  make there (compare at save time, so edit-then-undo saves nothing). Looking around saves
  nothing. The same comparison greys out **Restore original**.
- **Side panel.** For plots, the *Map area* section (pixel left/top/width/height, Fit map)
  becomes *Plot area*: a small diagram of the plot's screens, `3 × 2 screens`, and
  **Add screen ← ↑ → ↓**, each adding one whole screen. Revealed screens show what the game
  would show: saved content if that screen was edited (by any plot), generation otherwise.
  Dotted lines mark every screen seam, with a distinct style where saved meets generated.
  The world has no top or bottom, so nothing greys out.
- **Restore original** (Edit menu): puts the screen under the cursor back the way the world
  made it, after a confirm; one undo step. *Restore all screens in this plot* too.
- **Where generated meets saved,** the generator closes its doors on that edge (no generated
  hole drops into a plot, no generated room expects a climb the plot didn't build). A plot's
  own edges are the author's call; a reachability check at save time warns, never blocks.
- **The file** is an ordinary `.llmmap.txt` with a `world:{seed}` header, the edited-screen
  list and the plot views. It lives in browser storage while you play; **File ▸ Save**
  downloads it; dropped in `/maps`, the build packs it into the picker as that world.
- **Help.** A *Plots* entry in the **?** modal: Editor while exploring edits the screen you're
  on; Add screen reaches around it; only changed screens are saved; plots are bookmarks
  (deleting one keeps your changes); Restore original undoes a screen for good; File ▸ Save
  keeps a copy, `/maps` makes it part of the game.

## Not in this version

- **Plots** (see *Planned: plots* above), and with them persistence across reloads. Session
  memory of coins and blocks is in-memory only.
- **Moving-platform positions** across rebuilds. The current rooms only use static
  platforms.
- **The standalone engine has no World.** Rooms are packed by the release build, like maps.
