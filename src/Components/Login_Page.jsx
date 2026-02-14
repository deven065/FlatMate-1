import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { useState, useEffect } from 'react';
import { FaEnvelope, FaLock, FaSignInAlt, FaUser, FaUserShield, FaBuilding } from 'react-icons/fa';
import { motion as Motion } from "framer-motion";
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';

const LoginPage = () => {
    const navigate = useNavigate();

    const [loginData, setLoginData] = useState({ email: '', password: '' });
    const [activeTab, setActiveTab] = useState("admin");
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [loading, setLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    const switchTab = (tab) => {
        setActiveTab(tab);
        if (!rememberMe) {
            setLoginData({ email: '', password: '' });
        } else {
            setLoginData(prev => ({ ...prev, password: '' }));
        }
    };

    useEffect(() => {
        const savedEmail = localStorage.getItem("rememberedEmail");
        if (savedEmail) {
            setLoginData((prev) => ({ ...prev, email: savedEmail }));
            setRememberMe(true);
        }
    }, []);

    const toggleDarkMode = () => {
        setIsDarkMode(!isDarkMode);
        document.documentElement.classList.toggle("dark");
    };

    const handleChange = (e) => {
        setLoginData({ ...loginData, [e.target.name]: e.target.value });
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, loginData.email, loginData.password);
            const uid = userCredential.user.uid;

            const roleSnap = await get(ref(db, `users/${uid}/role`));
            const role = roleSnap.val();

            if (!role) {
                await signOut(auth);
                throw new Error("No role set in database");
            }

            // Check if the selected login tab matches the user's actual role
            if (activeTab !== role) {
                await signOut(auth);
                throw new Error(`This account is registered as an ${role}. Please login using the ${role} tab.`);
            }

            if (rememberMe) {
                localStorage.setItem("rememberedEmail", loginData.email);
            } else {
                localStorage.removeItem("rememberedEmail");
            }

            localStorage.setItem("role", role);
            setActiveTab("AdminDashboard");

            navigate(role === "admin" ? "/admin" : "/member");
        } catch (error) {
            alert("Login failed: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!loginData.email) {
            alert("Please enter your email to reset password.");
            return;
        }

        try {
            await sendPasswordResetEmail(auth, loginData.email);
            alert("Password reset email sent successfully.");
        } catch (error) {
            alert("Failed to send reset email: " + error.message);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900 transition-colors duration-300">
            {/* <Motion.button
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
                onClick={toggleDarkMode}
                transition={{ duration: 0.15 }}
                className="absolute top-4 right-4 px-4 py-2 bg-transparent dark:bg-gray-700 text-gray-800 dark:text-white rounded"
            >
                {isDarkMode ? "🔆 Light Mode" : "🌙 Dark Mode"}
            </Motion.button> */}

            <Motion.form
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, type: "easeOut" }}
                onSubmit={handleLogin}
                autoComplete="off"
                className="bg-[#1e293b] text-white p-8 rounded-xl shadow-xl w-full max-w-md"
            >
                <input aria-hidden="true" style={{display:'none'}} type="text" name="fake-username" autoComplete="username" />
               <input aria-hidden="true" style={{display:'none'}} type="password" name="fake-password" autoComplete="current-password" />
                
                {/* Logo and Title */}
                <div className="flex items-center justify-center gap-3 mb-2">
                    <FaBuilding className="text-4xl text-blue-500" />
                    <h1 className="text-3xl font-bold">FlatMate</h1>
                </div>
                <p className="text-center mb-6 text-sm text-gray-300">
                    Manage your society maintenance with ease
                </p>

                <div className="flex justify-between mb-6">
                    <Motion.button
                        type="button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`flex items-center justify-center gap-2 flex-1 mr-2 py-2 rounded-md transition-colors ${activeTab === "member" ? "bg-blue-600" : "bg-gray-700"}`}
                        onClick={() => switchTab("member")}
                    >
                        <FaUser /> Member Login
                    </Motion.button>

                    <Motion.button
                        type="button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`flex items-center justify-center gap-2 flex-1 py-2 rounded-md transition-colors ${activeTab === "admin" ? "bg-blue-600" : "bg-gray-700"}`}
                        onClick={() => switchTab("admin")}
                    >
                        <FaUserShield className="w-5" /> Admin Login
                    </Motion.button>
                </div>

                <label className="block text-sm mb-1">Email Address</label>
                <div className="flex items-center bg-gray-700 mb-4 rounded-md px-2">
                    <FaEnvelope className="text-gray-400" />
                    <input
                        type="email"
                        name="email"
                        placeholder="Enter your email"
                        value={loginData.email}
                        onChange={handleChange}
                        autoComplete="nope"
                        className="w-full p-2 bg-transparent outline-none text-white placeholder-gray-400"
                    />
                </div>

                <label className="block text-sm mb-1">Password</label>
                <div className="flex items-center bg-gray-700 mb-2 rounded-md px-2">
                    <FaLock className="text-gray-400" />
                    <input
                        type="password"
                        name="password"
                        placeholder="Enter your password"
                        value={loginData.password}
                        onChange={handleChange}
                        autoComplete="new-password"
                        className="w-full p-2 bg-transparent outline-none text-white placeholder-gray-400"
                    />
                </div>

                <div className="flex items-center justify-between text-sm text-gray-300 mb-4">
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={() => setRememberMe(!rememberMe)}
                        />
                        Remember me
                    </label>
                    <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-blue-400 hover:underline"
                    >
                        Forgot password?
                    </button>
                </div>

                <Motion.button
                    type="submit"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={loading}
                    aria-busy={loading}
                    className={`flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 w-full py-2 rounded-md font-semibold transition-colors ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                    <FaSignInAlt />
                    <span>Sign In</span>

                    {loading && (
                        <Motion.div className="flex items-center ml-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
                            <Motion.span className="w-2 h-2 bg-white rounded-full mr-1" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut", delay: 0 }} />
                            <Motion.span className="w-2 h-2 bg-white rounded-full mr-1" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut", delay: 0.15 }} />
                            <Motion.span className="w-2 h-2 bg-white rounded-full" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut", delay: 0.3 }} />
                        </Motion.div>
                    )}
                </Motion.button>

                <p className="text-center text-sm text-gray-300 mt-4">
                    Don't have an account?{" "}
                    <Link to="/signup" className="text-blue-400 hover:underline inline">
                        Sign up now
                    </Link>
                </p>
            </Motion.form>
        </div>
    );
};

export default LoginPage;
