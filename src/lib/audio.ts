export const SOUNDS = {
  correct: 'https://stonekit.com/sfx/coin.mp3',
  incorrect: 'https://stonekit.com/sfx/buzz.mp3',
  purchase: 'https://stonekit.com/sfx/register.mp3',
  busted: 'https://stonekit.com/sfx/siren.mp3',
  victory: 'https://stonekit.com/sfx/fanfare.mp3',
};

let isMuted = false;

export const setMuted = (muted: boolean) => {
  isMuted = muted;
};

export const getMuted = () => isMuted;

export const playSound = (effectName: keyof typeof SOUNDS) => {
  if (isMuted) return;
  
  const audio = new Audio(SOUNDS[effectName]);
  // Clone the node or just create a new Audio object to allow overlapping
  audio.play().catch(err => {
    // Ignore autoplay errors if user hasn't interacted with the document yet
    console.warn('Audio play failed:', err);
  });
};
