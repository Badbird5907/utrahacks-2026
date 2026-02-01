/**
 * Mock Data Seed Script for Mission Control
 * 
 * Generates 30 realistic competition runs showing improvement over time.
 * 
 * Usage:
 *   1. Start the dev server: npm run dev
 *   2. Run this script: npx tsx scripts/seed-mock-runs.ts
 * 
 * Features:
 *   - Scores improve from 20-40 to 55-80 over 30 runs
 *   - Strategy evolves (more sections attempted over time)
 *   - Target shooting accuracy improves
 *   - Obstacle course completion rate increases
 *   - Return to start rate improves
 *   - 4 different code versions to simulate iterations
 */

import crypto from 'crypto';

const API_URL = 'http://localhost:4667/api/runs';

// Code hashes representing 4 different code versions
const CODE_HASHES = [
  crypto.createHash('sha256').update('initial_code_v1').digest('hex'),
  crypto.createHash('sha256').update('improved_sensors_v2').digest('hex'),
  crypto.createHash('sha256').update('optimized_motors_v3').digest('hex'),
  crypto.createHash('sha256').update('final_tuning_v4').digest('hex'),
];

// Helper: Random integer between min and max (inclusive)
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper: Random boolean with given probability
function randomBool(probability: number): boolean {
  return Math.random() < probability;
}

// Helper: Pick random item from array
function randomPick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

// Generate a run based on run number (1-30)
function generateRun(runNumber: number) {
  // Calculate improvement factor (0 to 1)
  const progress = (runNumber - 1) / 29;
  
  // Determine code version based on run number
  let codeHashIndex = 0;
  if (runNumber >= 25) codeHashIndex = 3;
  else if (runNumber >= 17) codeHashIndex = 2;
  else if (runNumber >= 9) codeHashIndex = 1;
  
  // Base score improves from 20-40 to 55-80
  const baseScore = Math.round(20 + progress * 35 + randomInt(-10, 15));
  const score = Math.max(0, Math.min(99, baseScore));
  
  // Timestamps: spread across 3 days, with runs throughout each day
  const daysAgo = Math.floor((29 - runNumber) / 10); // 0-2 days ago
  const baseTime = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  const timeOffset = randomInt(0, 8 * 60 * 60 * 1000); // Random time within 8 hours
  const startTime = new Date(baseTime - timeOffset);
  
  // Duration: 1-4 minutes, generally getting faster over time
  const baseDuration = Math.round((4 - progress * 2) * 60 + randomInt(-20, 30));
  const duration = Math.max(60, Math.min(240, baseDuration));
  const endTime = new Date(startTime.getTime() + duration * 1000);
  
  // Sections attempted: evolve from single to both
  let sectionsAttempted: string[] = [];
  if (runNumber <= 10) {
    // Early: mostly single section
    if (randomBool(0.7)) {
      sectionsAttempted = [randomPick(['target_shooting', 'obstacle_course'])];
    } else {
      sectionsAttempted = ['target_shooting', 'obstacle_course'];
    }
  } else if (runNumber <= 20) {
    // Mid: mix
    if (randomBool(0.5)) {
      sectionsAttempted = ['target_shooting', 'obstacle_course'];
    } else {
      sectionsAttempted = [randomPick(['target_shooting', 'obstacle_course'])];
    }
  } else {
    // Late: mostly both
    if (randomBool(0.8)) {
      sectionsAttempted = ['target_shooting', 'obstacle_course'];
    } else {
      sectionsAttempted = [randomPick(['target_shooting', 'obstacle_course'])];
    }
  }
  
  // Box pickup: improves from 60% to 95%
  const boxPickupSuccess = randomBool(0.6 + progress * 0.35);
  
  // Path unlocked: if box pickup successful
  const pathUnlocked = boxPickupSuccess ? randomPick(['red', 'green']) : null;
  
  // Returned to start: improves from 50% to 85%
  const returnedToStart = randomBool(0.5 + progress * 0.35);
  
  // Target Shooting section
  let rampType: string | null = null;
  let reachedTargetCenter: boolean | null = null;
  let ballLandingZone: string | null = null;
  let ballHitWall: boolean | null = null;
  
  if (sectionsAttempted.includes('target_shooting')) {
    // Ramp choice: more curved over time (30% to 70%)
    rampType = randomBool(0.3 + progress * 0.4) ? 'curved' : 'straight';
    
    // Reached center: improves from 40% to 80%
    reachedTargetCenter = randomBool(0.4 + progress * 0.4);
    
    // Ball landing: better zones over time
    if (reachedTargetCenter) {
      const rand = Math.random();
      const blueChance = 0.1 + progress * 0.3; // 10% to 40%
      const greenChance = blueChance + 0.25;
      const yellowChance = greenChance + 0.2;
      const redChance = yellowChance + 0.15;
      
      if (rand < blueChance) ballLandingZone = 'blue';
      else if (rand < greenChance) ballLandingZone = 'green';
      else if (rand < yellowChance) ballLandingZone = 'yellow';
      else if (rand < redChance) ballLandingZone = 'red';
      else ballLandingZone = 'white';
    } else {
      ballLandingZone = randomBool(0.3) ? 'missed' : 'white';
    }
    
    // Wall hit penalty: decreases over time (30% to 5%)
    ballHitWall = randomBool(0.3 - progress * 0.25);
  }
  
  // Obstacle Course section
  let obstacleCompleted: boolean | null = null;
  let obstacleIssues: string | null = null;
  
  if (sectionsAttempted.includes('obstacle_course')) {
    // Completion: improves from 40% to 85%
    obstacleCompleted = randomBool(0.4 + progress * 0.45);
    
    // Issues: more common early on
    if (!obstacleCompleted && randomBool(0.7)) {
      const issues = [
        'Got stuck on turn 2',
        'Wheels slipped on turn 3',
        'Lost line on sharp curve',
        'Too slow, timed out',
        'Bumped into wall',
        'Sensor lost track',
        'Motor stalled on turn',
      ];
      obstacleIssues = randomPick(issues);
    }
  }
  
  // Technical issues: decrease over time
  let technicalIssues: string | null = null;
  if (randomBool(0.15 - progress * 0.12)) {
    const issues = [
      'Battery low mid-run',
      'Sensor calibration drift',
      'Motor power fluctuation',
      'Color sensor glitched',
      'Wheel encoder issue',
    ];
    technicalIssues = randomPick(issues);
  }
  
  // Notes: occasionally add observations
  const notesList = [
    'Good run overall',
    'Need to tune motor speeds',
    'Color sensor needs recalibration',
    'Excellent ball launch!',
    'Smooth obstacle navigation',
    'Box pickup was clean',
    'Curved ramp successful',
    'Best run so far',
    'Consistent performance',
    'Minor adjustments needed',
  ];
  const notes = randomBool(0.4) ? randomPick(notesList) : '';
  
  return {
    startTimestamp: startTime.toISOString(),
    endTimestamp: endTime.toISOString(),
    score,
    codeHash: CODE_HASHES[codeHashIndex],
    notes,
    sectionsAttempted,
    rampType,
    reachedTargetCenter,
    ballLandingZone,
    ballHitWall,
    obstacleCompleted,
    obstacleIssues,
    returnedToStart,
    boxPickupSuccess,
    pathUnlocked,
    technicalIssues,
    metadata: {},
  };
}

