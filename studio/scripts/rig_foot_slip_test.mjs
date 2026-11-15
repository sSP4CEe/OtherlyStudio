// rig_foot_slip_test.mjs - Pure Node test for foot plant accuracy
// Tracks planted ankle position across a full walk cycle
// Expects < 0.5 design units of drift for a planted foot

import { walk } from "../src/engine/cast/rig/clips.js";
import { solveLeg } from "../src/engine/cast/rig/skeleton.js";

function testFootSlip() {
  console.log("=== Foot Slip Test ===");
  console.log("Tracking planted ankle drift across walk cycle...\n");
  
  const stride = 370; // design units
  const legLength = 400; // thigh + shin
  const thigh = legLength * 0.5;
  const shin = legLength * 0.5;
  
  let maxDrift = 0;
  let totalDrift = 0;
  let plantFrames = 0;
  
  // Test 100 frames across multiple cycles
  for (let i = 0; i < 100; i++) {
    const u = i / 100;
    const pose = walk(u, { stride, yaw: 0 }); // front view
    
    // Check left leg
    const leftLeg = pose.legs[0];
    const rightLeg = pose.legs[1];
    
    // For planted legs, the ankle should stay at the same position
    if (leftLeg.plant) {
      // The ankle target is the planted position
      const plantedX = leftLeg.ankle[0];
      const plantedY = leftLeg.ankle[1];
      
      // In a perfect system, the planted foot's ankle doesn't move
      // We check that the ankle target is stable during plant phase
      // For front view, left leg plants in second half of cycle (u >= 0.5)
    }
    
    if (rightLeg.plant) {
      const plantedX = rightLeg.ankle[0];
      const plantedY = rightLeg.ankle[1];
      // Right leg plants in first half (u < 0.5)
    }
  }
  
  // More precise test: track ankle position during plant phase
  console.log("Testing left leg plant phase (u = 0.5 to 1.0):");
  let prevAnkleX = null;
  let maxLeftDrift = 0;
  
  for (let i = 50; i < 100; i++) {
    const u = i / 100;
    const pose = walk(u, { stride, yaw: 0 });
    const leftLeg = pose.legs[0];
    
    if (prevAnkleX !== null) {
      const drift = Math.abs(leftLeg.ankle[0] - prevAnkleX);
      if (drift > maxLeftDrift) maxLeftDrift = drift;
    }
    prevAnkleX = leftLeg.ankle[0];
  }
  
  console.log(`  Max left ankle X drift during plant: ${maxLeftDrift.toFixed(4)} design units`);
  
  console.log("\nTesting right leg plant phase (u = 0.0 to 0.5):");
  prevAnkleX = null;
  let maxRightDrift = 0;
  
  for (let i = 0; i < 50; i++) {
    const u = i / 100;
    const pose = walk(u, { stride, yaw: 0 });
    const rightLeg = pose.legs[1];
    
    if (prevAnkleX !== null) {
      const drift = Math.abs(rightLeg.ankle[0] - prevAnkleX);
      if (drift > maxRightDrift) maxRightDrift = drift;
    }
    prevAnkleX = rightLeg.ankle[0];
  }
  
  console.log(`  Max right ankle X drift during plant: ${maxRightDrift.toFixed(4)} design units`);
  
  // Test side view (yaw = π/2)
  console.log("\n=== Side View (yaw = π/2) ===");
  console.log("Testing left leg plant phase (u = 0.5 to 1.0):");
  prevAnkleX = null;
  let maxLeftDriftSide = 0;
  
  for (let i = 50; i < 100; i++) {
    const u = i / 100;
    const pose = walk(u, { stride, yaw: Math.PI / 2 });
    const leftLeg = pose.legs[0];
    
    if (prevAnkleX !== null) {
      const drift = Math.abs(leftLeg.ankle[0] - prevAnkleX);
      if (drift > maxLeftDriftSide) maxLeftDriftSide = drift;
    }
    prevAnkleX = leftLeg.ankle[0];
  }
  
  console.log(`  Max left ankle X drift during plant: ${maxLeftDriftSide.toFixed(4)} design units`);
  
  console.log("\nTesting right leg plant phase (u = 0.0 to 0.5):");
  prevAnkleX = null;
  let maxRightDriftSide = 0;
  
  for (let i = 0; i < 50; i++) {
    const u = i / 100;
    const pose = walk(u, { stride, yaw: Math.PI / 2 });
    const rightLeg = pose.legs[1];
    
    if (prevAnkleX !== null) {
      const drift = Math.abs(rightLeg.ankle[0] - prevAnkleX);
      if (drift > maxRightDriftSide) maxRightDriftSide = drift;
    }
    prevAnkleX = rightLeg.ankle[0];
  }
  
  console.log(`  Max right ankle X drift during plant: ${maxRightDriftSide.toFixed(4)} design units`);
  
  // Test solver accuracy
  console.log("\n=== IK Solver Accuracy ===");
  const hip = [300, 500];
  const ankle = [300, 975];
  const knee = solveLeg(hip, ankle, thigh, shin, 1);
  const dist = Math.hypot(knee[0] - hip[0], knee[1] - hip[1]);
  const dist2 = Math.hypot(ankle[0] - knee[0], ankle[1] - knee[1]);
  console.log(`  Thigh length: ${dist.toFixed(2)} (expected ${thigh})`);
  console.log(`  Shin length: ${dist2.toFixed(2)} (expected ${shin})`);
  console.log(`  Thigh error: ${Math.abs(dist - thigh).toFixed(4)}`);
  console.log(`  Shin error: ${Math.abs(dist2 - shin).toFixed(4)}`);
  
  // Summary
  const overallMaxDrift = Math.max(maxLeftDrift, maxRightDrift, maxLeftDriftSide, maxRightDriftSide);
  console.log(`\n=== SUMMARY ===`);
  console.log(`Overall max foot slip: ${overallMaxDrift.toFixed(4)} design units`);
  console.log(`Threshold: 0.5 design units`);
  console.log(`Status: ${overallMaxDrift < 0.5 ? "PASS ✓" : "FAIL ✗"}`);
  
  return overallMaxDrift < 0.5;
}

testFootSlip();