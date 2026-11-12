# AGENTS.md

This repo is a **ready-to-run skill** for making vertical cartoon story shorts: three.js scenes rendered by Remotion, with voice, synthesized SFX and music. `SKILL.md` is the authoritative production pipeline; read it before making or changing a short.

## Read first

- `SKILL.md` — script formula, shot plan, look values, sound pipeline, QA loop, gotchas.
- `references/STYLE_BIBLE.md` and `references/reports/*.md` — measured style targets. The reports are the source of truth, not adjectives in prose.
- `references/reports/CONTEXT.md` — the look-match loop and sandbox ownership model.

## Setup

- Requires Node.js LTS, Python 3 (`numpy`, `scipy`) and `ffmpeg`.
- Run once from the repo root: `powershell -ExecutionPolicy Bypass -File setup.ps1` (Windows) or `bash setup.sh` (macOS/Linux).
- Setup installs `studio/node_modules`, downloads the Kenney models into `studio/public/bridge/kenney/`, and sets `REMOTION_TMP`.
- If `studio/node_modules/` or `studio/public/bridge/kenney/` is missing, run setup before anything else.
- The downloaded Kenney models and generated audio (voice, mix, stems) are gitignored; do not commit them.
- Put `ELEVENLABS_API_KEY` in the environment for ElevenLabs voice generation; `.env` is gitignored.

## Commands (run from `studio/`)

- `npm run typecheck` — `tsc --noEmit` over `src/` only. Scripts (`.mjs`, `.py`) are not typechecked. There is no test suite or CI.
- `npm run studio` — Remotion preview.
- `node scripts/bridge-stills.mjs out/bridge/test_ 100,700,1500 [scale] [compositionId]` — bundle once and render JPEG stills. Default scale `0.5`; composition defaults to the first episode in `studio/episodes.json` (use `EPISODE=<id>` or the 4th argument for another).
- `EPISODE_ENTRY=src/sandboxes/<n>/index.tsx node scripts/bridge-stills.mjs ...` — render a sandbox copy instead of the main entry (legacy `BRIDGE_ENTRY` also works). In PowerShell, set `$env:EPISODE_ENTRY` first; the inline form is for bash.
- `CHROME=<path> node scripts/bridge-stills.mjs ...` — use a local Chrome; otherwise Remotion downloads its own. PowerShell: set `$env:CHROME` first.
- Final render: `npx remotion render src/index.ts <Comp> out/<name>/video.mp4 --codec h264 --crf 16 --scale 1.3333`.
- Sound: from `studio/shorts/<name>/audio/`, run `python mix.py` (writes `mix.wav`, stems, `cues.md`). It needs `../voice/voice.wav` and `../voice/words.json`; the example's `voice/` is not committed.
- Episode QA: `python scripts/episode_shots.py [episode-id|story.ts] [outdir]` (default: first episode in `episodes.json`) writes `shots.json`, then `python scripts/short_qa.py <mp4> <outdir> shots.json`. `python scripts/bridge_shots.py` is the bridge shortcut and still writes `out/bridge/shots.json`.
- Visual regression: `python scripts/diff_stills.py 100,700,1500 out/<dir>/<prefix>` compares JPEG stills against `out/baseline/` (expect `mean=0.000 max=0` after an engine refactor). `python scripts/still_stats.py <jpg...>` prints mean RGB/luma when you only need to confirm a colour shift.

## Render and disk traps

- `REMOTION_TMP` must point at a drive with 20+ GB free. Every bundle copies `public/` (~1.3 GB) into it and never deletes it. `bridge-stills.mjs` honors it; both setup scripts set it.
- The composition is authored at **1080x1920**. The final 2K export is that composition upscaled with `--scale 1.3333` (1440x2560), not a different composition size.
- Every pixel-sized post parameter is specified at 1080x1920 and scales with output height / 1920. Keep it that way or stills and the final will mismatch.
- Remotion writes a silent audio track; mux the real mix with `-map 0:v:0 -map 1:a:0`.
- Full 2K renders run around 4 fps plus a ~40 s bundle. Check changes with stills first; do not render the whole video to probe a look change.

## Architecture

- `src/index.ts` → `src/Root.tsx` renders one `<Composition>` per entry in `src/episodes/index.ts`. `BridgeShort` is the only episode today; adding one is a content folder plus one registry line.
- **Engine** (`src/engine/`) is genre-agnostic: `episode/` (definition → renderer → post chain), `stage/` (camera + timeline helpers), `look/` (light presets, world shading, painted textures), `build/` (geometry, materials, props, asset loading), `cast/` (toon drawing API, billboards, card shading), `post/` (ink, lens blur, grade), `sets/` (set contract and persistent-set cache).
- **Episodes** (`src/episodes/<name>/`) are content: `story.ts` timeline/cameras/cuts/DOF, `world.ts` + `<set>.ts`, `cast.ts` blocking, `Bridge.tsx`-style definition (`EpisodeDefinition`). Copy `broughton/` to start a new one.
- **Series** (`src/series/otherly/`) holds the bible, style contract, character canon and place canon. Recurring characters stay on-model by reading from `CHARACTERS` / `PLACES` instead of re-specifying outfits.
- **Genres are presets, not forks**: lights `day`, `golden`, `overcast`, `dusk`, `night`, `interior_warm`, each with a matching grade in `GRADES`. An episode picks per shot; the look pipeline is the same.
- Cross-file contracts are exported constants (`NOINK`, `dofAt`, `FOREGROUND`, `LIGHTS`/`LOOK`, `EpisodeDefinition`). Changing one means checking every consumer.
- Look-match sandboxes hold only the files they own in `src/sandboxes/bridge_<owner>/` (`cam`, `world`, `look`, `mat`, `char`, `post`). Ownership lives in `scripts/bridge_merge.py`; merge with `python scripts/bridge_merge.py cam,world,look,mat,char,post` (backs up episode + engine to `studio/backup/`), then re-sync every sandbox from main before the next round.

## Content constraints

- Story, characters and voice must be original. The reference channel is private study material: never publish/upload its videos or frames, copy its scripts/characters/shots, or name it in a voice-over or description.
- English only, no captions or on-screen labels, one steady voice tone.
- Jokes must be researched facts. Standard mix is music +3 dB, SFX -6 dB, voice unchanged.
- `SKILL.md` uses Claude Code tool names (`SendUserFile`, `SendMessage`); in OpenCode, link the output path in the final response and continue a subagent by its `sessionID`.

## Known gotchas

- Kenney nature-kit materials are teal; recolor by material name in `build.ts`.
- Ink must render as its own pass before DOF; merging the two overwrites the ink.
- R3F clamps `dpr` to ≥ 1, so `--scale 0.5` still renders a 1080x1920 WebGL buffer.
- Film grain is off on purpose: it quadruples the 2K file size and the reference has none.
- On Windows, write forward slashes in JS paths (`"D:/remotion-tmp"`); `"D:\remotion-tmp"` turns `\r` into a carriage return.
- Props within ~2 m of a moving camera become huge cut-off blobs at the frame edge; re-check props whenever a camera moves.
