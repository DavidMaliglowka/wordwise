import React from 'react';
import { XMarkIcon, ClockIcon } from '@heroicons/react/24/outline';

interface ComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
  customMessage?: string;
}

const ComingSoonModal: React.FC<ComingSoonModalProps> = ({
  isOpen,
  onClose,
  featureName = 'Feature',
  customMessage
}) => {
  if (!isOpen) return null;

  // Handle escape key press
  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const defaultMessage = `${featureName} is currently in development. This feature is coming soon!`;
  const message = customMessage || defaultMessage;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="coming-soon-title"
      aria-describedby="coming-soon-description"
    >
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-lg w-full max-w-md mx-4 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close modal"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="bg-indigo-100 rounded-full p-3">
            <ClockIcon className="h-8 w-8 text-indigo-600" />
          </div>
        </div>

        {/* Title */}
        <h3
          id="coming-soon-title"
          className="text-lg font-semibold text-center text-gray-900 mb-3"
        >
          Coming Soon
        </h3>

        {/* Message */}
        <p
          id="coming-soon-description"
          className="text-gray-600 text-center mb-6 leading-relaxed"
        >
          {message}
        </p>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComingSoonModal;
