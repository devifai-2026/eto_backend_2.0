import dotenv from "dotenv";
import { app, server } from "./app.js";
import connectDB from "./db/index.js";

dotenv.config({
  path: "./env",
});

// Connect to MongoDB and start the server
connectDB()
  .then(() => {
    const PORT = process.env.PORT || 8000;

    server.listen(PORT, () => {
      console.log(`Server and Socket.IO are running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MONGO DB CONNECTION FAILED !!!", err);
  });
