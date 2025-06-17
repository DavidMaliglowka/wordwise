import React from 'react';
import { AuthProvider, useAuthContext } from '../contexts/AuthContext';
import { AuthPage } from '../pages/AuthPage';
import { FirestoreTest } from './test/FirestoreTest';
import { StorageTest } from './test/StorageTest';
import { SecurityTest } from './test/SecurityTest';
import { DocumentTest } from './test/DocumentTest';
import Avatar from 'components/Avatar'
import logo from 'assets/logo.svg'

const randoms = [
  [1, 2],
  [3, 4, 5],
  [6, 7]
]

// Dashboard component for authenticated users
const Dashboard: React.FC = () => {
  const { user, signOut } = useAuthContext();

  return (
    <div className="relative bg-white min-h-screen">
      <div className="sm:pb-40 sm:pt-24 lg:pb-48 lg:pt-40">
        <div className="relative mx-auto max-w-7xl px-4 sm:static sm:px-6 lg:px-8">
          <div className="sm:max-w-lg">
            <div className="my-4">
              <Avatar size="large" src={logo} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
              Welcome to WordWise!
            </h1>
            <p className="mt-4 text-xl text-gray-500">
              Hello {user?.displayName || user?.email}! Your AI-first writing assistant is ready to help you craft clear, persuasive business communications.
            </p>
            <div className="mt-6 flex gap-4">
              <button
                onClick={() => {/* TODO: Navigate to editor */}}
                className="inline-block rounded-md border border-transparent bg-indigo-600 px-8 py-3 text-center font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2"
              >
                Start Writing
              </button>
              <button
                onClick={signOut}
                className="inline-block rounded-md border border-gray-300 bg-white px-8 py-3 text-center font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Test Components */}
          <div className="mt-12 mb-12 space-y-8">
            <SecurityTest />
            <FirestoreTest />
            <StorageTest />
            <DocumentTest />
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none mt-10 md:mt-0 lg:absolute lg:inset-y-0 lg:mx-auto lg:w-full lg:max-w-7xl"
          >
            <div className="absolute sm:left-1/2 sm:top-0 sm:translate-x-8 lg:left-1/2 lg:top-1/2 lg:-translate-y-1/2 lg:translate-x-8">
              <div className="flex items-center space-x-6 lg:space-x-8">
                {randoms.map((random, number) => (
                  <div
                    key={`random-${random[number]}`}
                    className="grid shrink-0 grid-cols-1 gap-y-6 lg:gap-y-8"
                  >
                    {random.map((number) => (
                      <div
                        key={`random-${number}`}
                        className="h-64 w-44 overflow-hidden rounded-lg sm:opacity-0 lg:opacity-100"
                      >
                        <img
                          src={`https://picsum.photos/600?random=${number}`}
                          alt=""
                          className="size-full bg-indigo-100 object-cover object-center"
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main app content that checks authentication state
const AppContent: React.FC = () => {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return user ? <Dashboard /> : <AuthPage />;
};

// Root App component with AuthProvider
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
