const rateLimit = {}; // In-memory store for rate limiting
const REQUEST_LIMIT = 3; // Maximum number of requests
const BLOCK_DURATION = 5 * 60 * 1000; // Block duration in milliseconds (5 minutes)

// Helper function to check rate limit
const checkRateLimit = (phone) => {
  const currentTime = Date.now();
  const limitInfo = rateLimit[phone];
  
  if (!limitInfo) {
    // Initialize if not present
    rateLimit[phone] = {
      count: 1,
      firstRequestTime: currentTime
    };
    return { allowed: true };
  }
  
  const { count, firstRequestTime } = limitInfo;
  
  if (currentTime - firstRequestTime > BLOCK_DURATION) {
    // Reset after block duration
    rateLimit[phone] = {
      count: 1,
      firstRequestTime: currentTime
    };
    return { allowed: true };
  }
  
  if (count >= REQUEST_LIMIT) {
    // Rate limit exceeded
    return { allowed: false, remainingTime: BLOCK_DURATION - (currentTime - firstRequestTime) };
  }
  
  // Update request count
  rateLimit[phone].count += 1;
  return { allowed: true };
};

export default checkRateLimit
