-- ============================================================================
-- Snowflake Initialization Script for Mission Control
-- ============================================================================
-- Run this script in your Snowflake console to set up the analytics database.
-- 
-- Prerequisites:
--   - You must have ACCOUNTADMIN or appropriate privileges to create databases
--   - A warehouse must exist (we use COMPUTE_WH by default)
--
-- Usage:
--   1. Log into your Snowflake account
--   2. Open a worksheet
--   3. Copy and paste this entire script
--   4. Run it (Ctrl+Enter or click Run)
-- ============================================================================

-- Use an existing warehouse (or create one if it doesn't exist)
CREATE WAREHOUSE IF NOT EXISTS COMPUTE_WH
  WITH WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE;

USE WAREHOUSE COMPUTE_WH;

-- Create the database for Mission Control
CREATE DATABASE IF NOT EXISTS MISSION_CONTROL;

USE DATABASE MISSION_CONTROL;

-- Create the schema for run data
CREATE SCHEMA IF NOT EXISTS RUNS;

USE SCHEMA RUNS;

-- ============================================================================
-- Main competition runs table
-- ============================================================================
CREATE TABLE IF NOT EXISTS COMPETITION_RUNS (
    -- Primary key and run identification
    id STRING PRIMARY KEY,
    run_number INT NOT NULL,
    
    -- Timing information
    start_timestamp TIMESTAMP_NTZ NOT NULL,
    end_timestamp TIMESTAMP_NTZ NOT NULL,
    duration_seconds INT NOT NULL,
    
    -- Scoring
    score INT NOT NULL,
    
    -- Code tracking
    code_hash STRING NOT NULL,
    notes STRING,
    
    -- Sections attempted (stored as JSON array)
    sections_attempted ARRAY,
    
    -- Target Shooting section data
    ramp_type STRING,                    -- 'straight' or 'curved'
    reached_target_center BOOLEAN,       -- Did robot navigate to black zone?
    ball_landing_zone STRING,            -- 'blue', 'green', 'yellow', 'red', 'white', 'missed', 'hit_wall'
    ball_hit_wall BOOLEAN,               -- Did ball touch/bounce off wall?
    
    -- Obstacle Course section data
    obstacle_completed BOOLEAN,          -- Did robot complete the obstacle course?
    obstacle_issues STRING,              -- Description of any problems
    
    -- General run information
    returned_to_start BOOLEAN NOT NULL,  -- Did robot return to starting position?
    box_pickup_success BOOLEAN,          -- Did robot successfully pick up the box?
    path_unlocked STRING,                -- 'red', 'green', or null
    technical_issues STRING,             -- Any hardware/software issues during run
    
    -- Metadata
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- ============================================================================
-- Useful Views for Analytics
-- ============================================================================

-- View: Score trends with moving averages
CREATE OR REPLACE VIEW SCORE_TRENDS AS
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
ORDER BY run_number;

-- View: Target shooting performance breakdown
CREATE OR REPLACE VIEW TARGET_SHOOTING_STATS AS
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
ORDER BY run_number;

-- View: Obstacle course performance
CREATE OR REPLACE VIEW OBSTACLE_COURSE_STATS AS
SELECT 
    run_number,
    score,
    duration_seconds,
    obstacle_completed,
    obstacle_issues,
    returned_to_start
FROM COMPETITION_RUNS
WHERE ARRAY_CONTAINS('obstacle_course'::VARIANT, sections_attempted)
ORDER BY run_number;

-- View: Code version performance (group by code hash)
CREATE OR REPLACE VIEW CODE_VERSION_PERFORMANCE AS
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
ORDER BY run_count DESC;

-- View: Daily performance summary
CREATE OR REPLACE VIEW DAILY_SUMMARY AS
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
ORDER BY run_date DESC;

-- View: Overall statistics
CREATE OR REPLACE VIEW OVERALL_STATS AS
SELECT 
    COUNT(*) AS total_runs,
    AVG(score) AS avg_score,
    MAX(score) AS best_score,
    MIN(score) AS worst_score,
    STDDEV(score) AS score_stddev,
    AVG(duration_seconds) AS avg_duration_seconds,
    MIN(duration_seconds) AS fastest_run_seconds,
    SUM(CASE WHEN returned_to_start THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 AS return_rate_pct,
    SUM(CASE WHEN box_pickup_success THEN 1 ELSE 0 END)::FLOAT / NULLIF(SUM(CASE WHEN box_pickup_success IS NOT NULL THEN 1 ELSE 0 END), 0) * 100 AS box_pickup_rate_pct,
    
    -- Section attempts
    SUM(CASE WHEN ARRAY_CONTAINS('target_shooting'::VARIANT, sections_attempted) THEN 1 ELSE 0 END) AS target_shooting_attempts,
    SUM(CASE WHEN ARRAY_CONTAINS('obstacle_course'::VARIANT, sections_attempted) THEN 1 ELSE 0 END) AS obstacle_attempts,
    SUM(CASE WHEN ARRAY_CONTAINS('target_shooting'::VARIANT, sections_attempted) AND ARRAY_CONTAINS('obstacle_course'::VARIANT, sections_attempted) THEN 1 ELSE 0 END) AS both_sections_attempts,
    
    -- Target shooting stats
    SUM(CASE WHEN ramp_type = 'curved' THEN 1 ELSE 0 END) AS curved_ramp_attempts,
    SUM(CASE WHEN ramp_type = 'straight' THEN 1 ELSE 0 END) AS straight_ramp_attempts,
    SUM(CASE WHEN ball_landing_zone = 'blue' THEN 1 ELSE 0 END) AS blue_zone_hits,
    SUM(CASE WHEN ball_hit_wall THEN 1 ELSE 0 END) AS wall_hits,
    
    -- Obstacle course stats
    SUM(CASE WHEN obstacle_completed THEN 1 ELSE 0 END) AS obstacle_completions
FROM COMPETITION_RUNS;

-- ============================================================================
-- Grant permissions (adjust role names as needed)
-- ============================================================================
-- If you have a specific role for your application, uncomment and modify:
-- GRANT USAGE ON DATABASE MISSION_CONTROL TO ROLE your_app_role;
-- GRANT USAGE ON SCHEMA RUNS TO ROLE your_app_role;
-- GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA RUNS TO ROLE your_app_role;
-- GRANT SELECT ON ALL VIEWS IN SCHEMA RUNS TO ROLE your_app_role;

-- ============================================================================
-- Verification
-- ============================================================================
-- Run these queries to verify the setup:

SELECT 'Database created: MISSION_CONTROL' AS status;
SELECT 'Schema created: RUNS' AS status;
SELECT 'Table created: COMPETITION_RUNS' AS status;

-- Show table structure
DESCRIBE TABLE COMPETITION_RUNS;

-- Show all views
SHOW VIEWS IN SCHEMA RUNS;

SELECT '✅ Snowflake initialization complete!' AS result;
