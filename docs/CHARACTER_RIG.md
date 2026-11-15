# Character rig: design

Status: **design only** (no implementation). Scope: a reusable, parametric 2D character rig for
`engine/cast/`, independent of episode and series.

The look is fixed: flat Canvas2D drawings on yaw-only billboards, lit by `cardshade.ts`, composited on
the `NOINK` layer before the world ink pass and the lens blur. Nothing here replaces that pipeline, adds
a dependency, or moves a character into 3D. What changes is how a drawing is *produced*.

Numbers quoted below are the measured targets in `references/reports/characters.md` and the current
values in `engine/cast/toon.ts`.

---

## 1. Current architecture and limitations

### 1.1 How a character reaches the screen today

```
episode stage(id, t, cam)                episodes/broughton/cast.ts:301
  builds Place[]  {key, draw, x,y,z, scale, yaw, size}          cast.ts:61-72
world.update(id, f, cam)                  episodes/broughton/world.ts:342
  frustum cull -> pool.req(key, w, h, k, draw)                  world.ts:417-430
Pool.flush()                              engine/cast/actor.ts:28-46
  miss: allocate / reuse canvas, run draw(p: Pen), upload texture
  hit:  share the CanvasTexture
Actor.bind() -> MeshLambertMaterial(map) + cardShade()          actor.ts:75, cardshade.ts
```

So a "character" at render time is: **one key string → one full-body Canvas2D drawing → one texture on
one quad**. Animation is achieved by changing the key every frame and redrawing the whole body. There is
no rig, no skeleton, no interpolation between poses. That is the root of every limitation below.

The drawing side is `engine/cast/toon.ts`:

| piece | lines | notes |
|---|---|---|
| `Pen` (canvas API + single global rotation) | 72-169 | `rot` at 76, applied in `P()` 78-82 |
| `blobPts` / `headBlob` (superellipse head) | 196-222 | the measured contour |
| `FACE` table + `eye` / `mouth` / `faceFront` / `faceSide` | 228-339 | 14 named expressions |
| `hatBehind` / `hatOn` | 341-422 | 4 hat families, `side: boolean` |
| `BUILD` (3 builds, 4 numbers) | 429-433 | proportions |
| `bodyFront` | 447-605 | front body, props, walk, face |
| `bodySide` | 627-728 | side body, legs IK, props, face |
| `swingKid` | 731-745 | canvas transform trick around `bodySide` |
| effects (`fxNote` … `fxBlob`) | 748-909 | independent of the rig; keep as-is |

### 1.2 Limitations

**(a) Two duplicated anatomies, no 3/4 view.**
`bodyFront` (447-605) and `bodySide` (627-728) independently rebuild torso, shoulders, arms, legs,
head, hat, face, rifle and clothing. The same concepts have different numbers: torso blob `a` is
`(tw/2)·W/1.06` front (498) but `0.31·W` side (679); hip offset is `torsoBot − 0.12 HH` (456) vs the
`ik` solution (667-676); the torso `asym` sign differs. A fix to one view silently does not apply to
the other. There is **no three-quarter view at all**, and the choice of view is one binary test:

```ts
// actor.ts:140-144
const c = (tx * dx + tz * dz) / tl;
return { side: c < 0.57, mirror: ..., fs: ... };
```

A character walking across the lens therefore **pops** from front to side at a fixed angle. Mirroring is
a negative mesh X scale (`world.ts:426`), so the whole drawing is flipped; only the painted light
crescent is compensated (`light2D(cam, mirror)`, actor.ts:134-137). Handed details (hat peak, mouth
offset, nose tick, asym bulge) are mirrored too, which is acceptable today only because the side view is
near-symmetric in practice.

**(b) Pose is an enum, not a continuous value.**
`FrontOpts.mode: "march" | "stroll" | "stand" | "sit" | "fall"` (436) and
`SideOpts.mode: "march" | "stand" | "swing" | "push"` (608) fork into if/else chains
(462-492 legs, 513-531 arms, 638-665 leg modes). Consequences:

- **No blending.** There is no representation of "70 % standing, 30 % walking". The episode hard-switches
  (`cast.ts:124, 133, 141`) and hides it behind a blink or a cut.
- **Every new motion is a new branch.** A run, a crouch, a reach-up or a turn would each add another
  coordinate formula inside the same two functions.
- **Front and side walk with different solvers.** Front legs use a sinusoidal lift (484-491); side legs
  use a stance/swing cycloid plus a two-bone IK (616-620, 638-652). The same character's gait differs
  between the two views and neither solver can be reused for stairs, a sloped deck or a run.

