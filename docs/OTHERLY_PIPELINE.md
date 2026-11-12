# Otherly production pipeline

Otherly is a multi-genre episodic studio built on one renderer. The look is unchanged from
*The Bridge That Fell for a Song*: flat Canvas2D characters inside a painted, ink-outlined 3D world.
What changed is where things live and how a new episode or genre is added.

```
studio/
  src/
    index.ts                 Remotion entry
    Root.tsx                 one <Composition> per registered episode
    engine/                  genre-agnostic renderer
      episode/               EpisodeDefinition -> Episode -> post chain
      stage/                 camera grammar + timeline/DOF helpers
      look/                  light presets, world shading, painted textures
      build/                 geometry, materials, props, asset loader
      cast/                  toon drawing API, billboards, card shading
      post/                  ink, lens blur, colour grade
      sets/                  set contract + persistent-set cache
    episodes/
      index.ts               episode registry (the only file Root reads)
      broughton/             the example episode = the template
        story.ts             shots, camera keys, cuts, kicks, DOF
        world.ts             the posed scene (update(id, f, cam))
        town.ts              the 1831 Broughton set layout
        cast.ts              blocking, expressions, crowd by shot
        Bridge.tsx           EpisodeDefinition + makeEpisode()
    series/
      otherly/
        series.ts            bible, format, style contract, season plan
        canon.ts             characters, outfits, places
  episodes.json              manifest for the Python/Node tooling
```

## The layers

### Engine

`src/engine/` never imports from `src/episodes/` or `src/series/`. `src/engine/index.ts` is the public
barrel an episode imports from; it re-exports the contracts below.

| Module | Contract |
|---|---|
| `episode/Episode.tsx` | `makeEpisode(def)` returns a Remotion component; runs ink → lens pre/main → bloom → neutral tone map → grade, MSAA 4 |
| `episode/types.ts` | `EpisodeDefinition`, `EpisodeTimeline`, `EpisodeScene`, `EpisodeShot` |
| `stage/camera.ts` | `Cam`, `Shot`, `Key`, `glide`, `runKeys`, `dolly`, `zoom`, `rolled` |
| `stage/timeline.ts` | `shotAt`, `layersAt`, `dofAt` |
| `look/lights.ts` | `LIGHTS` + `LOOK` per light preset; `LightName` union |
| `look/shade.ts` | two-tone world shading + `untone()` |
| `look/paint.ts` | Canvas2D painted textures |
| `build/build.ts` | `Batch`, `Strand`, `house`, `prop`, `kitClone`, sight-line culling (`setSight`/`clearSight`) |
| `build/assets.ts` | `loadKenneyKit(names, dir)` with per-folder caching |
| `cast/toon.ts` | `Pen` drawing API, bodies, faces, effects |
| `cast/actor.ts` | `Pool`, `Actor`, `Fx`, placements, sun lookup |
| `cast/cardshade.ts` | card lighting material |
| `post/ink.ts` | world ink pass (`NOINK` layer contract) |
| `post/lensblur.ts` | thin-lens DOF |
| `post/grade.ts` | `GradeEffect`, `GRADES`, `GRADE_STRENGTH`, `gradeFor` |
| `sets/types.ts` | `SetDefinition`, `SetPiece`, `buildSet` (persistent sets) |

Pixel-sized post parameters are authored at 1080x1920 and scale with output height / 1920. Do not
change that: stills (`--scale 0.5`) and the 2K export (`--scale 1.3333`) must match.

### Episodes

An episode is content plus a small definition. The minimum shape:

```tsx
export const myEpisode: EpisodeDefinition<Kit, MyShot> = {
  id: "MyShort",
  title: "…",
  series: "otherly",
  background: "#cfe3f2",
  timeline: {
    total: TOTAL,
    fps: 30,
    shots: SHOTS,
    layersAt: (f) => layersAt(SHOTS, XFADE, f),
    dofAt: (f) => dofAt(DOF, f),
    flashOpacity: (f) => (f >= FLASH_AT && f < FLASH_AT + 4 ? [1, 0.75, 0.45, 0.2][f - FLASH_AT] : 0),
  },
  loadKit: () => loadKenneyKit(MY_MODELS, "bridge/kenney"),
  createWorld: (kit) => new MyWorld(kit),
  // optional: grade independently of the shot light
  gradeOf: (shot) => shot.grade ?? shot.light,
};
export const MyShort = makeEpisode(myEpisode);
```

`EpisodeScene.update(id, f, cam, scene)` must be pure in `(id, f)` and return the camera look
target. The renderer stacks two scenes during crossfades and asks each one for the same frame.

