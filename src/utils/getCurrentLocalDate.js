export const getCurrentLocalDate = () => {
  const now = new Date();
  const localDateString = now.toLocaleString("en-US", {
    timeZone: "Asia/Kolkata", // Replace with your desired timezone
  });
  return new Date(localDateString);
};