**(c) Hands and feet are not targets.**
Arms are emitted per prop inside the mode branch: ice-cream 523-525, hammer 526-530, carried shako 516,
wave 520-522, rifle 517-519, or a hanging arm (502-506). The only real hand target is the push parent
(`opts.hand`, 611-612, 695-702), and it has to manually undo the torso lean because there is no joint
frame in which to express the target. A prop therefore cannot be re-used with another character, and
"pick up", "hand over", "press a button" are all bespoke.

**(d) One global transform, composed by hand.**
`Pen` has exactly one rotation vector (76) that every path, gradient and clip goes through (83-168).
The functions set and clear it at 461, 496, 596, 604, 668, 678, 727. The head's world position is
computed by rotating the chin around the hips manually (595):

```ts
const Ah = A + headTilt, [cpx, cpy] = rotAbout([300, chin], rad(A), [300, hipY]);
p.rot = Ah ? [rad(Ah), 300, chin, cpx - 300, cpy - chin] : null;
```

There is no transform stack, so a joint hierarchy (hips → chest → shoulder → elbow → wrist → prop)
cannot be expressed. `swingKid` (731-745) works around this with `save/translate/scale` and a virtual
`Pen`; that seat pose can never be blended with a standing pose.

**(e) Faces are a lookup, not channels.**
`Expr` is 14 strings (229-230) mapped to `{eye kind, 2 brow offsets, mouth kind}` (234-249). There is no
numeric lid, brow angle, smile curvature, jaw opening, gaze or squint, so:

- **no expression blending** — switching is a hard swap, masked by a blink (`SWAPS`/`LID`, cast.ts:44-56);
- **no emotional state** — mood cannot persist under a transient expression, and there is no intensity;
- **blink is lossy** — `eyeKind` (250-252) can only *degrade* an eye kind; `happy`, `squeeze` and `spiral`
  cannot blink, and `shock` needs a special half state;
- **3/4 is impossible** — `faceFront` (308-325) and `faceSide` (328-339) are two hand-tuned layouts with
  different constants (eye at `+7u ± 13u` vs `+27u`, mouth at `+20u` vs `+21u`); there is nothing to
  interpolate.

**(f) Proportions are scattered.**
`BUILD` (429-433) holds only head radius, torso and leg multipliers and torso width. The rest lives as
literals: torso blob widths per view (498 vs 679), head width via `headBlob` (216-222), arm length
`0.95 HH` (683), stroke widths (458-459, 634), foot length, hat heights (361, 408). Episodes add a
`scale` argument (cast.ts:61) and use it for the kid (`0.72`, cast.ts:218) and the swing card (`0.7`,
cast.ts:287). Canon (`series/otherly/canon.ts`) stores only the `Outfit` plus prose notes, so a returning
character can drift and no two episodes can be checked against each other.

**(g) The cache is per-frame JSON with no bound.**
The key is `JSON.stringify` of the quantised options object (cast.ts:57, 66), prefixed with `w×h`
(actor.ts:24). `Pool.flush` **deletes every key not requested this frame** (actor.ts:31) and pushes the
canvas onto a free list, so a drawing that leaves the frustum and returns is redrawn from scratch. The
key space is the cross-product of every option, and it grows with every feature added. Resolution is one
of four hard steps by distance (cast.ts:33-34); `tierKey` is computed (68) and never read — dead code.

**(h) Draw order is structural, not declarative.**
Each body function bakes its order: legs → far arm → rifle → torso/wardrobe → near arm/props → head →
hat → face. Props cannot be layered generically, and any future image-space cross-fade of two poses
would double the ink outlines (each shape strokes itself), which is why **blending must happen in pose
space**.

**(i) Turning, running, interaction are all absent.**
There is no turn clip, no run (cadence + airborne phase), no look-at, no ground query, no prop
attachment, no contact event. Every one of those is a requirement for a reusable rig.

---

## 2. Proposed system architecture

### 2.1 Principles

1. **Same renderer.** A character is still a Canvas2D drawing on a yaw-only card, shaded by `cardShade`,
   on `NOINK`. No 3D rig, no skeleton in the scene graph, no new dependency.
2. **Separate four things.** *What the character is* (`CharacterSpec`), *what it is doing* (`Pose`),
   *how it is seen* (`CharacterView`), *how it is painted* (`render/*`). Each is a plain data type.
3. **Pure math, no DOM.** `pose`, `skeleton`, `view`, `mixer` and `clips` must run in Node with no canvas,
   so they can be tested without Remotion.
