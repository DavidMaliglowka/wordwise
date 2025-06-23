import React, { useState, useEffect } from 'react';
import { personalDictionary, PersonalDictionaryEntry, PersonalDictionaryStats } from '../services/personal-dictionary';

interface PersonalDictionaryManagerProps {
  className?: string;
}

const PersonalDictionaryManager: React.FC<PersonalDictionaryManagerProps> = ({ className = '' }) => {
  const [entries, setEntries] = useState<PersonalDictionaryEntry[]>([]);
  const [stats, setStats] = useState<PersonalDictionaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<PersonalDictionaryStats['syncStatus']>('offline');
  const [syncMessage, setSyncMessage] = useState<string>('');

  // Add word form state
  const [newWord, setNewWord] = useState('');
  const [newWordCategory, setNewWordCategory] = useState<PersonalDictionaryEntry['category']>('custom');
  const [newWordNotes, setNewWordNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Filter state
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [periodicSyncEnabled, setPeriodicSyncEnabled] = useState(false);

  // Update sync status
  const updateSyncStatus = () => {
    setSyncStatus(personalDictionary.getSyncStatus());
  };

  // Load dictionary data
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [allEntries, dictionaryStats] = await Promise.all([
        personalDictionary.getAllWords(),
        personalDictionary.getStats()
      ]);

      setEntries(allEntries);
      setStats(dictionaryStats);
      updateSyncStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personal dictionary');
    } finally {
      setLoading(false);
    }
  };

  // Initialize on mount
  useEffect(() => {
    loadData();

    // Update sync status periodically
    const interval = setInterval(updateSyncStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  // Manual sync with server
  const handleManualSync = async () => {
    if (!personalDictionary.isUserAuthenticated()) {
      setSyncMessage('Please log in to sync with server');
      return;
    }

    try {
      setSyncing(true);
      setSyncMessage('');
      setError(null);

      const result = await personalDictionary.manualSync();

      if (result.success) {
        setSyncMessage(`✅ ${result.message} (${result.wordsCount} words)`);
        await loadData(); // Refresh the UI
      } else {
        setSyncMessage(`❌ ${result.message}`);
      }
    } catch (err) {
      setSyncMessage(`❌ Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);

      // Clear sync message after 3 seconds
      setTimeout(() => setSyncMessage(''), 3000);
    }
  };

  // Toggle periodic sync
  const handlePeriodicSyncToggle = (enabled: boolean) => {
    setPeriodicSyncEnabled(enabled);

    if (enabled) {
      personalDictionary.startPeriodicSync(5); // Every 5 minutes
      setSyncMessage('🔄 Periodic sync enabled (every 5 minutes)');
    } else {
      personalDictionary.stopPeriodicSync();
      setSyncMessage('⏹️ Periodic sync disabled');
    }

    // Clear message after 2 seconds
    setTimeout(() => setSyncMessage(''), 2000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      personalDictionary.stopPeriodicSync();
    };
  }, []);

  // Add a new word
  const handleAddWord = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newWord.trim()) return;

    try {
      setAdding(true);
      setError(null);

      await personalDictionary.addWord(newWord.trim(), {
        category: newWordCategory,
        notes: newWordNotes.trim() || undefined
      });

      // Reset form
      setNewWord('');
      setNewWordNotes('');
      setNewWordCategory('custom');

      // Reload data
      await loadData();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add word');
    } finally {
      setAdding(false);
    }
  };

  // Remove a word
  const handleRemoveWord = async (word: string) => {
    if (!confirm(`Remove "${word}" from your personal dictionary?`)) return;

    try {
      setError(null);
      await personalDictionary.removeWord(word);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove word');
    }
  };

  // Clear all words
  const handleClearAll = async () => {
    if (!confirm('Clear your entire personal dictionary? This cannot be undone.')) return;

    try {
      setError(null);
      await personalDictionary.clear();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear dictionary');
    }
  };

  // Get sync status display
  const getSyncStatusDisplay = () => {
    const isAuthenticated = personalDictionary.isUserAuthenticated();

    if (!isAuthenticated) {
      return { color: 'text-gray-500', icon: '🔒', text: 'Offline Only' };
    }

    switch (syncStatus) {
      case 'synced':
        return { color: 'text-green-600', icon: '✅', text: 'Synced' };
      case 'pending':
        return { color: 'text-yellow-600', icon: '🔄', text: 'Syncing...' };
      default:
        return { color: 'text-red-600', icon: '❌', text: 'Offline' };
    }
  };

  // Filter entries based on category and search
  const filteredEntries = entries.filter(entry => {
    const matchesCategory = filterCategory === 'all' || entry.category === filterCategory;
    const matchesSearch = entry.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (entry.notes && entry.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Get unique categories
  const categories = Array.from(new Set(entries.map(e => e.category || 'custom')));
  const syncDisplay = getSyncStatusDisplay();

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading personal dictionary...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 max-w-4xl mx-auto ${className}`}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Personal Dictionary</h2>
        <p className="text-gray-600">
          Manage your custom words and domain-specific terms to prevent false positives in grammar checking.
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Sync Message */}
      {syncMessage && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-800 text-sm">{syncMessage}</p>
        </div>
      )}

      {/* Statistics */}
      {stats && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-blue-900">Total Words</h3>
            <p className="text-2xl font-bold text-blue-700">{stats.totalWords}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-green-900">Categories</h3>
            <p className="text-2xl font-bold text-green-700">{Object.keys(stats.categories).length}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-purple-900">Cache Size</h3>
            <p className="text-2xl font-bold text-purple-700">{personalDictionary.getCacheSize()}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900">Sync Status</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${syncDisplay.color}`}>
                  {syncDisplay.icon} {syncDisplay.text}
                </p>
                {personalDictionary.isUserAuthenticated() && (
                  <button
                    onClick={handleManualSync}
                    disabled={syncing || syncStatus === 'pending'}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncing ? '⏳' : '🔄'}
                  </button>
                )}
              </div>

              {/* Periodic Sync Toggle */}
              {personalDictionary.isUserAuthenticated() && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                  <span className="text-xs text-gray-600">Auto-sync (5min)</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={periodicSyncEnabled}
                      onChange={(e) => handlePeriodicSyncToggle(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Word Form */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Add New Word</h3>
        <form onSubmit={handleAddWord} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="newWord" className="block text-sm font-medium text-gray-700 mb-1">
                Word *
              </label>
              <input
                id="newWord"
                type="text"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="Enter word or phrase"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                id="category"
                value={newWordCategory}
                onChange={(e) => setNewWordCategory(e.target.value as PersonalDictionaryEntry['category'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="custom">Custom</option>
                <option value="technical">Technical</option>
                <option value="domain">Domain-specific</option>
                <option value="name">Name/Proper Noun</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <input
              id="notes"
              type="text"
              value={newWordNotes}
              onChange={(e) => setNewWordNotes(e.target.value)}
              placeholder="Optional notes about this word"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={adding || !newWord.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md transition-colors"
            >
              {adding ? 'Adding...' : 'Add Word'}
            </button>
          </div>
        </form>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
            Search
          </label>
          <input
            id="search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search words or notes..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="filter" className="block text-sm font-medium text-gray-700 mb-1">
            Category Filter
          </label>
          <select
            id="filter"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Categories</option>
            {categories.map(category => (
              <option key={category} value={category}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Words List */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">
            Your Words ({filteredEntries.length})
          </h3>
          {entries.length > 0 && (
            <button
              onClick={handleClearAll}
              className="px-3 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {entries.length === 0 ? (
              <div>
                <p className="text-lg mb-2">No words in your personal dictionary yet.</p>
                <p className="text-sm">Add words above to prevent them from being flagged as spelling errors.</p>
              </div>
            ) : (
              <p>No words match your current filters.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredEntries.map((entry) => (
              <div key={entry.id} className="px-4 py-3 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">{entry.word}</span>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        entry.category === 'technical' ? 'bg-blue-100 text-blue-800' :
                        entry.category === 'domain' ? 'bg-green-100 text-green-800' :
                        entry.category === 'name' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {entry.category || 'custom'}
                      </span>
                    </div>
                    {entry.notes && (
                      <p className="text-sm text-gray-600">{entry.notes}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      Added {entry.addedAt.toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveWord(entry.word)}
                    className="ml-4 px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PersonalDictionaryManager;
