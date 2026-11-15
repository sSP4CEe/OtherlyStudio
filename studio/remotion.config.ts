import { Config } from "@remotion/cli/config";

// Force CPU rendering for speed & stability on integrated GPUs
Config.setChromiumOpenGlRenderer("swiftshader");
Config.setVideoImageFormat("jpeg");

// Disable hardware acceleration - use CPU encoder
Config.setHardwareAcceleration("disable");

// Read scale from environment variable (set by render script)
// Default to 1.0 for 1080x1920 (YouTube Shorts production)
// Options: 1.0 (1080x1920), 4/3 (1440x2560), 2/3 (720x1280)
const scale = parseFloat(process.env.REMOTION_SCALE || "1.0");
Config.setScale(scale);

console.log(`[Otherly] Rendering at ${1080 * scale}x${1920 * scale} (scale: ${scale}x) [CPU MODE]`);