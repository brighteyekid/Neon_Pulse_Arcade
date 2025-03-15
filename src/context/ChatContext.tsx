import React, { createContext, useContext, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  serverTimestamp, doc, updateDoc, deleteDoc, where, getDocs, getDoc, setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Message, User, Reaction } from '../types';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface ChatContextType {
  messages: Message[];
  users: User[];
  currentUser: User | null;
  sendMessage: (text: string, replyTo?: { id: string; username: string; text: string }) => void;
  sendMediaMessage: (type: 'image' | 'video' | 'audio' | 'gif', url: string, fileName: string, replyTo?: { id: string; username: string; text: string }) => Promise<void>;
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  joinChat: (username: string) => void;
  leaveChat: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Load user from localStorage on initial render
  useEffect(() => {
    const savedUser = localStorage.getItem('retro_chat_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setCurrentUser(parsedUser);
        
        // Verify the user still exists in Firestore
        const checkUserExists = async () => {
          try {
            const userDoc = await getDoc(doc(db, 'users', parsedUser.id));
            if (!userDoc.exists()) {
              // User no longer exists in Firestore, clear localStorage
              localStorage.removeItem('retro_chat_user');
              setCurrentUser(null);
            }
          } catch (error) {
            console.error('Error checking if user exists:', error);
          }
        };
        
        checkUserExists();
      } catch (error) {
        console.error('Error parsing saved user:', error);
        localStorage.removeItem('retro_chat_user');
      }
    }
  }, []);

  // Listen for messages from Firestore
  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const messagesData: Message[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        messagesData.push({
          id: doc.id,
          username: data.username,
          text: data.text,
          timestamp: data.timestamp?.toMillis() || Date.now(),
          mediaType: data.mediaType,
          mediaUrl: data.mediaUrl,
          reactions: data.reactions || [],
          replyTo: data.replyTo || undefined,
          mentions: data.mentions || []
        });
      });
      setMessages(messagesData);
    });

    return () => unsubscribe();
  }, []);

  // Listen for users from Firestore
  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('lastActive', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const usersData: User[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        usersData.push({
          id: doc.id,
          username: data.username,
          joinedAt: data.joinedAt?.toMillis() || Date.now(),
          lastActive: data.lastActive?.toMillis() || Date.now(),
          score: data.score || 0,
          level: data.level || 1,
          lives: data.lives || 3
        });
      });
      setUsers(usersData);
      console.log('Users loaded:', usersData.length);
      
      // Update current user if it exists in the users list
      if (currentUser) {
        const updatedCurrentUser = usersData.find(user => user.id === currentUser.id);
        if (updatedCurrentUser && JSON.stringify(updatedCurrentUser) !== JSON.stringify(currentUser)) {
          setCurrentUser(updatedCurrentUser);
          localStorage.setItem('retro_chat_user', JSON.stringify(updatedCurrentUser));
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Clean up inactive users
  useEffect(() => {
    const interval = setInterval(async () => {
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      
      // Find inactive users
      const inactiveUsers = users.filter(user => {
        // Skip current user
        if (currentUser && user.id === currentUser.id) return false;
        
        // Check if user has been inactive for 30 minutes
        return user.joinedAt && user.joinedAt < thirtyMinutesAgo;
      });
      
      // Remove inactive users
      for (const user of inactiveUsers) {
        try {
          // Delete user document
          await deleteDoc(doc(db, 'users', user.id));
          
          // Add system message
          await addDoc(collection(db, 'messages'), {
            username: 'System',
            text: `${user.username} has disconnected due to inactivity`,
            timestamp: serverTimestamp(),
          });
        } catch (error) {
          console.error('Error removing inactive user:', error);
        }
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, [users, currentUser]);

  // Update user's last active timestamp
  useEffect(() => {
    if (currentUser) {
      const updateInterval = setInterval(async () => {
        try {
          await updateDoc(doc(db, 'users', currentUser.id), {
            lastActive: serverTimestamp(),
          });
        } catch (error) {
          console.error('Error updating user activity:', error);
        }
      }, 60000); // Update every minute
      
      return () => clearInterval(updateInterval);
    }
  }, [currentUser]);

  // Join chat with a unique username
  const joinChat = async (username: string) => {
    try {
      // Check if username already exists
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', username));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        // Username exists, make it unique by adding a number
        let counter = 1;
        let uniqueUsername = `${username}_${counter}`;
        
        // Keep checking until we find a unique username
        while (true) {
          const uniqueQuery = query(usersRef, where('username', '==', uniqueUsername));
          const uniqueSnapshot = await getDocs(uniqueQuery);
          
          if (uniqueSnapshot.empty) {
            // Found a unique username
            username = uniqueUsername;
            break;
          }
          
          // Try next number
          counter++;
          uniqueUsername = `${username}_${counter}`;
        }
      }
      
      // Create new user
      const userId = uuidv4();
      const newUser: User = {
        id: userId,
        username: username,
        level: 1,
        score: 0,
        lives: 3,
        joinedAt: Date.now(),
        lastActive: Date.now(),
      };
      
      // Save to Firestore
      await setDoc(doc(db, 'users', userId), {
        ...newUser,
        lastActive: serverTimestamp(),
        joinedAt: serverTimestamp(),
      });
      
      // Update local state
      setCurrentUser(newUser);
      
      // Save to localStorage
      localStorage.setItem('retro_chat_user', JSON.stringify(newUser));
      
      // Add system message
      await addDoc(collection(db, 'messages'), {
        id: uuidv4(),
        text: `${username} has joined the chat`,
        username: 'System',
        timestamp: serverTimestamp(),
        type: 'system'
      });
      
      // Play join sound
      const joinSound = new Audio('/join-sound.mp3');
      joinSound.volume = 0.3;
      joinSound.play().catch(e => console.log('Audio play failed:', e));
      
    } catch (error) {
      console.error('Error joining chat:', error);
    }
  };

  const leaveChat = async () => {
    if (currentUser) {
      try {
        // Add system message
        await addDoc(collection(db, 'messages'), {
          username: 'System',
          text: `${currentUser.username} has left the chat`,
          timestamp: serverTimestamp(),
        });
        
        // Delete user from Firestore
        await deleteDoc(doc(db, 'users', currentUser.id));
        
        // Clear current user
        setCurrentUser(null);
        
        // Clear from localStorage
        localStorage.removeItem('retro_chat_user');
      } catch (error) {
        console.error('Error leaving chat:', error);
      }
    }
  };

  const sendMessage = (text: string, replyTo?: { id: string; username: string; text: string }) => {
    if (!currentUser) return;
    
    // Detect mentions using regex
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    
    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[1]);
    }
    
    // Add message to Firestore
    addDoc(collection(db, 'messages'), {
      username: currentUser.username,
      text,
      timestamp: serverTimestamp(),
      replyTo: replyTo || null,
      mentions: mentions.length > 0 ? mentions : null
    });
    
    // Update user score
    const newScore = (currentUser.score || 0) + 1;
    
    // Update user in Firestore
    updateDoc(doc(db, 'users', currentUser.id), {
      score: newScore,
      lastActive: serverTimestamp(),
    });
    
    // Update current user locally
    const updatedUser = {
      ...currentUser,
      score: newScore,
    };
    setCurrentUser(updatedUser);
    localStorage.setItem('retro_chat_user', JSON.stringify(updatedUser));
  };

  const sendMediaMessage = async (
    type: 'image' | 'video' | 'audio' | 'gif', 
    url: string, 
    fileName: string,
    replyTo?: { id: string; username: string; text: string }
  ) => {
    if (!currentUser) return;
    
    try {
      // Check if the URL is a base64 string and it's too large for Firestore
      if (url.startsWith('data:') && url.length > 900000) {
        alert('File is too large. Please choose a smaller file (under 1MB).');
        return;
      }
      
      // Create a message text based on the media type
      let messageText = '';
      switch (type) {
        case 'image':
          messageText = 'Shared an image';
          break;
        case 'video':
          messageText = 'Shared a video';
          break;
        case 'audio':
          messageText = 'Shared an audio clip';
          break;
        case 'gif':
          messageText = 'Shared a GIF';
          break;
        default:
          messageText = `Shared ${type}`;
      }
      
      // Add message to Firestore (no mentions for media messages)
      await addDoc(collection(db, 'messages'), {
        username: currentUser.username,
        text: messageText,
        mediaType: type,
        mediaUrl: url,
        timestamp: serverTimestamp(),
        replyTo: replyTo || null
      });
      
      // Update user score
      const newScore = (currentUser.score || 0) + 2;
      
      // Update user in Firestore
      await updateDoc(doc(db, 'users', currentUser.id), {
        score: newScore,
        lastActive: serverTimestamp(),
      });
      
      // Update current user locally
      const updatedUser = {
        ...currentUser,
        score: newScore,
      };
      setCurrentUser(updatedUser);
      localStorage.setItem('retro_chat_user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Error sending media message:', error);
      throw error;
    }
  };

  const addReaction = async (messageId: string, emoji: string) => {
    if (!currentUser) return;
    
    try {
      // Get the message document
      const messageRef = doc(db, 'messages', messageId);
      const messageDoc = await getDoc(messageRef);
      
      if (!messageDoc.exists()) {
        console.error('Message not found');
        return;
      }
      
      const messageData = messageDoc.data();
      const reactions = messageData.reactions || [];
      
      // Check if user already reacted with this emoji
      const existingReactionIndex = reactions.findIndex(
        (r: Reaction) => r.userId === currentUser.id && r.emoji === emoji
      );
      
      if (existingReactionIndex !== -1) {
        // User already reacted with this emoji, so we'll remove it
        reactions.splice(existingReactionIndex, 1);
      } else {
        // Add the new reaction
        reactions.push({
          emoji,
          userId: currentUser.id,
          username: currentUser.username
        });
      }
      
      // Update the message with the new reactions
      await updateDoc(messageRef, { reactions });
      
      // Add a small score for reacting
      const newScore = (currentUser.score || 0) + 1;
      
      // Update user in Firestore
      await updateDoc(doc(db, 'users', currentUser.id), {
        score: newScore,
        lastActive: serverTimestamp(),
      });
      
      // Update current user locally
      const updatedUser = {
        ...currentUser,
        score: newScore,
      };
      setCurrentUser(updatedUser);
      localStorage.setItem('retro_chat_user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const removeReaction = async (messageId: string, emoji: string) => {
    if (!currentUser) return;
    
    try {
      // Get the message document
      const messageRef = doc(db, 'messages', messageId);
      const messageDoc = await getDoc(messageRef);
      
      if (!messageDoc.exists()) {
        console.error('Message not found');
        return;
      }
      
      const messageData = messageDoc.data();
      const reactions = messageData.reactions || [];
      
      // Filter out the reaction to remove
      const updatedReactions = reactions.filter(
        (r: Reaction) => !(r.userId === currentUser.id && r.emoji === emoji)
      );
      
      // Update the message with the new reactions
      await updateDoc(messageRef, { reactions: updatedReactions });
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  };

  return (
    <ChatContext.Provider
      value={{
        messages,
        users,
        currentUser,
        sendMessage,
        sendMediaMessage,
        addReaction,
        removeReaction,
        joinChat,
        leaveChat,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}; 