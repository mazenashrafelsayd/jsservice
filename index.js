const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const axios = require("axios"); // To call external API for IP details
const requestIp = require("request-ip"); // To extract client's IP address
const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
} = require("firebase/firestore");

const SECRET_HEADER_VALUE = "secret";

const app = express();
const port = process.env.PORT || 4000;

app.set("trust proxy", true);

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

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAcVzAMWuYPOZ7CHIUXFnHMo34DKwFMe90",
  authDomain: "ip-api-check.firebaseapp.com",
  projectId: "ip-api-check",
  storageBucket: "ip-api-check.firebasestorage.app",
  messagingSenderId: "396717913614",
  appId: "1:396717913614:web:cce1489b2f1d232d666e5f"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Middleware to log requests into Firebase Firestore
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

    // Insert the request details into the Firestore database
    if (requestUrl !== "/favicon.ico" && requestUrl !== "/favicon.png") {
      await addDoc(collection(db, "requests"), {
        country,
        regionName,
        city,
        method: requestMethod,
        ip: clientIp,
        url: requestUrl,
        timestamp,
      });
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
      error: err
    });
  }
  next();
});

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

// Route: List all logged requests
app.get("/mine/list", async (req, res) => {
  try {
    const requestsRef = collection(db, "requests");
    const querySnapshot = await getDocs(requestsRef);
    const rows = querySnapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Manually sorting by timestamp in descending order

    // Generate the HTML table with rows from Firestore
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

            .toggle-btn {
              padding: 5px 15px;
              background-color: #4CAF50;
              color: white;
              border: none;
              cursor: pointer;
              border-radius: 5px;
            }

            .toggle-btn.off {
              background-color: #f44336;
            }

            .toggle-btn:hover {
              background-color: #45a049;
            }

            .toggle-btn.off:hover {
              background-color: #e53935;
            }

            .hidden-row {
              display: none;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Request Logs</h2>
            <button class="toggle-btn off" id="toggleFilter" onclick="toggleFilter()">Show All</button>
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

    rows.forEach((row, index) => {
      // Check if the request URL is "/mine/list" and filter out if the toggle is off
      const isFilteredOut = row.url === "/mine/list";
      const rowClass = isFilteredOut ? 'hidden-row' : '';

      table += `
        <tr class="${rowClass}" data-url="${row.url}">
          <td><input type="checkbox" class="checkbox" name="deleteIds[]" value="${row.id}"></td>
          <td>${index + 1}</td>
          <td>${row.country}</td>
          <td>${row.regionName}</td>
          <td>${row.city}</td>
          <td>${row.method}</td>
          <td>${row.ip}</td>
          <td>${row.url}</td>
          <td>${row.timestamp}</td>
          <td><button type="submit" class="btn" name="deleteId" value="${row.id}">Delete</button></td>
        </tr>
      `;
    });

    table += `
              </tbody>
            </table>
            <button type="submit">Delete Selected</button>
          </form>
          <script>
            function selectAll() {
              const checkboxes = document.querySelectorAll('input[type="checkbox"]');
              checkboxes.forEach((checkbox) => (checkbox.checked = event.target.checked));
            }

            function toggleFilter() {
              const toggleBtn = document.getElementById("toggleFilter");
              const rows = document.querySelectorAll("tr[data-url='/mine/list']");
              
              if (toggleBtn.classList.contains("off")) {
                // Show all rows
                rows.forEach((row) => row.classList.remove("hidden-row"));
                toggleBtn.classList.remove("off");
                toggleBtn.textContent = "Hide '/mine/list' Entries";
              } else {
                // Hide rows where the URL is "/mine/list"
                rows.forEach((row) => row.classList.add("hidden-row"));
                toggleBtn.classList.add("off");
                toggleBtn.textContent = "Show All";
              }
            }
          </script>
        </body>
      </html>
    `;

    res.send(table);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve logs.", err });
  }
});


// Route: Delete selected logs
app.post("/mine/delete", async (req, res) => {
  const deleteIds = req.body.deleteIds; // Get array of IDs to delete

  if (!deleteIds || deleteIds.length === 0) {
    return res.status(400).json({ error: "No records selected for deletion." });
  }

  try {
    await Promise.all(
      deleteIds.map((id) => deleteDoc(doc(db, "requests", id)))
    );
    res.redirect("/mine/list");
  } catch (err) {
    res.status(500).json({ error: "Failed to delete records." });
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

// Export for Vercel
module.exports = app;
