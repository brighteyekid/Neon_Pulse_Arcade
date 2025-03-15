import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatContext } from '../context/ChatContext';
import { Reaction } from '../types';
import './MessageReactions.css';

interface MessageReactionsProps {
  messageId: string;
  reactions: Reaction[];
}

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎮', '🚀'];

const MessageReactions: React.FC<MessageReactionsProps> = ({ messageId, reactions = [] }) => {
  const { currentUser, addReaction } = useChatContext();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const handleReactionClick = (emoji: string) => {
    if (currentUser) {
      addReaction(messageId, emoji);
      setShowEmojiPicker(false);
    }
  };
  
  const toggleEmojiPicker = () => {
    setShowEmojiPicker(!showEmojiPicker);
  };
  
  // Group reactions by emoji
  const groupedReactions: { [key: string]: Reaction[] } = {};
  reactions.forEach(reaction => {
    if (!groupedReactions[reaction.emoji]) {
      groupedReactions[reaction.emoji] = [];
    }
    groupedReactions[reaction.emoji].push(reaction);
  });
  
  return (
    <div className="message-reactions-container">
      {/* Display existing reactions */}
      <div className="message-reactions">
        {Object.entries(groupedReactions).map(([emoji, reactions]) => (
          <div 
            key={emoji} 
            className="reaction-badge"
            onClick={() => handleReactionClick(emoji)}
            title={reactions.map(r => r.username).join(', ')}
          >
            <span className="reaction-emoji">{emoji}</span>
            <span className="reaction-count">{reactions.length}</span>
          </div>
        ))}
        
        {/* Add reaction button */}
        <button 
          className="add-reaction-button"
          onClick={toggleEmojiPicker}
          aria-label="Add reaction"
        >
          +
        </button>
      </div>
      
      {/* Emoji picker */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div 
            className="emoji-picker"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            {EMOJI_OPTIONS.map(emoji => (
              <button
                key={emoji}
                className="emoji-option"
                onClick={() => handleReactionClick(emoji)}
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MessageReactions;