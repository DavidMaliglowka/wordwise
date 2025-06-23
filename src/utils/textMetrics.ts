import { syllable } from 'syllable';

export interface TextMetrics {
  wordCount: number;
  characterCount: number;
  sentenceCount: number;
  averageWordsPerSentence: number;
  fleschKincaidGrade: number;
  readingTimeMinutes: number;
  readingTimeSeconds: number;
  speakingTimeMinutes: number;
  speakingTimeSeconds: number;
}

export interface TimeDisplay {
  minutes: number;
  seconds: number;
  display: string;
}

/**
 * Calculate comprehensive text metrics including readability scores
 */
export function calculateTextMetrics(text: string): TextMetrics {
  // Basic counts
  const characterCount = text.length;
  const words = text.trim().split(/\s+/).filter(word => word.length > 0);
  const wordCount = words.length;

  // Sentence counting - split by periods, exclamation marks, question marks
  const sentences = text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0);
  const sentenceCount = Math.max(sentences.length, 1); // Avoid division by zero

  // Average words per sentence
  const averageWordsPerSentence = wordCount / sentenceCount;

  // Calculate syllables for all words
  const totalSyllables = words.reduce((total, word) => {
    // Remove punctuation from word before syllable counting
    const cleanWord = word.replace(/[^a-zA-Z]/g, '');
    return total + (cleanWord.length > 0 ? syllable(cleanWord) : 0);
  }, 0);

  // Flesch-Kincaid Grade Level (rounded down to nearest integer)
  // Formula: 0.39 × (words/sentences) + 11.8 × (syllables/words) - 15.59
  const fleschKincaidGrade = wordCount > 0 && sentenceCount > 0
    ? Math.max(2, Math.floor(0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / wordCount) - 15.59))
    : 2;

  // Reading time (275 words per minute for silent reading)
  const readingTimeTotal = wordCount / 275;
  const readingTimeMinutes = Math.floor(readingTimeTotal);
  const readingTimeSeconds = Math.round((readingTimeTotal - readingTimeMinutes) * 60);

  // Speaking time (180 words per minute for speaking)
  const speakingTimeTotal = wordCount / 180;
  const speakingTimeMinutes = Math.floor(speakingTimeTotal);
  const speakingTimeSeconds = Math.round((speakingTimeTotal - speakingTimeMinutes) * 60);

  return {
    wordCount,
    characterCount,
    sentenceCount,
    averageWordsPerSentence,
    fleschKincaidGrade: Math.max(0, fleschKincaidGrade), // Don't allow negative grades
    readingTimeMinutes,
    readingTimeSeconds,
    speakingTimeMinutes,
    speakingTimeSeconds,
  };
}

/**
 * Format time display for reading/speaking time
 */
export function formatTime(minutes: number, seconds: number): TimeDisplay {
  const totalSeconds = minutes * 60 + seconds;

  if (totalSeconds < 60) {
    return {
      minutes: 0,
      seconds: totalSeconds,
      display: `${totalSeconds}s`
    };
  } else if (totalSeconds < 3600) {
    return {
      minutes,
      seconds,
      display: seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
    };
  } else {
    const hours = Math.floor(totalSeconds / 3600);
    const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);
    return {
      minutes: remainingMinutes,
      seconds: totalSeconds % 60,
      display: `${hours}h ${remainingMinutes}m`
    };
  }
}

/**
 * Get grade level description for Flesch-Kincaid score
 */
export function getGradeLevelDescription(grade: number): string {
  if (grade <= 5) return 'Elementary';
  if (grade <= 8) return 'Middle School';
  if (grade <= 12) return 'High School';
  if (grade <= 16) return 'College';
  return 'Graduate';
}
