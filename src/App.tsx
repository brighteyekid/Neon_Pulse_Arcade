import React, { useState, useEffect } from 'react';
import { ChatProvider, useChatContext } from './context/ChatContext';
import Login from './components/Login';
import ChatRoom from './components/ChatRoom';
import LobbyCleanup from './components/LobbyCleanup';
import BootSplash from './components/BootSplash';
import UserLeaveNotification from './components/UserLeaveNotification';
import { collection, query, where, getDocs, Timestamp, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

const ChatApp: React.FC = () => {
  const { currentUser } = useChatContext();
  const [showCleanup, setShowCleanup] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState(Date.now());
  const [userCount, setUserCount] = useState(0);
  const [showBootSplash, setShowBootSplash] = useState(true);
  const [userLeaveNotifications, setUserLeaveNotifications] = useState<{id: string, username: string}[]>([]);
  const [previousUsers, setPreviousUsers] = useState<{id: string, username: string}[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Show boot splash on first load
  useEffect(() => {
    const hasSeenBootSplash = sessionStorage.getItem('hasSeenBootSplash') === 'true';
    
    if (hasSeenBootSplash) {
      setShowBootSplash(false);
    } else {
      // Play boot sound
      try {
        const audio = new Audio('/boot-sound.mp3');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Audio play failed:', e));
      } catch (error) {
        console.error('Error playing boot sound:', error);
      }
    }
    
    // Mark initial load as complete after a short delay
    setTimeout(() => {
      setIsInitialLoad(false);
    }, 500);
  }, []);

  const handleBootSplashComplete = () => {
    console.log("Boot splash complete, transitioning to app");
    setShowBootSplash(false);
    sessionStorage.setItem('hasSeenBootSplash', 'true');
  };

  // Listen for changes in the users collection to detect when users leave
  useEffect(() => {
    const usersQuery = query(collection(db, 'users'));
    
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const currentUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        username: doc.data().username
      }));
      
      // Find users who have left
      const usersWhoLeft = previousUsers.filter(prevUser => 
        !currentUsers.some(currUser => currUser.id === prevUser.id)
      );
      
      // Add notifications for users who left
      if (usersWhoLeft.length > 0) {
        usersWhoLeft.forEach(user => {
          // Add notification with unique ID to prevent duplicates
          setUserLeaveNotifications(prev => {
            // Check if notification already exists for this user
            if (prev.some(notification => notification.id === user.id)) {
              return prev;
            }
            return [...prev, user];
          });
        });
      }
      
      // Update previous users
      setPreviousUsers(currentUsers);
      
      // Update user count
      const count = snapshot.size;
      setUserCount(count);
      
      // If there are no users and we're not already showing cleanup
      // and we're not logged in, trigger cleanup
      if (count === 0 && !showCleanup && !currentUser) {
        // Check if there are messages to clean up
        checkForMessages();
      }
    });
    
    return () => unsubscribe();
  }, [currentUser, showCleanup, previousUsers]);

  // Remove a user leave notification
  const removeUserLeaveNotification = (id: string) => {
    setUserLeaveNotifications(prev => 
      prev.filter(notification => notification.id !== id)
    );
  };

  // Check if there are messages to clean up
  const checkForMessages = async () => {
    try {
      const messagesSnapshot = await getDocs(collection(db, 'messages'));
      
      if (!messagesSnapshot.empty) {
        console.log('No users in chat and messages exist. Starting cleanup...');
        setShowCleanup(true);
      }
    } catch (error) {
      console.error('Error checking for messages:', error);
    }
  };

  // Also periodically check for inactive users when no one is logged in
  useEffect(() => {
    if (currentUser) {
      // If user is logged in, no need to check
      return;
    }

    // Don't check too frequently
    const now = Date.now();
    if (now - lastCheckTime < 60 * 1000) { // Check at most once per minute
      return;
    }

    // Update last check time
    setLastCheckTime(now);

    const checkForInactiveLobby = async () => {
      try {
        // Check if there are any active users in the last 5 minutes
        const fiveMinutesAgo = new Date();
        fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);
        
        const usersQuery = query(
          collection(db, 'users'),
          where('lastActive', '>', Timestamp.fromDate(fiveMinutesAgo))
        );
        
        const activeUsersSnapshot = await getDocs(usersQuery);
        
        // If no active users and we have messages, show cleanup
        if (activeUsersSnapshot.empty) {
          checkForMessages();
        }
      } catch (error) {
        console.error('Error checking for inactive lobby:', error);
      }
    };

    // Run this check when the component mounts without a user
    const timeoutId = setTimeout(() => {
      checkForInactiveLobby();
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [currentUser, lastCheckTime]);

  const handleCleanupComplete = () => {
    setShowCleanup(false);
    // Update the last check time
    setLastCheckTime(Date.now());
  };

  const handleCleanupCancel = () => {
    setShowCleanup(false);
    // Update the last check time
    setLastCheckTime(Date.now());
  };

  return (
    <>
      {showBootSplash && (
        <BootSplash onComplete={handleBootSplashComplete} />
      )}
      
      {!showBootSplash && !currentUser && !isInitialLoad && !showCleanup && (
        <Login />
      )}
      
      {!showBootSplash && currentUser && (
        <ChatRoom />
      )}
      
      {showCleanup && !currentUser && (
        <LobbyCleanup 
          onComplete={handleCleanupComplete} 
          onCancel={handleCleanupCancel} 
        />
      )}
      
      {/* User leave notifications */}
      {userLeaveNotifications.map(notification => (
        <UserLeaveNotification 
          key={notification.id}
          username={notification.username}
          onClose={() => removeUserLeaveNotification(notification.id)}
        />
      ))}
    </>
  );
};

const App: React.FC = () => {
  return (
    <ChatProvider>
      <ChatApp />
    </ChatProvider>
  );
};

export default App;
