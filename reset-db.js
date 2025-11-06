/**
 * Reset Database Script
 * This script deletes all files and resets the database
 * Run this once to fix any encoding issues from previous uploads
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "files.db");
const uploadsDir = path.join(__dirname, "uploads");

console.log("🔄 Resetting database and clearing uploads...\n");

// Delete database file
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log("✅ Deleted old database");
}

// Clear uploads folder
if (fs.existsSync(uploadsDir)) {
  const files = fs.readdirSync(uploadsDir);
  files.forEach((file) => {
    const filePath = path.join(uploadsDir, file);
    if (fs.lstatSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  });
  console.log("✅ Cleared uploads folder");
}

// Create new database with UTF-8 encoding
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Error creating database:", err);
    process.exit(1);
  }

  console.log("✅ Created new database");

  // Create tables
  db.run(
    `
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      originalName TEXT NOT NULL COLLATE NOCASE,
      displayName TEXT NOT NULL,
      size INTEGER NOT NULL,
      type TEXT NOT NULL,
      uploadDate TEXT NOT NULL,
      filePath TEXT NOT NULL,
      folderId TEXT
    )
  `,
    (err) => {
      if (err) {
        console.error("❌ Error creating files table:", err);
        process.exit(1);
      }
      console.log("✅ Created files table");
    }
  );

  db.run(
    `
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdDate TEXT NOT NULL
    )
  `,
    (err) => {
      if (err) {
        console.error("❌ Error creating folders table:", err);
        process.exit(1);
      }
      console.log("✅ Created folders table");

      // Close database
      db.close((err) => {
        if (err) {
          console.error("❌ Error closing database:", err);
          process.exit(1);
        }
        console.log("\n✨ Database reset successfully!");
        console.log("Now restart the server and upload files again.");
        process.exit(0);
      });
    }
  );
});

db.on("error", (err) => {
  console.error("❌ Database error:", err);
  process.exit(1);
});
