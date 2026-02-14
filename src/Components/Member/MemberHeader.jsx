import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase';
import { signOut } from 'firebase/auth';
import { useToast } from '../Toast/useToast';
import { FaBuilding, FaSignOutAlt, FaMoon, FaSun, FaBell, FaUserCircle, FaTimes } from 'react-icons/fa';

export default function MemberHeader({ profile, notices = [] }) {
  const { push: pushToast } = useToast();
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [readNotices, setReadNotices] = useState(() => {
    const saved = localStorage.getItem('readNotices');
    return saved ? JSON.parse(saved) : [];
  });
  const notificationRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    const initial = saved == null ? true : saved === 'true';
    setIsDarkMode(initial);
    if (initial) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
    if (newMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      pushToast({ type: 'success', title: 'Logged out' });
      navigate('/');
    } catch (e) {
      pushToast({ type: 'error', title: 'Logout failed', description: e.message });
    }
  };

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  const markAsRead = (noticeId) => {
    if (!readNotices.includes(noticeId)) {
      const updated = [...readNotices, noticeId];
      setReadNotices(updated);
      localStorage.setItem('readNotices', JSON.stringify(updated));
    }
  };

  const markAllAsRead = () => {
    const allIds = notices.map(n => n.id);
    setReadNotices(allIds);
    localStorage.setItem('readNotices', JSON.stringify(allIds));
    pushToast({ type: 'success', title: 'All notifications marked as read' });
  };

  const unreadCount = notices.filter(n => !readNotices.includes(n.id)).length;

  const formatNoticeDate = (d) => {
    if (!d) return '';
    try {
      if (typeof d === 'number') {
        return new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      }
      const date = new Date(d);
      if (!isNaN(date)) return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    } catch {
      return String(d);
    }
    return String(d);
  };

  return (
    <div className="flex justify-between items-center px-6 py-2 bg-white dark:bg-[#1f2937] text-gray-900 dark:text-white shadow-md">
      {/* Logo */}
      <div className="flex items-center gap-2 text-lg font-semibold">
        <FaBuilding className="text-blue-600 dark:text-blue-400" />
        <span>FlatMate</span>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2 text-sm">
        {/* <button onClick={toggleDarkMode} title="Toggle Dark Mode">
          {isDarkMode ? (
            <FaSun className="cursor-pointer text-yellow-400 hover:text-white" />
          ) : (
            <FaMoon className="cursor-pointer text-gray-600 dark:text-gray-400 hover:text-white" />
          )}
        </button> */}
        
        {/* Notification Bell */}
        <div className="relative" ref={notificationRef}>
          <button 
            onClick={toggleNotifications}
            className="relative p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            title="Notifications"
          >
            <FaBell className="text-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-semibold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 z-50 max-h-[420px] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Notifications</h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                  >
                    <FaTimes />
                  </button>
                </div>
              </div>

              {/* Notification List */}
              <div className="overflow-y-auto max-h-[360px]">
                {notices.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                    <FaBell className="mx-auto mb-2 text-2xl opacity-50" />
                    <p className="text-sm">No notifications</p>
                  </div>
                ) : (
                  notices.map((notice) => {
                    const isUnread = !readNotices.includes(notice.id);
                    const Wrapper = notice.url ? 'a' : 'div';
                    const wrapperProps = notice.url ? {
                      href: notice.url,
                      target: "_blank",
                      rel: "noreferrer"
                    } : {};
                    
                    return (
                      <Wrapper
                        key={notice.id}
                        {...wrapperProps}
                        onClick={() => markAsRead(notice.id)}
                        className={`block px-3 py-2.5 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors ${
                          isUnread ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className={`text-xs font-medium ${isUnread ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                {notice.title || 'Notice'}
                              </h4>
                              {isUnread && (
                                <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mb-1">
                              {notice.category && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded text-white ${
                                  notice.category === 'emergency' ? 'bg-red-600' :
                                  notice.category === 'maintenance' ? 'bg-blue-600' :
                                  notice.category === 'events' ? 'bg-green-600' :
                                  notice.category === 'meetings' ? 'bg-purple-600' :
                                  'bg-gray-600'
                                }`}>
                                  {notice.category.charAt(0).toUpperCase() + notice.category.slice(1)}
                                </span>
                              )}
                              {!notice.url && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-600 dark:text-gray-400">Text Only</span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-600 dark:text-gray-400 line-clamp-2">
                              {notice.content || notice.description || 'No content'}
                            </p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">
                              {formatNoticeDate(notice.createdAt || notice.date)}
                            </p>
                          </div>
                        </div>
                      </Wrapper>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <FaUserCircle className="text-lg text-gray-700 dark:text-gray-300" />
        <div className="flex flex-col text-right">
          <span className="font-medium">{profile?.fullName || 'Member User'}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{profile?.flatNumber ? `Flat ${profile.flatNumber}` : 'Member'}</span>
        </div>
        <FaSignOutAlt
          className="text-gray-600 dark:text-gray-400 hover:text-red-400 cursor-pointer"
          onClick={handleLogout}
          title="Logout"
        />
      </div>
    </div>
  );
}
