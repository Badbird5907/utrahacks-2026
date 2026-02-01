# Snowflake Analytics Integration - Setup Guide

This guide will help you set up the Snowflake analytics integration for Mission Control.

## Overview

The integration includes:
- **Snowflake Data Warehouse**: Stores all run data for advanced analytics
- **Analytics API**: Pre-computed statistics and ad-hoc query endpoint
- **Analytics Dashboard** (`/analytics`): Visual charts and insights
- **AI Integration**: Gemini can query Snowflake directly for deep analysis

## Prerequisites

1. **Snowflake Account**: You need access to a Snowflake account
2. **Node.js & pnpm**: Installed on your system
3. **MongoDB**: Already configured for primary storage

## Setup Steps

### 1. Configure Snowflake Credentials

Add these environment variables to your `.env` file in `mission-control/`:

```env
# Snowflake Configuration
SNOWFLAKE_ACCOUNT=your_account_identifier    # e.g., "abc12345.us-east-1" or "abc12345"
SNOWFLAKE_USER=your_username                  # Your Snowflake username
SNOWFLAKE_PASSWORD=your_password              # Your Snowflake password
SNOWFLAKE_DATABASE=MISSION_CONTROL           # Database name
SNOWFLAKE_SCHEMA=RUNS                        # Schema name
SNOWFLAKE_WAREHOUSE=COMPUTE_WH               # Warehouse name
```

**Finding your account identifier:**
- Log into Snowflake
- Your account identifier is in the URL: `https://<account_identifier>.snowflakecomputing.com`

### 2. Initialize Snowflake Database

Run the initialization script in your Snowflake console:

1. Log into your Snowflake account
2. Open a new worksheet
3. Copy and paste the contents of `scripts/snowflake-init.sql`
4. Run the script (Ctrl+Enter or click "Run")

This will create:
- `MISSION_CONTROL` database
- `RUNS` schema
- `COMPETITION_RUNS` table
- Several useful views (SCORE_TRENDS, CODE_VERSION_PERFORMANCE, etc.)

### 3. Start the Development Server

```bash
cd mission-control
npm run dev
```

The server will start at `http://localhost:4667`

### 4. Seed Mock Data (Optional)

To test the analytics with realistic data:

```bash
npx tsx scripts/seed-mock-runs.ts
```

This will create 30 mock runs showing improvement over time.

### 5. View Analytics

Navigate to: `http://localhost:4667/analytics`

You should see:
- Summary cards (total runs, best score, trends, etc.)
- Score trend chart with moving averages
- Ball landing zone distribution
- Ramp type comparison
- Code version performance
- Section-specific statistics

## Features

### Run Tracking

When you create a run via the "Begin Run" button:
1. Data is saved to MongoDB (primary store)
2. Data is asynchronously pushed to Snowflake (analytics)
3. If Snowflake fails, the run still succeeds (graceful degradation)

### Analytics Dashboard (`/analytics`)

**Summary Cards:**
- Total runs, best score, recent average
- Improvement trend percentage
- Fastest run time
- Return-to-start rate
- Blue zone hits

**Charts:**
- **Score Trend**: Line chart with 5-run moving average
- **Ball Landing Zones**: Pie chart showing distribution
- **Ramp Comparison**: Bar chart comparing curved vs straight performance
- **Code Versions**: Top 5 code versions by performance

**Section Stats:**
- Target Shooting: attempts, curved ramp usage, blue zone hits, wall penalties
- Obstacle Course: attempts, completions, completion rate

**AI Insights:**
- Click "AI Insights" button
- Choose quick analysis or full report
- Gemini analyzes your data and provides strategic recommendations

### Gemini AI Integration

Gemini now has access to two powerful tools:

**1. `getRuns` tool** (existing):
- Returns recent runs from MongoDB
- Good for quick summaries

**2. `querySnowflake` tool** (new):
- Executes SQL queries against Snowflake
- Use for advanced analytics like:
  - Moving averages and trend analysis
  - Statistical correlations
  - Time-series analysis
  - Code version comparisons
  - Complex aggregations

**Example prompts:**
- "Show me the score trend with a moving average"
- "Which code version performed best?"
- "Compare curved vs straight ramp success rates"
- "What's the correlation between return-to-start and final score?"
- "Show improvement over the last week"

## API Endpoints

### `GET /api/analytics`
Returns pre-computed analytics:
- Overall statistics
- Score trends (last 50 runs)
- Ball landing distribution
- Code version performance
- Daily summaries
- Insights (recent avg, improvement %)

### `POST /api/analytics/query`
Execute ad-hoc SQL queries:
```json
{
  "query": "SELECT run_number, score FROM COMPETITION_RUNS ORDER BY score DESC LIMIT 10"
}
```

**Security:**
- Only SELECT queries allowed
- Forbidden keywords: INSERT, UPDATE, DELETE, DROP, etc.
- No multiple statements or comments

### `GET /api/analytics/query`
Returns schema documentation and example queries.

## Snowflake Schema

### Tables

**COMPETITION_RUNS** (main table):
```sql
- id (STRING)
- run_number (INT)
- start_timestamp, end_timestamp (TIMESTAMP)
- duration_seconds (INT)
- score (INT)
- code_hash (STRING)
- sections_attempted (ARRAY)
- rampType, reached_target_center, ball_landing_zone, ball_hit_wall
- obstacle_completed, obstacle_issues
- returned_to_start, box_pickup_success, path_unlocked
- technical_issues, notes
```

### Views

