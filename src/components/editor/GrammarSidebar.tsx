import React, { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, Lightbulb, Target, MessageSquare, X, Check, Brain } from 'lucide-react';
import { CategorizedSuggestions, EditorSuggestion, GrammarCategory } from '../../types/grammar';

interface GrammarSidebarProps {
  categorizedSuggestions: CategorizedSuggestions;
  isLoading: boolean;
  isRefining?: boolean;
  onApplySuggestion: (suggestion: EditorSuggestion) => void;
  onDismissSuggestion: (suggestionId: string) => void;
  onRefineSuggestion?: (suggestion: EditorSuggestion) => void;
  onClearAll: () => void;
}

interface CategoryConfig {
  title: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  description: string;
}

const categoryConfigs: Record<GrammarCategory, CategoryConfig> = {
  correctness: {
    title: 'Correctness',
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-red-700',
    bgColor: 'bg-red-50 border-red-200',
    description: 'Grammar, spelling, and punctuation errors'
  },
  clarity: {
    title: 'Clarity',
    icon: <Lightbulb className="w-4 h-4" />,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 border-blue-200',
    description: 'Suggestions to make your writing clearer'
  },
  engagement: {
    title: 'Engagement',
    icon: <Target className="w-4 h-4" />,
    color: 'text-purple-700',
    bgColor: 'bg-purple-50 border-purple-200',
    description: 'Ways to make your writing more engaging'
  },
  delivery: {
    title: 'Delivery',
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'text-green-700',
    bgColor: 'bg-green-50 border-green-200',
    description: 'Tone and style improvements'
  }
};

const GrammarSidebar: React.FC<GrammarSidebarProps> = ({
  categorizedSuggestions,
  isLoading,
  isRefining = false,
  onApplySuggestion,
  onDismissSuggestion,
  onRefineSuggestion,
  onClearAll
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Record<GrammarCategory, boolean>>({
    correctness: true,
    clarity: true,
    engagement: true,
    delivery: true
  });

  const toggleCategory = (category: GrammarCategory) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const totalSuggestions = Object.values(categorizedSuggestions).reduce(
    (total, suggestions) => total + suggestions.length,
    0
  );

  const getSuggestionTypeColor = (type: string) => {
    switch (type) {
      case 'grammar': return 'bg-red-100 text-red-800';
      case 'spelling': return 'bg-orange-100 text-orange-800';
      case 'punctuation': return 'bg-yellow-100 text-yellow-800';
      case 'style': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const renderSuggestion = (suggestion: EditorSuggestion) => (
    <div
      key={suggestion.id}
      className="p-3 border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors"
    >
      {/* Suggestion header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getSuggestionTypeColor(suggestion.type)}`}>
            {suggestion.type}
          </span>
          <span className="text-xs text-gray-500">
            {Math.round(suggestion.confidence * 100)}% confidence
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onApplySuggestion(suggestion)}
            className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
            title="Apply suggestion"
          >
            <Check className="w-3 h-3" />
          </button>
          {onRefineSuggestion && (
            <button
              onClick={() => onRefineSuggestion(suggestion)}
              disabled={isRefining}
              className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
              title="Refine with AI"
            >
              <Brain className={`w-3 h-3 ${isRefining ? 'animate-pulse' : ''}`} />
            </button>
          )}
          <button
            onClick={() => onDismissSuggestion(suggestion.id)}
            className="p-1 text-gray-400 hover:bg-gray-100 rounded transition-colors"
            title="Dismiss suggestion"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Original vs proposed text */}
      <div className="mb-2">
        <div className="text-sm">
          <span className="line-through text-red-600 font-medium">"{suggestion.original}"</span>
          <span className="mx-2 text-gray-400">→</span>
          <span className="text-green-600 font-medium">"{suggestion.proposed}"</span>
        </div>
      </div>

      {/* Explanation */}
      <p className="text-sm text-gray-700 leading-relaxed">
        {suggestion.explanation}
      </p>

      {/* Position info */}
      <div className="mt-2 text-xs text-gray-400">
        Position: {suggestion.range.start}-{suggestion.range.end}
      </div>
    </div>
  );

  const renderCategory = (category: GrammarCategory) => {
    const config = categoryConfigs[category];
    const suggestions = categorizedSuggestions[category];
    const isExpanded = expandedCategories[category];

    if (suggestions.length === 0) return null;

    return (
      <div key={category} className="mb-4">
        {/* Category header */}
        <button
          onClick={() => toggleCategory(category)}
          className={`w-full flex items-center justify-between p-3 rounded-lg border-2 ${config.bgColor} hover:opacity-80 transition-opacity`}
        >
          <div className="flex items-center gap-3">
            <div className={config.color}>
              {config.icon}
            </div>
            <div className="text-left">
              <h3 className={`font-semibold ${config.color}`}>
                {config.title} ({suggestions.length})
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                {config.description}
              </p>
            </div>
          </div>
          <div className={config.color}>
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </button>

        {/* Category content */}
        {isExpanded && (
          <div className="mt-2 space-y-2">
            {suggestions.map(renderSuggestion)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-80 bg-gray-50 border-l border-gray-200 h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Grammar Assistant</h2>
            <p className="text-sm text-gray-600">
              {isLoading ? 'Checking...' : `${totalSuggestions} suggestions found`}
            </p>
          </div>
          {totalSuggestions > 0 && (
            <button
              onClick={onClearAll}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 hover:bg-gray-100 rounded transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : totalSuggestions === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">
              <Check className="w-12 h-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-700 mb-1">Great writing!</h3>
            <p className="text-sm text-gray-500">No grammar suggestions found.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {(Object.keys(categoryConfigs) as GrammarCategory[]).map(renderCategory)}
          </div>
        )}
      </div>
    </div>
  );
};

export default GrammarSidebar;
