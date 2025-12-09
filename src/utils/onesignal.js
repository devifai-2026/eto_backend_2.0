import OneSignal from "onesignal-node";
import { Driver } from "../models/driver.model.js";


const client = new OneSignal.Client({
  app: {
    appAuthKey:
      "os_v2_app_vuy3vbpkjzbznneeno24doubw33zqcagvesucxnqrzcaa52bn5akrhaugfvickzlaurjuudvzigkb3yddx3z65s24ahhwb22flnanui",
    appId: "ad31ba85-ea4e-4396-b484-6bb5c1ba81b6",
  },
});

const sendDriverNotification = async (driverId, title, message) => {
  try {
    const driver = await Driver.findById(driverId);

    console.log(`Attempting to send notification to driver with ID: ${driverId}`);
    if (!driver || !driver.oneSignalPlayerId) {
      console.log("Driver not found or OneSignal Player ID is missing");
      return;
    }

    const notification = {
      contents: { en: message },
      headings: { en: title },
      include_player_ids: [driver.oneSignalPlayerId],
    };

    await client.createNotification(notification);
    console.log(`Notification sent successfully to driver ${driver.phone}`);
  } catch (error) {
    console.error("Failed to send push notification to driver:", error.message);
  }
};

export default sendDriverNotification;
