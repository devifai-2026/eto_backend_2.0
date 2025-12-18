import express from "express";
import http from "http";
import cors from "cors";
import errorHandler from "./middlewares/errorMiddleware.js";
import { setupSocketIO } from "./socket.js"; // Import the Socket.IO setup

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();

// Create HTTP server and attach Express app
const server = http.createServer(app);

// Initialize Socket.IO by passing the server
const io = setupSocketIO(server); // Use the same server for Socket.IO

const orginStatus = {
  development: [
    "http://localhost:8081", // your local frontend (if needed)
    "http://localhost:5173", // your local frontend (if needed)
    "http://192.168.1.5:8081", // allow your LAN frontend
    "http://192.168.1.5", // allow without port if needed
    "*", // (optional) allow all, but not recommended for production
  ],
};

// Middleware configuration
app.use(cors());

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));

// Import and use routes
import userRouter from "./routes/user.routes.js";
import adminRouter from "./routes/admin.routes.js";
import driverRouter from "./routes/driver.routes.js";
import riderRouter from "./routes/rider.routes.js";
import createRideDetailsRouter from "./routes/rideDetails.routes.js";
import dueRequestRouter from "./routes/dueRequest.routes.js";
import etoRouter from "./routes/eto.routes.js";
import paymentRouter from "./routes/payment.routes.js";
import ratingRouter from "./routes/rating.routes.js";
import franchisesRouter from "./routes/franchise.routes.js";
import fareSettingsRouter from "./routes/fareSettings.routes.js";
import commissionSettingsRouter from "./routes/commissionSettings.routes.js";
import path from "path";
import fs from "fs";

app.use("/eto/api/v1/auth", userRouter);
app.use("/eto/api/v1/admin", adminRouter);
app.use("/eto/api/v1/driver", driverRouter);
app.use("/eto/api/v1/rider", riderRouter);
app.use("/eto/api/v1/rides", createRideDetailsRouter(io));
app.use("/eto/api/v1/dueRequest", dueRequestRouter);
app.use("/eto/api/v1/eto", etoRouter);
app.use("/", paymentRouter);
app.use("/eto/api/v1/rating", ratingRouter);
app.use("/eto/api/v1/franchises", franchisesRouter);
app.use("/eto/api/v1/fare-settings", fareSettingsRouter);
app.use("/eto/api/v1/commission-settings", commissionSettingsRouter);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
  "/franchise-documents",
  express.static(path.join(__dirname, "uploads/franchise-documents"))
);

// Home route
app.get("/", (req, res) => {
  res.send("Welcome To EASY Toto Operator (TRIAL) API!");
});

// check commit

app.get("/test", (req, res) => {
  res.send("Welcome to EASY (TRIAL) API!");
});

// Error handling middleware
app.use(errorHandler);

app.get("/check-files", (req, res) => {


  const franchiseDir = path.join(__dirname, "uploads/franchise-documents");

  if (!fs.existsSync(franchiseDir)) {
    return res.json({ error: "Directory not found", path: franchiseDir });
  }

  const files = fs.readdirSync(franchiseDir);

  res.json({
    directory: franchiseDir,
    fileCount: files.length,
    files: files.map((file) => ({
      name: file,
      path: `/franchise-documents/${file}`,
      url: `http://localhost:8000/franchise-documents/${file}`,
    })),
  });
});

// Export server and app
export { app, server };
