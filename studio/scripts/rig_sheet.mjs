// rig_sheet.mjs - render contact sheets for pose validation
// Usage: node scripts/rig_sheet.mjs <out-dir> <scale> [compositionId]
// Renders clip × phase × yaw × expression combinations for visual review.

import fs from "node:fs";
import path from "node:path";
if (process.env.REMOTION_TMP) { fs.mkdirSync(process.env.REMOTION_TMP, { recursive: true }); process.env.TEMP = process.env.TMP = process.env.TMPDIR = process.env.REMOTION_TMP; }
const { bundle } = await import("@remotion/bundler");
const { renderStill, selectComposition } = await import("@remotion/renderer");

const manifest = JSON.parse(fs.readFileSync(path.resolve("episodes.json"), "utf8"));
const [outDir, scale = "0.5", argId] = process.argv.slice(2);
const prefix = path.resolve(outDir);
fs.mkdirSync(prefix, { recursive: true });

// Sheet parameters
const PHASES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]; // 8 phases per cycle
const YAWS = [-Math.PI/2, -Math.PI*3/8, -Math.PI/4, -Math.PI/8, 0, Math.PI/8, Math.PI/4, Math.PI*3/8, Math.PI/2]; // 9 yaws
const EXPRESSIONS = ["neutral", "stern", "grin", "laugh", "whistle", "nervous", "shock", "relief", "smile", "smile_closed", "lick"];
const CLIPS = ["walk", "stroll", "stand", "sit", "fall", "push", "swing", "wave", "turn"];

// Build a test composition that renders a single pose
const testCode = `
import React from "react";
import { Canvas, useVideoConfig } from "remotion";
import { Pen } from "./src/engine/cast/toon";
import { drawCharacter, walk, stroll, stand, sit, fall, push, swing, wave, turn, makeSpec } from "./src/engine/cast/rig";
import { KID, OFFICER, PARENT, RIFLEMAN, townsfolk, soldier } from "./src/engine/cast/toon";

const clips = { walk, stroll, stand, sit, fall, push, swing, wave, turn };

export const RigSheet = () => {
  const { width, height } = useVideoConfig();
  const clipName = process.env.CLIP || "walk";
  const phase = parseFloat(process.env.PHASE || "0");
  const yaw = parseFloat(process.env.YAW || "0");
  const expr = process.env.EXPR || "neutral";
  const spec = makeSpec(RIFLEMAN, 1, "test");
  const pose = clips[clipName](phase, { yaw, phase });
  return (
    <Canvas width={width} height={height}>
      <PoseRenderer spec={spec} pose={pose} view={{ yaw, pitch: 0, mirror: false, light: -2.094, tier: 0 }} outfit={RIFLEMAN} expr={expr} />
    </Canvas>
  );
};

const PoseRenderer = ({ spec, pose, view, outfit, expr }) => {
  const canvasRef = React.useRef(null);
  React.useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const pen = new Pen(ctx);
    // Clear
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    // Draw character centered
    drawCharacter(pen, spec, pose, view, outfit);
  }, [spec, pose, view, outfit, expr]);
  return <canvas ref={canvasRef} width={600} height={1000} />;
};

export default RigSheet;
`;

async function main() {
  // Write test composition
  const testFile = path.resolve("src/rigSheetTest.tsx");
  fs.writeFileSync(testFile, testCode);
  
  const bundleResult = await bundle({
    entryPoint: testFile,
    webpackOverride: { mode: "production" },
  });
  
  const compositionId = "RigSheet";
  const composition = await selectComposition({
    serveUrl: bundleResult,
    id: compositionId,
    inputProps: {},
  });
  
  // Render sheets
  for (const clip of CLIPS) {
    for (const phase of PHASES) {
      for (const yaw of YAWS) {
        for (const expr of EXPRESSIONS) {
          const fileName = `${clip}_p${phase.toFixed(3)}_y${yaw.toFixed(3)}_${expr}.jpg`;
          const filePath = path.join(prefix, fileName);
          
          process.env.CLIP = clip;
          process.env.PHASE = phase.toString();
          process.env.YAW = yaw.toString();
          process.env.EXPR = expr;
          
          await renderStill({
            serveUrl: bundleResult,
            composition,
            output: filePath,
            imageFormat: "jpeg",
            quality: 90,
            scale: parseFloat(scale),
          });
          
          console.log(`Rendered: ${fileName}`);
        }
      }
    }
  }
  
  // Cleanup
  fs.unlinkSync(testFile);
  console.log("Sheet complete!");
}

main().catch(console.error);