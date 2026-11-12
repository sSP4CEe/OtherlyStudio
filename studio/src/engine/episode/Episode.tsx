// Genre-agnostic episode renderer: one definition in, a 1080x1920 composition out.
// Post chain (look-match pass), unchanged from the bridge short:
//   InkPass (world ink lines, own pass) -> lens blur pre + main (thin-lens DOF from the episode timeline) ->
//   [bloom (emissive only) + NEUTRAL tone mapping + colour grade] (one merged EffectPass), MSAA 4.
// Ink runs before the DOF so lines blur with what they belong to; bloom after the DOF so glows defocus with their
// source; the grade is display-referred, so it comes after tone mapping. Every pixel-sized parameter is specified at
// 1080x1920 and scaled with the output size, so stills at --scale 0.5 and the 1440x2560 final match.
// Place changes crossfade by stacking a second canvas for the fade frames; an episode may add a white flash.
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, getInputProps, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { InkPass, noInkFallback } from "../post/ink";
import { LensBlur, GrainEffect } from "../post/lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH, gradeFor } from "../post/grade";
import type { EpisodeDefinition, EpisodeShot } from "./types";

/** A/B switches for test stills only (Remotion inputProps `{ post: { ink: false, ... } }`); everything is on by default. */
type PostToggles = { ink: boolean; lens: boolean; pre: boolean; bloom: boolean; grade: boolean; grain: boolean };
const toggles = (): PostToggles => ({ ink: true, lens: true, pre: true, bloom: true, grade: true, grain: false, ...((getInputProps() as { post?: Partial<PostToggles> }).post ?? {}) });

/** Bloom for emissive sources only (depth.md 6.4). Its MIP chain always starts at 540x960 (half of 1080x1920),
 *  whatever the output size, so the glow keeps the same size relative to the frame (e-fold ~30 px at 1080p,
 *  ~1.5 % of the frame height) at 540, 1080 and 1440 widths. ADD blend: HDR-safe (SCREEN darkens values > 1). */
const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = b.mipmapBlurPass;
  const setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
  return b;
};

const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

const useKit = <K, S extends EpisodeShot>(def: EpisodeDefinition<K, S>) => {
  const [kit, setKit] = useState<K | null>(null);
  const [handle] = useState(() => delayRender(`${def.id} kit`));
  useEffect(() => { def.loadKit().then((k) => { setKit(k); continueRender(handle); }); }, [def, handle]);
  return kit;
};

const Inner = <K, S extends EpisodeShot>({ def, id, kit }: { def: EpisodeDefinition<K, S>; id: number; kit: K }) => {
  const f = useCurrentFrame();
  const { camera, scene } = useThree();
  const world = useMemo(() => def.createWorld(kit), [def, kit]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const on = useMemo(toggles, []);
  const fx = useMemo(() => ({
    ink: new InkPass(scene, camera as THREE.PerspectiveCamera),
    lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
    bloom: makeBloom(),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(GRADES.day, GRADE_STRENGTH.day),
    grain: new GrainEffect({ amount: 0.025, cellPx: 1.5 }), // film grain, OFF by default (inputProps post.grain): the reference measures no grain and it quadruples the file size
  }), [camera, scene]);
  useEffect(() => () => fx.ink.dispose(), [fx]);
  const post = useMemo(() => (
    <EffectComposer multisampling={4}>
      {/* an array, not `cond ? <x/> : null`: newer @react-three/postprocessing types reject null children */}
      {[
        on.ink && <primitive key="ink" object={fx.ink} dispose={null} />,
        on.lens && on.pre && <primitive key="pre" object={fx.lens.pre} dispose={null} />,
        on.lens && <primitive key="lens" object={fx.lens.main} dispose={null} />,
        on.bloom && <primitive key="bloom" object={fx.bloom} dispose={null} />,
        <primitive key="tone" object={fx.tone} dispose={null} />,
        on.grade && <primitive key="grade" object={fx.grade} dispose={null} />,
        on.grain && <primitive key="grain" object={fx.grain} dispose={null} />,
      ].filter((e): e is React.JSX.Element => !!e)}
    </EffectComposer>
  ), [fx, on]);
  const cam = camera as THREE.PerspectiveCamera;
  target.copy(world.update(id, f, cam, scene));
  noInkFallback(world.root);
  // thin-lens focus: distance along the view axis to the shot's focus point (default: the camera's look target)
  const d = def.timeline.dofAt(f);
  cam.getWorldDirection(fwd);
  if (d.focus) fpt.set(...d.focus(f)); else fpt.copy(target);
  fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  fx.lens.cInf = d.cInf;
  const shot = def.timeline.shots.find((s) => s.id === id) ?? def.timeline.shots[0];
  gradeFor(fx.grade, def.gradeOf ? def.gradeOf(shot) : (shot.grade ?? shot.light));
  fx.grain.seed = f; // deterministic per frame
  return (
    <>
      <primitive object={world.root} dispose={null} />
      {post}
    </>
  );
};

/** test stills only: inputProps `{ post: { dpr: 0.5 } }` forces the WebGL buffer size (R3F clamps dpr to >= 1 by default) */
const dprOverride = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;

const ShotView = <K, S extends EpisodeShot>({ def, id, kit, alpha }: { def: EpisodeDefinition<K, S>; id: number; kit: K; alpha: number }) => (
  <AbsoluteFill style={{ opacity: alpha }}>
    <ThreeCanvas width={1080} height={1920} {...(dprOverride() ? { dpr: dprOverride() } : {})} shadows gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
      camera={{ fov: 40, near: 0.2, far: 1500 }}>
      <Inner def={def} id={id} kit={kit} />
    </ThreeCanvas>
  </AbsoluteFill>
);

/** Bind a definition into a Remotion component. */
export function makeEpisode<K, S extends EpisodeShot>(def: EpisodeDefinition<K, S>): React.FC {
  const Episode: React.FC = () => {
    const f = useCurrentFrame();
    const kit = useKit(def);
    if (kit === null) return null;
    const flash = def.timeline.flashOpacity?.(f) ?? 0;
    return (
      <AbsoluteFill style={{ background: def.background }}>
        {def.timeline.layersAt(f).map((l, i) => <ShotView key={i ? "over" : "base"} def={def} id={l.id} kit={kit} alpha={l.alpha} />)}
        {flash > 0 && <AbsoluteFill style={{ background: "#ffffff", opacity: flash }} />}
      </AbsoluteFill>
    );
  };
  Episode.displayName = `Episode(${def.id})`;
  return Episode;
}
