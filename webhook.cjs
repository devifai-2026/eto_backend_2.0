const express = require("express");
const bodyParser = require("body-parser");
const { exec } = require("child_process");

const app = express();
app.use(bodyParser.json());

app.post("/webhook", (req, res) => {
  const payload = req.body;
  
  // Log the incoming payload for debugging
  console.log("Received webhook payload:", JSON.stringify(payload, null, 2));

  // Ensure it's a push event
  if (payload.ref === "refs/heads/main") {
    console.log("New code pushed to GitHub. Pulling and redeploying...");

    // Pull the latest code and restart app
    exec("git pull origin main && npm install && pm2 restart all", (err, stdout, stderr) => {
      if (err) {
        console.error("Error pulling code or restarting app:", err);
        return res.status(500).send("Deployment failed");
      }
      console.log(stdout);
      res.status(200).send("Deployed successfully");
    });
  } else {
    res.status(400).send("Not a main branch push.");
  }
});

app.listen(5000, () => console.log("Webhook listener running on port 5000"));
