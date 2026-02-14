import { Fragment, useEffect, useMemo, useState } from "react";
import {
    FaWallet,
    FaReceipt,
    FaUserCog,
    FaInfoCircle,
    FaDownload,
    FaCreditCard,
    FaBuilding,
    FaFileInvoiceDollar,
    FaHistory,
    FaFolder,
    FaComments,
    FaLifeRing,
    FaCloudDownloadAlt,
    FaRobot,
    FaEnvelope
} from "react-icons/fa";
import { useToast } from "../Toast/useToast";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { onValue, ref, query, orderByChild, equalTo, limitToLast } from "firebase/database";
import PayModal from "./PayModal";
import { openReceiptPrintWindow } from "../../utils/receipt";
import MemberHeader from "./MemberHeader";
import Footer from "./Footer";
import SupportChatModal from "./SupportChatModal";

const MemberDashboard = () => {
    const { push: pushToast } = useToast();

    const [uid, setUid] = useState(null);
    const [profile, setProfile] = useState(null);
    const [payments, setPayments] = useState([]);
    const [payOpen, setPayOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('Dashboard');
    const [config, setConfig] = useState(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [documents, setDocuments] = useState([]);
    const [notices, setNotices] = useState([]);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            if (u) setUid(u.uid);
            else setUid(null);
        });
        return () => unsub();
    }, []);

    // Load user profile
    useEffect(() => {
        if (!uid) {
            setProfile(null);
            setPayments([]);
            // no-op
            return;
        }
        const profileRef = ref(db, `users/${uid}`);
        const off = onValue(
            profileRef,
            (snap) => {
                const val = snap.val();
                setProfile(val || null);
                // no-op
            },
            (err) => {
                pushToast({ type: "error", title: "Failed to load profile", description: err.message });
            }
        );
        return () => off();
    }, [uid, pushToast]);

    // Load recent payments for this user's email
    useEffect(() => {
        if (!profile?.email) {
            setPayments([]);
            return;
        }
        const qp = query(
            ref(db, "recentPayments"),
            orderByChild("email"),
            equalTo(profile.email),
            limitToLast(10)
        );
        const off = onValue(
            qp,
            (snap) => {
                const val = snap.val() || {};
                const list = Object.entries(val)
                    .map(([id, p]) => ({ id, ...p }))
                    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
                setPayments(list);
            },
            (err) => pushToast({ type: "error", title: "Failed to load payments", description: err.message })
        );
        return () => off();
    }, [profile?.email, pushToast]);

    const lastPayment = useMemo(() => (payments.length ? payments[payments.length - 1] : null), [payments]);
    const formatCurrency = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Helper function to check if member has paid for current billing cycle
    const hasPaidCurrentCycle = () => {
        if (!profile?.email) return false;
        
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        // Find payments for this member in the current month
        const memberPayments = payments.filter(p => {
            // Check email match
            const emailsMatch = p.email && profile.email && 
                               p.email.toLowerCase().trim() === profile.email.toLowerCase().trim();
            if (!emailsMatch) return false;
            
            // Check if payment is in current month - prioritize createdAt timestamp
            let paymentDate;
            if (p.createdAt && typeof p.createdAt === 'number') {
                paymentDate = new Date(p.createdAt);
            } else if (p.date) {
                // Handle DD/MM/YYYY format from en-IN locale
                const parts = String(p.date).split('/');
                if (parts.length === 3) {
                    // Convert DD/MM/YYYY to YYYY-MM-DD for proper parsing
                    paymentDate = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
                } else {
                    // Try direct parsing as fallback
                    paymentDate = new Date(p.date);
                }
            } else {
                return false;
            }
            
            // Check if date is valid and in current month/year
            if (isNaN(paymentDate.getTime())) return false;
            
            return paymentDate.getFullYear() === currentYear && 
                   (paymentDate.getMonth() + 1) === currentMonth;
        });
        
        return memberPayments.length > 0;
    };

    // Load maintenance config for breakdown/due date
    useEffect(() => {
        const cfgRef = ref(db, 'config/maintenance');
        const off = onValue(cfgRef, (snap) => setConfig(snap.val() || null));
        return () => off();
    }, []);

    const maintenanceAmt = Number(config?.maintenanceCharge || profile?.maintenance || 0);
    const waterAmt = Number(config?.waterCharge || profile?.water || 0);
    const sinkingAmt = Number(config?.sinkingFund || profile?.sinking || 0);
    const configTotal = maintenanceAmt + waterAmt + sinkingAmt;

    const getNextDueDate = useMemo(() => {
        return () => {
            const iso = config?.dueDateISO;
            if (iso) {
                // Return the same day-of-month as ISO, in current or next month
                const picked = new Date(iso);
                if (!isNaN(picked)) {
                    const day = picked.getDate();
                    const now = new Date();
                    let y = now.getFullYear();
                    let m = now.getMonth();
                    if (now.getDate() > day) m += 1;
                    const d = new Date(y, m, day);
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(day).padStart(2, '0');
                    return `${yyyy}-${mm}-${dd}`;
                }
            }
            // Fallback: legacy numeric day-of-month
            const dayStr = config?.dueDate;
            const day = Number(dayStr);
            if (!day || Number.isNaN(day) || day < 1 || day > 31) return '—';
            const now = new Date();
            const y = now.getFullYear();
            let m = now.getMonth();
            if (now.getDate() > day) m += 1; // move to next month if passed
            const d = new Date(y, m, day);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };
    }, [config?.dueDateISO, config?.dueDate]);

    // Calculate amount due based on current payment cycle
    // If member has paid this month, show 0; otherwise show the config total
    const amountDueDisplay = hasPaidCurrentCycle() ? 0 : configTotal;
    const isClear = amountDueDisplay === 0; // Member is clear if amount due is 0

    // Load society documents
    useEffect(() => {
        const docsRef = ref(db, 'documents');
        const off = onValue(docsRef, (snap) => {
            const val = snap.val() || {};
            const list = Object.entries(val).map(([id, d]) => ({ id, ...d }));
            setDocuments(list);
        });
        return () => off();
    }, []);

    // Load notices uploaded by admin only, and filter by audience/flat targeting
    useEffect(() => {
        const noticesRef = ref(db, 'notices');
        const off = onValue(noticesRef, (snap) => {
            const val = snap.val() || {};
            const list = Object.entries(val)
                .map(([id, n]) => ({ id, ...n }))
                .filter((n) => {
                    const byAdmin = String(n.uploadedBy || n.role || '').toLowerCase() === 'admin';
                    const notExpired = !n.expiryAt || Number(n.expiryAt) > Date.now();
                    if (!byAdmin || !notExpired) return false;
                    // Audience rules
                    const audience = (n.audience || 'all');
                    if (audience === 'all') return true;
                    if (audience === 'owners') return String(profile?.role) === 'owner';
                    if (audience === 'tenants') return String(profile?.role) === 'tenant';
                    if (audience === 'flats') {
                        const flats = Array.isArray(n.targetFlats) ? n.targetFlats.map(String) : [];
                        const myFlat = String(profile?.flatNumber || profile?.flat || '').trim();
                        if (!myFlat) return false;
                        return flats.includes(myFlat);
                    }
                    return true;
                })
                .sort((a, b) => {
                    const ad = a.createdAt || a.date || '';
                    const bd = b.createdAt || b.date || '';
                    return String(bd).localeCompare(String(ad));
                });
            setNotices(list);
        });
        return () => off();
    }, [profile?.flatNumber, profile?.role, profile?.flat]);

    const formatNoticeDate = (d) => {
        if (!d) return '';
        try {
            if (typeof d === 'number') {
                return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
            }
            const date = new Date(d);
            if (!isNaN(date)) return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
        } catch {
            // ignore invalid date parsing
        }
        return String(d);
    };

    const handlePayNow = () => setPayOpen(true);

    const handleDownloadReceipt = (payment = null) => {
        const p = payment || lastPayment;
        if (!p) {
            pushToast({ title: "No receipt available", tone: "critical" });
            return;
        }

        const name = p.name || profile?.name || profile?.displayName || "N/A";
        const flat = profile?.flatNumber || profile?.flat || "N/A";
        const receipt = p.receipt || `RCPT-${p.createdAt || Date.now()}`;
        const paid = Number(p.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const method = (p.method || "N/A").toUpperCase();
        const prev = Number(p.previousDue ?? profile?.dues ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const remaining = Number(p.remainingDue ?? profile?.dues ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const date = p.date || new Date().toLocaleDateString("en-IN");

        const html = `<!doctype html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>FlatMate Receipt - ${receipt}</title>
          <style>
            body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:24px}
            .container{max-width:700px;margin:0 auto;border:1px solid #e6edf3;padding:20px;border-radius:6px}
            .header{display:flex;align-items:center;gap:12px}
            .logo svg{width:140px;height:auto;display:block}
            h1{margin:0;font-size:20px}
            .meta{color:#555;font-size:13px}
            table{width:100%;margin-top:18px;border-collapse:collapse}
            td{padding:10px;border-bottom:1px solid #f1f5f9}
            td.label{width:40%;font-weight:600;color:#333}
            .note{margin-top:18px;color:#555;font-size:13px}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" role="img" aria-label="FlatMate Logo">
                  <rect rx="12" width="400" height="120" fill="#2563eb"/>
                  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="42" fill="#fff">FlatMate</text>
                </svg>
              </div>
              <div>
                <h1>Payment Receipt</h1>
                <div class="meta">FlatMate — Society Maintenance</div>
              </div>
            </div>

            <table>
              <tr><td class="label">Receipt No:</td><td>${receipt}</td></tr>
              <tr><td class="label">Name:</td><td>${name}</td></tr>
              <tr><td class="label">Flat:</td><td>${flat}</td></tr>
              <tr><td class="label">Date:</td><td>${date}</td></tr>
              <tr><td class="label">Previous Due:</td><td>₹${prev}</td></tr>
              <tr><td class="label">Amount Paid:</td><td>₹${paid}</td></tr>
              <tr><td class="label">Payment Method:</td><td>${method}</td></tr>
              <tr><td class="label">Remaining Due:</td><td>₹${remaining}</td></tr>
            </table>

            <p class="note">This is a system generated receipt from FlatMate.</p>
          </div>
        </body>
        </html>`;

        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `FlatMate_receipt_${receipt}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // revoke after a short delay to ensure download started
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

        //
        return (
        <Fragment>
            <div className="min-h-screen flex flex-col bg-[#0f172a]">
                <MemberHeader profile={profile} notices={notices} />
                <main className="flex-1">
                    <div className="max-w-6xl mx-auto px-4 py-6">{/* Tabs */}
                        {/* Tabs */}
                                        <div className="flex items-center gap-2 text-sm mb-5">
                                            <button onClick={() => setActiveTab('Dashboard')} className={`flex items-center gap-2 px-3 py-1 rounded ${activeTab==='Dashboard' ? 'bg-[#374151] text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                                                <FaBuilding />
                                                <span>Dashboard</span>
                                            </button>
                                            <button onClick={() => setActiveTab('Bills')} className={`flex items-center gap-2 px-3 py-1 rounded ${activeTab==='Bills' ? 'bg-[#374151] text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                                                <FaFileInvoiceDollar />
                                                <span>Bills</span>
                                            </button>
                                            <button onClick={() => setActiveTab('History')} className={`flex items-center gap-2 px-3 py-1 rounded ${activeTab==='History' ? 'bg-[#374151] text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                                                <FaHistory />
                                                <span>History</span>
                                            </button>
                                            <button onClick={() => setActiveTab('Documents')} className={`flex items-center gap-2 px-3 py-1 rounded ${activeTab==='Documents' ? 'bg-[#374151] text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                                                <FaFolder />
                                                <span>Documents</span>
                                            </button>
                                        </div>

                                        {/* Helper components */}
                                        {/* Current Bill */}
                                        <div className="hidden" />
                                        {/* Content by tab */}
                                        {activeTab === 'Dashboard' && (
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                                <div className="lg:col-span-2 space-y-4">
                                                    <div className="rounded-md p-4 shadow border border-[#374151] text-white bg-[#1f2937]">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="font-semibold">Current Maintenance Bill</div>
                                            <div className="flex items-center gap-3">
                                                <span className={`px-2 py-1 text-xs rounded-full font-semibold ${isClear ? 'bg-green-600' : 'bg-red-600'}`}>
                                                                        {isClear ? 'Paid' : 'Unpaid'}
                                                </span>
                                                <button
                                                    disabled={isClear}
                                                    onClick={handlePayNow}
                                                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-md ${isClear ? 'bg-[#374151] cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                                                >
                                                    <FaCreditCard /> Pay Now
                                                </button>
                                            </div>
                                        </div>

                                                            {/* Amount Due callout */}
                                                            <div className="rounded-md bg-[#2d3644] px-4 py-3 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
                                            <div>
                                                <div className="text-xs text-gray-300">Amount Due</div>
                                                                    <div className="text-3xl font-bold">{formatCurrency(amountDueDisplay)}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-300">Due Date</div>
                                                                    <div className="font-medium">{getNextDueDate()}</div>
                                            </div>
                                                            </div>

                                                            {/* Breakdown */}
                                                            <div className="text-sm font-medium mb-2">Payment Breakdown</div>
                                                            <div className="text-sm space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-300">Maintenance Charge</span>
                                                                    <span className="text-white">{formatCurrency(maintenanceAmt)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-300">Water Charge</span>
                                                                    <span className="text-white">{formatCurrency(waterAmt)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-300">Sinking Fund</span>
                                                                    <span className="text-white">{formatCurrency(sinkingAmt)}</span>
                                            </div>
                                                            </div>
                                                            <div className="border-t border-[#374151] mt-3 pt-3 flex items-center justify-between">
                                            <div className="text-sm text-gray-300">Total</div>
                                                                <div className="font-semibold">{formatCurrency(configTotal)}</div>
                                                            </div>
                                                        </div>

                                                        {/* Payment History */}
                                                        <div className="rounded-md shadow p-4 text-white bg-[#1f2937] border border-[#374151]">
                                        <div className="text-sm font-medium mb-2">Payment History</div>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full text-sm">
                                                <thead>
                                                    <tr className="bg-[#2a3340] text-left text-gray-300">
                                                        <th className="p-2">Date</th>
                                                        <th className="p-2">Amount</th>
                                                        <th className="p-2">Status</th>
                                                        <th className="p-2">Receipt</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-gray-100">
                                                    {payments.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={4} className="p-4 text-center text-gray-400">No payments yet</td>
                                                        </tr>
                                                    ) : (
                                                        payments.map((p) => (
                                                            <tr key={p.id} className="border-t border-[#374151] hover:bg-[#2d3748]">
                                                                <td className="p-2">{p.date}</td>
                                                                <td className="p-2">{formatCurrency(p.amount)}</td>
                                                                <td className="p-2"><span className="px-2 py-1 text-xs rounded-full font-semibold bg-green-600">Paid</span></td>
                                                                <td className="p-2 text-gray-200">{p.receipt}</td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                                        </div>
                                                    </div>

                                                    {/* Right column */}
                                                    <div className="space-y-4">
                                    {/* Quick Actions */}
                                    <div className="rounded-md shadow p-4 text-white bg-[#1f2937] border border-[#374151]">
                                        <div className="text-sm font-medium mb-3">Quick Actions</div>
                                        <div className="grid grid-cols-2 gap-3">
                                                                <button onClick={() => setActiveTab('Bills')} className="h-20 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex flex-col items-center justify-center gap-2">
                                                <FaFileInvoiceDollar />
                                                <span className="text-sm">View Bills</span>
                                            </button>
                                            <button onClick={handlePayNow} className="h-20 rounded-md bg-green-600 hover:bg-green-700 text-white flex flex-col items-center justify-center gap-2">
                                                <FaCreditCard />
                                                <span className="text-sm">Make Payment</span>
                                            </button>
                                            <button onClick={handleDownloadReceipt} className="h-20 rounded-md bg-purple-700 hover:bg-purple-800 text-white flex flex-col items-center justify-center gap-2">
                                                <FaDownload />
                                                <span className="text-sm">Download Receipts</span>
                                            </button>
                                            <button onClick={() => {
                                                const email = (typeof config === 'object' && config && config.contactEmail) ? config.contactEmail : '';
                                                if (email) {
                                                    // Open Gmail compose with pre-filled recipient
                                                    const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
                                                    window.open(gmailComposeUrl, '_blank');
                                                } else {
                                                    pushToast({ type: 'info', title: 'Contact Admin', description: 'Admin email not configured yet.' });
                                                }
                                            }} className="h-20 rounded-md bg-amber-600 hover:bg-amber-700 text-white flex flex-col items-center justify-center gap-2">
                                                <FaEnvelope />
                                                <span className="text-sm">Contact Admin</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Society Notices */}
                                    <div className="rounded-md shadow p-4 text-white bg-[#1f2937] border border-[#374151]">
                                        <div className="text-sm font-medium mb-3">Society Notices</div>
                                        <div className="space-y-2">
                                            {notices.length === 0 ? (
                                                <div className="text-sm text-gray-300">No notices available.</div>
                                            ) : (
                                                notices.map((n) => {
                                                    const Wrapper = n.url ? 'a' : 'div';
                                                    const wrapperProps = n.url ? {
                                                        href: n.url,
                                                        target: "_blank",
                                                        rel: "noreferrer",
                                                        download: true
                                                    } : {};
                                                    
                                                    return (
                                                        <Wrapper key={n.id} {...wrapperProps} className="flex items-center justify-between rounded-md bg-[#2a3340] px-3 py-2 hover:bg-[#253040] transition">
                                                            <div className="min-w-0 pr-3">
                                                                <div className="font-medium text-sm truncate" title={n.title || 'Notice'}>
                                                                    {n.title || 'Notice'}
                                                                    <span className="ml-2 inline-flex gap-1">
                                                                        {n.category && (
                                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${
                                                                                n.category === 'emergency' ? 'bg-red-600' :
                                                                                n.category === 'maintenance' ? 'bg-blue-600' :
                                                                                n.category === 'events' ? 'bg-green-600' :
                                                                                n.category === 'meetings' ? 'bg-purple-600' :
                                                                                'bg-gray-600'
                                                                            }`}>
                                                                                {n.category.charAt(0).toUpperCase() + n.category.slice(1)}
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                {(n.noticeDate || n.date || n.createdAt) && (
                                                                    <div className="text-xs text-gray-300">Date: {formatNoticeDate(n.noticeDate || n.date || n.createdAt)}</div>
                                                                )}
                                                                {n.description && (
                                                                    <div className="text-xs text-gray-400 line-clamp-2">{n.description}</div>
                                                                )}
                                                            </div>
                                                            {n.url && <FaCloudDownloadAlt className="text-gray-400 flex-shrink-0" />}
                                                        </Wrapper>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>


                                                    </div>
                                                </div>
                                                )}

                                                {activeTab === 'Bills' && (
                                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                                        <div className="lg:col-span-2 space-y-4">
                                                            <div className="rounded-md p-4 shadow border border-[#374151] text-white bg-[#1f2937]">
                                                                <div className="flex items-center justify-between mb-3">
                                                                    <div className="font-semibold">Current Maintenance Bill</div>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className={`px-2 py-1 text-xs rounded-full font-semibold ${isClear ? 'bg-green-600' : 'bg-red-600'}`}>{isClear ? 'Paid' : 'Unpaid'}</span>
                                                                        <button disabled={isClear} onClick={handlePayNow} className={`inline-flex items-center gap-2 px-4 py-2 rounded-md ${isClear ? 'bg-[#374151] cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
                                                                            <FaCreditCard /> Pay Now
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <div className="rounded-md bg-[#2d3644] px-4 py-3 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
                                                                    <div>
                                                                        <div className="text-xs text-gray-300">Amount Due</div>
                                                                        <div className="text-3xl font-bold">{formatCurrency(amountDueDisplay)}</div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-xs text-gray-300">Due Date</div>
                                                                        <div className="font-medium">{getNextDueDate()}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="text-sm font-medium mb-2">Payment Breakdown</div>
                                                                <div className="text-sm space-y-2">
                                                                    <div className="flex items-center justify-between"><span className="text-gray-300">Maintenance Charge</span><span className="text-white">{formatCurrency(maintenanceAmt)}</span></div>
                                                                    <div className="flex items-center justify-between"><span className="text-gray-300">Water Charge</span><span className="text-white">{formatCurrency(waterAmt)}</span></div>
                                                                    <div className="flex items-center justify-between"><span className="text-gray-300">Sinking Fund</span><span className="text-white">{formatCurrency(sinkingAmt)}</span></div>
                                                                </div>
                                                                <div className="border-t border-[#374151] mt-3 pt-3 flex items-center justify-between">
                                                                    <div className="text-sm text-gray-300">Total</div>
                                                                    <div className="font-semibold">{formatCurrency(configTotal)}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {activeTab === 'History' && (
                                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                                        <div className="lg:col-span-2 space-y-4">
                                                            <div className="rounded-md shadow p-4 text-white bg-[#1f2937] border border-[#374151]">
                                                                <div className="text-sm font-medium mb-2">Payment History</div>
                                                                <div className="overflow-x-auto">
                                                                    <table className="min-w-full text-sm">
                                                                        <thead>
                                                                            <tr className="bg-[#2a3340] text-left text-gray-300">
                                                                                <th className="p-2">Date</th>
                                                                                <th className="p-2">Amount</th>
                                                                                <th className="p-2">Status</th>
                                                                                <th className="p-2">Receipt</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="text-gray-100">
                                                                            {payments.length === 0 ? (
                                                                                <tr><td colSpan={4} className="p-4 text-center text-gray-400">No payments yet</td></tr>
                                                                            ) : (
                                                                                payments.map((p) => (
                                                                                    <tr key={p.id} className="border-t border-[#374151] hover:bg-[#2d3748]">
                                                                                        <td className="p-2">{p.date}</td>
                                                                                        <td className="p-2">{formatCurrency(p.amount)}</td>
                                                                                        <td className="p-2"><span className="px-2 py-1 text-xs rounded-full font-semibold bg-green-600">Paid</span></td>
                                                                                        <td className="p-2">{p.receipt}</td>
                                                                                    </tr>
                                                                                ))
                                                                            )}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                                {activeTab === 'Documents' && (
                                                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                                                        <div className="lg:col-span-2 space-y-4">
                                                                            <div className="rounded-md shadow p-4 text-white bg-[#1f2937] border border-[#374151]">
                                                                                <div className="text-sm font-medium mb-3">Documents</div>
                                                                                <div className="space-y-2">
                                                                                    {documents.length === 0 ? (
                                                                                        <div className="text-sm text-gray-300">No documents uploaded yet.</div>
                                                                                    ) : (
                                                                                        documents.map((doc) => (
                                                                                            <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-md bg-[#2a3340] px-3 py-2 hover:bg-[#253040]">
                                                                                                <div>
                                                                                                    <div className="font-medium text-sm">{doc.title || 'Document'}</div>
                                                                                                    {doc.date && (<div className="text-xs text-gray-300">Date: {doc.date}</div>)}
                                                                                                </div>
                                                                                                <FaCloudDownloadAlt className="text-gray-400" />
                                                                                            </a>
                                                                                        ))
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}

                

                                                <div className="mt-8" />
                        </div>
                    </main>
                    <Footer />
                </div>
                <PayModal
                    open={payOpen}
                    onClose={() => setPayOpen(false)}
                    uid={uid}
                    profile={profile}
                    dues={amountDueDisplay}
                    onSuccess={(rec) => {
                        pushToast({ type: 'success', title: 'Payment recorded', description: `Receipt ${rec.receipt}` });
                    }}
                />
            </Fragment>
        );
};

export default MemberDashboard;