import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import './BootSplash.css';

interface BootSplashProps {
  onComplete: () => void;
}

const BootSplash: React.FC<BootSplashProps> = ({ onComplete }) => {
  const [bootPhase, setBootPhase] = useState(0);
  const [loadingText, setLoadingText] = useState('');
  const [typedTitle, setTypedTitle] = useState('');
  const [progress, setProgress] = useState(0);
  const [showFinalScreen, setShowFinalScreen] = useState(false);
  const appName = "NEON PULSE ARCADE";
  const tagline = "WHERE RETRO MEETS REALITY";
  
  // Boot sequence text
  const bootSequence = [
    "INITIALIZING SYSTEM...",
    "LOADING GRAPHICS ENGINE...",
    "CONNECTING TO NETWORK...",
    "CALIBRATING PIXEL MATRIX...",
    "ACTIVATING SOUND MODULES...",
    "SYNCHRONIZING TIME CIRCUITS...",
    "LOADING USER INTERFACE...",
    "SYSTEM READY!"
  ];

  // Handle key press to complete boot
  const handleKeyPress = useCallback(() => {
    if (showFinalScreen) {
      // Play enter sound
      try {
        const enterSound = new Audio('/enter-sound.mp3');
        enterSound.volume = 0.4;
        enterSound.play().catch(e => console.log('Enter sound failed:', e));
      } catch (error) {
        console.error('Error playing enter sound:', error);
      }
      
      setTimeout(() => {
        console.log("Completing boot splash");
        onComplete();
      }, 500);
    }
  }, [showFinalScreen, onComplete]);
  
  // Add key press listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('click', handleKeyPress);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('click', handleKeyPress);
    };
  }, [handleKeyPress]);

  // Play boot sound on initial render
  useEffect(() => {
    try {
      const bootSound = new Audio('/boot-sound.mp3');
      bootSound.volume = 0.5;
      bootSound.play().catch(e => console.log('Audio play failed:', e));
      
      return () => {
        bootSound.pause();
      };
    } catch (error) {
      console.error('Error playing boot sound:', error);
    }
  }, []);
  
  // Force progress if stuck
  useEffect(() => {
    // Safety timeout - if boot sequence doesn't progress within 10 seconds, show final screen
    const safetyTimeout = setTimeout(() => {
      if (!showFinalScreen && progress < 100) {
        console.log("Boot sequence taking too long, forcing completion");
        setProgress(100);
        setBootPhase(bootSequence.length);
        setShowFinalScreen(true);
      }
    }, 10000);
    
    return () => clearTimeout(safetyTimeout);
  }, [showFinalScreen, progress, bootSequence.length]);
  
  // Typing effect for loading text
  useEffect(() => {
    if (bootPhase < bootSequence.length) {
      console.log(`Starting boot phase ${bootPhase}: ${bootSequence[bootPhase]}`);
      let currentText = '';
      const textToType = bootSequence[bootPhase];
      let charIndex = 0;
      
      const typingInterval = setInterval(() => {
        if (charIndex < textToType.length) {
          currentText += textToType.charAt(charIndex);
          setLoadingText(currentText);
          charIndex++;
          
          // Update progress based on overall completion
          const totalChars = bootSequence.reduce((sum, text) => sum + text.length, 0);
          const charsTyped = bootSequence.slice(0, bootPhase).reduce((sum, text) => sum + text.length, 0) + charIndex;
          const newProgress = Math.floor((charsTyped / totalChars) * 100);
          setProgress(newProgress);
          console.log(`Progress: ${newProgress}%`);
        } else {
          clearInterval(typingInterval);
          
          // Move to next phase after a delay
          setTimeout(() => {
            setBootPhase(prev => prev + 1);
          }, 500);
        }
      }, 40);
      
      return () => clearInterval(typingInterval);
    } else if (bootPhase === bootSequence.length) {
      // Complete the progress bar
      setProgress(100);
      console.log("Boot sequence complete, showing final screen");
      
      // Play completion sound
      try {
        const completeSound = new Audio('/boot-complete.mp3');
        completeSound.volume = 0.4;
        completeSound.play().catch(e => console.log('Complete sound failed:', e));
      } catch (error) {
        console.error('Error playing complete sound:', error);
      }
      
      // Start typing the title after a delay
      setTimeout(() => {
        setShowFinalScreen(true);
        let titleIndex = 0;
        
        const titleInterval = setInterval(() => {
          if (titleIndex < appName.length) {
            setTypedTitle(appName.substring(0, titleIndex + 1));
            titleIndex++;
          } else {
            clearInterval(titleInterval);
          }
        }, 100);
        
        return () => clearInterval(titleInterval);
      }, 1000);
    }
  }, [bootPhase, bootSequence]);
  
  // Debug button to force completion (for development)
  const forceComplete = () => {
    console.log("Forcing boot completion");
    setBootPhase(bootSequence.length);
    setProgress(100);
    setShowFinalScreen(true);
  };
  
  return (
    <div className="boot-splash" onClick={showFinalScreen ? handleKeyPress : undefined}>
      <div className="boot-splash-content">
        {!showFinalScreen ? (
          <>
            <div className="boot-splash-terminal">
              <div className="boot-splash-terminal-header">
                <div className="boot-splash-terminal-title">SYSTEM BOOT</div>
                <div className="boot-splash-terminal-controls">
                  <span className="boot-splash-terminal-control"></span>
                  <span className="boot-splash-terminal-control"></span>
                  <span className="boot-splash-terminal-control"></span>
                </div>
              </div>
              <div className="boot-splash-terminal-body">
                {bootSequence.slice(0, bootPhase).map((text, index) => (
                  <div key={index} className="boot-splash-terminal-line">
                    <span className="boot-splash-terminal-prompt">&gt;</span> {text}
                    <span className="boot-splash-terminal-success"> [OK]</span>
                  </div>
                ))}
                
                {bootPhase < bootSequence.length && (
                  <div className="boot-splash-terminal-line">
                    <span className="boot-splash-terminal-prompt">&gt;</span> {loadingText}
                    <span className="boot-splash-terminal-cursor">_</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="boot-splash-progress-container">
              <div 
                className="boot-splash-progress-bar"
                style={{ width: `${progress}%` }}
              ></div>
              <div className="boot-splash-progress-text">{progress}%</div>
            </div>
            
            {/* Emergency skip button - only visible in development */}
            {process.env.NODE_ENV === 'development' && (
              <button 
                onClick={forceComplete}
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  right: '10px',
                  background: 'red',
                  color: 'white',
                  border: 'none',
                  padding: '5px 10px',
                  cursor: 'pointer'
                }}
              >
                Skip Boot
              </button>
            )}
          </>
        ) : (
          <motion.div 
            className="boot-splash-title-container"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="boot-splash-title">{typedTitle}</h1>
            <p className="boot-splash-tagline">{tagline}</p>
            
            <motion.div 
              className="boot-splash-logo"
              animate={{ 
                rotate: [0, 5, 0, -5, 0],
                scale: [1, 1.05, 1, 1.05, 1]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                repeatType: "loop"
              }}
            >
              <div className="boot-splash-logo-inner"></div>
            </motion.div>
            
            <motion.p 
              className="boot-splash-enter"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              PRESS ANY KEY TO CONTINUE
            </motion.p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default BootSplash; 