// Main seeding function
async function seedRuns() {
  console.log('🚀 Starting to seed 30 mock runs...\n');
  console.log(`Posting to: ${API_URL}\n`);
  
  const runs = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 1; i <= 30; i++) {
    const run = generateRun(i);
    runs.push(run);
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(run),
      });
      
      const result = await response.json();
      
      if (result.success) {
        successCount++;
        console.log(`✅ Run ${i}/30: Score ${run.score} | Sections: ${run.sectionsAttempted.join(', ') || 'none'} | ${run.returnedToStart ? '✓' : '✗'} returned`);
      } else {
        failCount++;
        console.error(`❌ Run ${i}/30 failed: ${result.error}`);
      }
    } catch (error) {
      failCount++;
      console.error(`❌ Run ${i}/30 error:`, error instanceof Error ? error.message : 'Unknown error');
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n📊 Seeding complete!`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`\n🎯 You can now view the analytics at: http://localhost:4667/analytics`);
  
  // Summary stats
  const scores = runs.map(r => r.score);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  
  console.log(`\n📈 Generated Data Summary:`);
  console.log(`   Score Range: ${minScore} - ${maxScore}`);
  console.log(`   Average Score: ${avgScore}`);
  console.log(`   Total Sections: ${runs.filter(r => r.sectionsAttempted.includes('target_shooting')).length} target, ${runs.filter(r => r.sectionsAttempted.includes('obstacle_course')).length} obstacle`);
  console.log(`   Return Rate: ${Math.round(runs.filter(r => r.returnedToStart).length / runs.length * 100)}%`);
  console.log(`   Blue Zone Hits: ${runs.filter(r => r.ballLandingZone === 'blue').length}`);
}

// Check if server is running before starting
async function checkServer() {
  try {
    const response = await fetch('http://localhost:4667/api/runs', {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Run the seeder
(async () => {
  console.log('🔍 Checking if dev server is running...\n');
  
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.error('❌ Error: Dev server is not running at http://localhost:4667');
    console.error('   Please start it with: npm run dev\n');
    process.exit(1);
  }
  
  console.log('✅ Server is running!\n');
  
  await seedRuns();
})();
