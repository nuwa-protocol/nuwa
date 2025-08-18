
import dayjs from 'dayjs';

export function formatDate (timestamp: number = 0): string {
return dayjs(timestamp).format(
    'MMMM DD, YYYY HH:mm:ss'
    )
}

export const formatTimestamp = (timestamp: number | string): string => {
    // Convert to number if string is provided
    const numericTimestamp = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
    
    // Ensure we have a valid timestamp
    if (!numericTimestamp || isNaN(numericTimestamp)) {
      return 'Invalid date';
    }
  
    try {
      // Check if timestamp is in seconds and convert to milliseconds if needed
      const timestampMs = numericTimestamp < 10000000000 ? numericTimestamp * 1000 : numericTimestamp;
      
      // Create date object
      const date = new Date(timestampMs);
      
      // Verify date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
      // Display relative time for recent messages
      if (diffInSeconds < 60) {
        return 'just now';
      } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
      } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
      }
  
      // For older messages, use simple, reliable formatting
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getMonth()];
      const day = date.getDate();
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      
      hours = hours % 12;
      hours = hours ? hours : 12; // Convert 0 to 12
      
      return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
    } catch (error) {
      // Last resort fallback
      return 'Date error';
    }
  };