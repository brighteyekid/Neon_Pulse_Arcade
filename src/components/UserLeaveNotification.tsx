import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaSignOutAlt } from 'react-icons/fa';
import './UserLeaveNotification.css';

interface UserLeaveNotificationProps {
  username: string;
  onClose: () => void;
}

const UserLeaveNotification: React.FC<UserLeaveNotificationProps> = ({ username, onClose }) => {
  const [visible, setVisible] = useState(true);
  
  useEffect(() => {
    // Automatically close after 3 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 500); // Allow exit animation to complete
    }, 300);
    
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <AnimatePresence>
      {visible && (
        <motion.div 
          className="user-leave-notification"
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', damping: 15 }}
        >
          <div className="user-leave-icon">
            <FaSignOutAlt />
          </div>
          <div className="user-leave-content">
            <h3>PLAYER DISCONNECTED</h3>
            <p>{username} has left the arcade</p>
          </div>
          <motion.div 
            className="user-leave-progress"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: 3, ease: 'linear' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default UserLeaveNotification; 