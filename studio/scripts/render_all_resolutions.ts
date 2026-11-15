// Render script with proper timeout and concurrency settings
import { renderMedia, selectComposition } from "@remotion/renderer";
import { bundle } from "@remotion/bundler";
import * as path from "path";

const RESOLUTIONS = [
  { name: "preview", scale: 2/3, width: 720, height: 1280, description: "Preview (720x1280)" },
  { name: "production", scale: 1.0, width: 1080, height: 1920, description: "Production (1080x1920) - YouTube Shorts default" },
  { name: "high-quality", scale: 4/3, width: 1440, height: 2560, description: "High Quality (1440x2560)" },
];

const COMPOSITION_ID = "BridgeShort";
const ENTRY_POINT = path.resolve("src/index.ts");
const OUTPUT_DIR = path.resolve("out/bridge");

async function main() {
  console.log("Bundling...");
  const bundleLocation = await bundle(
    path.resolve("src/index.ts"),
    () => undefined,
    {
      webpackOverride: (config) => config,
    },
  );

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "BridgeShort",
    inputProps: {},
  });

  if (!composition) {
    throw new Error(`Composition BridgeShort not found`);
  }

  console.log(`Composition: ${composition.id}`);
  console.log(`Duration: ${composition.durationInFrames} frames at ${composition.fps} fps`);
  console.log(`Base resolution: ${composition.width}x${composition.height}`);

  for (const preset of RESOLUTIONS) {
    const outputFile = path.join("out/bridge", `BridgeShort_${preset.name}.mp4`);
    console.log(`\n=== Rendering ${preset.description} (scale: ${preset.scale}x) ===`);

    const startTime = Date.now();

    try {
      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: "h264",
        outputLocation: path.resolve("out/bridge", `BridgeShort_${preset.name}.mp4`),
        inputProps: {},
        scale: preset.scale,
        concurrency: 1,
        timeoutInMilliseconds: 600000,
        onProgress: (progress) => {
          const pct = (progress.overallProgress * 100).toFixed(1);
          process.stdout.write(`\rProgress: ${pct}%`);
        },
      });

      const duration = (Date.now() - startTime) / 1000;
      console.log(`\n✓ Done in ${duration.toFixed(1)}s`);
      
      // Verify video
      const { execSync } = await import("child_process");
      const ffprobe = execSync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,codec_name -of default=noprint_wrappers=1 "${path.resolve("out/bridge", `BridgeShort_${preset.name}.mp4`)}"`,
        { encoding: "utf-8" }
      );
      console.log(`  Verified: ${ffprobe.trim()}`);

    } catch (error) {
      console.error(`\n✗ Failed: ${error}`);
    }
  }

  console.log("\n=== All renders complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});