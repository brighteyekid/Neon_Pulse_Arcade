import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useChatContext } from '../context/ChatContext';
import './MessageList.css';
import { FaImage, FaVideo, FaFileAudio, FaSmile, FaReply } from 'react-icons/fa';
import MessageReactions from './MessageReactions';
import MessageReply from './MessageReply';
import { Message } from '../types';

interface MessageListProps {
  muted?: boolean;
  onReply?: (message: Message) => void;
}

const MessageList: React.FC<MessageListProps> = ({ muted = false, onReply }) => {
  const { messages, currentUser } = useChatContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    // Play sound for new message if not muted and not the first load
    if (messages.length > 0 && !muted) {
      const lastMessage = messages[messages.length - 1];
      // Only play sound for messages that aren't from the current user and aren't system messages
      if (lastMessage.username !== currentUser?.username && lastMessage.username !== 'System') {
        const audio = new Audio('/message-received.mp3');
        audio.volume = 0.2;
        audio.play().catch(e => console.log('Audio play failed:', e));
      }
    }
  }, [messages, muted, currentUser]);

  // Add this effect to play a sound when the current user is mentioned
  useEffect(() => {
    if (messages.length > 0 && !muted && currentUser) {
      const lastMessage = messages[messages.length - 1];
      
      // Check if the current user is mentioned in the last message
      const isMentioned = lastMessage.mentions?.includes(currentUser.username);
      
      // Play sound if the current user is mentioned and the message is not from the current user
      if (isMentioned && lastMessage.username !== currentUser.username) {
        const audio = new Audio('/mention-sound.mp3'); // Create a mention sound file
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Audio play failed:', e));
        
        // Also show a browser notification if supported
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('You were mentioned!', {
            body: `${lastMessage.username} mentioned you: ${lastMessage.text}`,
            icon: '/favicon.ico'
          });
        }
      }
    }
  }, [messages, muted, currentUser]);

  // Function to render media content
  const renderMediaContent = (message: Message) => {
    if (!message.mediaType || !message.mediaUrl) return null;
    
    // Check if the URL is a base64 string
    const isBase64 = message.mediaUrl.startsWith('data:');
    
    switch (message.mediaType) {
      case 'image':
        return (
          <div className="message-media">
            <img 
              src={message.mediaUrl} 
              alt="Shared image" 
              className="media-image"
              onClick={() => window.open(message.mediaUrl, '_blank')}
              onError={(e) => {
                // If image fails to load, show a fallback
                (e.target as HTMLImageElement).src = '/image-placeholder.png';
              }}
            />
          </div>
        );
      case 'video':
        return (
          <div className="message-media">
            {isBase64 ? (
              <video 
                src={message.mediaUrl} 
                controls 
                className="media-video"
                onError={(e) => {
                  // If video fails to load, show a message
                  const target = e.target as HTMLVideoElement;
                  target.outerHTML = '<div class="media-error">Video could not be loaded</div>';
                }}
              />
            ) : (
              <a 
                href={message.mediaUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="media-link"
              >
                View Video
              </a>
            )}
          </div>
        );
      case 'audio':
        return (
          <div className="message-media">
            {isBase64 ? (
              <audio 
                src={message.mediaUrl} 
                controls 
                className="media-audio"
                onError={(e) => {
                  // If audio fails to load, show a message
                  const target = e.target as HTMLAudioElement;
                  target.outerHTML = '<div class="media-error">Audio could not be loaded</div>';
                }}
              />
            ) : (
              <a 
                href={message.mediaUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="media-link"
              >
                Listen to Audio
              </a>
            )}
          </div>
        );
      case 'gif':
        return (
          <div className="message-media">
            <img 
              src={message.mediaUrl} 
              alt="GIF" 
              className="media-gif"
              onClick={() => window.open(message.mediaUrl, '_blank')}
              onError={(e) => {
                // If GIF fails to load, show a fallback
                (e.target as HTMLImageElement).src = '/gif-placeholder.png';
              }}
            />
          </div>
        );
      default:
        return null;
    }
  };

  // Function to get media icon
  const getMediaIcon = (mediaType?: string) => {
    if (!mediaType) return null;
    
    switch (mediaType) {
      case 'image':
        return <FaImage className="media-icon" />;
      case 'video':
        return <FaVideo className="media-icon" />;
      case 'audio':
        return <FaFileAudio className="media-icon" />;
      case 'gif':
        return <FaSmile className="media-icon" />;
      default:
        return null;
    }
  };

  // Function to scroll to a message by ID
  const scrollToMessage = (messageId: string) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Highlight the message briefly
      messageElement.classList.add('message-highlight');
      setTimeout(() => {
        messageElement.classList.remove('message-highlight');
      }, 2000);
    }
  };

  // Update the formatMessageText function to safely handle mentions
  const formatMessageText = (text: string, mentions?: string[]) => {
    if (!mentions || mentions.length === 0) {
      // If no mentions, just return the plain text
      return text;
    }
    
    try {
      // Replace @username with highlighted spans
      let formattedText = text;
      
      // Sort mentions by length (longest first) to avoid partial replacements
      const sortedMentions = [...mentions].sort((a, b) => b.length - a.length);
      
      sortedMentions.forEach(username => {
        // Use word boundary to ensure we match complete usernames
        const mentionRegex = new RegExp(`@(${username})\\b`, 'g');
        formattedText = formattedText.replace(
          mentionRegex, 
          '<span class="mention-highlight">@$1</span>'
        );
      });
      
      return (
        <span dangerouslySetInnerHTML={{ __html: formattedText }} />
      );
    } catch (error) {
      console.error('Error formatting message text:', error);
      return text; // Fallback to plain text if there's an error
    }
  };

  return (
    <div className="message-list">
      {messages.map((message) => {
        const isCurrentUser = currentUser?.username === message.username;
        const isSystem = message.username === 'System';
        
        return (
          <motion.div
            key={message.id}
            id={`message-${message.id}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`message-container ${isCurrentUser ? 'message-container-user' : ''}`}
          >
            <div
              className={`message ${
                isSystem
                  ? 'message-system'
                  : isCurrentUser
                  ? 'message-user'
                  : 'message-other'
              }`}
            >
              {/* Reply content if this message is a reply */}
              {message.replyTo && (
                <MessageReply 
                  replyTo={message.replyTo} 
                  onClick={() => scrollToMessage(message.replyTo!.id)}
                />
              )}
              
              {!isSystem && (
                <div className="message-username">
                  {message.username}
                </div>
              )}
              <div className="message-text">
                {message.mediaType && getMediaIcon(message.mediaType)}
                {formatMessageText(message.text, message.mentions)}
              </div>
              {renderMediaContent(message)}
              <div className="message-time">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              
              <div className="message-actions">
                {!isSystem && onReply && (
                  <button 
                    className="message-action-button reply-button"
                    onClick={() => onReply(message)}
                    title="Reply to this message"
                  >
                    <FaReply />
                  </button>
                )}
                
                {!isSystem && (
                  <MessageReactions 
                    messageId={message.id} 
                    reactions={message.reactions || []} 
                  />
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList; 