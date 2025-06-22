import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { TextMetrics, formatTime } from '../utils/textMetrics';

interface DocumentLengthDropdownProps {
  metrics: TextMetrics;
  className?: string;
}

interface EstimatedTimeDropdownProps {
  metrics: TextMetrics;
  className?: string;
}

interface ReadabilityTooltipProps {
  grade: number;
  className?: string;
}

type CountDisplay = 'words' | 'characters';
type TimeDisplay = 'reading' | 'speaking';

// Document Length Dropdown Component
export const DocumentLengthDropdown: React.FC<DocumentLengthDropdownProps> = ({
  metrics,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [display, setDisplay] = useState<CountDisplay>('words');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDisplay = (newDisplay: CountDisplay) => {
    setDisplay(newDisplay);
    setIsOpen(false);
  };

  const currentValue = display === 'words' ? metrics.wordCount : metrics.characterCount;
  const currentLabel = display === 'words' ? 'words' : 'characters';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-sm text-gray-600 hover:text-gray-800 transition-colors"
      >
        <span>{currentValue.toLocaleString()} {currentLabel}</span>
        <ChevronDown className={`w-3 h-3 ml-1 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

            {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-[180px]">
          <div className="p-3">
            <div className="text-xs font-medium text-gray-500 mb-2">Document Length</div>

            <div className="space-y-1">
              <button
                onClick={() => toggleDisplay('words')}
                className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                  display === 'words'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span>Words</span>
                  <span className="text-xs font-mono ml-4">{metrics.wordCount.toLocaleString()}</span>
                </div>
              </button>

              <button
                onClick={() => toggleDisplay('characters')}
                className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                  display === 'characters'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span>Characters</span>
                  <span className="text-xs font-mono ml-4">{metrics.characterCount.toLocaleString()}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Estimated Time Dropdown Component
export const EstimatedTimeDropdown: React.FC<EstimatedTimeDropdownProps> = ({
  metrics,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [display, setDisplay] = useState<TimeDisplay>('reading');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDisplay = (newDisplay: TimeDisplay) => {
    setDisplay(newDisplay);
    setIsOpen(false);
  };

  const readingTime = formatTime(metrics.readingTimeMinutes, metrics.readingTimeSeconds);
  const speakingTime = formatTime(metrics.speakingTimeMinutes, metrics.speakingTimeSeconds);

  const currentTime = display === 'reading' ? readingTime : speakingTime;
  const currentLabel = display === 'reading' ? 'to read' : 'to speak';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-sm text-gray-600 hover:text-gray-800 transition-colors"
      >
        <span>{currentTime.display} {currentLabel}</span>
        <ChevronDown className={`w-3 h-3 ml-1 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

            {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-[140px]">
          <div className="p-3">
            <div className="text-xs font-medium text-gray-500 mb-2">Estimated Time</div>

            <div className="space-y-1">
              <button
                onClick={() => toggleDisplay('reading')}
                className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                  display === 'reading'
                    ? 'bg-green-50 text-green-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span>Reading</span>
                  <span className="text-xs font-mono ml-4">{readingTime.display}</span>
                </div>
              </button>

              <button
                onClick={() => toggleDisplay('speaking')}
                className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                  display === 'speaking'
                    ? 'bg-green-50 text-green-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span>Speaking</span>
                  <span className="text-xs font-mono ml-4">{speakingTime.display}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Readability Tooltip Component
export const ReadabilityTooltip: React.FC<ReadabilityTooltipProps> = ({
  grade,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setIsVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getGradeInfo = (grade: number) => {
    if (grade <= 5) return { level: 'Elementary', ideal: 'Great for general audiences', color: 'text-green-600' };
    if (grade <= 8) return { level: 'Middle School', ideal: 'Ideal for most content', color: 'text-blue-600' };
    if (grade <= 12) return { level: 'High School', ideal: 'Good for educated audiences', color: 'text-yellow-600' };
    if (grade <= 16) return { level: 'College', ideal: 'Complex content', color: 'text-orange-600' };
    return { level: 'Graduate', ideal: 'Very complex content', color: 'text-red-600' };
  };

  const gradeInfo = getGradeInfo(grade);

  return (
    <div className={`relative ${className}`} ref={tooltipRef}>
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="flex items-center justify-between w-full text-sm text-gray-600 hover:text-gray-800 transition-colors"
      >
        <span>Grade {grade}</span>
        <Info className="w-3 h-3 ml-1 flex-shrink-0" />
      </button>

      {isVisible && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-64">
          <div className="p-3">
            <div className="text-xs font-medium text-gray-500 mb-2">Readability Score</div>

            <div className="space-y-2">
              <div className={`text-sm font-medium ${gradeInfo.color}`}>
                Grade {grade} • {gradeInfo.level}
              </div>

              <div className="text-xs text-gray-600">
                {gradeInfo.ideal}
              </div>

              <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                Based on Flesch-Kincaid Grade Level. Lower scores indicate easier readability.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
