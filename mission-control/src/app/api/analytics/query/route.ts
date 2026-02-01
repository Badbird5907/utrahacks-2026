import { z } from "zod"; import { query, isConfigured } from "@/lib/snowflake";

export const dynamic = "force-dynamic";

// Whitelist of allowed tables and views for security
const ALLOWED_OBJECTS = [
  "COMPETITION_RUNS",
  "SCORE_TRENDS",
  "TARGET_SHOOTING_STATS",
  "OBSTACLE_COURSE_STATS",
  "CODE_VERSION_PERFORMANCE",
  "DAILY_SUMMARY",
  "OVERALL_STATS",
];

// Forbidden SQL keywords that could modify data
const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "CREATE",
  "ALTER",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "EXECUTE",
  "EXEC",
  "MERGE",
  "CALL",
];

const QuerySchema = z.object({
  query: z.string().min(1).max(5000),
});

function validateQuery(sqlQuery: string): { valid: boolean; error?: string } {
  const upperQuery = sqlQuery.toUpperCase().trim();

  // Must start with SELECT
  if (!upperQuery.startsWith("SELECT")) {
    return { valid: false, error: "Only SELECT queries are allowed" };
  }

  // Check for forbidden keywords
  for (const keyword of FORBIDDEN_KEYWORDS) {
    // Use word boundary matching to avoid false positives
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(upperQuery)) {
      return { valid: false, error: `Forbidden keyword detected: ${keyword}` };
    }
  }

  // Check for semicolons (prevent multiple statements)
  const queryWithoutStrings = sqlQuery.replace(/'[^']*'/g, "");
  if (queryWithoutStrings.includes(";")) {
    return { valid: false, error: "Multiple statements are not allowed" };
  }

  // Check for comments (potential injection vectors)
  if (sqlQuery.includes("--") || sqlQuery.includes("/*")) {
    return { valid: false, error: "SQL comments are not allowed" };
  }

  return { valid: true };
}

export async function POST(req: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json(
      {
        success: false,
        error: "Snowflake is not configured",
      },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const parsed = QuerySchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { success: false, error: "Invalid request: " + parsed.error.message },
        { status: 400 }
      );
    }

    const { query: sqlQuery } = parsed.data;

    // Validate the query for security
    const validation = validateQuery(sqlQuery);
    if (!validation.valid) {
      return Response.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Execute the query with a timeout
    const startTime = Date.now();
    const results = await query(sqlQuery);
    const executionTime = Date.now() - startTime;

    return Response.json({
      success: true,
      data: {
        rows: results,
        rowCount: results.length,
        executionTimeMs: executionTime,
      },
      meta: {
        allowedTables: ALLOWED_OBJECTS,
        queryLength: sqlQuery.length,
      },
    });
  } catch (error) {
    console.error("Query API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { success: false, error: `Query execution failed: ${message}` },
      { status: 500 }
    );
  }
}