4. **Pose-space blending only.** Blend channels, then draw once. Never composite two drawings.
5. **Cache what was drawn, not what was asked for.** Key = `spec.id + poseHash + viewHash + tier + light`,
   quantised and packed; bounded and stable within a shot.
6. **Episode-independent.** The rig knows nothing about Broughton, the bridge or the story. It exposes
   targets in metres/design units; the episode supplies ground height, camera and blocking.
7. **Never break the old path.** `bodyFront` / `bodySide` / `swingKid` remain as adapters over the new
   renderer for as long as the episode needs them.

### 2.2 Data flow

```
episode blocking
  clip track list (walk 1.0, wave 0.4, face mood)
        │  mixer.sample(t)
        ▼
      Pose  ──────────────┐
        │ skeleton.solve   │
        ▼                  │
   JointFrame (points,    │  viewOf(cam, …) -> CharacterView {yaw, pitch, mirror, light, tier}
   angles, foot polys)    │
        │                  │
        └──────► drawCharacter(pen, spec, pose, view) ──► one canvas ──► one texture
                                     ▲
                        cache.keyOf(spec, pose, view, tier)
```

### 2.3 Modules (`src/engine/cast/rig/`)

| file | responsibility | key contracts |
|---|---|---|
| `spec.ts` | the character, as data | `CharacterSpec`, `makeSpec(outfit, seed)`, `measures(spec)` |
| `pose.ts` | one frame of body state | `Pose`, `restPose()`, `partial()`, channel names |
| `skeleton.ts` | pure FK/IK | `solveLeg`, `solveArm`, `torsoFrame`, `headFrame`, `footPoly` |
| `view.ts` | continuous camera relation | `CharacterView`, `viewOf(cam, pos, dir)`, `viewBand(yaw)` |
| `face.ts` | face channels and presets | `FacePose`, `FACE_PRESETS`, `lerpFace`, `applyMood` |
| `clips.ts` (+ `clips/`) | named motion generators | `walk`, `stroll`, `run`, `stand`, `sit`, `fall`, `push`, `swing`, `wave`, `turn`, `gesture` |
| `mixer.ts` | tracks, masks, additive layers | `Track`, `sample(tracks, t)`, `blend(a, b, t, mask)` |
| `props.ts` | attachable objects | `PropSpec`, `attachHands(pose, props)`, `contactAt(t)` |
| `render/pen.ts` | draw context with a transform stack | `pushFrame`, `popFrame`, `joint(name)` |
| `render/body.ts` | torso, dress, clothing | one implementation for all views |
| `render/limbs.ts` | arms, legs, feet, hands | from joint points only |
| `render/head.ts` | head, hats, hair, bonnet | view-parameterised |
| `render/faceDraw.ts` | features from channels + view | front/side/3-4 continuous |
| `render/character.ts` | layer order + orchestration | `drawCharacter(pen, spec, pose, view)` |
| `cache.ts` | quantise, hash, pack | `keyOf`, `PoseHash`, `CacheStats` |
| `adapters.ts` | legacy options → rig | `legacyPose(FrontOpts \| SideOpts)`, `bodyFront`, `bodySide`, `swingKid` |
| `index.ts` | rig barrel | types + `drawCharacter`, `makeSpec`, clips |

### 2.4 `CharacterSpec` — one source of truth for proportions

Everything measured for the style lives in one record, in head units, matching
`references/reports/characters.md` 2.1/2.3 so the defaults reproduce today's cast exactly:

```
identity   id, seed, build ("adult" | "stout" | "kid" | future)
head       a, b, nTop, nBot, egg, asym, rot, noise   (blob params, characters.md 2.2)
spine      torsoLen, torsoW, shoulderInset, hipInset, neckOverlap   (× HH)
limbs      legLen, thigh, shin, armLen, upper, fore, limbW, footLen, footW
face       eyeSpacing, eyeY, browY, mouthY, mouthW, moustache, skin, quirk
wardrobe   OrderedPart[]  (jacket, pants, boots, hat, hair, sash, belt, buttons, dress …)
style      ink width, shadow multipliers, minimum stroke at each tier
```

- `measures(spec)` derives every absolute number once (design units), so no function re-derives a
  proportion from a different constant.
- Canon (`series/otherly/canon.ts`) gains `spec` (or `specId` + overrides) so a returning character is
  literally the same record. `Outfit` stays for compatibility and is lowered to `CharacterSpec` by
  `makeSpec`.
- A debug `specSheet(spec)` draws front / side / 3-4 with joint dots and the measured table, so the
  proportions can be checked against `characters.md` without a full render.

