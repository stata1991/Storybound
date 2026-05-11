#!/usr/bin/env node

/**
 * Load test cleanup — deletes all loadtest+vuN@thestoryboundapp.com users
 * and their associated data.
 *
 * Usage: node scripts/loadtest-cleanup.js
 *
 * Requires explicit "yes" confirmation before deleting anything.
 * Handles FK dependencies in correct order regardless of cascade settings.
 */

const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const readline = require("readline");

require("dotenv").config({ path: path.join(__dirname, "..", "web", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY in web/.env.local");
  process.exit(1);
}

const EMAIL_PATTERN = /^loadtest\+vu\d+@thestoryboundapp\.com$/;

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // List all loadtest users
  console.log("Scanning auth.users for loadtest accounts...\n");

  // Supabase admin.listUsers paginates at 1000 — 50 users is well within
  const { data: listData, error: listError } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });

  if (listError) {
    console.error("Failed to list users:", listError.message);
    process.exit(1);
  }

  const loadtestUsers = listData.users.filter(
    (u) => u.email && EMAIL_PATTERN.test(u.email)
  );

  if (loadtestUsers.length === 0) {
    console.log("No loadtest users found. Nothing to clean up.");
    return;
  }

  console.log(`Found ${loadtestUsers.length} loadtest user(s):\n`);
  // Show first 5 as sample
  const sample = loadtestUsers.slice(0, 5);
  for (const u of sample) {
    console.log(`  ${u.email}  (${u.id})`);
  }
  if (loadtestUsers.length > 5) {
    console.log(`  ... and ${loadtestUsers.length - 5} more\n`);
  }

  const answer = await ask(
    `\nDelete all ${loadtestUsers.length} users and their data? Type "yes" to confirm: `
  );

  if (answer !== "yes") {
    console.log("Aborted.");
    return;
  }

  console.log("\nDeleting...\n");

  let deleted = 0;
  let errors = 0;

  for (const user of loadtestUsers) {
    try {
      // 1. Delete onboarding drafts
      await admin
        .from("onboarding_drafts")
        .delete()
        .eq("user_id", user.id);

      // 2. Find parent → family → children chain
      const { data: parent } = await admin
        .from("parents")
        .select("family_id")
        .eq("id", user.id)
        .single();

      if (parent) {
        // 3. Find children in this family
        const { data: children } = await admin
          .from("children")
          .select("id")
          .eq("family_id", parent.family_id);

        if (children && children.length > 0) {
          const childIds = children.map((c) => c.id);

          // 4. Delete harvests for these children
          await admin
            .from("harvests")
            .delete()
            .in("child_id", childIds);

          // 5. Delete children
          await admin
            .from("children")
            .delete()
            .in("id", childIds);
        }

        // 6. Delete parent
        await admin
          .from("parents")
          .delete()
          .eq("id", user.id);

        // 7. Delete family (only if no other parents reference it)
        const { data: otherParents } = await admin
          .from("parents")
          .select("id")
          .eq("family_id", parent.family_id)
          .limit(1);

        if (!otherParents || otherParents.length === 0) {
          await admin
            .from("families")
            .delete()
            .eq("id", parent.family_id);
        }
      }

      // 8. Delete auth user
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

      if (deleteError) {
        console.error(`  Failed to delete auth user ${user.email}:`, deleteError.message);
        errors++;
      } else {
        deleted++;
        process.stdout.write(`\r  Deleted: ${deleted}/${loadtestUsers.length}`);
      }
    } catch (err) {
      console.error(`\n  Error cleaning up ${user.email}:`, err.message);
      errors++;
    }
  }

  console.log(`\n\nDone. Deleted: ${deleted}, Errors: ${errors}`);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
