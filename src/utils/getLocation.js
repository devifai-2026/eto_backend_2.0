import axios from "axios";

export const GOOGLE_MAPS_API_KEY = "AIzaSyADoCI2hyTYNI3jXfG4jRZzVu0qdMMEH4Q";

export async function getEstimatedTime(startLocation, endLocation) {
  const { lat: startLat, lng: startLng } = startLocation; // Driver's location
  const { lat: endLat, lng: endLng } = endLocation; // Drop location

  console.log(`Start Location: ${startLat}, ${startLng}`);
  console.log(`End Location: ${endLat}, ${endLng}`);

  // Modified URL with travel mode and alternatives
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startLat},${startLng}&destination=${endLat},${endLng}&mode=driving&alternatives=true&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const response = await axios.get(url);

    if (response.data.status === "OK" && response.data.routes?.length > 0) {
      const legs = response.data.routes[0].legs[0];

      if (legs && legs.duration) {
        return legs.duration.text; // Return the estimated time in text (e.g., "15 mins")
      } else {
        console.error("Duration information is missing in the response");
        return "Unable to calculate time";
      }
    } else if (response.data.status === "ZERO_RESULTS") {
      console.error("No valid routes found: ZERO_RESULTS");
      return "No route found";
    } else {
      console.error("Error fetching directions:", response.data.status);
      return "Unable to calculate time";
    }
  } catch (error) {
    console.error("Error fetching estimated time:", error.message);
    return "Unable to calculate time";
  }
}
