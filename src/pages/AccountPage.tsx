import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import { personalDictionary } from '../services/personal-dictionary';
import { PersonalDictionaryEntry } from '../services/personal-dictionary';

const AccountPage: React.FC = () => {
  const { user } = useAuthContext();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState(false);

  // Personal Dictionary state
  const [dictionaryEntries, setDictionaryEntries] = useState<PersonalDictionaryEntry[]>([]);
  const [newWord, setNewWord] = useState('');
  const [isAddingWord, setIsAddingWord] = useState(false);
  const [isLoadingDictionary, setIsLoadingDictionary] = useState(true);
  const [dictionaryError, setDictionaryError] = useState('');

  // Load personal dictionary on component mount
  useEffect(() => {
    const loadDictionary = async () => {
      try {
        setIsLoadingDictionary(true);
        await personalDictionary.initialize();
        const entries = await personalDictionary.getAllWords();
        setDictionaryEntries(entries);
      } catch (error) {
        console.error('Failed to load personal dictionary:', error);
        setDictionaryError('Failed to load personal dictionary');
      } finally {
        setIsLoadingDictionary(false);
      }
    };

    loadDictionary();
  }, []);

  // Handle name update
  const handleNameUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !displayName.trim()) return;

    try {
      setIsUpdatingName(true);
      setNameError('');

      const { updateProfile } = await import('firebase/auth');
      await updateProfile(user, { displayName: displayName.trim() });

      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to update name:', error);
      setNameError('Failed to update name. Please try again.');
    } finally {
      setIsUpdatingName(false);
    }
  };

  // Handle adding new word to dictionary
  const handleAddWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim()) return;

    try {
      setIsAddingWord(true);
      setDictionaryError('');

      const entry = await personalDictionary.addWord(newWord.trim().toLowerCase());
      setDictionaryEntries(prev => [entry, ...prev]);
      setNewWord('');
    } catch (error) {
      console.error('Failed to add word:', error);
      setDictionaryError('Failed to add word. Please try again.');
    } finally {
      setIsAddingWord(false);
    }
  };

  // Handle removing word from dictionary
  const handleRemoveWord = async (word: string) => {
    try {
      setDictionaryError('');
      await personalDictionary.removeWord(word);
      setDictionaryEntries(prev => prev.filter(entry => entry.word !== word));
    } catch (error) {
      console.error('Failed to remove word:', error);
      setDictionaryError('Failed to remove word. Please try again.');
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="space-y-8">
          {/* Page Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
            <p className="mt-2 text-gray-600">Manage your profile and personal dictionary</p>
          </div>

          {/* Profile Section */}
          <div className="bg-white shadow-sm rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Profile</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
              </div>

              <form onSubmit={handleNameUpdate}>
                <div>
                  <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name
                  </label>
                  <div className="flex space-x-3">
                    <input
                      type="text"
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Enter your display name"
                    />
                    <button
                      type="submit"
                      disabled={isUpdatingName || !displayName.trim() || displayName === user?.displayName}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUpdatingName ? 'Updating...' : 'Update'}
                    </button>
                  </div>
                </div>
              </form>

              {nameError && (
                <div className="text-red-600 text-sm">{nameError}</div>
              )}

              {nameSuccess && (
                <div className="text-green-600 text-sm">Name updated successfully!</div>
              )}
            </div>
          </div>

          {/* Personal Dictionary Section */}
          <div className="bg-white shadow-sm rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Personal Dictionary</h2>
            <p className="text-gray-600 text-sm mb-6">
              Add words to your personal dictionary to prevent them from being flagged as spelling errors.
            </p>

            {/* Add Word Form */}
            <form onSubmit={handleAddWord} className="mb-6">
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  placeholder="Add a word to your dictionary"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isAddingWord || !newWord.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAddingWord ? 'Adding...' : 'Add Word'}
                </button>
              </div>
            </form>

            {dictionaryError && (
              <div className="mb-4 text-red-600 text-sm">{dictionaryError}</div>
            )}

            {/* Dictionary Words List */}
            {isLoadingDictionary ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
                <p className="text-gray-600">Loading dictionary...</p>
              </div>
            ) : dictionaryEntries.length > 0 ? (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  {dictionaryEntries.length} word{dictionaryEntries.length !== 1 ? 's' : ''} in your dictionary
                </p>
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-md">
                  <div className="divide-y divide-gray-200">
                    {dictionaryEntries.map((entry) => (
                      <div key={entry.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                        <div>
                          <span className="font-medium text-gray-900">{entry.word}</span>
                          {entry.category && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              {entry.category}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveWord(entry.word)}
                          className="text-red-600 hover:text-red-700 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600">No words in your personal dictionary yet.</p>
                <p className="text-sm text-gray-500 mt-1">Add words above to get started.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AccountPage;
