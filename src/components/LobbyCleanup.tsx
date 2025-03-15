import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from 'framer-motion';
import './LobbyCleanup.css';

interface LobbyCleanupProps {
  onComplete: () => void;
  onCancel: () => void;
}

const LobbyCleanup: React.FC<LobbyCleanupProps> = ({ onComplete, onCancel }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing cleanup...');
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    const checkIfCleanupNeeded = async () => {
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        
        if (!usersSnapshot.empty) {
          console.log('Users found. Cleanup not needed.');
          onCancel();
          return;
        }
        
        runCleanup();
      } catch (error) {
        console.error('Error checking if cleanup needed:', error);
        onCancel();
      }
    };
    
    checkIfCleanupNeeded();
  }, [onCancel]);

  const runCleanup = async () => {
    setIsConfirming(false);
    
    try {
      setStatus('Starting cleanup process...');
      setProgress(10);
      
      setStatus('Deleting messages...');
      const messagesSnapshot = await getDocs(collection(db, 'messages'));
      let deletedCount = 0;
      const totalMessages = messagesSnapshot.size;
      
      if (totalMessages === 0) {
        setProgress(40);
      } else {
        for (const document of messagesSnapshot.docs) {
          await deleteDoc(doc(db, 'messages', document.id));
          deletedCount++;
          setProgress(10 + Math.floor((deletedCount / totalMessages) * 30));
        }
      }
      
      setStatus(`Deleted ${deletedCount} messages.`);
      setProgress(50);
      
      setStatus('Checking for any remaining user accounts...');
      const usersSnapshot = await getDocs(collection(db, 'users'));
      deletedCount = 0;
      const totalUsers = usersSnapshot.size;
      
      if (totalUsers === 0) {
        setProgress(80);
      } else {
        for (const document of usersSnapshot.docs) {
          await deleteDoc(doc(db, 'users', document.id));
          deletedCount++;
          setProgress(50 + Math.floor((deletedCount / totalUsers) * 30));
        }
      }
      
      setStatus(`Deleted ${deletedCount} user accounts.`);
      setProgress(90);
      
      setStatus('Cleaning up additional data...');
      
      setStatus('Lobby cleanup complete!');
      setProgress(100);
      
      setTimeout(() => onComplete(), 1000);
    } catch (error) {
      console.error('Error during lobby cleanup:', error);
      setError(`Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setProgress(100);
      
      setTimeout(() => onComplete(), 2000);
    }
  };

  return (
    <div className="lobby-cleanup-container">
      <motion.div 
        className="lobby-cleanup-card"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="lobby-cleanup-title">SYSTEM MAINTENANCE</h2>
        
        {error ? (
          <div className="lobby-cleanup-error">
            <p>{error}</p>
            <button 
              className="lobby-cleanup-button"
              onClick={onComplete}
            >
              CONTINUE
            </button>
          </div>
        ) : isConfirming ? (
          <div className="lobby-cleanup-confirm">
            <p>The chat room is empty. Cleaning up messages...</p>
            <div className="lobby-cleanup-buttons">
              <button 
                className="lobby-cleanup-button lobby-cleanup-button-confirm"
                onClick={runCleanup}
              >
                PROCEED
              </button>
              <button 
                className="lobby-cleanup-button lobby-cleanup-button-cancel"
                onClick={onCancel}
              >
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="lobby-cleanup-status">{status}</p>
            
            <div className="lobby-cleanup-progress-container">
              <div 
                className="lobby-cleanup-progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
            
            <p className="lobby-cleanup-percentage">{progress}%</p>
            
            {progress === 100 && (
              <motion.p
                className="lobby-cleanup-complete"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                ARCADE RESET COMPLETE
              </motion.p>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
};

export default LobbyCleanup; 