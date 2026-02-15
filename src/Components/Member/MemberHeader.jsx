import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../firebase';
import { signOut } from 'firebase/auth';
import { ref, onValue, update, remove } from 'firebase/database';
import { useToast } from '../Toast/useToast';
import { FaBuilding, FaSignOutAlt, FaMoon, FaSun, FaBell, FaUserCircle, FaTimes } from 'react-icons/fa';

export default function MemberHeader({ profile, notices = [] }) {
  const { push: pushToast } = useToast();
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readNotices, setReadNotices] = useState(() => {
    const saved = localStorage.getItem('readNotices');
    return saved ? JSON.parse(saved) : [];
  });
  const notificationRef = useRef(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    const initial = saved == null ? true : saved === 'true';
    setIsDarkMode(initial);
    if (initial) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, []);

  // Get current user ID
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setCurrentUserId(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch user notifications from Firebase
  useEffect(() => {
    if (!currentUserId) return;

    const notificationsRef = ref(db, `userNotifications/${currentUserId}`);
    const unsubscribe = onValue(notificationsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const notificationsList = Object.entries(data)
          .map(([id, notif]) => ({ id, ...notif }))
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setNotifications(notificationsList);
        setUnreadCount(notificationsList.filter(n => !n.read).length);
        
        // Show toast for new unread notifications (reminders and query replies)
        const unreadImportant = notificationsList.filter(n => !n.read && (n.type === 'reminder' || n.type === 'query_reply'));
        if (unreadImportant.length > 0) {
          const latest = unreadImportant[0];
          if (Date.now() - (latest.timestamp || 0) < 5000) { // Show toast only for very recent notifications
            pushToast({
              type: latest.type === 'query_reply' ? 'success' : 'info',
              title: latest.title || 'New Notification',
              description: latest.message || 'You have a new notification'
            });
          }
        }
      } else {
        setNotifications([]);
        setUnreadCount(0);
      }
    });

    return () => unsubscribe();
  }, [currentUserId]);

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

  const markAsRead = async (notificationId) => {
    if (!currentUserId) return;
    
    const notificationRef = ref(db, `userNotifications/${currentUserId}/${notificationId}`);
    try {
      await update(notificationRef, { read: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    if (!currentUserId) return;
    
    try {
      const updates = {};
      notifications.forEach(n => {
        if (!n.read) {
          updates[`userNotifications/${currentUserId}/${n.id}/read`] = true;
        }
      });
      
      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
        pushToast({ type: 'success', title: 'All notifications marked as read' });
      }
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const deleteNotification = async (e, notificationId) => {
    e.stopPropagation();
    if (!currentUserId) return;
    
    const notificationRef = ref(db, `userNotifications/${currentUserId}/${notificationId}`);
    try {
      await remove(notificationRef);
      pushToast({ type: 'success', title: 'Notification deleted' });
    } catch (error) {
      console.error("Error deleting notification:", error);
      pushToast({ type: 'error', title: 'Failed to delete notification' });
    }
  };

  const formatNoticeDate = (d) => {
    if (!d) return '';
    try {
      if (typeof d === 'number') {
        return new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
      const date = new Date(d);
      if (!isNaN(date)) return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                    <FaBell className="mx-auto mb-2 text-2xl opacity-50" />
                    <p className="text-sm">No notifications</p>
                  </div>
                ) : (
                  notifications.map((notification) => {
                    const isUnread = !notification.read;
                    
                    return (
                      <div
                        key={notification.id}
                        onClick={() => markAsRead(notification.id)}
                        className={`block px-3 py-2.5 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${
                          isUnread ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className={`text-xs font-medium ${isUnread ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                {notification.title || 'Notification'}
                              </h4>
                              {isUnread && (
                                <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mb-1">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded text-white ${
                                notification.type === 'reminder' ? 'bg-red-600' :
                                notification.type === 'payment' ? 'bg-green-600' :
                                notification.type === 'query_reply' ? 'bg-purple-600' :
                                notification.type === 'notice' ? 'bg-blue-600' :
                                'bg-gray-600'
                              }`}>
                                {notification.type === 'reminder' ? 'Payment Reminder' :
                                 notification.type === 'payment' ? 'Payment' :
                                 notification.type === 'query_reply' ? 'Admin Reply' :
                                 notification.type === 'notice' ? 'Notice' : 
                                 'Info'}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-600 dark:text-gray-400 line-clamp-2">
                              {notification.message || 'No message'}
                            </p>
                            {notification.amount && (
                              <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 mt-1">
                                Amount Due: ₹{Number(notification.amount).toLocaleString('en-IN')}
                              </p>
                            )}
                            {notification.dueDate && (
                              <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-0.5">
                                Due: {notification.dueDate}
                              </p>
                            )}
                            <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">
                              {formatNoticeDate(notification.timestamp)}
                            </p>
                          </div>
                          <button
                            onClick={(e) => deleteNotification(e, notification.id)}
                            className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition flex-shrink-0 p-1"
                            title="Delete notification"
                          >
                            <FaTimes className="text-xs" />
                          </button>
                        </div>
                      </div>
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
