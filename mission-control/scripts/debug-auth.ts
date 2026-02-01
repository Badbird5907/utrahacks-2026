/**
 * Quick Snowflake Authentication Debugger
 * 
 * This helps identify credential issues quickly.
 * 
 * Usage: npx tsx scripts/debug-auth.ts
 */

import "dotenv/config";

console.log("🔐 Snowflake Authentication Debug\n");
console.log("=================================\n");

const account = process.env.SNOWFLAKE_ACCOUNT;
const username = process.env.SNOWFLAKE_USER;
const password = process.env.SNOWFLAKE_PASSWORD;

console.log("Environment Variables:");
console.log(`  SNOWFLAKE_ACCOUNT: ${account ? '✅ Set' : '❌ Missing'}`);
console.log(`  SNOWFLAKE_USER: ${username ? '✅ Set' : '❌ Missing'}`);
console.log(`  SNOWFLAKE_PASSWORD: ${password ? '✅ Set' : '❌ Missing'}\n`);

if (!account || !username || !password) {
  console.error("❌ Missing credentials in .env file\n");
  process.exit(1);
}

console.log("Credential Values (sanitized):");
console.log(`  Account: "${account}"`);
console.log(`  Username: "${username}"`);
console.log(`  Password: "${password.substring(0, 2)}${"*".repeat(Math.min(password.length - 2, 8))}"\n`);

console.log("Common Issues:\n");

// Check for whitespace
if (account !== account.trim() || username !== username.trim() || password !== password.trim()) {
  console.error("⚠️  WARNING: Credentials have leading/trailing whitespace!");
  console.error("   This will cause authentication to fail.\n");
  console.error("   Current values:");
  console.error(`   Account: |${account}|`);
  console.error(`   Username: |${username}|`);
  console.error(`   Password: |${password}|\n`);
  console.error("   Fix: Remove quotes and whitespace in .env\n");
}

// Check for quotes
if (account.includes('"') || account.includes("'") || 
    username.includes('"') || username.includes("'") ||
    password.includes('"') || password.includes("'")) {
  console.error("⚠️  WARNING: Credentials contain quotes!");
  console.error("   In .env files, don't use quotes around values.\n");
  console.error("   Wrong: SNOWFLAKE_USER=\"myuser\"");
  console.error("   Right: SNOWFLAKE_USER=myuser\n");
}

// Check account format
console.log("Account Identifier Check:");
if (account.includes('.snowflakecomputing.com')) {
  console.log("  ⚠️  Account contains '.snowflakecomputing.com'");
  console.log("  This will be auto-stripped, but better to remove it.\n");
  console.log("  Change:");
  console.log(`    From: ${account}`);
  console.log(`    To:   ${account.split('.snowflakecomputing.com')[0]}\n`);
} else {
  console.log("  ✅ Account format looks good\n");
}

// Username format check
console.log("Username Check:");
if (username.includes('@')) {
  console.error("  ⚠️  Username contains '@' - are you using email?");
  console.error("  Snowflake usernames are NOT emails.\n");
  console.error("  Use your Snowflake username, not email.\n");
} else if (username.toUpperCase() !== username) {
  console.log("  ℹ️  Username has lowercase letters");
  console.log("  Snowflake will convert to uppercase internally\n");
} else {
  console.log("  ✅ Username format looks good\n");
}

console.log("Error Code 401002 Troubleshooting:\n");
console.log("This error means: Authentication failed\n");
console.log("Most common causes:");
console.log("  1. Wrong password");
console.log("  2. Wrong username");
console.log("  3. Wrong account identifier");
console.log("  4. User account is locked/disabled");
console.log("  5. Password expired\n");

console.log("Next Steps:\n");
console.log("1. Verify credentials by logging into Snowflake web console:");
console.log(`   https://${account}.snowflakecomputing.com`);
console.log("   Username: " + username);
console.log("   Password: (your password)\n");

console.log("2. If login works in browser:");
console.log("   - Copy EXACT username from web console (top right corner)");
console.log("   - Reset password if needed");
console.log("   - Update .env with exact values (no quotes!)\n");

console.log("3. Common .env mistakes:\n");
console.log("   ❌ WRONG:");
console.log('   SNOWFLAKE_USER="myuser"     # Has quotes');
console.log('   SNOWFLAKE_PASSWORD=my pass  # Has space');
console.log('   SNOWFLAKE_ACCOUNT=abc123.snowflakecomputing.com # Too long\n');

console.log("   ✅ CORRECT:");
console.log('   SNOWFLAKE_USER=MYUSER       # No quotes, uppercase OK');
console.log('   SNOWFLAKE_PASSWORD=MyP@ss123 # No quotes, no spaces');
console.log('   SNOWFLAKE_ACCOUNT=abc123    # Just the account locator\n');

console.log("4. Check if MFA is enabled:");
console.log("   - The Node.js SDK doesn't support MFA/SSO");
console.log("   - Create a non-MFA service account if needed\n");

console.log("After fixing credentials:");
console.log("  npx tsx scripts/test-snowflake-connection.ts\n");
