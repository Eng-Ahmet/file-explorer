const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// تعيين الترميز الافتراضي
process.stdout.isTTY && process.stdout._handle?.setBlocking(true);

const app = express();
const PORT = 8080;

// Middleware
app.use(express.json({ charset: "utf-8" }));
app.use(express.urlencoded({ extended: true, charset: "utf-8" }));
app.use(express.static(__dirname));

// تعيين ترميز UTF-8 للاستجابات
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, PUT");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    // استخدام اسم الملف الأصلي مع ترميز UTF-8 صحيح
    const originalname = Buffer.from(file.originalname, "latin1").toString(
      "utf8"
    );
    cb(null, `${timestamp}_${random}_${originalname}`);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".md" || ext === ".pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only MD and PDF files are allowed"));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Initialize SQLite database
const db = new sqlite3.Database(path.join(__dirname, "files.db"), (err) => {
  if (err) {
    console.error("Error opening database:", err);
  } else {
    console.log("Connected to SQLite database");
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      originalName TEXT NOT NULL,
      displayName TEXT NOT NULL,
      size INTEGER NOT NULL,
      type TEXT NOT NULL,
      uploadDate TEXT NOT NULL,
      filePath TEXT NOT NULL,
      folderId TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdDate TEXT NOT NULL
    )
  `);
}

// API Routes

// Get all files
app.get("/api/files", (req, res) => {
  db.all("SELECT * FROM files ORDER BY uploadDate DESC", (err, rows) => {
    if (err) {
      console.error("Database error:", err);
      res.status(500).json({ error: "Failed to fetch files" });
      return;
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json(rows || []);
  });
});

// Get single file
app.get("/api/files/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM files WHERE id = ?", [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: "Database error" });
      return;
    }

    if (!row) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const filePath = row.filePath;

    // Read file content with UTF-8 encoding
    fs.readFile(filePath, "utf-8", (err, data) => {
      if (err) {
        console.error("File read error:", err);
        res.status(500).json({ error: "Failed to read file" });
        return;
      }

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.json({
        ...row,
        content: data,
      });
    });
  });
});

// Upload file
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  const fileId = `file_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  const filePath = req.file.path;

  // الحصول على امتداد الملف (md أو pdf)
  const fileExt = path
    .extname(req.file.originalname)
    .toLowerCase()
    .replace(".", "");
  const fileType = fileExt;

  // معالجة صحيحة للأسماء العربية - تحويل من latin1 إلى utf8
  let fileName = req.file.originalname;
  try {
    // تحويل الاسم من encoding خاطئ إلى UTF-8 صحيح
    fileName = Buffer.from(fileName, "latin1").toString("utf8");
  } catch (e) {
    console.warn("Warning: Could not convert filename encoding:", e);
  }

  db.get(
    "SELECT id FROM files WHERE originalName = ?",
    [fileName],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: "Database error" });
        return;
      }

      const insertFile = () => {
        db.run(
          "INSERT INTO files (id, name, originalName, displayName, size, type, uploadDate, filePath, folderId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            fileId,
            req.file.filename,
            fileName,
            fileName,
            req.file.size,
            fileType,
            new Date().toISOString(),
            filePath,
            req.body.folderId || null,
          ],
          function (err) {
            if (err) {
              res.status(500).json({ error: "Failed to save file" });
              return;
            }

            res.json({
              id: fileId,
              name: req.file.filename,
              originalName: fileName,
              displayName: fileName,
              size: req.file.size,
              type: fileType,
              uploadDate: new Date().toISOString(),
            });
          }
        );
      };

      if (row) {
        // File exists - delete old one first
        db.get(
          "SELECT filePath FROM files WHERE id = ?",
          [row.id],
          (err, oldFile) => {
            if (oldFile && fs.existsSync(oldFile.filePath)) {
              fs.unlinkSync(oldFile.filePath);
            }

            db.run("DELETE FROM files WHERE id = ?", [row.id], (err) => {
              insertFile();
            });
          }
        );
      } else {
        insertFile();
      }
    }
  );
});

// Delete file
app.delete("/api/files/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT filePath FROM files WHERE id = ?", [id], (err, row) => {
    if (err || !row) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Delete physical file
    if (fs.existsSync(row.filePath)) {
      fs.unlinkSync(row.filePath);
    }

    // Delete from database
    db.run("DELETE FROM files WHERE id = ?", [id], function (err) {
      if (err) {
        res.status(500).json({ error: "Failed to delete file" });
        return;
      }

      res.json({ message: "File deleted successfully" });
    });
  });
});