### 2.5 `Pose` — continuous, blendable, view-independent

Targets rather than per-view angles, because that is what makes front and side share a gait:

```
root        x, y, scale, roll, facing        // design units, facing -1..1
hips        { x, y, angle }                  // y = hip height above soles
chest       { angle, lift, twist }           // twist drives shoulder/hip offset for 3/4
head        { yaw, pitch, tilt }
legs        [ { ankle: P2, footAngle, kneeDir, plant: bool, weight } ]   // ankle in root space
arms        [ { hand: P2 | null, elbowDir, wrist, grip: GripRef | null } ]
face        FacePose
extras      { blink, sweat, kick, lean, airborne }
```

- `plant: true` means "the ankle is pinned to the ground this frame"; the skeleton solves the knee and the
  hips ride over it. That single flag replaces the front sinusoid and the side cycloid.
- `ankle` and `hand` are root-space design units, which is exactly what a prop target or a ground query
  produces.
- Defaults come from `restPose()`, so a clip only writes the channels it cares about.

### 2.6 `skeleton.ts` — one solver, both views

- `solveLeg(hip, ankle, thigh, shin, kneeDir)` — the existing two-bone solver (toon.ts:616-620), promoted
  and view-agnostic, with a reach clamp and a `kneeDir` so front and side knees bend correctly.
- `solveArm(shoulder, hand, upper, fore, elbowDir)` — same construction, replacing the six bespoke arm
  curves.
- `torsoFrame(pose, spec)` returns `{ hip, chest, shoulderL/R, neck, chin, crown }` by composing root →
  hips → chest; `headFrame` composes chin → head tilt. Angles and points come out of **one** transform
  chain, so the manual `rotAbout` composition at toon.ts:595 disappears.
- `footPoly(ankle, footAngle, spec)` and `handDot(...)` standardise the two shapes that are currently
  copied in every branch (442-445, 533, 717).
- Because the solver is pure and target-based, running is the same code as walking with different ankle
  targets and no `plant` during flight; stairs are ankle targets on a sloped ground; a seated pose is
  ankle targets plus a hip height.

### 2.7 `view.ts` — continuous yaw, quantised only for the cache

`CharacterView = { yaw, pitch, mirror, light, foreshorten }`, where `yaw` is the angle between the
character's facing and the camera's view axis (0 = front, ±π/2 = profile, π = back).

- Replaces the `c < 0.57` boolean (actor.ts:143). Today's exact frame is preserved by mapping
  `|yaw| >= 0.955 rad` to the old "side" projection, so the baseline still matches during migration.
- The drawing interpolates feature placement between the measured front layout and the measured side/3-4
  layout (characters.md 2.2 gives 3/4 targets: `b/a 1.02`, `asym 0.08`, `rot ±12°`, `nTop 2.2 / nBot 1.9`).
  The silhouette stays the same superellipse family; only the params and the feature offsets move.
- `mirror` stays a mesh scale (no pipeline change), but the renderer receives it so handed details can
  be drawn rather than flipped where it matters (hat peak, mouth side, hair part).
- The card remains a yaw-only billboard: `yaw` changes the *drawing*, not the quad's orientation beyond
  what the world already computes (world.ts:425).
- Turning is a clip: `turn({ from, to, t })` sweeps yaw; the cache quantises to 8 bands (22.5°), which is
  the same granularity the light already uses (`light2D`, actor.ts:134-137), so a turn costs at most a
  handful of new drawings and no new resolution tier.

### 2.8 `face.ts` — channels, presets, mood

```
FacePose {
  lidL, lidR,               // 0 open .. 1 shut
  browInL, browOutL, browInR, browOutR,   // u offsets, + = down (same units as FACE)
  browAngle,                // extra tilt, for anger/worry
  smile, open, jaw,         // mouth curvature / aperture / open jaw
  squint, pupil, gazeX, gazeY,
  sweat, tongue
}
```

- `FACE_PRESETS` reproduces the 14 current expressions **exactly** by writing the same values the `FACE`
  table and the eye/mouth kinds already use. At `lid = 0` and preset weights of 0/1, the drawn pixels are
  identical, which is what the parity gate checks.
- `lerpFace(a, b, t)` makes expression changes smooth. The blink that currently hides a swap
  (`SWAPS`, cast.ts:44) becomes optional polish, not a structural necessity.
- `applyMood(face, mood)` adds a persistent baseline (e.g. `stern`, `bright`, `afraid`) under a transient
  expression, clamped — this is the "emotional state" requirement.
