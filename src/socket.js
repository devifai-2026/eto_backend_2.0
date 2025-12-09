import { Server } from "socket.io";
import { Driver } from "./models/driver.model.js";
import { Rider } from "./models/rider.model.js";
import { RideDetails } from "./models/rideDetails.model.js";
import geolib from "geolib";
import { Admin } from "./models/admin.model.js";
import { PendingRideRequest } from "./models/pendingRequest.model.js";
import sendDriverNotification from "./utils/onesignal.js";
// import { getEstimatedTime } from "./utils/getlocation.js";

export const setupSocketIO = (server) => {
  const io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:8081", // your local frontend (if needed)
        "http://192.168.1.5:8081", // allow your LAN frontend
        "http://192.168.1.5", // allow without port if needed
        "*", // (optional) allow all, but not recommended for production
      ], // Set your React app origin
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    // console.log("A user connected:", socket.id);

    // Register Admin Socket ID
    socket.on("registerAdmin", async (data) => {
      const { adminId } = data;
      if (!adminId) {
        return socket.emit("error", { message: "Admin ID is required" });
      }

      try {
        const admin = await Admin.findById(adminId);
        if (!admin) {
          return socket.emit("error", { message: "Admin not found" });
        }

        admin.socketId = socket.id;
        await admin.save();

        console.log(`Admin ${adminId} connected with socket ${socket.id}`);
        socket.emit("adminRegistered", {
          success: true,
          message: "Admin registered successfully",
        });
      } catch (error) {
        console.error("Error registering admin:", error.message);
        socket.emit("error", { message: "Failed to register admin" });
      }
    });

    // Register Driver Socket ID only
    socket.on("registerDriver", async (data) => {
      const { driverId } = data;
      if (!driverId) {
        return socket.emit("error", {
          message: "Driver ID is required",
        });
      }

      try {
        const driver = await Driver.findById(driverId);
        if (!driver) {
          return socket.emit("error", { message: "Driver not found" });
        }

        if (driver.isActive) {
          // Only update socketId
          await Driver.findByIdAndUpdate(driverId, {
            socketId: socket.id,
          });

          console.log(`Driver ${driverId} connected with socket ${socket.id}`);
        } else {
          return socket.emit("error", {
            message: "Driver is not active, cannot connect",
          });
        }
      } catch (error) {
        console.error("Error registering driver's socketId:", error.message);
        socket.emit("error", {
          message: "Failed to register driver",
        });
      }
    });


    // New event: Update Driver Location
    socket.on("updateDriverLocation", async (data) => {
      const { driverId, lat, lng } = data;
      if (!driverId || !lat || !lng) {
        return socket.emit("error", {
          message: "Driver ID and location required",
        });
      }

      try {
        const driver = await Driver.findById(driverId);
        if (!driver) {
          return socket.emit("error", { message: "Driver not found" });
        }

        if (driver.isActive) {
          // Only update location
          await Driver.findByIdAndUpdate(driverId, {
            current_location: {
              type: "Point",
              coordinates: [lng, lat],
            },
          });

          console.log(`Driver ${driverId} location updated`);
        } else {
          return socket.emit("error", {
            message: "Driver is not active, cannot update location",
          });
        }
      } catch (error) {
        console.error("Error updating driver's location:", error.message);
        socket.emit("error", {
          message: "Failed to update driver location",
        });
      }
    });

    // Register Rider Socket ID with location update
    socket.on("registerRider", async (data) => {
      // console.log(data);
      const { riderId, lat, lng } = data;

      if (!riderId || !lat || !lng) {
        return socket.emit("error", {
          message: "Rider ID and location required",
        });
      }

      try {
        await Rider.findByIdAndUpdate(riderId, {
          socketId: socket.id,
          current_location: {
            type: "Point",
            coordinates: [lng, lat],
          },
        });
        // console.log(
        //   `Rider ${riderId} connected with socket ${socket.id} and location updated`
        // );

        // Emit rider's updated location to the driver (if a ride is ongoing)
        const ride = await RideDetails.findOne({
          riderId,
          isRide_started: true,
        });
        if (ride && ride.driverId) {
          const driver = await Driver.findById(ride.driverId);
          if (driver && driver.socketId) {
            io.to(driver.socketId).emit("riderLocationUpdate", {
              riderId,
              location: { lat, lng },
              message: "Rider's location updated",
            });
          }
        }
      } catch (error) {
        console.error(
          "Error updating rider's socketId or location:",
          error.message
        );
        socket.emit("error", {
          message: "Failed to register rider and update location",
        });
      }
    });

    // Handle driver selection with details
    socket.on("selectDriverWithDetails", async (rideDetails) => {
      const {
        driverId,
        riderId,
        pickUpLocation,
        dropLocation,
        totalKmPickupToDrop,
        totalPrice,
        distanceToPickup,
        estimatedTimeToPickup,
      } = rideDetails;

      try {
        const driver = await Driver.findById(driverId);
        const rider = await Rider.findById(riderId);

        if (driver && driver.isActive && !driver.is_on_ride) {
          if (driver.socketId) {
            // Driver is online, send ride request via socket
            io.to(driver.socketId).emit("rideRequest", {
              riderId,
              pickUpLocation,
              dropLocation,
              totalKmPickupToDrop,
              totalPrice,
              distanceToPickup,
              estimatedTimeToPickup,
            });

            sendDriverNotification(
              driverId,
              "New Ride Request",
              "You have a new ride request. Tap to open the app."
            );
          } else {
            // Driver is offline, store pending request and send push notification
            await PendingRideRequest.create({
              driverId,
              riderSocketId: rider?.socketId || "",
              data: {
                riderId,
                pickUpLocation,
                dropLocation,
                totalKmPickupToDrop,
                totalPrice,
                distanceToPickup,
                estimatedTimeToPickup,
              },
              expiresAt: new Date(Date.now() + 30 * 1000), // 30 seconds from now
            });
            // sendPushNotificationToDriver
            sendDriverNotification(
              driverId,
              "New Ride Request",
              "You have a new ride request. Tap to open the app."
            );
          }

          socket.emit("driverSelected", {
            success: true,
            message: "Driver selected successfully",
          });
        } else {
          socket.emit("driverSelected", {
            success: false,
            message: "Driver is not available",
          });
        }
      } catch (error) {
        console.error("Error selecting driver:", error.message);
        socket.emit("error", { message: "Failed to select driver" });
      }
    });

    // Emit available drivers' location when requested
    socket.on("sendAvailableDriversLocation", async (data) => {
      const { riderId } = data;

      try {
        const rider = await Rider.findById(riderId);
        if (rider?.socketId) {
          const drivers = await Driver.find({
            isActive: true,
            is_on_ride: false,
          });
          io.to(rider.socketId).emit("availableDriversLocation", {
            drivers: drivers.map((driver) => ({
              driverId: driver._id,
              location: driver.current_location.coordinates,
              name: driver.name,
            })),
            message: "Updated available drivers sent to rider",
          });
        }
      } catch (error) {
        console.error("Error sending drivers' location:", error.message);
        socket.emit("error", {
          message: "Failed to send available drivers' location",
        });
      }
    });

    // Accept Ride Event
    socket.on("acceptRide", async (data) => {
      // console.log(data);
      const { rideId, riderId, driverId } = data;
      if (!rideId || !riderId || !driverId) {
        return socket.emit("error", {
          message: "Ride ID and Driver ID are required",
        });
      }

      try {
        await RideDetails.findByIdAndUpdate(
          rideId,
          { driverId, isRide_accept: true, isOn: true },
          { new: true }
        );

        const rider = await Rider.findById(riderId);
        // console.log("Emiting accept status to rider", rider.socketId);
        io.to(rider.socketId).emit("rideStatus", {
          isBooked: true,
          message: "Booking request accepted. Ride successfully booked.",
        });
      } catch (error) {
        console.error("Error accepting ride:", error.message);
        socket.emit("error", { message: "Failed to accept ride" });
      }
    });

    // Emit driver location to rider after ride acceptance
    socket.on("driverLocationUpdateAfterAccept", async (data) => {
      // console.log("Received data:", data);

      const {
        driverLocation,
        riderId,
        riderLocation,
        pickupLocation,
        dropLocation,
      } = data;

      if (!pickupLocation || !dropLocation) {
        console.error("Pickup or Drop Location is missing");
        return;
      }

      // console.log("Pickup Location:", pickupLocation);
      // console.log("Drop Location:", dropLocation);

      if (riderId) {
        try {
          const rider = await Rider.findById(riderId);

          if (rider?.socketId) {
            // Calculate distance in meters from driver location to rider location
            const driverToRiderDistanceMeters = geolib.getDistance(
              {
                latitude: driverLocation.latitude,
                longitude: driverLocation.longitude,
              },
              {
                latitude: riderLocation.coordinates[1], // riderLocation is [longitude, latitude]
                longitude: riderLocation.coordinates[0],
              }
            );

            console.log(
              "Driver Distance to Rider (meters):",
              driverToRiderDistanceMeters
            );

            // Convert distance to kilometers
            const driverToRiderDistanceKm = driverToRiderDistanceMeters / 1000;
            console.log(
              "Driver Distance to Rider (kilometers):",
              driverToRiderDistanceKm
            );

            const averageSpeed = 40; // km/h
            const estimatedTimeToRiderHours =
              driverToRiderDistanceKm / averageSpeed;
            const estimatedTimeToRiderMinutes = estimatedTimeToRiderHours * 60;

            console.log(
              "Estimated Time to Rider (minutes):",
              estimatedTimeToRiderMinutes.toFixed(2)
            );

            io.to(rider.socketId).emit("driverLocationUpdate", {
              driverLocation,
              riderLocation,
              pickupLocation,
              dropLocation,
              estimatedTimeToRider:
                estimatedTimeToRiderMinutes.toFixed(2) + " mins",
              message: "Driver's location after ride acceptance",
            });
          }
        } catch (error) {
          console.error(
            "Error finding rider or emitting location:",
            error.message
          );
          socket.emit("error", {
            message: "Failed to emit driver location to rider",
          });
        }
      }
    });

    // Listen for 'canceltime' event
    socket.on("canceltime", async ({ rideId, canceltime }) => {
      console.log(`Canceltime event received for ride ID: ${rideId}`);

      try {
        // Update the isCancel_time field in the database
        const ride = await RideDetails.findByIdAndUpdate(
          rideId,
          { isCancel_time: canceltime },
          { new: true } // Return the updated document
        );

        if (ride) {
          console.log("Ride cancel time updated successfully:", ride);
          // Optionally broadcast the update to other users (e.g., admin or driver)
          socket.broadcast.emit("rideStatusUpdated", {
            rideId,
            status: "canceled",
          });
        } else {
          console.log("Ride not found for the provided ID");
        }
      } catch (error) {
        console.error("Error updating ride:", error.message);
      }
    });

    // On socket "send_location" event
    socket.on("send_location", async (locationData) => {
      const { rideId, driverLocation } = locationData;
      console.log("Location Data", locationData);

      try {
        // Fetch the ride details from the database using rideId
        const rideDetails = await RideDetails.findById(rideId);
        if (!rideDetails) {
          socket.emit("error", { message: "Ride not found" });
          return;
        }

        // Fetch the rider details using riderId from rideDetails
        const rider = await Rider.findById(rideDetails.riderId);
        if (!rider) {
          socket.emit("error", { message: "Rider not found" });
          return;
        }

        const riderSocketId = rider.socketId; // Assuming the rider model stores the socketId

        // Extract the drop location from the ride details
        const dropLocation = {
          lat: rideDetails.drop_location.coordinates[1], // Correct order: latitude first
          lng: rideDetails.drop_location.coordinates[0], // longitude second
        };

        // Format driver's location for distance calculation
        const formattedDriverLocation = {
          lat: driverLocation.latitude,
          lng: driverLocation.longitude,
        };

        // Calculate the distance in meters from driver to drop location
        const driverToDropDistanceMeters = geolib.getDistance(
          {
            latitude: formattedDriverLocation.lat,
            longitude: formattedDriverLocation.lng,
          },
          {
            latitude: dropLocation.lat,
            longitude: dropLocation.lng,
          }
        );

        // Convert distance to kilometers
        const driverToDropDistanceKm = driverToDropDistanceMeters / 1000;
        console.log(
          "Driver Distance to Drop Location (kilometers):",
          driverToDropDistanceKm
        );

        // Average speed in km/h (you can adjust this based on your needs)
        const averageSpeed = 40; // km/h

        // Calculate the estimated time in hours
        const estimatedTimeToDropHours = driverToDropDistanceKm / averageSpeed;

        // Convert hours to minutes
        const estimatedTimeToDropMinutes = estimatedTimeToDropHours * 60;

        console.log(
          "Estimated Time to Drop Location (minutes):",
          estimatedTimeToDropMinutes.toFixed(2)
        );

        // Emit the updated data to the rider's socket
        io.to(riderSocketId).emit("estimatedTimeToDrop", {
          estimatedTimeToDrop: estimatedTimeToDropMinutes.toFixed(2) + " mins",
          message: "Estimated time to drop updated",
        });
      } catch (error) {
        console.error("Error calculating estimated time:", error.message);
        socket.emit("error", { message: "Unable to calculate estimated time" });
      }
    });

    // Admin requests driver's current location by rideId
    socket.on("getDriverLocationByRideId", async (data) => {
      const { rideId, adminId } = data;
      if (!rideId || !adminId) {
        return socket.emit("driverLocationForAdmin", {
          success: false,
          message: "Ride ID and Admin ID are required",
        });
      }

      try {
        // 1. Find the ride and check if isOn is true
        const ride = await RideDetails.findById(rideId);
        if (!ride || !ride.isOn) {
          return socket.emit("driverLocationForAdmin", {
            success: false,
            message: "Active ride not found",
            rideId,
          });
        }

        // 2. Find the driver by driverId
        const driver = await Driver.findById(ride.driverId);
        if (!driver || !driver.current_location) {
          return socket.emit("driverLocationForAdmin", {
            success: false,
            message: "Driver or location not found",
            rideId,
          });
        }

        // 3. Find the admin's socketId
        const admin = await Admin.findById(adminId);
        // if (!admin || !admin.socketId) {
        //   return socket.emit("driverLocationForAdmin", {
        //     success: false,
        //     message: "Admin socket not found",
        //     rideId,
        //   });
        // }

        // 4. Emit driver's current location to the admin's socket
        io.to(admin.socketId).emit("driverLocationForAdmin", {
          success: true,
          rideId,
          driverId: driver._id,
          location: driver.current_location,
        });
      } catch (error) {
        console.error(
          "Error fetching driver location for admin:",
          error.message
        );
        socket.emit("driverLocationForAdmin", {
          success: false,
          message: "Failed to get driver location",
        });
      }
    });

    // Emergency Notification Event
    socket.on("emergencyAlert", async (data) => {
      // data: { userType: "rider" | "driver", userId, location: { lat, lng } }
      const { userType, userId, location } = data;
      if (!userType || !userId || !location) {
        return socket.emit("error", { message: "Missing emergency data" });
      }

      try {
        let userDetails = null;
        if (userType === "rider") {
          userDetails = await Rider.findById(userId);
        } else if (userType === "driver") {
          userDetails = await Driver.findById(userId);
        }
        if (!userDetails) {
          return socket.emit("error", { message: "User not found" });
        }

        // Find the only admin
        const admin = await Admin.findOne({ socketId: { $ne: null } });
        if (!admin || !admin.socketId) {
          return socket.emit("error", { message: "Admin not online" });
        }

        // Prepare emergency data
        const emergencyData = {
          userType,
          userId,
          name: userDetails.name,
          phone: userDetails.phone,
          location,
          message: `Emergency alert from ${userType}`,
        };

        // Notify the admin
        socket.to(admin.socketId).emit("emergencyNotification", emergencyData);

        socket.emit("emergencySent", {
          success: true,
          message: "Emergency alert sent to admin",
        });
      } catch (error) {
        console.error("Error in emergencyAlert:", error.message);
        socket.emit("error", { message: "Failed to send emergency alert" });
      }
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log(`Socket ${socket.id} disconnected`);

      try {
        // Find the driver by socketId and remove the socketId when disconnected
        await Driver.findOneAndUpdate(
          { socketId: socket.id },
          { socketId: null }
        );
        console.log(`Driver with socket ${socket.id} disconnected`);
      } catch (error) {
        console.error("Error removing driver's socketId:", error.message);
      }
    });

    // Test event for addition
    socket.on("addition", (arg1, arg2, callback) => {
      callback({ result: arg1 + arg2 });
    });
  });

  setInterval(async () => {
    const now = new Date();
    const expiredRequests = await PendingRideRequest.find({
      expiresAt: { $lte: now },
    });

    for (const req of expiredRequests) {
      // Notify the rider that the driver did not respond
      if (req.riderSocketId) {
        io.to(req.riderSocketId).emit("driverNoResponse", {
          message: "Driver did not respond to your ride request.",
          driverId: req.driverId,
        });
      }
      // Delete the pending request
      await PendingRideRequest.findByIdAndDelete(req._id);
    }
  }, 5000); // Check every 5 seconds

  return io;
};
