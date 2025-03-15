import React from 'react';
import { motion } from 'framer-motion';
import { FaUser, FaCrown, FaGamepad, FaStar, FaPhoneAlt } from 'react-icons/fa';
import { useChatContext } from '../context/ChatContext';
import './UserList.css';

interface UserListProps {
  onCallUser?: (username: string, userId: string) => void;
  inCall?: boolean;
}

const UserList: React.FC<UserListProps> = ({ onCallUser, inCall = false }) => {
  const { users, currentUser } = useChatContext();

  // Get time since user joined
  const getTimeOnline = (joinedAt?: number) => {
    if (!joinedAt) return 'Unknown';
    
    const seconds = Math.floor((Date.now() - joinedAt) / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  return (
    <div className="user-list-container">
      <h2 className="user-list-title">
        <FaGamepad className="user-list-icon" />
        PLAYERS ONLINE ({users.length})
      </h2>
      
      <div className="user-list-items">
        {users.map((user) => {
          const isCurrentUser = user.id === currentUser?.id;
          
          return (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`user-item ${isCurrentUser ? 'user-item-current' : ''}`}
            >
              <div className="user-item-avatar">
                {isCurrentUser ? <FaCrown /> : <FaUser />}
              </div>
              <div className="user-item-info">
                <div className="user-item-name">
                  {user.username}
                  {isCurrentUser && ' (YOU)'}
                </div>
                <div className="user-item-stats">
                  <span className="user-item-level">
                    LVL {user.level || 1}
                  </span>
                  {user.score !== undefined && (
                    <span className="user-item-score">
                      <FaStar className="score-icon" /> {user.score}
                    </span>
                  )}
                </div>
                <div className="user-item-time">
                  TIME: {getTimeOnline(user.joinedAt)}
                </div>
              </div>
              {!isCurrentUser && onCallUser && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className={`call-button ${inCall ? 'call-disabled' : ''}`}
                  onClick={() => !inCall && onCallUser(user.username, user.id)}
                  disabled={inCall}
                  title={inCall ? "Already in a call" : `Call ${user.username}`}
                >
                  <FaPhoneAlt />
                </motion.button>
              )}
              <div className="user-item-status">
                <div className="user-status-indicator"></div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default UserList; 