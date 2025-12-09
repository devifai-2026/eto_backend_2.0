const generateOtp = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Helper function to generate a random 3-digit number
export const generateRandom3DigitNumber = () => Math.floor(100 + Math.random() * 900);


export default generateOtp;
