# Horizon One vehicle source and runtime contract

This vehicle is an original procedural interpretation of the Mercedes-AMG ONE. Geometry, carbon weave normal data, instrument artwork, and all animation are authored in these ES modules. No third-party model or texture is bundled.

## Visual target and references

- Primary visual reference: the red AMG ONE in the user-supplied Forza Horizon 5 cover, supplied locally at `/Users/macos/Library/Application Support/orca/native-chat-pastes/orca-paste-1795273342527-7a329409-9ee8-41ac-964c-745111ec577c.png`. The reference image is viewed, not copied into the game.
- Dimension reference: [Mercedes-AMG One, technical infobox](https://en.wikipedia.org/wiki/Mercedes-AMG_One), read 2026-11-22: length 4,756 mm, body width 2,010 mm, height 1,261 mm, wheelbase 2,720 mm. The model follows these body proportions; mirrors, splitter, and exhaust extend beyond the nominal body envelope.
- [Mercedes-AMG official model page](https://www.mercedes-amg.com/en/home/vehicles/amg-one.html) and [official launch press release](https://group-media.mercedes-benz.com/marsMediaSite/en/instance/ko/The-new-Mercedes-AMG-ONE-Formula-1-technology-for-the-road.xhtml?oid=53396743) returned HTTP 403 during this session, so no unverified details are attributed to them.
- A [CC-BY Sketchfab candidate by 3dblender_1](https://sketchfab.com/3d-models/none-77b02e5a555d4819b490f67eeb348d22) was assessed. Its public API advertises CC-BY and 28,877 faces, but the official download endpoint requires authentication. It was not downloaded or used. The original procedural route avoids this dependency.

The target is a smooth, low, wide hypercar with separate crowned wheel arches, a compact angular intake immediately ahead of each rear wheel, a large flush carbon cowl, curved dark glazing, an oval roof air scoop and shark fin, two-element wing, thin rear LEDs, and a finned diffuser. Small details sit on continuous major surfaces; they do not substitute for the silhouette.

## Garage: two original bodies

`bodies.js` holds the style table. Both cars are original procedural interpretations with
the same axles, tyres and driving model, so a swap only flips which shell group is visible.

- `one` — the AMG ONE-inspired hypercar above (4.756 × 2.010 × 1.261 m).
- `coupe` — an original grand-touring coupe in the spirit of a BMW 4 Series: long bonnet,
  upright greenhouse, body-colour buttresses, slim L-shaped tail lamps and a wide twin-kidney
  nose (4.79 × 2.18 × 1.44 m). Green paint by default. Built from `coupe.js`; the nose
  treatment is a gesture toward the supplied reference photo, not a copy of any BMW badge
  or model-specific trim.

Press `G` (or the 换车 button) to swap mid-drive. The instrument header, footer badge and
HUD caption follow the active car; opponents in the sprint borrow whichever style the player
is not driving. At load both shells are built once and share the same materials, so the swap
costs a visibility toggle rather than a rebuild.

Each style also brings its own cockpit pair, built once up front and mounted under
`cockpitInterior` only while that style is active (`coupeCabin.js` for the coupe). The coupe
gets a round three-spoke M Sport wheel (thick 9-and-3 grips, red M1/M2 buttons, silver trim,
slanted `///M` hub badge on a canvas texture) and a twin-dial cluster: speed dial left, rpm
dial right with redline and nine shift lights, `///M` header, centre gear, digital readouts,
fuel and coolant bars. The AMG ONE keeps its squared-off wheel and wide split display.
`getObjectByName('steeringWheel')` / `('liveInstrumentCluster')` always resolve to the active
car because the inactive mount is detached from the cabin. Both clusters share the same
`update(dt, data)` contract in `car.js`, so driving state, garage swaps and screenshots need
no per-style branches.

## Mirrors

`mirrors.js` renders one 768 × 192 rear panorama (62° horizontal FOV, 30 Hz) and maps three
cropped windows of it onto the interior mirror and both door glasses. One pass feeds all
three mirrors instead of three scene passes; car meshes are hidden for that pass (lights stay
resident so shader permutations never change). The panorama is only refreshed in the cockpit
view. Anything that changes the door-pod position must update `mirrors` in the style table.

## Modules and units

`car.js` owns assembly and presentation updates. `exterior.js` owns shell/aero geometry. `wheels.js` owns reusable wheel geometry and pivots. `cabin.js` owns the physical interior and steering wheel. `instruments.js` owns the state-driven display, metal tachometer bezel, and physical RPM hand. `materials.js` owns the PBR palette. `geometry.js` supplies bounded geometry authoring primitives and material batching.

- Unit: metre; Y up, local +Z forward, driver's left is local +X.
- Front/rear axle local Z: +1.32 / -1.40; wheelbase 2.72 m. Each tire has radius .357 m and contacts local Y=0.
- `cockpitCamera`: Object3D at `(.345, 1.015, -.235)`, local X rotation `.075` rad, for a slight view down to the instrument cluster. `hoodCamera`: `(0, .785, 1.22)`.
- `setView('cockpit')` reveals the interior and reduces glass opacity to .035. Exterior modes use opaque glass and hide the interior to avoid unnecessary rendering work.
- `update(dt, state)` never changes the root transform or wheel pivot positions. Positive steer means driver-right. Front-wheel yaw is negative and uses the driving model's `0.46 / (1 + speed² / 110)` scale, plus a 5.5% inner/outer-wheel difference.
- Required mechanical readings come from `drive.js`: signed m/s speed, actual RPM, N/R/1–7 gear, fuel 0–1, coolant °C, odometer metres, and turnSignal -1/0/+1. The car does not simulate these values.
- The 1024×512 instrument CanvasTexture refreshes at 24 Hz; the physical needle updates every frame. A zero-dt update also refreshes the canvas. Node environments retain the instrument geometry/readings and skip DOM texture allocation.

## Inspection

With the Vite server running, open `/src/car/preview.html` for the isolated vehicle workshop. It uses an outdoor environment, ground shadow, and light strengths matching the main daytime scene. Front, side, rear, cabin, high-speed state, and sunset controls are independent of the shared game page.

`node src/car/check.mjs` checks finite geometry, dimensions, positive-left cockpit placement, right-turn wheel yaw, speed-dependent angle reduction, stable root/pivots, shared geometry, input-driven readings, and clear forward cockpit rays. Final QA images are under `src/car/qa/`. Static and high-speed instrument images use explicitly different source states; the preview scenarios are separate from the game's mechanics.

**Never pass a Three.js object to `assert.equal` / `assert.deepEqual`.** On failure Node
builds a full inspection diff of the value — for a scene object that walks circular `parent`
back-references, every buffer attribute and every texture. This once grew a single `node`
process past 10 GB in under twenty seconds and froze the machine (it looks like a runaway
leak but is pure assertion formatting; `--max-old-space-size` cannot cap it because the
memory is off-heap). Compare booleans or membership instead, as `check.mjs` does with its
`same` / `differs` helpers and `cabin.children.includes(...)`.
