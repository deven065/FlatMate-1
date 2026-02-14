import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { ref, onValue, set, push, remove, update } from "firebase/database";
import { db } from "../../firebase";

import {
    FaBuilding,
    FaBell,
    FaUserCircle,
    FaSignOutAlt,
    FaMoneyBill,
    FaUserPlus,
    FaTimes,
    FaBullhorn
} from "react-icons/fa";

export default function Header() {
    const [userData, setUserData] = useState({ fullName: "", role: "" });
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [processedPayments, setProcessedPayments] = useState(new Set());
    const [processedMembers, setProcessedMembers] = useState(new Set());
    const notificationRef = useRef(null);
    const navigate = useNavigate();
    const auth = getAuth();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                const userRef = ref(db, `users/${user.uid}`);
                onValue(userRef, (snapshot) => {
                    const data = snapshot.val();
                    if (data) {
                        setUserData({
                            fullName: data.fullName,
                            role: data.role,
                        });
                    }
                });
            }
        });

        // Load theme preference on mount
        const savedMode = localStorage.getItem("darkMode") === "true";
        setIsDarkMode(savedMode);
        if (savedMode) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }

        return () => unsubscribe();
    }, [auth]);

    // Load admin notifications from Firebase
    useEffect(() => {
        const notificationsRef = ref(db, "adminNotifications");
        const unsubscribe = onValue(notificationsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const notificationsList = Object.entries(data)
                    .map(([id, notif]) => ({ id, ...notif }))
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                setNotifications(notificationsList);
                setUnreadCount(notificationsList.filter(n => !n.read).length);
            } else {
                setNotifications([]);
                setUnreadCount(0);
            }
        });

        return () => unsubscribe();
    }, []);

    // Listen to new payments and create notifications
    useEffect(() => {
        const paymentsRef = ref(db, "recentPayments");
        const unsubscribe = onValue(paymentsRef, (snapshot) => {
            if (snapshot.exists()) {
                const paymentsData = snapshot.val();
                
                Object.entries(paymentsData).forEach(([paymentId, payment]) => {
                    // Skip if already processed
                    if (processedPayments.has(paymentId)) return;
                    
                    // Mark as processed
                    setProcessedPayments(prev => new Set(prev).add(paymentId));
                    
                    // Create notification in Firebase
                    const notificationData = {
                        type: "payment",
                        title: "Payment Received",
                        message: `${payment.name || payment.member || "A member"} paid ₹${Number(payment.amount || 0).toLocaleString('en-IN')} from Flat ${payment.flat || "N/A"}`,
                        timestamp: payment.createdAt || Date.now(),
                        read: false,
                        paymentId: paymentId,
                        memberName: payment.name || payment.member,
                        amount: payment.amount,
                        flat: payment.flat
                    };
                    
                    // Add to Firebase
                    const notifRef = ref(db, `adminNotifications/${paymentId}`);
                    set(notifRef, notificationData);
                });
            }
        });

        return () => unsubscribe();
    }, [processedPayments]);

    // Listen to new members and create notifications
    useEffect(() => {
        const usersRef = ref(db, "users");
        const unsubscribe = onValue(usersRef, (snapshot) => {
            if (snapshot.exists()) {
                const usersData = snapshot.val();
                
                Object.entries(usersData).forEach(([userId, user]) => {
                    // Only process members, skip if already processed
                    if (user.role !== "member" || processedMembers.has(userId)) return;
                    
                    // Mark as processed
                    setProcessedMembers(prev => new Set(prev).add(userId));
                    
                    // Create notification in Firebase
                    const notificationData = {
                        type: "member",
                        title: "New Member Signup",
                        message: `${user.fullName || "New member"} signed up for Flat ${user.flatNumber || user.flat || "N/A"}`,
                        timestamp: user.createdAt || Date.now(),
                        read: false,
                        memberId: userId,
                        memberName: user.fullName,
                        flat: user.flatNumber || user.flat,
                        email: user.email
                    };
                    
                    // Add to Firebase
                    const notifRef = ref(db, `adminNotifications/member_${userId}`);
                    set(notifRef, notificationData);
                });
            }
        });

        return () => unsubscribe();
    }, [processedMembers]);

    // Click outside to close dropdown
    useEffect(() => {
        function handleClickOutside(event) {
            if (notificationRef.current && !notificationRef.current.contains(event.target)) {
                setShowNotifications(false);
            }
        }

        if (showNotifications) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showNotifications]);

    const handleLogout = () => {
        signOut(auth)
            .then(() => {
                navigate("/login");
            })
            .catch((error) => {
                console.error("Logout error:", error);
            });
    };

    const toggleDarkMode = () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);
        localStorage.setItem("darkMode", newMode);
        if (newMode) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    };

    const toggleNotifications = () => {
        setShowNotifications(!showNotifications);
        if (!showNotifications) {
            // Mark all as read in Firebase when opening
            notifications.forEach(n => {
                if (!n.read) {
                    const notifRef = ref(db, `adminNotifications/${n.id}`);
                    update(notifRef, { read: true });
                }
            });
        }
    };

    const clearNotification = (id) => {
        const notifRef = ref(db, `adminNotifications/${id}`);
        remove(notifRef);
    };

    const clearAllNotifications = () => {
        const notificationsRef = ref(db, "adminNotifications");
        set(notificationsRef, null);
    };

    const formatTimestamp = (timestamp) => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    return (
        <div className="flex justify-between items-center px-6 py-2 bg-white dark:bg-[#1f2937] text-gray-900 dark:text-white shadow-md">
            {/* Logo */}
            <div className="flex items-center gap-2 text-lg font-semibold">
                <FaBuilding className="text-blue-600 dark:text-blue-400" />
                <span>FlatMate</span>
            </div>

            {/* Right section */}
            <div className="flex items-center gap-4 text-sm">
                {/* Dark Mode Toggle */}
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
                        className="relative flex items-center justify-center cursor-pointer text-gray-600 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition"
                        title="Notifications"
                    >
                        <FaBell className="text-xl" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-bold text-[10px]">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Notification Dropdown */}
                    {showNotifications && (
                        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#1f2937] rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                            {/* Header */}
                            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
                                {notifications.length > 0 && (
                                    <button 
                                        onClick={clearAllNotifications}
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        Clear All
                                    </button>
                                )}
                            </div>

                            {/* Notifications List */}
                            <div className="max-h-96 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                        <FaBell className="mx-auto text-3xl mb-2 opacity-50" />
                                        <p>No notifications yet</p>
                                    </div>
                                ) : (
                                    notifications.map((notification) => (
                                        <div 
                                            key={`${notification.type}-${notification.id}`}
                                            className={`px-4 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition ${!notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-1 p-2 rounded-full ${
                                                    notification.type === 'payment' 
                                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' 
                                                        : notification.type === 'notice'
                                                        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                                                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                }`}>
                                                    {notification.type === 'payment' ? (
                                                        <FaMoneyBill className="text-sm" />
                                                    ) : notification.type === 'notice' ? (
                                                        <FaBullhorn className="text-sm" />
                                                    ) : (
                                                        <FaUserPlus className="text-sm" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 dark:text-white text-sm">
                                                                {notification.title}
                                                            </p>
                                                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 break-words">
                                                                {notification.message}
                                                            </p>
                                                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                                {formatTimestamp(notification.timestamp)}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => clearNotification(notification.id)}
                                                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition flex-shrink-0"
                                                            title="Dismiss"
                                                        >
                                                            <FaTimes className="text-xs" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <FaUserCircle className="text-xl text-gray-700 dark:text-gray-300" />
                <div className="flex flex-col text-right">
                    <span className="font-medium">{userData.fullName || "Admin User"}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                        {userData.role || "admin"}
                    </span>
                </div>
                <FaSignOutAlt
                    className="text-gray-600 dark:text-gray-400 hover:text-red-400 cursor-pointer"
                    onClick={handleLogout}
                    title="Logout"
                />
            </div>
        </div>
    )
}
