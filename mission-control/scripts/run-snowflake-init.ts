/**
 * Initialize Snowflake Database via Node.js
 * 
 * This script creates the database, schema, table, and views.
 * Run this if you can't run the SQL manually in Snowflake console.
 * 
 * Usage: npx tsx scripts/run-snowflake-init.ts
 */

import "dotenv/config";
import snowflake from "snowflake-sdk";

const account = process.env.SNOWFLAKE_ACCOUNT?.trim() || "";
const username = process.env.SNOWFLAKE_USER?.trim() || "";
const password = process.env.SNOWFLAKE_PASSWORD?.trim() || "";
const warehouse = process.env.SNOWFLAKE_WAREHOUSE?.trim() || "COMPUTE_WH";

// Clean account identifier
let cleanAccount = account;
if (cleanAccount.includes('.snowflakecomputing.com')) {
  cleanAccount = cleanAccount.split('.snowflakecomputing.com')[0];
}

console.log("🚀 Snowflake Database Initialization\n");
console.log("====================================\n");

// SQL statements to execute (in order)
const sqlStatements = [
  // Create warehouse
  `CREATE WAREHOUSE IF NOT EXISTS ${warehouse}
    WITH WAREHOUSE_SIZE = 'XSMALL'
    AUTO_SUSPEND = 60
    AUTO_RESUME = TRUE
    INITIALLY_SUSPENDED = FALSE`,
  
  // Use warehouse
  `USE WAREHOUSE ${warehouse}`,
  
  // Create database
  `CREATE DATABASE IF NOT EXISTS MISSION_CONTROL`,
  
  // Use database
  `USE DATABASE MISSION_CONTROL`,
  
  // Create schema
  `CREATE SCHEMA IF NOT EXISTS RUNS`,
  
  // Use schema
  `USE SCHEMA RUNS`,
  
  // Create main table
  `CREATE TABLE IF NOT EXISTS COMPETITION_RUNS (
    id STRING PRIMARY KEY,
    run_number INT NOT NULL,
    start_timestamp TIMESTAMP_NTZ NOT NULL,
    end_timestamp TIMESTAMP_NTZ NOT NULL,
    duration_seconds INT NOT NULL,
    score INT NOT NULL,
    code_hash STRING NOT NULL,
    notes STRING,
    sections_attempted ARRAY,
    ramp_type STRING,
    reached_target_center BOOLEAN,
    ball_landing_zone STRING,
    ball_hit_wall BOOLEAN,
    obstacle_completed BOOLEAN,
    obstacle_issues STRING,
    returned_to_start BOOLEAN NOT NULL,
    box_pickup_success BOOLEAN,
    path_unlocked STRING,
    technical_issues STRING,
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
  )`,
  
  // Create views
  `CREATE OR REPLACE VIEW SCORE_TRENDS AS
  SELECT 
    run_number,
    score,
    start_timestamp,
    duration_seconds,
    AVG(score) OVER (ORDER BY run_number ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS moving_avg_5,
    AVG(score) OVER (ORDER BY run_number ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS moving_avg_10,
    score - LAG(score, 1) OVER (ORDER BY run_number) AS score_change,
    CASE 
      WHEN score > LAG(score, 1) OVER (ORDER BY run_number) THEN 'improved'
      WHEN score < LAG(score, 1) OVER (ORDER BY run_number) THEN 'declined'
      ELSE 'unchanged'
    END AS trend
  FROM COMPETITION_RUNS
  ORDER BY run_number`,

  `CREATE OR REPLACE VIEW TARGET_SHOOTING_STATS AS
  SELECT 
    run_number,
    score,
    ramp_type,
    reached_target_center,
    ball_landing_zone,
    ball_hit_wall,
    CASE ball_landing_zone
      WHEN 'blue' THEN 5
      WHEN 'green' THEN 4
      WHEN 'yellow' THEN 3
      WHEN 'red' THEN 2
      WHEN 'white' THEN 1
      ELSE 0
    END AS landing_zone_score,
    CASE WHEN ball_hit_wall THEN -2 ELSE 0 END AS wall_penalty
  FROM COMPETITION_RUNS
  WHERE ARRAY_CONTAINS('target_shooting'::VARIANT, sections_attempted)
  ORDER BY run_number`,

  `CREATE OR REPLACE VIEW OBSTACLE_COURSE_STATS AS
  SELECT 
    run_number,
    score,
    duration_seconds,
    obstacle_completed,
    obstacle_issues,
    returned_to_start
  FROM COMPETITION_RUNS
  WHERE ARRAY_CONTAINS('obstacle_course'::VARIANT, sections_attempted)
  ORDER BY run_number`,

  `CREATE OR REPLACE VIEW CODE_VERSION_PERFORMANCE AS
  SELECT 
    code_hash,
    COUNT(*) AS run_count,
    AVG(score) AS avg_score,
    MAX(score) AS best_score,
    MIN(score) AS worst_score,
    STDDEV(score) AS score_stddev,
    AVG(duration_seconds) AS avg_duration,
    SUM(CASE WHEN returned_to_start THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 AS return_rate_pct,
    MIN(start_timestamp) AS first_run,
    MAX(start_timestamp) AS last_run
  FROM COMPETITION_RUNS
  GROUP BY code_hash
  ORDER BY run_count DESC`,

  `CREATE OR REPLACE VIEW DAILY_SUMMARY AS
  SELECT 
    DATE(start_timestamp) AS run_date,
    COUNT(*) AS runs,
    AVG(score) AS avg_score,
    MAX(score) AS best_score,
    MIN(score) AS worst_score,
    AVG(duration_seconds) AS avg_duration,
    SUM(CASE WHEN returned_to_start THEN 1 ELSE 0 END) AS successful_returns,
    SUM(CASE WHEN ARRAY_CONTAINS('target_shooting'::VARIANT, sections_attempted) THEN 1 ELSE 0 END) AS target_shooting_attempts,
    SUM(CASE WHEN ARRAY_CONTAINS('obstacle_course'::VARIANT, sections_attempted) THEN 1 ELSE 0 END) AS obstacle_attempts
  FROM COMPETITION_RUNS
  GROUP BY DATE(start_timestamp)
  ORDER BY run_date DESC`,

  `CREATE OR REPLACE VIEW OVERALL_STATS AS
  SELECT 
    COUNT(*) AS total_runs,
    AVG(score) AS avg_score,
    MAX(score) AS best_score,
    MIN(score) AS worst_score,
    STDDEV(score) AS score_stddev,
    AVG(duration_seconds) AS avg_duration_seconds,
    MIN(duration_seconds) AS fastest_run_seconds,
    SUM(CASE WHEN returned_to_start THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100 AS return_rate_pct,
    SUM(CASE WHEN box_pickup_success THEN 1 ELSE 0 END)::FLOAT / NULLIF(SUM(CASE WHEN box_pickup_success IS NOT NULL THEN 1 ELSE 0 END), 0) * 100 AS box_pickup_rate_pct,
    SUM(CASE WHEN ARRAY_CONTAINS('target_shooting'::VARIANT, sections_attempted) THEN 1 ELSE 0 END) AS target_shooting_attempts,
    SUM(CASE WHEN ARRAY_CONTAINS('obstacle_course'::VARIANT, sections_attempted) THEN 1 ELSE 0 END) AS obstacle_attempts,
    SUM(CASE WHEN ARRAY_CONTAINS('target_shooting'::VARIANT, sections_attempted) AND ARRAY_CONTAINS('obstacle_course'::VARIANT, sections_attempted) THEN 1 ELSE 0 END) AS both_sections_attempts,
    SUM(CASE WHEN ramp_type = 'curved' THEN 1 ELSE 0 END) AS curved_ramp_attempts,
    SUM(CASE WHEN ramp_type = 'straight' THEN 1 ELSE 0 END) AS straight_ramp_attempts,
    SUM(CASE WHEN ball_landing_zone = 'blue' THEN 1 ELSE 0 END) AS blue_zone_hits,
    SUM(CASE WHEN ball_hit_wall THEN 1 ELSE 0 END) AS wall_hits,
    SUM(CASE WHEN obstacle_completed THEN 1 ELSE 0 END) AS obstacle_completions
  FROM COMPETITION_RUNS`,
];

