const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const axios = require("axios"); // To call external API for IP details
const requestIp = require("request-ip"); // To extract client's IP address
const sqlite3 = require("sqlite3").verbose(); // SQLite for database

const SECRET_HEADER_VALUE = "secret";

const app = express();

// Path to the "15" folder
const folderPath = path.join(__dirname, "15");

// Enable CORS for all requests
app.use(cors());

// Rate Limiter Middleware to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",

  // Skip rate limiting if the secret header is valid
  skip: (req) => req.headers["x-secret-header"] === SECRET_HEADER_VALUE,
});

// Apply rate limiter globally
app.use(limiter);

// Middleware to extract client's IP
app.use(requestIp.mw());

// Middleware to parse JSON requests
app.use(express.json());

// SQLite database setup
const db = new sqlite3.Database("requests.db");

// Create the `requests` table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country TEXT,
    regionName TEXT,
    city TEXT,
    method TEXT,
    ip TEXT,
    url TEXT,
    timestamp TEXT
  )
`);

// Middleware to log requests into the SQLite database
app.use(async (req, res, next) => {
  const secretHeader = req.headers["x-secret-header"];
  const clientIp = req.clientIp; // Extract the IP address
  const requestUrl = req.originalUrl;
  const requestMethod = req.method; // Capture the HTTP method
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }); // UTC+9

  try {
    // Fetch IP details using ip-api.com
    const ipApiResponse = await axios.get(`http://ip-api.com/json/${clientIp}`);
    const ipDetails = ipApiResponse.data;
    const { country = "none", regionName = "none", city = "none" } = ipDetails;

    // Insert the request details into the database
    if (requestUrl !== "/favicon.ico") {
      db.run(
        `INSERT INTO requests (country, regionName, city, method, ip, url, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [country, regionName, city, requestMethod, clientIp, requestUrl, timestamp]
      );
    }
    if (requestUrl === "/mine/list" || requestUrl === "/mine/delete") {
      next();
      return;
    }
    if (secretHeader !== SECRET_HEADER_VALUE) {
      // Return IP details if the header is incorrect
      return res.json({
        ipInfo: ipDetails,
      });
    }
  } catch (err) {
    // Fallback in case of an error with the external API
    return res.status(403).json({
      ipInfo: {
        query: clientIp,
        message: "Unable to fetch IP details.",
      },
    });
  }
  next();
});

// Middleware to parse JSON requests
app.use(express.json());

// Dynamic Route: Return file contents based on the filename in the "15" folder
app.get("/api/ipcheck/:filename", (req, res) => {
  const requestedFile = req.params.filename;
  const filePath = path.join(folderPath, requestedFile);

  // Check if the file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ error: "IP check failed." });
    }

    // Read the file content
    fs.readFile(filePath, "utf-8", (err, content) => {
      if (err) {
        return res.status(500).json({ error: "Unable to check IP." });
      }
      res.json(content);
    });
  });
});

// Route: List all logged requests in a simple table format
app.get("/mine/list", (req, res) => {
  db.all(`SELECT * FROM requests ORDER BY id DESC`, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Failed to retrieve logs." });
    }

    // Format as a simple HTML table with checkboxes and delete button
    let table = `
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
              background-color: #f4f4f9;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }

            th, td {
              padding: 12px 15px;
              text-align: left;
              border: 1px solid #ddd;
            }

            th {
              background-color: #4CAF50;
              color: white;
            }

            tr:nth-child(even) {
              background-color: #f2f2f2;
            }

            tr:hover {
              background-color: #ddd;
            }

            h2 {
              text-align: center;
              color: #333;
            }

            .table-container {
              overflow-x: auto;
            }

            .container {
              max-width: 1200px;
              margin: 0 auto;
              padding: 20px;
            }

            .btn {
              padding: 5px 10px;
              background-color: red;
              color: white;
              border: none;
              cursor: pointer;
              border-radius: 5px;
            }

            .btn:hover {
              background-color: darkred;
            }

            .checkbox {
              margin: 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Request Logs</h2>
            <form method="POST" action="/mine/delete">
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th><input type="checkbox" id="select-all" onclick="selectAll()"></th>
                      <th>#</th>
                      <th>Country</th>
                      <th>Region</th>
                      <th>City</th>
                      <th>Method</th>
                      <th>IP</th>
                      <th>Request URL</th>
                      <th>Timestamp</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
    `;

    rows.forEach((row) => {
      table += `
        <tr>
          <td><input type="checkbox" class="checkbox" name="deleteIds[]" value="${row.id}"></td>
          <td>${row.id}</td>
          <td>${row.country}</td>
          <td>${row.regionName || "N/A"}</td>
          <td>${row.city || "N/A"}</td>
          <td>${row.method || "N/A"}</td>
          <td>${row.ip || "N/A"}</td>
          <td>${row.url}</td>
          <td>${row.timestamp}</td>
          <td><button type="submit" class="btn" name="deleteId" value="${row.id}">Delete</button></td>
        </tr>
      `;
    });

    table += `
                  </tbody>
                </table>
              </div>
              <button type="submit" class="btn">Delete Selected</button>
            </form>
          </div>

          <script>
            function selectAll() {
              const checkboxes = document.querySelectorAll('.checkbox');
              const selectAllBox = document.getElementById('select-all');
              checkboxes.forEach((checkbox) => {
                checkbox.checked = selectAllBox.checked;
              });
            }
          </script>
        </body>
      </html>
    `;

    res.send(table);
  });
});

app.post("/mine/delete", (req, res) => {
  const deleteIds = req.body.deleteIds; // Get array of IDs to delete
  console.log(req.body);

  if (!deleteIds || deleteIds.length === 0) {
    return res.status(400).json({ error: "No records selected for deletion." });
  }

  const placeholders = deleteIds.map(() => "?").join(", ");
  const sql = `DELETE FROM requests WHERE id IN (${placeholders})`;

  db.run(sql, deleteIds, function (err) {
    if (err) {
      return res.status(500).json({ error: "Failed to delete records." });
    }

    res.redirect("/mine/list");
  });
});

// Export for Vercel
module.exports = app;