- **SCORE_TRENDS**: Scores with moving averages and trend indicators
- **TARGET_SHOOTING_STATS**: Target shooting performance with calculated scores
- **OBSTACLE_COURSE_STATS**: Obstacle course performance data
- **CODE_VERSION_PERFORMANCE**: Aggregated stats by code hash
- **DAILY_SUMMARY**: Daily aggregated statistics
- **OVERALL_STATS**: Overall aggregate statistics

## Troubleshooting

### "Snowflake is not configured" error

**Solution**: Check that all environment variables are set in `.env`:
```bash
echo $SNOWFLAKE_ACCOUNT
echo $SNOWFLAKE_USER
echo $SNOWFLAKE_PASSWORD
```

### "Failed to connect to Snowflake" error

**FIRST: Run the connection test script:**
```bash
npx tsx scripts/test-snowflake-connection.ts
```

This will help diagnose the exact issue.

**Common causes:**

1. **Wrong account identifier format**
   
   The account identifier is tricky! Try these formats:
   
   ```env
   # Modern format (recommended):
   SNOWFLAKE_ACCOUNT=orgname-accountname
   # Example: SNOWFLAKE_ACCOUNT=mycompany-prod123
   
   # Legacy format with region:
   SNOWFLAKE_ACCOUNT=xy12345.us-east-1
   
   # Legacy format without region:
   SNOWFLAKE_ACCOUNT=xy12345
   ```
   
   **How to find it:**
   - Look at your Snowflake URL: `https://XXXXXX.snowflakecomputing.com`
   - Use everything before `.snowflakecomputing.com`
   - Example: `https://abc12345.us-east-1.snowflakecomputing.com` → `abc12345.us-east-1`

2. **Incorrect credentials**
   - Double-check username and password
   - Try logging into Snowflake web console with same credentials
   - Passwords are case-sensitive!

3. **Network/Firewall issues**
   - Snowflake uses port 443 (HTTPS)
   - Check if firewall is blocking connection
   - Try disabling VPN temporarily
   - Corporate proxy might interfere

4. **Warehouse not running**
   - Make sure `COMPUTE_WH` exists (or use your warehouse name)
   - Warehouse should be running or set to auto-resume

**Test in Snowflake console:**
```sql
-- Verify you can connect
SELECT CURRENT_TIMESTAMP();

-- Check your current context
SELECT CURRENT_ACCOUNT(), CURRENT_USER(), CURRENT_WAREHOUSE();

-- List your warehouses
SHOW WAREHOUSES;
```

### Run creation succeeds but not in Snowflake

**This is expected behavior!** Snowflake insert is fire-and-forget.

Check server logs:
```bash
npm run dev
# Look for "[Snowflake]" log messages
```

### Analytics page shows "No data"

**Possible causes:**
1. No runs have been created yet
2. Snowflake not initialized (run `scripts/snowflake-init.sql`)
3. Data not synced yet (check Snowflake console)

**Verify data in Snowflake:**
```sql
SELECT COUNT(*) FROM COMPETITION_RUNS;
SELECT * FROM COMPETITION_RUNS ORDER BY run_number DESC LIMIT 5;
```

### AI Insights not working

**Check:**
1. Gemini API key is set (`GOOGLE_GENERATIVE_AI_API_KEY`)
2. Competition mode is enabled (trophy icon in AI chat)
3. Browser console for errors

## Performance Considerations

- **Snowflake inserts are async**: Won't slow down run creation
- **Analytics endpoint caches**: Runs multiple queries in parallel
- **Query endpoint has validation**: Prevents expensive/dangerous queries
- **Charts limited to recent data**: Keeps dashboard fast

## Cost Optimization

Snowflake costs scale with:
1. **Compute**: Warehouse usage (queries)
2. **Storage**: Data stored

**Tips:**
- Use `COMPUTE_WH` (X-Small) for development
- Set `AUTO_SUSPEND = 60` (suspends after 1 min idle)
- Views don't cost extra (just materialized views)
- Analytics endpoint is efficient (parallel queries)

## Next Steps

1. **Custom Views**: Create more views for specific analyses
2. **Scheduled Reports**: Set up daily/weekly analytics summaries
3. **Data Export**: Add CSV/JSON export functionality
4. **Historical Trends**: Track improvement week-over-week
5. **Team Leaderboards**: If multiple teams use the system
6. **Predictive Analytics**: Use ML to predict optimal strategies

## Files Created

```
mission-control/
├── scripts/
│   ├── snowflake-init.sql              # Database initialization
│   └── seed-mock-runs.ts               # Mock data generator
├── src/
│   ├── lib/
│   │   └── snowflake.ts                # Snowflake connection client
│   ├── app/
│   │   ├── api/
│   │   │   ├── runs/route.ts           # Modified: Added Snowflake push
│   │   │   ├── analytics/
│   │   │   │   ├── route.ts            # Pre-computed analytics
│   │   │   │   └── query/route.ts      # Ad-hoc SQL queries
│   │   │   └── chat/route.ts           # Modified: Added querySnowflake tool
│   │   └── (mission-control)/
│   │       ├── analytics/page.tsx      # Analytics dashboard
│   │       └── history/page.tsx        # Run history (existing)
│   └── components/
│       └── analytics/
│           └── ai-insights.tsx         # AI insights panel
└── .env                                 # Add Snowflake credentials here
```

## Support

If you encounter issues:
1. Check server logs (`npm run dev`)
2. Verify Snowflake connection in console
3. Test API endpoints directly (Postman/curl)
4. Check browser console for frontend errors

---

**Happy analyzing!** 🚀📊