const statementNames = [
  "Create warehouse",
  "Use warehouse", 
  "Create database",
  "Use database",
  "Create schema",
  "Use schema",
  "Create COMPETITION_RUNS table",
  "Create SCORE_TRENDS view",
  "Create TARGET_SHOOTING_STATS view",
  "Create OBSTACLE_COURSE_STATS view",
  "Create CODE_VERSION_PERFORMANCE view",
  "Create DAILY_SUMMARY view",
  "Create OVERALL_STATS view",
];

// Create connection
const connection = snowflake.createConnection({
  account: cleanAccount,
  username,
  password,
  application: "MissionControlInit",
  timeout: 60000,
});

// Execute statements sequentially
async function executeStatements() {
  return new Promise<void>((resolve, reject) => {
    connection.connect(async (err, _conn) => {
      if (err) {
        reject(new Error(`Connection failed: ${err.message}`));
        return;
      }

      console.log("✅ Connected to Snowflake\n");
      
      let success = 0;
      let failed = 0;

      for (let i = 0; i < sqlStatements.length; i++) {
        const sql = sqlStatements[i];
        const name = statementNames[i];
        
        try {
          await new Promise<void>((res, rej) => {
            connection.execute({
              sqlText: sql,
              complete: (err2, _stmt, _rows) => {
                if (err2) {
                  rej(err2);
                } else {
                  res();
                }
              },
            });
          });
          console.log(`✅ ${i + 1}/${sqlStatements.length}: ${name}`);
          success++;
        } catch (e) {
          const error = e as { message?: string };
          console.error(`❌ ${i + 1}/${sqlStatements.length}: ${name}`);
          console.error(`   Error: ${error.message || 'Unknown error'}\n`);
          failed++;
          
          // Continue with other statements even if one fails
        }
      }

      console.log(`\n====================================`);
      console.log(`✅ Successful: ${success}`);
      console.log(`❌ Failed: ${failed}\n`);

      // Verify setup
      console.log("Verifying setup...\n");
      
      connection.execute({
        sqlText: "SHOW TABLES IN SCHEMA MISSION_CONTROL.RUNS",
        complete: (err3, _stmt, rows) => {
          if (err3) {
            console.error("❌ Could not verify tables:", err3.message);
          } else {
            console.log(`📋 Tables found: ${rows?.length || 0}`);
            rows?.forEach((row: { name?: string }) => console.log(`   - ${row.name}`));
          }

          connection.execute({
            sqlText: "SHOW VIEWS IN SCHEMA MISSION_CONTROL.RUNS",
            complete: (err4, _stmt2, rows2) => {
              if (err4) {
                console.error("❌ Could not verify views:", err4.message);
              } else {
                console.log(`📊 Views found: ${rows2?.length || 0}`);
                rows2?.forEach((row: { name?: string }) => console.log(`   - ${row.name}`));
              }

              console.log("\n====================================");
              if (failed === 0) {
                console.log("🎉 Initialization complete!\n");
                console.log("Next steps:");
                console.log("1. Seed mock data: npx tsx scripts/seed-mock-runs.ts");
                console.log("2. View analytics: http://localhost:4667/analytics");
              } else {
                console.log("⚠️  Initialization completed with errors.\n");
                console.log("Some objects may already exist (which is OK).");
              }

              connection.destroy(() => {
                resolve();
              });
            },
          });
        },
      });
    });
  });
}

// Run
executeStatements()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err.message);
    process.exit(1);
  });
