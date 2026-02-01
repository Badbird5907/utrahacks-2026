/**
 * Snowflake Connection Test Script
 * 
 * This script tests your Snowflake connection and helps debug issues.
 * 
 * Usage: npx tsx scripts/test-snowflake-connection.ts
 */

import "dotenv/config";
import snowflake from "snowflake-sdk";

console.log("🔍 Testing Snowflake Connection\n");
console.log("================================\n");

// Step 1: Check environment variables
console.log("1. Checking environment variables...");
const account = process.env.SNOWFLAKE_ACCOUNT;
const username = process.env.SNOWFLAKE_USER;
const password = process.env.SNOWFLAKE_PASSWORD;
const database = process.env.SNOWFLAKE_DATABASE || "MISSION_CONTROL";
const schema = process.env.SNOWFLAKE_SCHEMA || "RUNS";
const warehouse = process.env.SNOWFLAKE_WAREHOUSE || "COMPUTE_WH";

if (!account || !username || !password) {
  console.error("❌ Missing required environment variables:");
  if (!account) console.error("   - SNOWFLAKE_ACCOUNT");
  if (!username) console.error("   - SNOWFLAKE_USER");
  if (!password) console.error("   - SNOWFLAKE_PASSWORD");
  console.error("\nPlease add these to your .env file");
  process.exit(1);
}

console.log("✅ Environment variables found");
console.log(`   Account: ${account}`);
console.log(`   Username: ${username}`);
console.log(`   Password: ${"*".repeat(password.length)}`);
console.log(`   Database: ${database}`);
console.log(`   Schema: ${schema}`);
console.log(`   Warehouse: ${warehouse}\n`);

// Step 2: Clean account identifier
console.log("2. Cleaning account identifier...");
let cleanAccount = account.trim();
if (cleanAccount.includes('.snowflakecomputing.com')) {
  const original = cleanAccount;
  cleanAccount = cleanAccount.split('.snowflakecomputing.com')[0];
  console.log(`   Cleaned: ${original} -> ${cleanAccount}`);
} else {
  console.log(`   Account identifier: ${cleanAccount}`);
}
console.log();

// Step 3: Create connection
console.log("3. Creating connection object...");
const connection = snowflake.createConnection({
  account: cleanAccount,
  username,
  password,
  database,
  schema,
  warehouse,
  application: "MissionControlTest",
  timeout: 30000, // 30 second timeout
  clientSessionKeepAlive: false,
  validateDefaultParameters: false,
});
console.log("✅ Connection object created\n");

// Step 4: Attempt connection
console.log("4. Attempting to connect to Snowflake...");
console.log("   (This may take 10-30 seconds)");
console.log("   URL: https://" + cleanAccount + ".snowflakecomputing.com\n");

connection.connect((err, conn) => {
  if (err) {
    console.error("❌ Connection failed!\n");
    console.error("Error details:");
    console.error(`   Message: ${err.message}`);
    console.error(`   Code: ${err.code || 'N/A'}`);
    console.error(`   SQL State: ${err.sqlState || 'N/A'}`);
    
    console.error("\n🔧 Troubleshooting tips:");
    
    if (err.message.includes("Incorrect username or password")) {
      console.error("   - Check your username and password");
      console.error("   - Verify credentials in Snowflake console");
    } else if (err.message.includes("does not exist or not authorized")) {
      console.error("   - Account identifier may be wrong");
      console.error("   - Try format: <orgname-accountname> (e.g., 'abc12345-xy98765')");
      console.error("   - Or: <accountname>.<region> (e.g., 'abc12345.us-east-1')");
      console.error("   - Check your Snowflake URL in browser");
    } else if (err.message.includes("Network") || err.message.includes("timeout")) {
      console.error("   - Check your network connection");
      console.error("   - Check if a firewall is blocking port 443");
      console.error("   - Try disabling VPN if active");
    } else if (err.message.includes("warehouse")) {
      console.error("   - Warehouse may not exist or not be running");
      console.error("   - Try creating COMPUTE_WH in Snowflake console");
    } else {
      console.error("   - Verify your account is active");
      console.error("   - Check Snowflake service status");
      console.error("   - Try logging into Snowflake web console");
    }
    
    console.error("\n💡 Common account identifier formats:");
    console.error("   - Legacy: <account_locator> (e.g., 'xy12345')");
    console.error("   - Legacy with region: <account_locator>.<region> (e.g., 'xy12345.us-east-1')");
    console.error("   - Organization: <orgname>-<account_name> (e.g., 'myorg-account1')");
    
    process.exit(1);
  }

  console.log("✅ Connected successfully!\n");
  console.log("5. Testing query execution...");

  // Test a simple query
  connection.execute({
    sqlText: "SELECT CURRENT_TIMESTAMP() as now, CURRENT_DATABASE() as db, CURRENT_SCHEMA() as schema",
    complete: (err, stmt, rows) => {
      if (err) {
        console.error("❌ Query failed:", err.message);
        connection.destroy(() => process.exit(1));
        return;
      }

      console.log("✅ Query executed successfully!\n");
      console.log("Query results:");
      if (rows && rows.length > 0) {
        console.log(JSON.stringify(rows[0], null, 2));
      }

      console.log("\n6. Checking database and schema...");
      
      connection.execute({
        sqlText: `SHOW TABLES IN SCHEMA ${database}.${schema}`,
        complete: (err2, stmt2, rows2) => {
          if (err2) {
            console.warn("⚠️  Warning: Could not list tables");
            console.warn(`   This might mean ${database}.${schema} doesn't exist yet`);
            console.warn(`   Run scripts/snowflake-init.sql to create it`);
          } else {
            console.log(`✅ Schema ${database}.${schema} exists`);
            if (rows2 && rows2.length > 0) {
              console.log(`   Found ${rows2.length} table(s):`);
              rows2.forEach((row: any) => {
                console.log(`   - ${row.name}`);
              });
            } else {
              console.log("   No tables found (run snowflake-init.sql to create them)");
            }
          }

          // Clean up
          console.log("\n7. Closing connection...");
          connection.destroy((err3) => {
            if (err3) {
              console.warn("⚠️  Warning closing connection:", err3.message);
            } else {
              console.log("✅ Connection closed\n");
            }

            console.log("================================");
            console.log("🎉 Connection test successful!");
            console.log("\nYou can now:");
            console.log("1. Run: npx tsx scripts/seed-mock-runs.ts");
            console.log("2. Visit: http://localhost:4667/analytics");
            process.exit(0);
          });
        },
      });
    },
  });
});