- `faceDraw` lays out from `view.yaw` and the spec's face measures, so front, 3/4 and profile are one
  function. Eye *kinds* survive as fast paths chosen from the channels, so preset output does not regress.

### 2.9 `clips.ts` + `mixer.ts` — motion as data

Each clip is a pure `(u: number, opts) => Pose` where `u` is normalised time or a gait phase:

| clip | drives | notes |
|---|---|---|
| `walk` | ankle targets, foot plant, hip bob, lean, arm swing | one solver for both views; `stride` in metres (0.8 m default), cadence in steps/s |
| `run` | same + airborne phase, longer stride, forward lean, bigger arm swing | new |
| `stroll` | walk with 55 % lift and 3 % bob (today's numbers) | same code path |
| `stand` | breath, weight shift, micro sway | replaces `march` with zero stride |
| `sit` / `fall` | hip height + ankle targets | the fall arc is episode-driven |
| `push` | hand target from the episode (`handTarget`) | retires `opts.hand` and its lean-undo |
| `swing` | seated hip + kick | replaces `swingKid`'s virtual Pen |
| `wave`, `gesture` | additive arm/chest layer | masks allow wave while walking |
| `turn` | yaw sweep | new |

`mixer.ts` is deliberately small:

```
Track { clip, weight, start, duration, fadeIn, fadeOut, mask?, mode: "override" | "add" }
sample(tracks, t) -> Pose
```

- `override` tracks blend by weight (walk ↔ stand, sit ↔ stand).
- `add` tracks layer on top (wave, face, lean) and are clamped by channel ranges.
- `mask` selects channels (upper body only, face only), which is how a gesture plays over a walk.
- Blending happens **before** `skeleton.solve`, so there is exactly one draw call and one ink pass.

### 2.10 `props.ts` — attachment instead of branches

```
PropSpec {
  id, layers: "far" | "near",
  attach: "handL" | "handR" | "both" | "head" | "back" | "world",
  grip: { angle, offset },      // canonical hand pose relative to the grip point
  draw(pen, frame, state),      // state = clip channels (e.g. hammer strike 0..1)
  contact?: { at, normal },     // drives FX and the strike frame
}
```

- Rifle, ice-cream, hammer and carried shako become `PropSpec`s. `attachHands(pose, props)` writes the
  hand targets and grip angle, so the arms are solved by the same IK as everything else.
- A prop can define a two-hand pose (rifle) or a support target (sign), removing the rifle-specific
  branches at 509-510, 517-519, 535-538, 688-689, 713-716.
- `contactAt(t)` gives the episode the exact frame/point for a burst, splash or sound cue, so animation
  and FX cannot drift apart.

### 2.11 `render/*` and `cache.ts`

- `render/pen.ts` adds `pushFrame(matrix) / popFrame()` around the existing `Pen`. That is the only
  change to the drawing API; all existing primitives (`poly`, `ell`, `band`, `shadedFill`, `gradFill`,
  `inkRing`, `clip`, `dot`) keep their signatures, so the look is untouched.
- `render/character.ts` declares the layer order as data:
  `far legs → far arm → far props → torso → wardrobe → near arm → near props → head → hat → face → extras`.
  It matches today's order, which is why phase 1 can be pixel-identical.
- `cache.keyOf(spec, pose, view, tier)` packs `spec.id` (short hash), 8-12 pose channels quantised to
  visible precision (`phase` 1/120, joint targets 1/8 design unit, face 1/12, lid 1/4), `yaw` band,
  `light` octant, tier. Integer → base-36 string: short, stable, allocation-light, and no
  `JSON.stringify` of option objects.
- `Pool` gains a byte budget and LRU eviction independent of the frame's request set, plus `CacheStats`
  (`draws`, `hits`, `misses`, `bytes`, `uploads`, `flushMs`). Eviction no longer means "not requested this
  frame"; a warm cache survives a cut.

### 2.12 What stays exactly as it is

`cardshade.ts`, `post/*` (ink, lens blur, grade), `stage/*`, `build/*`, `sets/*`, the four LOD tiers
(cast.ts:33-34), the design space (600×1000, soles at 975), `SU = 0.00216`, the `NOINK` layer contract,
and every effect drawing in toon.ts:748-909.

---

## 3. Required files and changes

### 3.1 New files (all under `studio/src/engine/cast/rig/`)

| file | content |
|---|---|
| `spec.ts` | `CharacterSpec`, `makeSpec`, `measures`, `specSheet` |
| `pose.ts` | `Pose`, `restPose`, `partial`, channel ranges |
| `skeleton.ts` | `solveLeg`, `solveArm`, `torsoFrame`, `headFrame`, `footPoly` |
| `view.ts` | `CharacterView`, `viewOf`, `viewBand`, legacy band mapping |
| `face.ts` | `FacePose`, `FACE_PRESETS`, `lerpFace`, `applyMood` |
| `clips.ts` (+ `clips/*.ts` when it grows) | walk, stroll, run, stand, sit, fall, push, swing, wave, turn, gesture |
| `mixer.ts` | `Track`, `sample`, `blend`, masks, additive layers |
| `props.ts` | `PropSpec`, `attachHands`, `contactAt` |
| `render/pen.ts` | `Pen` wrapper with a frame stack |
| `render/body.ts`, `render/limbs.ts`, `render/head.ts`, `render/faceDraw.ts`, `render/character.ts` | painters + orchestration |
| `cache.ts` | `keyOf`, quantisation, `CacheStats` |
| `adapters.ts` | `legacyPose`, `bodyFront`, `bodySide`, `swingKid` |
| `index.ts` | rig barrel |

### 3.2 Modified files

| file | change | risk |
|---|---|---|
| `engine/cast/toon.ts` | keep `Pen`, colours, `blobPts`, `headBlob`, `mul/shade/mix`, `curve`, effects; bodies/faces/hats move to `rig/render/*`; `bodyFront`/`bodySide`/`swingKid` become re-exports of the adapters | **high** — must stay byte-identical in phase 1 |
| `engine/cast/actor.ts` | `Place` gains `pose`/`view`/`specKey` (or a `keyOf` callback); `geo` widens from `"body" \| "swing"` to `string`; `Pool` gains budget/LRU/stats; `viewOf` keeps its boolean as a wrapper, new `viewOfContinuous` | medium |
| `engine/index.ts` | export the rig barrel (`CharacterSpec`, `Pose`, `CharacterView`, `drawCharacter`, `makeSpec`, clips) and keep the old exports | low |
| `episodes/broughton/cast.ts` | `person()` → `rigPlace()`; `fkey` → `keyOf`; `tier` → `LodPolicy`; `mode` → clip tracks; `prop` → `PropSpec`; `blink` → `FacePose.lid`; `hand` → `handTarget` | medium |
| `episodes/broughton/world.ts` | optionally pass `groundAt` to the stage for foot planting; no change to `Place` binding otherwise | low |
| `series/otherly/canon.ts` | add `spec`/`specId` per character; keep `outfit` | low |
| `docs/OTHERLY_PIPELINE.md`, `AGENTS.md` | add the rig to the cast table and the rules (pose-space blending, cache key rules, parity gate) | low |

### 3.3 Tooling

| file | purpose |
|---|---|
| `scripts/rig_sheet.mjs` (new) | render a contact sheet (clip × phase × yaw × expression) through Remotion stills, saved to `out/rig/` |
| `scripts/rig_math_test.mjs` (new) | Node 24 type-stripping tests for `skeleton`, `view`, `mixer`, `cache` (no DOM, no renderer) |
| `scripts/diff_stills.py` | unchanged; used as the phase gate |
| `scripts/bridge-stills.mjs` | unchanged; add an `EPISODE`-independent rig entry only if needed for the sheet |

### 3.4 Explicit non-goals

No sprite atlas, no WebGL character shader, no offscreen-worker drawing, no additional runtime
dependency, no change to the post chain, no 3D character geometry, and no episode-specific knowledge
inside `engine/cast/rig/`.

---

## 4. Implementation phases

Every phase is shippable, leaves the tree green, and keeps `BridgeShort` renderable. The gate for every
phase is the same parity check:

```
python scripts/diff_stills.py 100,700,1500 out/<dir>/<prefix>   # expect mean=0.000 max=0
npx tsc --noEmit
```

### Phase 0 — baseline and instrumentation (no visual change)

- Extend the baseline from three frames to **all shots × 2 frames** (start/middle) plus the current
  three frames, through `episode_shots.py` + `bridge-stills.mjs`.
- Add `CacheStats` to `Pool` (`draws`, `hits`, `misses`, `bytes`, `uploads`, `flushMs`) and expose it in
  dev stills/logs. Record the starting numbers for a light shot and a heavy one (9/10 with 40 sitters,
  15 with 24 tourists).
- Add `rig_math_test.mjs` and `rig_sheet.mjs` (the sheet may render the *old* `bodyFront`/`bodySide` at
  first; it is a review aid).

Gate: stills unchanged, stats recorded.

### Phase 1 — extract the character as data (no visual change)

- `spec.ts`: `makeSpec(outfit, seed)` reproduces `BUILD` + `headBlob` + the measured table
  (characters.md 2.1) to the unit.
- `pose.ts` + `adapters.ts`: encode today's `mode` branches as data (`legacyPose`) — same targets, same
  ordering — then move the drawing code into `render/*` driven by a skeleton computed from that pose.
- `Pen` frame stack; replace the manual `rotAbout` composition (toon.ts:595) with the chain, verifying
  the resulting matrix is identical.
- `bodyFront`/`bodySide`/`swingKid` keep their signatures and delegate.

Gate: full still set `mean=0.000 max=0`; the JPEGs should also match at the byte level after a fresh
cache warm-up.

### Phase 2 — pose model, one solver, continuous view

- `skeleton.ts` shared by both projections; walk becomes one clip with foot plants.
- `view.ts` continuous yaw with the legacy band mapping; `viewOf` wrapper keeps the old boolean.
- Replace the front sinusoid and the side cycloid (484-491 vs 638-652) with one target-based gait.

Gate: parity on the current front/side frames; pose sheet across 8 yaw bands; a foot-slip test (track the
planted foot across a cycle, expect < 0.5 design units of drift).

### Phase 3 — clips and mixer

- `clips.ts` for walk/stroll/stand/sit/fall/push/swing/wave/turn; `mixer.ts` with masks and additive
  layers.
- Episode transitions become fades: `SNAP` stand (cast.ts:124), `DROP` fall→sit (133), tourists'
  stroll→march (236). Blink stays a channel.

Gate: parity on every frame that is not inside a new transition; transition contact sheets; no double
ink (see §5).

### Phase 4 — face channels and the 3/4 projection

- `face.ts` presets replicate `FACE` exactly; `lerpFace` and `applyMood` add blending and mood.
- `faceDraw` becomes view-parameterised using the characters.md 2.2 3/4 targets; front and side presets
  stay as the interpolation endpoints.
- Add micro-asymmetry (one brow 2u higher) and gaze as channels.

Gate: pixel parity for the front/side presets at `lid = 0`; a face sheet comparing the 14 expressions to
the reference crops; blink now works on all eye kinds.

### Phase 5 — props, interaction, scene awareness

- `props.ts`: rifle, ice-cream, hammer, carried shako; generic hand targets; `contactAt`.
- Foot planting against the episode's ground function (the deck bounce in shots 8 and 15, the swing seat
  in 12), and `lookAt` targets.
