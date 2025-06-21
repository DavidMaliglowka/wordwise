import React, { useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import {
  DocumentTextIcon,
  ClockIcon,
  TrashIcon,
  UserCircleIcon,
  QuestionMarkCircleIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import { PerformanceMonitorDashboard } from '../PerformanceMonitorDashboard';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { user, signOut } = useAuthContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showPerformanceDashboard, setShowPerformanceDashboard] = useState(false);

  const navigation = [
    { name: 'Documents', icon: DocumentTextIcon, href: '/documents', current: true },
    { name: 'Version History', icon: ClockIcon, href: '/history', current: false },
    { name: 'Trash', icon: TrashIcon, href: '/trash', current: false },
    { name: 'Account', icon: UserCircleIcon, href: '/account', current: false },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-75"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-white shadow-xl transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center space-x-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-600 text-white font-bold">
              W
            </div>
            <span className="text-lg font-semibold text-gray-900">WordWise</span>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-gray-400 hover:text-gray-500"
            onClick={() => setSidebarOpen(false)}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        <SidebarContent
          navigation={navigation}
          user={user}
          onSignOut={handleSignOut}
          onShowPerformance={() => setShowPerformanceDashboard(true)}
        />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:w-72 lg:flex-col lg:fixed lg:inset-y-0">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          {/* Logo */}
          <div className="flex h-16 items-center px-6">
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-600 text-white font-bold">
                W
              </div>
              <span className="text-lg font-semibold text-gray-900">WordWise</span>
            </div>
          </div>
          <SidebarContent
            navigation={navigation}
            user={user}
            onSignOut={handleSignOut}
            onShowPerformance={() => setShowPerformanceDashboard(true)}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:pl-72">
        {/* Mobile header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 pl-1 pr-4 sm:pl-3 sm:pr-6 lg:hidden">
          <div className="flex h-16 items-center justify-between">
            <button
              type="button"
              className="rounded-md p-2 text-gray-400 hover:text-gray-500"
              onClick={() => setSidebarOpen(true)}
            >
              <Bars3Icon className="h-6 w-6" />
            </button>
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-600 text-white font-bold">
                W
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 focus:outline-none">
          {children}
        </main>
      </div>

      {/* Performance Monitor Dashboard */}
      {showPerformanceDashboard && (
        <PerformanceMonitorDashboard
          onClose={() => setShowPerformanceDashboard(false)}
        />
      )}
    </div>
  );
};

// Sidebar content component (shared between mobile and desktop)
interface SidebarContentProps {
  navigation: Array<{
    name: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    href: string;
    current: boolean;
  }>;
  user: any;
  onSignOut: () => void;
  onShowPerformance: () => void;
}

const SidebarContent: React.FC<SidebarContentProps> = ({ navigation, user, onSignOut, onShowPerformance }) => {
  return (
    <div className="flex flex-1 flex-col">
      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-6">
        {navigation.map((item) => (
          <a
            key={item.name}
            href={item.href}
            className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              item.current
                ? 'bg-gray-100 text-gray-900 border-l-4 border-indigo-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <item.icon
              className={`mr-3 h-5 w-5 flex-shrink-0 ${
                item.current ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-500'
              }`}
            />
            {item.name}
            {item.name === 'Apps' && (
              <span className="ml-auto bg-indigo-100 text-indigo-600 py-0.5 px-2 rounded-full text-xs font-medium">
                3
              </span>
            )}
          </a>
        ))}

        {/* Get Pro CTA */}
        <div className="mt-6">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg p-4 text-white">
            <h4 className="text-sm font-semibold">Upgrade to Pro</h4>
            <p className="text-xs mt-1 opacity-90">
              Unlock advanced AI features and unlimited documents
            </p>
            <button className="mt-3 w-full bg-white text-indigo-600 rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
              Get Pro
            </button>
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex items-center text-gray-400 hover:text-gray-500 transition-colors"
            title="Support"
          >
            <QuestionMarkCircleIcon className="h-5 w-5" />
          </button>
          <div className="flex items-center space-x-2">
            <button
              onClick={onShowPerformance}
              className="flex items-center text-gray-400 hover:text-gray-500 transition-colors"
              title="Performance Monitor"
            >
              <ChartBarIcon className="h-5 w-5" />
            </button>
            <button
              onClick={onSignOut}
              className="flex items-center text-gray-400 hover:text-gray-500 transition-colors"
              title="Sign out"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        {user && (
          <div className="mt-3 flex items-center">
            <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.displayName || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardLayout;
