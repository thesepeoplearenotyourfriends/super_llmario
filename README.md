<img width="2172" height="724" alt="ChatGPT Image Jul 23, 2026, 10_58_51 PM" src="https://github.com/user-attachments/assets/52b4412c-8433-4c43-a070-4e616f970497" />



**CURRENT GAMEPLAY STATE:**

Current built-in cartridge is the Physics Test Plains / Jump Test style level. It is a known-good gameplay baseline with:

* working run/jump/fall tuning
* standing and running jumps that feel fair
* mushroom powerup block
* big/small player loop
* enemies, stomps, shrink/hurt/lives
* coins and stars
* bonk blocks and messages
* moving/bobbing floating blocks
* portal win condition
* level clear overlay
* signs and speech bubbles
* counters/HUD updating correctly without overlap

**CURRENT INPUT STATE:**

Keyboard:

* arrows / WASD movement
* Space / Up / W jump
* Shift / Z / X run
* P / Escape / Enter pause
* R restart

Default gamepad mapping:

* Left: Button 14
* Right: Button 15
* Up: Button 12
* Down: Button 13
* Run: Button 0
* Jump: Button 1
* Pause/Start: Button 9

Gamepad Learn lives in the pause/status-bar menu. The visible always-on gamepad icon was removed. Tapping/clicking the top status bar opens pause/settings.

**CURRENT AUDIO STATE:**

RetroCharm SFX are integrated and working. The engine has one shared audio path intended to support future theme music/MIDI work later.

Current built-in SFX hooks include:

* jump
* coin
* star
* bonk
* mushroom emerge
* powerup collect
* enemy stomp
* hurt/shrink/life loss
* level clear

The audio system is intentionally ready for future music, but full MIDI parser/drop-folder/song scheduling is not part of the current baseline.

**MAP EDITOR**
<img width="1157" height="618" alt="image" src="https://github.com/user-attachments/assets/09d18622-c2f7-4eea-8477-1a00c1d22df7" />

the above map is in maps/ and is a work in progress, mainly done while simultaneously getting the map editor working, which it does pretty well. 

**Retro Charm MIDI player**
<img width="866" height="568" alt="image" src="https://github.com/user-attachments/assets/03500e4d-49f4-4520-b9be-6e2ab5aa2123" />

converts any .mid file into (admittedly pretty awesome) retro-sounding NES-style output. 

**BloopForge**
<img width="764" height="616" alt="image" src="https://github.com/user-attachments/assets/15569e36-7e32-4657-93a4-343df48b2f24" />

Generate retro sound effects and/or tweak existing ones. 


----

**Play the demo level**

https://thesepeoplearenotyourfriends.github.io/super_llmario/

----

**(partial) historical trace**

**v85** — Adds global pipe/tube support as an engine noun. Maps can place solid green fallback pipes, themes can provide custom skins, and optional JSON targets enable down-press pipe travel.

**v84** — Smooths ladder seams by merging touching climb-zone pieces into a single climb column, preventing stacked ladder or vine segments from clamp-stopping at their joins.

**v83** — Adds first-pass global ladder and climb-zone physics. Maps can place ladder or vine climbables with engine fallback art or theme skins. Up/down controls climbing; jumping detaches.

**v79** — Prevents demo `resourceScenery` trees, shrubs, and mushrooms from leaking into loaded maps.

**v78** — Makes theme-truth image assets render as their original sprites while collision truth independently controls physics, including line and slope collision.

**v77** — Supports the split source model: `.llmtheme.txt` and `.llmmap.txt` load as separate documents and combine in memory, without turning maps back into base64 asset carts.

**v76** — Makes mushroom powerups row-aware, adds a simple emergence phase, briefly ignores collision with the source block, and allows mushrooms to ride existing slope platforms.

**v75** — Adds cartridge-toggled bustable/breakable floating blocks with shard animation.

**v74** — Extends the true-underside rule to solid image sprites and rectangular platforms.