- Retire `opts.hand` (695-702) in favour of hand targets; retire `swingKid`'s transform trick (731-745).

Gate: shots 12, 14, 8 and 15 compared before/after stills; no floating feet or hands; parity everywhere
else.

### Phase 6 — cache hardening and LOD

- `cache.ts` integer keys; `Pool` byte budget + LRU + per-frame draw budget; per-shot warm-up of the
  first frame; tier hysteresis to stop flicker at the 3.2 / 6.5 / 16 m boundaries.
- Remove dead `tierKey` (cast.ts:68).

Gate: cache bytes and `draws/frame` within budget; `flushMs` and total frame time no worse than phase 0;
parity.

---

## 5. Performance risks and validation

### 5.1 Risks

| risk | why it matters here | mitigation |
|---|---|---|
| **Cache explosion** | The rig multiplies key dimensions (phase × yaw × light × lid × expression × tier). Today's cache is already a JSON cross-product (cast.ts:57). | Quantise to visible precision only; derive the key from the **final** pose (after blending), not from the track list; share keys between characters with the same `spec.id`; 8 yaw bands and 8 light octants; cap expression channels to 12 steps. |
| **Texture memory** | Tier 0 is 1800×3000 ≈ 21.6 MB RGBA (plus mips) per distinct drawing (cast.ts:33). A 3/4 view adds near-camera keys. | Keep the four tiers; tier hysteresis; cap tier-0 canvases to on-screen close characters; LRU byte budget (~256 MB) with stale-texture fallback instead of a mid-frame redraw. |
| **CPU per drawing** | `blobPts` is 72 points, `curve` 10 segments, `inkRing` per shape; the drawing dominates, not the math. | Skeleton/mixer cost is negligible (<0.1 ms/character). Do not add shapes; the 3/4 projection must reuse the same primitive count. Measure `flushMs`, not intuition. |
| **Uploads / bind churn** | Each miss re-uploads a canvas texture; LRU thrash at cuts is the real cost. | Stable keys within a shot, per-shot warm-up, no eviction during a shot, and `draws/frame` budget (≤ 8 steady state). |
| **Transition cost** | A 6-frame fade creates up to 6 new keys per visible character. | Short fades (4-6 frames), only for characters on screen, cap simultaneous fades; most transitions happen on one or two characters. |
| **Double ink / alpha seams** | Image-space blending of two drawings would double the outline and interact badly with `alphaTest` + DOF. | **No compositing of poses.** One draw per sampled pose. Enforce with an ink-pixel counter in the QA script. |
| **Mirror / light mismatch** | Continuous yaw must not rotate the painted crescent wrongly. | `light2D` stays a function of (camera, mirror); yaw only moves features. Check both sides of a turn on the pose sheet. |
| **Tier flicker** | Distance thresholds are hard (3.2 / 6.5 / 16 m) and a character crossing one re-keys the same drawing at a new size. | Hysteresis (±0.4 m) and per-shot stable tier in the blocking, not per frame. |

