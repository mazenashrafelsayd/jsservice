const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

// Path to the "15" folder
const folderPath = path.join(__dirname, "15");

// Middleware to parse JSON requests
app.use(express.json());

// Route: List all available files in the "15" folder
// app.get("/", (req, res) => {
//   fs.readdir(folderPath, (err, files) => {
//     if (err) {
//       return res.status(500).json({ error: "Unable to read folder." });
//     }
//     res.json({ availableFiles: files });
//   });
// });

// Dynamic Route: Return file contents based on the filename in the "15" folder
app.get("/:filename", (req, res) => {
  const requestedFile = req.params.filename;
  const filePath = path.join(folderPath, requestedFile);

  // Check if the file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ error: "File not found." });
    }

    // Read the file content
    fs.readFile(filePath, "utf-8", (err, content) => {
      if (err) {
        return res.status(500).json({ error: "Unable to read the file." });
      }
      res.json(content);
    });
  });
});

// Export for Vercel
module.exports = app;

