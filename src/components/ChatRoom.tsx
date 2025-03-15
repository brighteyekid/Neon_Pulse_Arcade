import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPaperPlane, FaSignOutAlt, FaUsers, FaVolumeUp, FaVolumeMute, FaTrophy, FaPhoneAlt, FaPhoneSlash, FaHeadset, FaImage, FaPaperclip, FaReply, FaTimes } from 'react-icons/fa';
import { useChatContext } from '../context/ChatContext';
import MessageList from './MessageList';
import UserList from './UserList';
import WebRTCService from '../services/WebRTCService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import AudioLobby from './AudioLobby';
import MediaShare from './MediaShare';
import './ChatRoom.css';
import { Message, User } from '../types';

const ChatRoom: React.FC = () => {
  const { messages, users, currentUser, sendMessage, leaveChat } = useChatContext();
  const [newMessage, setNewMessage] = useState('');
  const [showUsers, setShowUsers] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callPartner, setCallPartner] = useState<string | null>(null);
  const [showIncomingCall, setShowIncomingCall] = useState(false);
  const [incomingCallInfo, setIncomingCallInfo] = useState<{callId: string, callerId: string, callerName: string} | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [typingEffect, setTypingEffect] = useState('');
  const roomTitle = "ARCADE CHAT ZONE";
  const webRTCServiceRef = useRef<WebRTCService | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [showAudioLobby, setShowAudioLobby] = useState(false);
  const [showMediaShare, setShowMediaShare] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    username: string;
    text: string;
  } | null>(null);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionResults, setMentionResults] = useState<User[]>([]);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const mentionSuggestionsRef = useRef<HTMLDivElement>(null);

  // Initialize WebRTC service
  useEffect(() => {
    if (currentUser) {
      webRTCServiceRef.current = new WebRTCService(
        currentUser.id,
        (status) => {
          if (status === 'disconnected') {
            setInCall(false);
            setCallPartner(null);
          } else {
            setInCall(true);
            
            // Connect remote stream to audio element
            const remoteStream = webRTCServiceRef.current?.getRemoteStream();
            if (remoteStream && remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = remoteStream;
            }
          }
        }
      );
      
      // Listen for incoming calls
      const unsubscribe = webRTCServiceRef.current.listenForIncomingCalls(
        (callId, callerId, callerName) => {
          setIncomingCallInfo({ callId, callerId, callerName });
          setShowIncomingCall(true);
          
          // Play ringtone if not muted
          if (!muted) {
            const audio = new Audio('/incoming-call.mp3');
            audio.loop = true;
            audio.volume = 0.3;
            audio.play().catch(e => console.log('Audio play failed:', e));
            
            // Store audio reference to stop it later
            (window as any).incomingCallAudio = audio;
          }
        }
      );
      
      return () => {
        unsubscribe();
        if (webRTCServiceRef.current) {
          webRTCServiceRef.current.endCall();
        }
      };
    }
  }, [currentUser]);

  // Typing effect for the header
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setTypingEffect(roomTitle.substring(0, index));
      index = (index + 1) % (roomTitle.length + 1);
      if (index === 0) {
        // Pause at the end before restarting
        clearInterval(interval);
        setTimeout(() => {
          const newInterval = setInterval(() => {
            setTypingEffect(roomTitle.substring(0, index));
            index = (index + 1) % (roomTitle.length + 1);
            if (index === 0) {
              clearInterval(newInterval);
            }
          }, 150);
        }, 2000);
      }
    }, 150);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      sendMessage(newMessage, replyingTo || undefined);
      setNewMessage('');
      setReplyingTo(null);
      
      // Play message sent sound directly
      if (!muted) {
        try {
          const audio = new Audio('/message-sent.mp3');
          audio.volume = 0.3;
          audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (error) {
          console.error('Error playing message sound:', error);
        }
      }
    }
  };

  const toggleMute = () => {
    setMuted(!muted);
  };

  const toggleScoreboard = () => {
    setShowScoreboard(!showScoreboard);
  };

  const handleCallUser = async (username: string, userId: string) => {
    if (inCall || !webRTCServiceRef.current || !currentUser) return;
    
    try {
      setCallPartner(username);
      await webRTCServiceRef.current.callUser(userId);
      setInCall(true);
      
      // Play sound effect when sending message
      if (!muted) {
        try {
          const audio = new Audio('/call-start.mp3');
          audio.volume = 0.3;
          audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (error) {
          console.error('Error playing call start sound:', error);
        }
      }
    } catch (error) {
      console.error('Failed to start call:', error);
      setCallPartner(null);
      setInCall(false);
      
      // Show error message
      alert('Failed to start call. Please check your microphone permissions.');
    }
  };

  const handleEndCall = async () => {
    if (webRTCServiceRef.current) {
      await webRTCServiceRef.current.endCall();
      setInCall(false);
      setCallPartner(null);
      
      // Play sound effect when ending call
      if (!muted) {
        try {
          const audio = new Audio('/call-end.mp3');
          audio.volume = 0.3;
          audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (error) {
          console.error('Error playing call end sound:', error);
        }
      }
    }
  };

  const handleAcceptCall = async () => {
    if (!webRTCServiceRef.current || !incomingCallInfo) return;
    
    try {
      // Stop ringtone
      if ((window as any).incomingCallAudio) {
        (window as any).incomingCallAudio.pause();
        (window as any).incomingCallAudio = null;
      }
      
      setShowIncomingCall(false);
      setCallPartner(incomingCallInfo.callerName);
      
      await webRTCServiceRef.current.answerCall(
        incomingCallInfo.callId,
        incomingCallInfo.callerId
      );
      
      setInCall(true);
      setIncomingCallInfo(null);
      
      // Play sound effect when accepting call
      if (!muted) {
        try {
          const audio = new Audio('/call-accept.mp3');
          audio.volume = 0.3;
          audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (error) {
          console.error('Error playing call accept sound:', error);
        }
      }
    } catch (error) {
      console.error('Failed to accept call:', error);
      setShowIncomingCall(false);
      setIncomingCallInfo(null);
      
      // Show error message
      alert('Failed to accept call. Please check your microphone permissions.');
    }
  };

  const handleRejectCall = async () => {
    if (!webRTCServiceRef.current || !incomingCallInfo) return;
    
    // Stop ringtone
    if ((window as any).incomingCallAudio) {
      (window as any).incomingCallAudio.pause();
      (window as any).incomingCallAudio = null;
    }
    
    await webRTCServiceRef.current.rejectCall(incomingCallInfo.callId);
    setShowIncomingCall(false);
    setIncomingCallInfo(null);
    
    // Play sound effect when rejecting call
    if (!muted) {
      try {
        const audio = new Audio('/call-reject.mp3');
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Audio play failed:', e));
      } catch (error) {
        console.error('Error playing call reject sound:', error);
      }
    }
  };

  const handleLeave = () => {
    if (inCall && webRTCServiceRef.current) {
      webRTCServiceRef.current.endCall();
    }
    
    // Play sound effect when leaving chat
    if (!muted) {
      try {
        const audio = new Audio('/game-over.mp3');
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Audio play failed:', e));
      } catch (error) {
        console.error('Error playing game over sound:', error);
      }
    }
    
    // Add a small delay before actually leaving
    setTimeout(() => {
      leaveChat();
    }, 500);
  };

  const toggleAudioLobby = () => {
    setShowAudioLobby(!showAudioLobby);
  };

  const toggleMediaShare = () => {
    setShowMediaShare(!showMediaShare);
  };

  const handleReply = (message: Message) => {
    setReplyingTo({
      id: message.id,
      username: message.username,
      text: message.text
    });
    inputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);
    
    // Get cursor position
    const cursorPos = e.target.selectionStart || 0;
    setCursorPosition(cursorPos);
    
    // Check if we're in the middle of typing a mention
    const textBeforeCursor = value.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      const searchTerm = mentionMatch[1].toLowerCase();
      setMentionSearch(searchTerm);
      
      // Filter users based on the search term
      if (users && users.length > 0) {
        const filteredUsers = users.filter(user => 
          user.username.toLowerCase().includes(searchTerm) && 
          user.username !== currentUser?.username
        );
        
        setMentionResults(filteredUsers);
        setShowMentionSuggestions(filteredUsers.length > 0);
      } else {
        setMentionResults([]);
        setShowMentionSuggestions(false);
      }
    } else {
      setShowMentionSuggestions(false);
    }
  };

  const handleMentionSelect = (username: string) => {
    // Replace the partial mention with the full username
    const textBeforeCursor = newMessage.substring(0, cursorPosition);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      const startPos = textBeforeCursor.lastIndexOf('@') + 1;
      const newText = 
        newMessage.substring(0, startPos - 1) + 
        `@${username} ` + 
        newMessage.substring(cursorPosition);
      
      setNewMessage(newText);
      setShowMentionSuggestions(false);
      
      // Focus back on input and set cursor position after the inserted mention
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const newCursorPos = startPos + username.length + 1;
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mentionSuggestionsRef.current && 
        !mentionSuggestionsRef.current.contains(event.target as Node)
      ) {
        setShowMentionSuggestions(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Update the useEffect for playing join sound
  useEffect(() => {
    // Check if this is a new join from the login page
    const isNewJoin = sessionStorage.getItem('newJoin') === 'true';
    
    if (isNewJoin && currentUser) {
      // Clear the flag
      sessionStorage.removeItem('newJoin');
      
      // Check if there's already a join sound playing from the Login component
      const existingAudio = (window as any).joinSoundAudio;
      
      // If no audio is playing from Login, play it here
      if (!existingAudio && !muted) {
        try {
          const audio = new Audio('/join-sound.mp3');
          audio.volume = 0.5;
          
          // Store the audio reference globally
          (window as any).joinSoundAudio = audio;
          
          // Play the sound
          audio.play().catch(e => console.log('Audio play failed:', e));
          
          // Clean up the audio reference after it finishes
          audio.onended = () => {
            (window as any).joinSoundAudio = null;
          };
        } catch (error) {
          console.error('Error playing join sound:', error);
        }
      }
    }
    
    // Clean up function
    return () => {
      // If component unmounts, clean up the audio
      if ((window as any).joinSoundAudio) {
        try {
          (window as any).joinSoundAudio.pause();
          (window as any).joinSoundAudio = null;
        } catch (error) {
          console.error('Error cleaning up join sound:', error);
        }
      }
    };
  }, [currentUser, muted]);

  return (
    <>
      <div className="scanlines"></div>
      <div className="pixel-stars"></div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col h-screen bg-primary chat-background"
      >
        {/* Hidden audio element for remote stream */}
        <audio ref={remoteAudioRef} autoPlay playsInline />
        
        {/* Header */}
        <div className="p-4 flex justify-between items-center header">
          <h1 className="text-xl font-bold text-accent-yellow">
            {typingEffect}
            <span style={{ opacity: Math.random() > 0.5 ? 1 : 0 }}>_</span>
          </h1>
          <div className="flex space-x-2">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="btn-icon retro-button-small"
              onClick={toggleMute}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <FaVolumeMute /> : <FaVolumeUp />}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="btn-icon retro-button-small"
              onClick={toggleScoreboard}
              title="High Scores"
            >
              <FaTrophy />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="btn-icon retro-button-small"
              onClick={() => setShowUsers(!showUsers)}
              title="Players"
            >
              <FaUsers />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="btn-icon retro-button-danger"
              onClick={handleLeave}
              title="Leave Chat"
            >
              <FaSignOutAlt />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="btn-icon retro-button"
              onClick={toggleAudioLobby}
              title="Audio Lobbies"
            >
              <FaHeadset />
            </motion.button>
          </div>
        </div>
        
        {/* Call notification */}
        <AnimatePresence>
          {inCall && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="call-notification"
            >
              <div className="call-info">
                <div className="call-status">
                  <span className="call-pulse"></span>
                  VOICE CALL ACTIVE
                </div>
                <div className="call-partner">
                  WITH: {callPartner}
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="btn-icon retro-button-danger"
                onClick={handleEndCall}
                title="End Call"
              >
                <FaPhoneSlash />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Incoming call modal */}
        <AnimatePresence>
          {showIncomingCall && incomingCallInfo && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="incoming-call-overlay"
            >
              <motion.div 
                className="incoming-call-modal"
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.8 }}
              >
                <h2 className="incoming-call-title">INCOMING CALL</h2>
                <div className="incoming-call-from">
                  FROM: {incomingCallInfo.callerName}
                </div>
                <div className="incoming-call-animation">
                  <div className="call-ring"></div>
                  <div className="call-ring"></div>
                  <div className="call-ring"></div>
                </div>
                <div className="incoming-call-actions">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="btn retro-button-accept"
                    onClick={handleAcceptCall}
                  >
                    <FaPhoneAlt /> ACCEPT
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="btn retro-button-reject"
                    onClick={handleRejectCall}
                  >
                    <FaPhoneSlash /> REJECT
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Chat area */}
          <div className="flex-1 flex flex-col">
            <MessageList muted={muted} onReply={handleReply} />
            
            {/* Message input */}
            <form onSubmit={handleSubmit} className="p-4 chat-input-container">
              {replyingTo && (
                <div className="reply-preview">
                  <div className="reply-preview-content">
                    <FaReply className="reply-preview-icon" />
                    <div className="reply-preview-text">
                      <span className="reply-preview-username">@{replyingTo.username}</span>
                      <span className="reply-preview-message">{replyingTo.text.length > 30 ? replyingTo.text.substring(0, 30) + '...' : replyingTo.text}</span>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    className="reply-preview-cancel"
                    onClick={cancelReply}
                  >
                    <FaTimes />
                  </button>
                </div>
              )}
              <div className="flex space-x-2 relative">
                <input
                  type="text"
                  value={newMessage}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    // Handle keyboard navigation in mention suggestions
                    if (showMentionSuggestions && mentionResults.length > 0) {
                      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        // Navigation logic would go here
                      } else if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        handleMentionSelect(mentionResults[0].username);
                      } else if (e.key === 'Escape') {
                        setShowMentionSuggestions(false);
                      }
                    }
                  }}
                  placeholder={replyingTo ? `Reply to ${replyingTo.username}...` : "TYPE YOUR MESSAGE..."}
                  className="input flex-1 retro-input"
                  ref={inputRef}
                />
                
                {/* Mention suggestions */}
                {showMentionSuggestions && mentionResults.length > 0 && (
                  <div 
                    className="mention-suggestions" 
                    ref={mentionSuggestionsRef}
                  >
                    {mentionResults.slice(0, 5).map(user => (
                      <div 
                        key={user.id}
                        className="mention-suggestion-item"
                        onClick={() => handleMentionSelect(user.username)}
                      >
                        <div className="mention-avatar">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="mention-username">
                          {user.username}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  className="btn-icon retro-button-small"
                  onClick={toggleMediaShare}
                  title="Share Media"
                >
                  <FaPaperclip />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="submit"
                  className="btn-icon retro-button-send"
                >
                  <FaPaperPlane />
                </motion.button>
              </div>
            </form>
          </div>
          
          {/* User list */}
          <AnimatePresence>
            {showUsers && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 250, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="user-list"
              >
                <UserList onCallUser={handleCallUser} inCall={inCall} />
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Scoreboard overlay */}
          <AnimatePresence>
            {showScoreboard && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="scoreboard-overlay"
                onClick={() => setShowScoreboard(false)}
              >
                <motion.div 
                  className="scoreboard-content"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.8 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2 className="text-center mb-4 text-accent-yellow">HIGH SCORES</h2>
                  <div className="scoreboard-list">
                    <div className="scoreboard-item">
                      <span>1. PACMAN</span>
                      <span>9999</span>
                    </div>
                    <div className="scoreboard-item">
                      <span>2. MARIO</span>
                      <span>8888</span>
                    </div>
                    <div className="scoreboard-item">
                      <span>3. SONIC</span>
                      <span>7777</span>
                    </div>
                    <div className="scoreboard-item">
                      <span>4. LINK</span>
                      <span>6666</span>
                    </div>
                    <div className="scoreboard-item">
                      <span>5. SAMUS</span>
                      <span>5555</span>
                    </div>
                    {currentUser && (
                      <div className="scoreboard-item scoreboard-player">
                        <span>?. {currentUser.username}</span>
                        <span>{currentUser.score || 0}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-center mt-4">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowScoreboard(false)}
                      className="btn retro-button-small"
                    >
                      CLOSE
                    </motion.button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Player status bar */}
        <div className="status-bar">
          <div className="player-info">
            <span className="player-label">PLAYER:</span>
            <span className="player-value">{currentUser?.username}</span>
          </div>
          <div className="player-info">
            <span className="player-label">LEVEL:</span>
            <span className="player-value">{currentUser?.level || 1}</span>
          </div>
          <div className="player-info">
            <span className="player-label">SCORE:</span>
            <span className="player-value">{currentUser?.score || 0}</span>
          </div>
          <div className="player-info">
            <span className="player-label">LIVES:</span>
            <span className="player-value">{currentUser?.lives || 3}</span>
          </div>
        </div>
      </motion.div>
      
      {/* Audio lobby overlay */}
      <AnimatePresence>
        {showAudioLobby && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="audio-lobby-overlay"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="audio-lobby-modal"
            >
              <AudioLobby onClose={() => setShowAudioLobby(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Media share overlay */}
      <AnimatePresence>
        {showMediaShare && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="media-share-overlay"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="media-share-modal"
            >
              <MediaShare 
                onClose={() => setShowMediaShare(false)} 
                replyTo={replyingTo}
                onReplyCancel={cancelReply}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChatRoom; 