### 5.2 Validation strategy

1. **Parity gate (blocks every phase).** `python scripts/diff_stills.py <frames> out/<dir>/<prefix>`
   against `out/baseline/` must print `mean=0.000 max=0`. Expand the baseline in phase 0 so a rig change
   cannot hide in an unbaselined shot.
2. **Pose contact sheets.** `rig_sheet.mjs` renders clip × phase × yaw × expression at 0.5 scale into
   `out/rig/`. Review for silhouette, foot plant, hand/prop contact and ink weight. Keep the sheets as
   artifacts to diff between phases.
3. **Pure-math tests (Node, no DOM).**
   - solver: no NaN, `|hip−ankle|` clamped to `≤ l1 + l2`, knee on the requested side;
   - foot plant: planted ankle drift < 0.5 design units over a full cycle at 0.8 m stride;
   - mixer: `sample([{clip, weight: 1}], t)` equals the clip pose; blending endpoints reproduce presets;
   - face: `FACE_PRESETS` channel values reproduce the `FACE` table; `lid` is monotonic and legal for
     every eye kind;
   - spec: `measures` matches the characters.md 2.1/2.3 table exactly;
   - cache: same inputs → same key, a changed lid/yaw/phase → a different key, key length bounded.
4. **Performance budget.** Record for phase 0 vs each phase, on a light shot and a heavy crowd shot:
   `draws/frame`, cache bytes, texture uploads/frame, `flushMs`, total frame time. Accept
   `frame time ≤ baseline + 10 %` and `draws/frame ≤ 8` steady state.
