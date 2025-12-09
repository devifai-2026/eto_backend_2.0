import express from "express";
import http from "http";
import cors from "cors";
import errorHandler from "./middlewares/errorMiddleware.js";
import { setupSocketIO } from "./socket.js"; // Import the Socket.IO setup

// Initialize Express app
const app = express();

// Create HTTP server and attach Express app
const server = http.createServer(app);

// Initialize Socket.IO by passing the server
const io = setupSocketIO(server); // Use the same server for Socket.IO

const orginStatus = {
  development: [
    "http://localhost:8081", // your local frontend (if needed)
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

app.use("/eto/api/v1/auth", userRouter);
app.use("/eto/api/v1/admin", adminRouter);
app.use("/eto/api/v1/driver", driverRouter);
app.use("/eto/api/v1/rider", riderRouter);
app.use("/eto/api/v1/rides", createRideDetailsRouter(io));
app.use("/eto/api/v1/dueRequest", dueRequestRouter);
app.use("/eto/api/v1/eto", etoRouter);
app.use("/", paymentRouter);
app.use("/eto/api/v1/rating", ratingRouter);

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

// Export server and app
export { app, server };
