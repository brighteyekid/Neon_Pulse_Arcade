import { collection, query, where, getDocs, Timestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

class LobbyService {
  private checkInterval: number | null = null;
  private listeners: Array<(shouldCleanup: boolean) => void> = [];
  
  /**
   * Start monitoring the lobby for inactivity
   * @param inactivityThreshold Time in minutes before considering the lobby inactive
   */
  startMonitoring(inactivityThreshold: number = 30) {
    // Clear any existing interval
    if (this.checkInterval) {
      window.clearInterval(this.checkInterval);
    }
    
    // Set up interval to check for inactive users
    this.checkInterval = window.setInterval(() => {
      this.checkForInactiveUsers(inactivityThreshold);
    }, 60000); // Check every minute
    
    // Do an initial check
    this.checkForInactiveUsers(inactivityThreshold);
    
    return () => {
      if (this.checkInterval) {
        window.clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
    };
  }
  
  /**
   * Stop monitoring the lobby
   */
  stopMonitoring() {
    if (this.checkInterval) {
      window.clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  
  /**
   * Add a listener for lobby cleanup events
   * @param listener Function to call when cleanup should occur
   */
  addListener(listener: (shouldCleanup: boolean) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  /**
   * Check if there are any active users in the lobby
   * @param inactivityThreshold Time in minutes before considering the lobby inactive
   */
  private async checkForInactiveUsers(inactivityThreshold: number) {
    try {
      // Calculate the timestamp for the inactivity threshold
      const thresholdDate = new Date();
      thresholdDate.setMinutes(thresholdDate.getMinutes() - inactivityThreshold);
      
      // Query for users active after the threshold
      const usersQuery = query(
        collection(db, 'users'),
        where('lastActive', '>', Timestamp.fromDate(thresholdDate))
      );
      
      const activeUsersSnapshot = await getDocs(usersQuery);
      
      // If no active users, notify listeners
      if (activeUsersSnapshot.empty) {
        console.log(`No active users found in the last ${inactivityThreshold} minutes. Triggering cleanup.`);
        this.notifyListeners(true);
      } else {
        console.log(`Found ${activeUsersSnapshot.size} active users. No cleanup needed.`);
        this.notifyListeners(false);
      }
    } catch (error) {
      console.error('Error checking for inactive users:', error);
    }
  }
  
  /**
   * Notify all listeners of the cleanup status
   * @param shouldCleanup Whether the lobby should be cleaned up
   */
  private notifyListeners(shouldCleanup: boolean) {
    this.listeners.forEach(listener => {
      try {
        listener(shouldCleanup);
      } catch (error) {
        console.error('Error in lobby listener:', error);
      }
    });
  }
}

// Create a singleton instance
const lobbyService = new LobbyService();

export default lobbyService; 