5. **Transition QA.** Render 24-frame sequences around shot 8 `SNAP`/`DROP`, the shot 12 pushes and the
   shot 15 stroll; check no pop, no double outline, no foot slide. Track one planted foot across
   consecutive frames.
6. **Tone and ink checks.** `python scripts/still_stats.py` for mean RGB/luma; add an ink-pixel count to
   `diff_stills.py` output so a changed outline weight fails loudly even when the mean diff is small.
7. **Existing checks.** `npm run typecheck`, a registry smoke test (temporary second episode), a sandbox
   entry test (`EPISODE_ENTRY`), and the sandbox merge round-trip, all of which already exist.

### 5.3 Rollback

`adapters.ts` keeps the legacy API alive for the whole migration, so any phase can be reverted to the
previous phase without touching the episode. The engine barrel keeps exporting `Pen`, `Outfit`,
`bodyFront` and `bodySide` until the episode has fully moved to clips; only then are the deprecated
options removed.

---

## 6. What this buys, mapped to the requirements

| requirement | mechanism |
|---|---|
| smooth pose transitions and blending | `Pose` channels + `mixer` tracks with weight, masks and additive layers; one draw per blended pose |
| walking, running, turning, gestures | target-based `walk`/`run` clips share `solveLeg`; `turn` sweeps `view.yaw`; `wave`/`gesture` are additive masked tracks |
| facial expressions and emotional states | `FacePose` channels, `FACE_PRESETS`, `lerpFace`, `applyMood` |
| object interaction and scene-aware movement | `PropSpec` + hand IK targets + `contactAt`; ankle targets + `plant` against an episode-supplied ground function |
| consistent proportions across shots | one `CharacterSpec` per canon character, `measures()` derived once, `specSheet` QA |
| preserve the look | same Canvas2D primitives, same design space, same ink/shading/`cardShade`/`NOINK`/DOF pipeline, pixel-parity gate |
| preserve performance | same four tiers, bounded LRU cache, integer keys, per-frame draw budget, measured budget per phase |
