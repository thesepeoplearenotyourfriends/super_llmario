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

v68 added first-pass local-row slope platforms (up/down); v69 fixes the slope-to-flat handoff seam on steeper ramps while keeping v67 bonk-box behavior; v70 fixes the flat-to-slope seam jump teleport; v71 fixes steep slope-to-flat walking/running exit pause; v72 guards bonk boxes against seam-jump side-overlap false bonks; v74 extends the true-underside rule to solid image sprites and rectangular platforms; v75 adds cartridge-toggled bustable/breakable floating blocks with shard animation; v76 makes mushroom powerups row-aware, adds a simple emergence phase, ignores the source block briefly, and lets mushrooms ride existing slope platforms; v77 supports the split source model: load .llmtheme.txt and .llmmap.txt as two documents, combining them in memory without turning maps back into base64 asset carts; v78 makes theme-truth image assets draw as their original sprites while collision truth handles physics, including line/slope truth.

v79 stops demo resourceScenery trees/shrubs/mushrooms from leaking into loaded maps.

v83 adds first-pass global ladder/climb-zone physics: maps can place ladder/vine climbables with engine fallback art or theme skins; up/down climbs, jump detaches. v84 smooths ladder seams by merging/treating touching climb-zone pieces as one climb column, so stacked ladder/vine pieces do not clamp-stop at joins.

v85 adds global pipe/tube support as an engine noun: maps can place solid green fallback pipes, themes can still skin later, and optional JSON targets can make down-press pipe travel.

v67 keeps v66 behavior and makes the existing bonk block vocabulary cartridge/theme-friendly: floating blocks may declare boxKind/kind, payload/contents, usedStyle/usedRecipe/usedImage, oneShot info behavior, and imageBlock/usedBlock recipes. Reward boxes can emit coin bursts or the existing mushroom powerup without hardcoding theme art. Floating blocks may also opt into busting with bustable:true/breakable:true and optional requiresBig:true.

v66 adds optional solid image sprites for asset-backed cartridges. Resource scenery sprites marked solid:true now participate in collision using their rendered image rectangle, so platform-looking PNG/SVG pieces do not accidentally behave like background decoration.

v65 keeps the row-camera latched seam as the first successful row transition implementation: falling across a row boundary latches the target row, gives a short readable seam pause, pans the camera, then releases the fall without old/new row bounce.

v63 adds an optional row-aware camera experiment for carts that define world.rows, including a brief fall-stall while the camera pans down to the next row. Carts without rows should keep the v62 side-scroller camera behavior.

v62 tightens the image-cartridge hooks after the first Jungle/BrownNature visual test: image tile platforms can paint a backing color and overdraw seams so transparent tile gutters do not reveal sky, and themed sign recipes get readable light text without mutating the classic physics-test level.

v60 adds a conservative load-time placement normalizer for external cartridges: surface props such as pipes/trees/shrubs/mushrooms/arrow signs are snapped to nearby walking surfaces, impossible scenery over chasms is dropped unless marked anchor:"raw", solid pipe collision follows the corrected pipe base, and floating blocks are forced into either ground-block placement or big-hero-safe overhead clearance.

v59 fixes the final 1-1 scenery nit: the later tree near x≈3080/3208 now has its base raised so the trunk reads above the grass/ledge. Rest of World 1 is intended to live as external .llmcart cartridge files, not embedded in the engine.

v58 raises the two too-low second-half block pairs so the hero can pass underneath, adds a tap-to-read map coordinate probe in the lower corner, shifts the arrow triangles right so their visual weight is centered, and drops the first decorative mushroom onto the grass.

v57 fixes the sign/mushroom polish nibs and extends built-in 1-1 into a longer second half with extra platforms, coins, enemies, scenery, and a later portal.

v56 fixes the follow-up polish misses: arrow signs now point right, the decorative red mushroom recipe gets a visible stem, and the hero ground shadow no longer follows jumps.

v55 refines the built-in 1-1 cart presentation: removes the confusing starting pipe, gives arrow signs a more balanced double-chevron face, and lifts the small red mushroom so it reads as a mushroom instead of a speckled rock.

v54 is the v53 merged baseline plus built-in 1-1 scenery cleanup: pipes/arches anchored to platforms, pipes optionally solid, and shrubs moved into cartridge data.

v53 is the merged baseline containing:

v46 milestone systems: SFX/audio path, gamepad Learn, pause/status-bar menu, mobile display fixes, working counters/HUD, no onscreen mobile buttons.
v52 visual systems: mushroom-cap hero, improved grass/dirt blend, attribution pager, EPS-derived scenery/prefab math.
v53 external cartridge loader: Load Cartridge in pause menu; supports ".llmcart.txt", ".llmcart", ".json", ".txt".

