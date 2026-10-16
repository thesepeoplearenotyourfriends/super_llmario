# World (explore)

An endless world in every direction, generated as you arrive. Pick **World (explore)** in the
release build's map picker. There's no goal: you wander, and home is where you started.

## How it works

- **Chunks.** The world is a grid of 40×24-cell chunks (640×384 px). Each chunk is a pure
  function of `(seed, chunk x, chunk y)` (`worldChunk` in the engine boundary). Nothing is
  stored: come back to a chunk and it's rebuilt identically.
- **Floors and doors.** The generator owns every chunk's bottom 4 rows, the floor band, so
  chunks always meet at the same floor height and run on sideways forever. A vertical door
  is a 6-cell hole in a floor, decided by hashing that edge's coordinates. The chunk below a
  hole always gets an **ascent room** whose top ledge sits right under the hole, so every
  hole goes both ways. Home (0,0) has no holes.
- **Rooms** fill the 40×20 interior above the floor band. They're ASCII v3 sketches in
  `world/rooms/*.llmroom.txt` (see below). A room is picked per chunk by weighted hash, and
  sometimes mirrored.
- **Biomes by depth.** Sky, ground, caves, castle, with district boundaries that shift every
  8 chunks. A glance at the ground style tells you roughly how deep you are.
- **Rolling window.** The engine plays a 3×3-chunk window (`worldWindowMap`, an ordinary
  reference map) and rebuilds it when you're a little way into another chunk, which takes
  about one frame. You, your speed and held buttons, nearby enemies, a held shell and
  emerging pickups carry across. Taken coins and used or broken blocks are remembered by
  stable instance ID for the session, even after their chunk leaves the window. Dying
  respawns you where you last entered a chunk.
- **Capture.** While exploring, the **Editor** button opens the current window as an
  ordinary map, starting where you stand: "that would make a good level", then refine it.
- **Status bar** shows the seed and your offset from home in chunks (`⌂ →3 ↑2`). Pause →
  **New world** rolls a random seed.

## Writing a room

```
@room kind=ascent weight=2
@llmario-ascii 3
@cell 16
@note Zigzag up through one-way shelves to the ledge under the hole above.

<exactly 40 columns × 20 rows of ASCII v3 glyphs>

@at …   @place …   @pipe …   (any ASCII v3 directive)
```

- `kind=plain`: any chunk whose top has no hole. `kind=ascent`: must climb from the floor to a
  one-way ledge at **row 2 spanning cols 15–24** (under the hole above, cols 17–22).
- `weight=N`: pick frequency. `home`: exactly one room, always at (0,0).
- `solidfloor`: the generator never cuts a hole under this room (for rooms with something
  standing over the middle of the floor).
- Row 19 stands on the floor band, so don't draw the floor. Keep the floor walkable end to
  end, including hopping a 6-cell hole at cols 17–22 unless the room is `solidfloor`.

`tests/world.test.js` runs the reachability checker on every room in a neighbourhood: flat
floors either side, a floor with a hole above for ascent rooms, and an ascent room below
when its own floor has a hole. The floor must run both ways, the hole must work up and down,
and there must be no pockets. A room that fails can't ship.
`node scripts/world_rooms.js` prints the compiled rooms. The release build runs the same
module.

## Not in this version

- **Patch overlays** (editing a spot in the world and having the change appear whenever the
  generator draws it) and promoting captures into rooms. The stable instance IDs are there
  for when that's wanted.
- **Persistence across reloads.** Session memory is in-memory only.
- **Moving-platform positions** across rebuilds. The current rooms only use static
  platforms.
- **The standalone engine has no World.** Rooms are packed by the release build, like maps.