**v72** — Guards bonk boxes against false bonks caused by side overlap during seam jumps.

**v71** — Fixes the pause when walking or running from a steep slope onto a flat platform.

**v70** — Fixes the teleport that could occur when jumping across a flat-to-slope seam.

**v69** — Fixes the slope-to-flat handoff seam on steeper ramps while preserving v67 bonk-box behavior.

**v68** — Adds first-pass local-row upward and downward slope platforms.

**v67** — Keeps v66 behavior and makes the existing bonk-block vocabulary cartridge/theme-friendly. Floating blocks may declare:

* `boxKind` / `kind`
* `payload` / `contents`
* `usedStyle`
* `usedRecipe`
* `usedImage`
* one-shot information behavior
* `imageBlock` / `usedBlock` recipes

Reward boxes can emit coin bursts or the existing mushroom powerup without hardcoding theme art. Floating blocks may also opt into breaking with `bustable:true` or `breakable:true`, plus optional `requiresBig:true`.

**v66** — Adds optional solid image sprites for asset-backed cartridges. `resourceScenery` sprites marked `solid:true` participate in collision using their rendered image rectangle, so platform-like PNG or SVG assets do not behave as background decoration.

**v65** — Establishes the row-camera latched seam as the first successful row-transition implementation. Falling across a row boundary latches the target row, pauses briefly at the seam, pans the camera, and then releases the fall without old/new-row bouncing.

**v63** — Adds an optional row-aware camera experiment for cartridges defining `world.rows`, including a brief fall stall while the camera pans to the next row. Cartridges without rows retain the v62 side-scroller camera behavior.

**v62** — Tightens image-cartridge hooks after the first Jungle/BrownNature visual test. Image-tile platforms can paint a backing color and overdraw seams so transparent tile gutters do not reveal sky. Themed sign recipes receive readable light text without altering the classic physics-test level.

**v60** — Adds a conservative load-time placement normalizer for external cartridges:

* Surface props such as pipes, trees, shrubs, mushrooms, and arrow signs snap to nearby walking surfaces.
* Impossible scenery over chasms is dropped unless marked `anchor:"raw"`.
* Solid pipe collision follows the corrected pipe base.
* Floating blocks are forced into either ground-block placement or big-hero-safe overhead clearance.

**v59** — Fixes the final World 1-1 scenery issue: the later tree near `x ≈ 3080/3208` has its base raised so the trunk reads above the grass ledge. The remainder of World 1 is intended to live in external `.llmcart` cartridge files rather than being embedded in the engine.

**v58** — Raises the two overly low second-half block pairs so the hero can pass beneath them, adds a tap-to-read map-coordinate probe in the lower corner, shifts arrow triangles right for better visual centering, and places the first decorative mushroom directly on the grass.

**v57** — Fixes sign and mushroom polish issues and extends the built-in World 1-1 cartridge with a longer second half containing additional platforms, coins, enemies, scenery, and a later portal.

**v56** — Fixes follow-up presentation issues: arrow signs now point right, the decorative red mushroom has a visible stem, and the hero’s ground shadow no longer follows jumps.

**v55** — Refines the built-in World 1-1 presentation by removing the confusing starting pipe, giving arrow signs a more balanced double-chevron face, and raising the small red mushroom so it reads as a mushroom rather than a speckled rock.

**v54** — Uses the v53 merged baseline and adds built-in World 1-1 scenery cleanup: pipes and arches are anchored to platforms, pipes may optionally be solid, and shrubs are moved into cartridge data.

**v53** — Merged baseline containing:

* **v46 milestone systems:** SFX/audio path, gamepad Learn, pause/status-bar menu, mobile display fixes, working counters/HUD, and no onscreen mobile buttons.
* **v52 visual systems:** mushroom-cap hero, improved grass/dirt blending, attribution pager, and EPS-derived scenery/prefab math.
* **v53 external cartridge loader:** adds **Load Cartridge** to the pause menu and supports `.llmcart.txt`, `.llmcart`, `.json`, and `.txt`.

