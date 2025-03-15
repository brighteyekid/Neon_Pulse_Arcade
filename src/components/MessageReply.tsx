import React from 'react';
import { FaReply } from 'react-icons/fa';
import './MessageReply.css';

interface MessageReplyProps {
  replyTo: {
    id: string;
    username: string;
    text: string;
  };
  onClick?: () => void;
}

const MessageReply: React.FC<MessageReplyProps> = ({ replyTo, onClick }) => {
  // Truncate long reply text
  const truncateText = (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="message-reply-container" onClick={onClick}>
      <div className="message-reply-indicator">
        <FaReply className="reply-icon" />
      </div>
      <div className="message-reply-content">
        <div className="message-reply-username">{replyTo.username}</div>
        <div className="message-reply-text">{truncateText(replyTo.text)}</div>
      </div>
    </div>
  );
};

export default MessageReply; 