// Download file
app.get("/api/download/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM files WHERE id = ?", [id], (err, row) => {
    if (err || !row) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const filePath = row.filePath;

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found on disk" });
      return;
    }

    // معالجة الأسماء بشكل صحيح للتحميل
    let fileName = row.originalName;

    try {
      // تنظيف الاسم من الأحرف الخاصة التي قد تسبب مشاكل
      // استخدام encodeURIComponent للأسماء التي تحتوي على أحرف غير ASCII
      const encodedFileName = encodeURIComponent(fileName);

      // تعيين رؤوس الاستجابة بشكل آمن
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodedFileName}`
      );

      // إرسال الملف
      res.sendFile(filePath, (err) => {
        if (err) {
          console.error("Error sending file:", err);
        }
      });
    } catch (error) {
      console.error("Error preparing file download:", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  });
});

// Clear all files
app.delete("/api/clear", (req, res) => {
  db.all("SELECT filePath FROM files", (err, rows) => {
    if (err) {
      res.status(500).json({ error: "Database error" });
      return;
    }

    // Delete all physical files
    rows.forEach((row) => {
      if (fs.existsSync(row.filePath)) {
        fs.unlinkSync(row.filePath);
      }
    });

    // Clear database
    db.run("DELETE FROM files", (err) => {
      if (err) {
        res.status(500).json({ error: "Failed to clear files" });
        return;
      }

      res.json({ message: "All files cleared" });
    });
  });
});

// Get all folders
app.get("/api/folders", (req, res) => {
  db.all("SELECT * FROM folders ORDER BY createdDate DESC", (err, rows) => {
    if (err) {
      res.status(500).json({ error: "Failed to fetch folders" });
      return;
    }
    res.json(rows);
  });
});

// Create folder
app.post("/api/folders", (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === "") {
    res.status(400).json({ error: "Folder name is required" });
    return;
  }

  const folderId = `folder_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  db.run(
    "INSERT INTO folders (id, name, createdDate) VALUES (?, ?, ?)",
    [folderId, name.trim(), new Date().toISOString()],
    function (err) {
      if (err) {
        res.status(500).json({ error: "Failed to create folder" });
        return;
      }

      res.json({
        id: folderId,
        name: name.trim(),
        createdDate: new Date().toISOString(),
      });
    }
  );
});

// Delete folder
app.delete("/api/folders/:id", (req, res) => {
  const { id } = req.params;

  // First delete all files in this folder
  db.all(
    "SELECT filePath FROM files WHERE folderId = ?",
    [id],
    (err, files) => {
      if (err) {
        res.status(500).json({ error: "Database error" });
        return;
      }

      files.forEach((file) => {
        if (fs.existsSync(file.filePath)) {
          fs.unlinkSync(file.filePath);
        }
      });

      // Delete files from database
      db.run("DELETE FROM files WHERE folderId = ?", [id], (err) => {
        if (err) {
          res.status(500).json({ error: "Failed to delete files" });
          return;
        }

        // Delete folder
        db.run("DELETE FROM folders WHERE id = ?", [id], (err) => {
          if (err) {
            res.status(500).json({ error: "Failed to delete folder" });
            return;
          }

          res.json({ message: "Folder deleted successfully" });
        });
      });
    }
  );
});

// Rename file
app.put("/api/files/:id/rename", (req, res) => {
  const { id } = req.params;
  const { displayName } = req.body;

  if (!displayName || displayName.trim() === "") {
    res.status(400).json({ error: "Display name is required" });
    return;
  }

  db.run(
    "UPDATE files SET displayName = ? WHERE id = ?",
    [displayName.trim(), id],
    function (err) {
      if (err) {
        res.status(500).json({ error: "Failed to rename file" });
        return;
      }

      res.json({
        message: "File renamed successfully",
        displayName: displayName.trim(),
      });
    }
  );
});

// Rename folder
app.put("/api/folders/:id/rename", (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || name.trim() === "") {
    res.status(400).json({ error: "Folder name is required" });
    return;
  }

  db.run(
    "UPDATE folders SET name = ? WHERE id = ?",
    [name.trim(), id],
    function (err) {
      if (err) {
        res.status(500).json({ error: "Failed to rename folder" });
        return;
      }

      res.json({ message: "Folder renamed successfully", name: name.trim() });
    }
  );
});

// Move file to folder
app.put("/api/files/:id/move", (req, res) => {
  const { id } = req.params;
  const { folderId } = req.body;

  db.run(
    "UPDATE files SET folderId = ? WHERE id = ?",
    [folderId || null, id],
    function (err) {
      if (err) {
        res.status(500).json({ error: "Failed to move file" });
        return;
      }

      res.json({ message: "File moved successfully" });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Database: ${path.join(__dirname, "files.db")}`);
});
