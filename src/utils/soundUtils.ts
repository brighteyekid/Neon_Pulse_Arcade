// Basic sound utility functions
export const playSound = (soundPath: string, volume = 1.0): HTMLAudioElement | null => {
  try {
    const audio = new Audio(soundPath);
    audio.volume = volume;
    audio.play().catch(e => console.error('Error playing sound:', e));
    return audio;
  } catch (error) {
    console.error('Error creating audio:', error);
    return null;
  }
};

export const stopSound = (audio: HTMLAudioElement | null): void => {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
};

export const isSoundPlaying = (audio: HTMLAudioElement | null): boolean => {
  return !!audio && !audio.paused;
}; 