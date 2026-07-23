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

**Play the demo level**

https://thesepeoplearenotyourfriends.github.io/super_llmario/