### Series canon

`src/series/otherly/series.ts` freezes the format (1080x1920, 30 fps, 9:16, English, no captions),
the style contract and the season plan. `canon.ts` holds the outfits and notes for recurring
characters and the set modules for recurring places. A returning episode imports `CHARACTERS.kid`
instead of re-specifying the outfit, so the character stays on-model.

All story, character and voice content is original. The private reference channel is never
published, copied or named.

## Genres are presets

A genre is a lighting + grade + set + cast combination, not a fork of the engine. The current light
vocabulary:

| Preset | Use |
|---|---|
| `day` | bright adventure / history default |
| `golden` | low backlit sun, long shadows, warm grade |
| `overcast` | flat soft light, cool desaturated grade |
| `dusk` | after-sunset violet/orange, warm rim |
| `night` | moonlit blue, crushed shadows |
| `interior_warm` | lamps and wood, short fog range |

Each preset has one entry in `LIGHTS` (sun rig + two-tone + card shading), one in `LOOK` (sky,
water, clouds, saturation, bounce) and one in `GRADES` (curve, saturation, tints, vignette).
`LightName` is the union; episodes type their shots with it.

To add a genre look:

1. Add the name to `LightName` and `LIGHT_NAMES`.
2. Add `LIGHTS.<name>` and `LOOK.<name>`.
3. Add `GRADES.<name>` and `GRADE_STRENGTH.<name>`.
4. Use it in a shot: `{ id: n, a, b, light: "<name>", ... }`.

## Add an episode

1. Copy `src/episodes/broughton/` to `src/episodes/<name>/`.
2. Rename the exported component and the definition id in `<name>/Bridge.tsx` (or rename the file).
3. Write the new `story.ts` (shots, `CAMS`, `DOF`, `FOREGROUND`) and `cast.ts` blocking.
4. Build the set: keep `world.ts`, replace `town.ts` or add another set module; reuse
   `engine/build/build.ts` primitives and `engine/build/assets.ts` for models.
5. Register it in `src/episodes/index.ts`:
   ```ts
   export const EPISODES = [bridgeEpisode, myEpisode];
   ```
6. Add a manifest entry in `studio/episodes.json` (`id`, `dir`, `story`, `outDir`) so
   `episode_shots.py` and the stills script find it.
7. `npm run typecheck`, render three stills, then a full pass.

Persistent places: implement one `SetDefinition` and call `buildSet(set, kit)` from each episode
that revisits it. The geometry is built once per kit and cloned, so a second episode in Broughton
costs no extra build time.

## Tooling

| Command | Purpose |
|---|---|
| `npm run typecheck` | `tsc --noEmit` over `src/` |
| `node scripts/bridge-stills.mjs <prefix> <frames> [scale] [id]` | bundle once, render JPEG stills; id defaults to the first episode |
| `python scripts/episode_shots.py [id|story.ts] [outdir]` | shot/xfade/flash/cut/kick table for QA |
| `python scripts/bridge_shots.py` | bridge shortcut, writes `out/bridge/shots.json` |
| `python scripts/short_qa.py <mp4> <outdir> <shots.json>` | black/white/frozen/pop frames, loudness, sheets |
| `python scripts/diff_stills.py <frames> <prefix>` | numeric pixel diff of stills against `out/baseline/` |
| `python scripts/still_stats.py <jpg...>` | mean RGB/luma of stills, for checking a preset shift without opening images |
| `python scripts/bridge_merge.py [cam,world,look,mat,char,post]` | merge owned sandbox files, with backup |
| `npx remotion render src/index.ts <Comp> out/<name>/video.mp4 --codec h264 --crf 16 --scale 1.3333` | final 2K render |

`episodes.json` is the single source for tool-side episode metadata. Keep it in sync with
`src/episodes/index.ts`.

## Sound

The sound pipeline is per episode and unchanged: copy `studio/shorts/bridge/audio/` to
`studio/shorts/<name>/audio/`, edit `timeline.py` to the episode's beats, run `python mix.py` from
that folder. It expects `../voice/voice.wav` and `../voice/words.json`. Standard mix: music +3 dB,
SFX -6 dB, voice unchanged.

## Verification

- **Visual parity**: `out/baseline/bridge_{100,700,1500}.jpg` is the pre-refactor baseline. After
  any engine change, render stills and run `python scripts/diff_stills.py`; expect
  `mean=0.000 max=0`.
- **Typecheck** after every phase; there is no test suite.
- **QA** every final render with `short_qa.py`.
- Check stills, not full renders, when probing a look change: 2K renders run at ~4 fps.
