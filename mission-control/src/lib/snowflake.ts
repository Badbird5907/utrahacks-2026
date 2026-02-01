import "dotenv/config";
import snowflake from "snowflake-sdk";

// Configure Snowflake SDK globally
snowflake.configure({ 
  logLevel: "ERROR",
  // insecureConnect: false,
  // Disable OCSP checks which can hang on some networks
  ocspFailOpen: true,
});

interface SnowflakeConfig {
  account: string;
  username: string;
  password: string;
  database: string;
  schema: string;
  warehouse: string;
}

interface QueryResult {
  rows: Record<string, unknown>[];
  statement: {
    getSqlText: () => string;
    getNumRows: () => number;
  };
}

function getConfig(): SnowflakeConfig {
  const account = process.env.SNOWFLAKE_ACCOUNT?.trim();
  const username = process.env.SNOWFLAKE_USER?.trim();
  const password = process.env.SNOWFLAKE_PASSWORD?.trim();
  const database = process.env.SNOWFLAKE_DATABASE?.trim() || "MISSION_CONTROL";
  const schema = process.env.SNOWFLAKE_SCHEMA?.trim() || "RUNS";
  const warehouse = process.env.SNOWFLAKE_WAREHOUSE?.trim() || "COMPUTE_WH";

  if (!account || !username || !password) {
    throw new Error(
      "Missing Snowflake configuration. Please set SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, and SNOWFLAKE_PASSWORD environment variables."
    );
  }

  return { account, username, password, database, schema, warehouse };
}

/**
 * Create a new Snowflake connection
 */
function createConnection(): snowflake.Connection {
  const config = getConfig();
  
  // Clean account identifier (remove .snowflakecomputing.com if present)
  let account = config.account.trim();
  if (account.includes('.snowflakecomputing.com')) {
    account = account.split('.snowflakecomputing.com')[0];
  }
  
  return snowflake.createConnection({
    account,
    username: config.username,
    password: config.password,
    database: config.database,
    schema: config.schema,
    warehouse: config.warehouse,
    application: "MissionControl",
    timeout: 30000, // 30 second timeout instead of 3+ minutes
    clientSessionKeepAlive: false,
    validateDefaultParameters: false,
    // OCSP settings - disable for faster connection
    // ocspMode: snowflake.ocspModes.FAIL_OPEN,
    // Disable browser timeout that can cause hangs
    // browserResponseTimeout: 30000,
  });
}

/**
 * Connect to Snowflake (promisified)
 */
function connect(connection: snowflake.Connection): Promise<snowflake.Connection> {
  return new Promise((resolve, reject) => {
    connection.connect((err, conn) => {
      if (err) {
        // Log detailed error information
        console.error('[Snowflake] Connection error details:', {
          code: err.code,
          message: err.message,
          sqlState: err.sqlState,
          // Don't log the full error object as it may contain sensitive data
        });
        reject(new Error(`Failed to connect to Snowflake: ${err.message}${err.code ? ` (${err.code})` : ''}`));
      } else {
        resolve(conn);
      }
    });
  });
}

/**
 * Execute a query (promisified)
 */
function executeQuery(
  connection: snowflake.Connection,
  sqlText: string,
  binds?: (string | number | boolean | null)[]
): Promise<QueryResult> {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText,
      binds,
      complete: (err, stmt, rows) => {
        if (err) {
          reject(new Error(`Failed to execute query: ${err.message}`));
        } else {
          resolve({
            rows: (rows || []) as Record<string, unknown>[],
            statement: stmt,
          });
        }
      },
    });
  });
}

/**
 * Destroy connection (promisified)
 */
function destroy(connection: snowflake.Connection): Promise<void> {
  return new Promise((resolve) => {
    try {
      connection.destroy((err) => {
        if (err) {
          // Log but don't reject - destroying is best effort
          console.warn('[Snowflake] Connection destroy warning:', err.message);
        }
        resolve();
      });
    } catch {
      // Catch synchronous errors (e.g., already destroyed)
      console.warn('[Snowflake] Connection already destroyed');
      resolve();
    }
  });
}

/**
 * Execute a query with automatic connection management
 * Opens a connection, executes the query, and closes the connection
 */
export async function query(
  sqlText: string,
  binds?: (string | number | boolean | null)[]
): Promise<Record<string, unknown>[]> {
  const connection = createConnection();
  
  try {
    await connect(connection);
    const result = await executeQuery(connection, sqlText, binds);
    return result.rows;
  } finally {
    try {
      await destroy(connection);
    } catch (e) {
      console.error("Error destroying Snowflake connection:", e);
    }
  }
}

/**
 * Insert a run record into Snowflake
 * This is fire-and-forget - errors are logged but don't throw
 */
export async function insertRun(run: {
  id: string;
  number: number;
  startTimestamp: Date;
  endTimestamp: Date;
  score: number;
  codeHash: string;
  notes: string;
  sectionsAttempted: string[];
  rampType: string | null;
  reachedTargetCenter: boolean | null;
  ballLandingZone: string | null;
  ballHitWall: boolean | null;
  obstacleCompleted: boolean | null;
  obstacleIssues: string | null;
  returnedToStart: boolean;
  boxPickupSuccess: boolean | null;
  pathUnlocked: string | null;
  technicalIssues: string | null;
}): Promise<boolean> {
  try {
    const durationSeconds = Math.floor(
      (run.endTimestamp.getTime() - run.startTimestamp.getTime()) / 1000
    );

    // Use INSERT ... SELECT with PARSE_JSON since PARSE_JSON can't be used in VALUES clause with bindings
    const sqlText = `
      INSERT INTO COMPETITION_RUNS (
        id, run_number, start_timestamp, end_timestamp, duration_seconds, score,
        code_hash, notes, sections_attempted,
        ramp_type, reached_target_center, ball_landing_zone, ball_hit_wall,
        obstacle_completed, obstacle_issues,
        returned_to_start, box_pickup_success, path_unlocked, technical_issues
      ) 
      SELECT 
        ?, ?, ?, ?, ?, ?,
        ?, ?, PARSE_JSON(?),
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?
    `;

    const binds = [
      run.id,
      run.number,
      run.startTimestamp.toISOString(),
      run.endTimestamp.toISOString(),
      durationSeconds,
      run.score,
      run.codeHash,
      run.notes,
      JSON.stringify(run.sectionsAttempted),
      run.rampType,
      run.reachedTargetCenter,
      run.ballLandingZone,
      run.ballHitWall,
      run.obstacleCompleted,
      run.obstacleIssues,
      run.returnedToStart,
      run.boxPickupSuccess,
      run.pathUnlocked,
      run.technicalIssues,
    ];

    await query(sqlText, binds as (string | number | boolean | null)[]);
    console.log(`[Snowflake] Successfully inserted run #${run.number}`);
    return true;
  } catch (error) {
    console.error("[Snowflake] Failed to insert run:", error);
    return false;
  }
}

/**
 * Check if Snowflake is configured
 */
export function isConfigured(): boolean {
  return !!(
    process.env.SNOWFLAKE_ACCOUNT &&
    process.env.SNOWFLAKE_USER &&
    process.env.SNOWFLAKE_PASSWORD
  );
}

/**
 * Test the Snowflake connection
 */
export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    await query("SELECT CURRENT_TIMESTAMP()");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
