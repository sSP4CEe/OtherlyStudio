// rig_foot_slip_test.ts - Pure Node test for foot plant accuracy
// Tracks planted ankle position across a full walk cycle
// Expects < 0.5 design units of drift for a planted foot

import { walk } from "../src/engine/cast/rig/clips";
import { solveLeg } from "../src/engine/cast/rig/skeleton";
import { rad, lerp2 } from "../src/engine/cast/rig/math2d";

function testFootSlip() {
  console.log("=== Foot Slip Test ===");
  console.log("Tracking planted ankle drift across walk cycle...\n");
  
  const stride = 370; // design units
  const legLength = 400; // thigh + shin
  const thigh = legLength * 0.5;
  const shin = legLength * 0.5;
  
  // Walk function logic:
  // cadence = 2 steps/sec, so cycle = 0.5 sec per step pair
  // cyclePhase = (u * 2) % 1
  // leftPlant = cyclePhase < 0.5 (plants in first half of each cycle)
  // rightPlant = cyclePhase >= 0.5 (plants in second half of each cycle)
  
  // For u in [0, 1) with cadence=2:
  // cyclePhase = (u * 2) % 1
  // u=0.0 to 0.25: cyclePhase=0.0 to 0.5, leftPlant=true, rightPlant=false
  // u=0.25 to 0.5: cyclePhase=0.5 to 1.0, leftPlant=false, rightPlant=true
  // u=0.5 to 0.75: cyclePhase=0.0 to 0.5, leftPlant=true, rightPlant=false
  // u=0.75 to 1.0: cyclePhase=0.5 to 1.0, leftPlant=false, rightPlant=true
  
  // Test left leg plant phases: u in [0, 0.25) and [0.5, 0.75)
  console.log("Testing left leg plant phase 1 (u = 0.0 to 0.25):");
  let prevAnkleX = null;
  let maxLeftDrift1 = 0;
  
  for (let i = 0; i < 25; i++) {
    const u = i / 100;
    const pose = walk(u, { stride: 370, yaw: 0 });
    const leftLeg = pose.legs[0];
    
    if (prevAnkleX !== null) {
      const drift = Math.abs(leftLeg.ankle[0] - prevAnkleX);
      if (drift > maxLeftDrift1) maxLeftDrift1 = drift;
    }
    prevAnkleX = leftLeg.ankle[0];
  }
  
  console.log(`  Max left ankle X drift during plant: ${maxLeftDrift1.toFixed(4)} design units`);
  
  console.log("\nTesting left leg plant phase 2 (u = 0.5 to 0.75):");
  prevAnkleX = null;
  let maxLeftDrift2 = 0;
  
  for (let i = 50; i < 75; i++) {
    const u = i / 100;
    const pose = walk(u, { stride: 370, yaw: 0 });
    const leftLeg = pose.legs[0];
    
    if (prevAnkleX !== null) {
      const drift = Math.abs(leftLeg.ankle[0] - prevAnkleX);
      if (drift > maxLeftDrift2) maxLeftDrift2 = drift;
    }
    prevAnkleX = leftLeg.ankle[0];
  }
  
  console.log(`  Max left ankle X drift during plant: ${maxLeftDrift2.toFixed(4)} design units`);
  
  // Test right leg plant phases: u in [0.25, 0.5) and [0.75, 1.0)
  console.log("\nTesting right leg plant phase 1 (u = 0.25 to 0.5):");
  prevAnkleX = null;
  let maxRightDrift1 = 0;
  
  for (let i = 25; i < 50; i++) {
    const u = i / 100;
    const pose = walk(u, { stride: 370, yaw: 0 });
    const rightLeg = pose.legs[1];
    
    if (prevAnkleX !== null) {
      const drift = Math.abs(rightLeg.ankle[0] - prevAnkleX);
      if (drift > maxRightDrift1) maxRightDrift1 = drift;
    }
    prevAnkleX = rightLeg.ankle[0];
  }
  
  console.log(`  Max right ankle X drift during plant: ${maxRightDrift1.toFixed(4)} design units`);
  
  console.log("\nTesting right leg plant phase 2 (u = 0.75 to 1.0):");
  prevAnkleX = null;
  let maxRightDrift2 = 0;
  
  for (let i = 75; i < 100; i++) {
    const u = i / 100;
    const pose = walk(u, { stride: 370, yaw: 0 });
    const rightLeg = pose.legs[1];
    
    if (prevAnkleX !== null) {
      const drift = Math.abs(rightLeg.ankle[0] - prevAnkleX);
      if (drift > maxRightDrift2) maxRightDrift2 = drift;
    }
    prevAnkleX = rightLeg.ankle[0];
  }
  
  console.log(`  Max right ankle X drift during plant: ${maxRightDrift2.toFixed(4)} design units`);
  
  // Test side view (yaw = π/2)
  console.log("\n=== Side View (yaw = π/2) ===");
  console.log("Testing left leg plant phase (u = 0.0 to 0.25):");
  prevAnkleX = null;
  let maxLeftDriftSide = 0;
  
  for (let i = 0; i < 25; i++) {
    const u = i / 100;
    const pose = walk(u, { stride: 370, yaw: Math.PI / 2 });
    const leftLeg = pose.legs[0];
    
    if (prevAnkleX !== null) {
      const drift = Math.abs(leftLeg.ankle[0] - prevAnkleX);
      if (drift > maxLeftDriftSide) maxLeftDriftSide = drift;
    }
    prevAnkleX = leftLeg.ankle[0];
  }
  
  console.log(`  Max left ankle X drift during plant: ${maxLeftDriftSide.toFixed(4)} design units`);
  
  console.log("\nTesting right leg plant phase (u = 0.25 to 0.5):");
  prevAnkleX = null;
  let maxRightDriftSide = 0;
  
  for (let i = 25; i < 50; i++) {
    const u = i / 100;
    const pose = walk(u, { stride: 370, yaw: Math.PI / 2 });
    const rightLeg = pose.legs[1];
    
    if (prevAnkleX !== null) {
      const drift = Math.abs(rightLeg.ankle[0] - prevAnkleX);
      if (drift > maxRightDriftSide) maxRightDriftSide = drift;
    }
    prevAnkleX = rightLeg.ankle[0];
  }
  
  console.log(`  Max right ankle X drift during plant: ${maxRightDriftSide.toFixed(4)} design units`);
  
  // Test solver accuracy with reachable position
  console.log("\n=== IK Solver Accuracy ===");
  // Use a reachable position: hip at y=600, ankle at y=900 (distance 300, within thigh+shin=400)
  const hip = [300, 600];
  const ankle = [300, 900];
  const knee = solveLeg(hip, ankle, thigh, shin, 1);
  const dist = Math.hypot(knee[0] - hip[0], knee[1] - hip[1]);
  const dist2 = Math.hypot(ankle[0] - knee[0], ankle[1] - knee[1]);
  console.log(`  Thigh length: ${dist.toFixed(2)} (expected ${thigh})`);
  console.log(`  Shin length: ${dist2.toFixed(2)} (expected ${shin})`);
  console.log(`  Thigh error: ${Math.abs(dist - thigh).toFixed(4)}`);
  console.log(`  Shin error: ${Math.abs(dist2 - shin).toFixed(4)}`);
  
  // Summary
  const overallMaxDrift = Math.max(maxLeftDrift1, maxLeftDrift2, maxRightDrift1, maxRightDrift2, maxLeftDriftSide, maxRightDriftSide);
  console.log(`\n=== SUMMARY ===`);
  console.log(`Overall max foot slip: ${overallMaxDrift.toFixed(4)} design units`);
  console.log(`Threshold: 0.5 design units`);
  console.log(`Status: ${overallMaxDrift < 0.5 ? "PASS ✓" : "FAIL ✗"}`);
  
  return overallMaxDrift < 0.5;
}

testFootSlip();