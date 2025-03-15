import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaUserAlt } from 'react-icons/fa';
import { useChatContext } from '../context/ChatContext';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [typedTitle, setTypedTitle] = useState('');
  const [titleColor, setTitleColor] = useState(0);
  const [playersOnline, setPlayersOnline] = useState(0);
  const fullTitle = "RETRO CHAT ARCADE";
  const { joinChat } = useChatContext();
  
  // Colors for the title animation
  const colors = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'];

  // Set players online count once on component mount
  useEffect(() => {
    // Generate a random number between 5 and 24 for players online
    setPlayersOnline(Math.floor(Math.random() * 20) + 5);
  }, []);

  // Typing effect for the title
  useEffect(() => {
    if (typedTitle.length < fullTitle.length) {
      const timeout = setTimeout(() => {
        setTypedTitle(fullTitle.substring(0, typedTitle.length + 1));
      }, 150);
      return () => clearTimeout(timeout);
    }
  }, [typedTitle]);

  // Color cycling effect for the title
  useEffect(() => {
    const interval = setInterval(() => {
      setTitleColor((prev) => (prev + 1) % colors.length);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setTypedTitle('');
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      // Store the username in session storage to indicate this is a new join
      sessionStorage.setItem('newJoin', 'true');
      
      // Play join sound directly
      try {
        const audio = new Audio('/join-sound.mp3');
        audio.volume = 0.5;
        
        // Store the audio reference globally so it continues playing during navigation
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
      
      // Wait for a moment before redirecting to give the sound time to start
      setTimeout(() => {
        joinChat(username.trim());
      }, 500);
    }
  };

  return (
    <>
      <div className="scanlines"></div>
      <div className="pixel-stars"></div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center min-h-screen p-4 bg-primary login-background"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="card max-w-md w-full retro-card"
        >
          <motion.h1 
            className="text-center mb-6"
            style={{ color: colors[titleColor] }}
            animate={{ 
              textShadow: [
                `0 0 7px ${colors[titleColor]}`,
                `0 0 10px ${colors[titleColor]}`,
                `0 0 7px ${colors[titleColor]}`
              ]
            }}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            {typedTitle}
            <span style={{ opacity: Math.random() > 0.5 ? 1 : 0 }}>_</span>
          </motion.h1>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <FaUserAlt className="absolute left-3 top-1/2 transform text-yellow-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="PLAYER NAME"
                className="input pl-10 pr-4 retro-input"
                required
                autoFocus
              />
            </div>
            
            <motion.button
              whileHover={{ 
                scale: 1.05, 
                boxShadow: "0 0 15px rgba(255, 204, 0, 0.8)" 
              }}
              whileTap={{ 
                scale: 0.95,
                boxShadow: "0 0 5px rgba(255, 204, 0, 0.8)"
              }}
              type="submit"
              className="btn w-full retro-button"
            >
              START GAME
            </motion.button>
          </form>
          
          <div className="text-center mt-4 retro-info">
            <motion.p
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              INSERT COIN TO CONTINUE
            </motion.p>
            <p className="mt-1">PLAYERS ONLINE: {playersOnline}</p>
            <p className="mt-1">HIGH SCORE: 9999</p>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
};

export default Login; 