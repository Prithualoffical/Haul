# HAUL

A co-op horror looting game that runs in the browser (TypeScript, three.js, cannon-es, PeerJS).
Loot the haunted building, haul valuables to the green extraction pad, stay quiet, and don't get caught.
Up to 8 players with proximity voice chat. Five large (65 m) locations, each with its own look and layout, four monster types, a shop between levels, revive, flares and touch controls.

## Controls
| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move / sprint | WASD / Shift | left stick (push to the edge to sprint) |
| Look | mouse | drag on the right side |
| Grab / throw | hold LMB / RMB | GRAB / THROW buttons |
| Revive teammate | hold E next to the body | REVIVE button |
| Flare (stuns monsters) | F | FLARE button |
| Mic mute | V | |
| Map | M | MAP button |
| Shop (host) | 1-6 buy, Enter continue | tap |

## Run
```bash
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build into dist/
npm test           # map, balance and headless simulation tests (needs bun)
```
Co-op: one player clicks **Host co-op game** and shares the code shown top-right; others paste it into **Join**.
Voice chat needs HTTPS (or localhost) and microphone permission.

## Locations
Blackwood Manor, Saint Mercy Asylum, Kepler Research Facility, Port 9 Cargo Terminal, Grand Ostara Hotel.
In *A different location every level* mode the same place is never played twice in a row.