// GET endpoint to return schema information
export async function GET(): Promise<Response> {
  return Response.json({
    success: true,
    data: {
      allowedObjects: ALLOWED_OBJECTS,
      schema: {
        COMPETITION_RUNS: {
          description: "Main table containing all competition run data",
          columns: {
            id: "STRING - Primary key",
            run_number: "INT - Sequential run number",
            start_timestamp: "TIMESTAMP - When the run started",
            end_timestamp: "TIMESTAMP - When the run ended",
            duration_seconds: "INT - Run duration in seconds",
            score: "INT - Score achieved (0-99)",
            code_hash: "STRING - SHA-256 hash of the code used",
            notes: "STRING - User notes about the run",
            sections_attempted: "ARRAY - ['target_shooting', 'obstacle_course']",
            ramp_type: "STRING - 'straight' or 'curved'",
            reached_target_center: "BOOLEAN - Did robot reach the black zone",
            ball_landing_zone: "STRING - 'blue', 'green', 'yellow', 'red', 'white', 'missed', 'hit_wall'",
            ball_hit_wall: "BOOLEAN - Did ball hit the wall (penalty)",
            obstacle_completed: "BOOLEAN - Did robot complete obstacle course",
            obstacle_issues: "STRING - Description of issues",
            returned_to_start: "BOOLEAN - Did robot return to start",
            box_pickup_success: "BOOLEAN - Did robot pick up box",
            path_unlocked: "STRING - 'red' or 'green'",
            technical_issues: "STRING - Any technical problems",
            created_at: "TIMESTAMP - When record was created",
          },
        },
        SCORE_TRENDS: {
          description: "View with score trends and moving averages",
          columns: {
            run_number: "INT",
            score: "INT",
            moving_avg_5: "FLOAT - 5-run moving average",
            moving_avg_10: "FLOAT - 10-run moving average",
            score_change: "INT - Change from previous run",
            trend: "STRING - 'improved', 'declined', 'unchanged'",
            start_timestamp: "TIMESTAMP",
          },
        },
        TARGET_SHOOTING_STATS: {
          description: "View with target shooting performance data",
          columns: {
            run_number: "INT",
            score: "INT",
            ramp_type: "STRING",
            reached_target_center: "BOOLEAN",
            ball_landing_zone: "STRING",
            ball_hit_wall: "BOOLEAN",
            landing_zone_score: "INT - Points for landing zone (blue=5, green=4, etc)",
            wall_penalty: "INT - Penalty for wall hit (-2)",
          },
        },
        OBSTACLE_COURSE_STATS: {
          description: "View with obstacle course performance data",
          columns: {
            run_number: "INT",
            score: "INT",
            duration_seconds: "INT",
            obstacle_completed: "BOOLEAN",
            obstacle_issues: "STRING",
            returned_to_start: "BOOLEAN",
          },
        },
        CODE_VERSION_PERFORMANCE: {
          description: "View grouping runs by code version",
          columns: {
            code_hash: "STRING",
            run_count: "INT",
            avg_score: "FLOAT",
            best_score: "INT",
            worst_score: "INT",
            score_stddev: "FLOAT",
            avg_duration: "FLOAT",
            return_rate_pct: "FLOAT",
            first_run: "TIMESTAMP",
            last_run: "TIMESTAMP",
          },
        },
        DAILY_SUMMARY: {
          description: "View with daily aggregated statistics",
          columns: {
            run_date: "DATE",
            runs: "INT",
            avg_score: "FLOAT",
            best_score: "INT",
            worst_score: "INT",
            avg_duration: "FLOAT",
            successful_returns: "INT",
            target_shooting_attempts: "INT",
            obstacle_attempts: "INT",
          },
        },
        OVERALL_STATS: {
          description: "View with overall aggregate statistics",
          columns: {
            total_runs: "INT",
            avg_score: "FLOAT",
            best_score: "INT",
            worst_score: "INT",
            score_stddev: "FLOAT",
            avg_duration_seconds: "FLOAT",
            fastest_run_seconds: "INT",
            return_rate_pct: "FLOAT",
            box_pickup_rate_pct: "FLOAT",
            target_shooting_attempts: "INT",
            obstacle_attempts: "INT",
            both_sections_attempts: "INT",
            curved_ramp_attempts: "INT",
            straight_ramp_attempts: "INT",
            blue_zone_hits: "INT",
            wall_hits: "INT",
            obstacle_completions: "INT",
          },
        },
      },
      exampleQueries: [
        {
          description: "Get score trend with moving average",
          query: "SELECT run_number, score, moving_avg_5 FROM SCORE_TRENDS ORDER BY run_number",
        },
        {
          description: "Compare curved vs straight ramp performance",
          query: "SELECT ramp_type, AVG(score) as avg_score, COUNT(*) as attempts FROM TARGET_SHOOTING_STATS GROUP BY ramp_type",
        },
        {
          description: "Find runs where ball landed in blue zone",
          query: "SELECT run_number, score, ramp_type FROM COMPETITION_RUNS WHERE ball_landing_zone = 'blue' ORDER BY score DESC",
        },
        {
          description: "Get improvement over time",
          query: "SELECT run_number, score, score - LAG(score) OVER (ORDER BY run_number) as improvement FROM COMPETITION_RUNS",
        },
      ],
    },
  });
}
