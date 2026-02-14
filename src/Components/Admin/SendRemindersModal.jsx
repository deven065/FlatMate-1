import { useEffect, useState, useMemo } from "react";
import { FaTimes, FaEnvelope, FaCheckCircle } from "react-icons/fa";
import { ref, onValue } from "firebase/database";
import { db } from "../../firebase";
import { useToast } from "../Toast/useToast";

const SendRemindersModal = ({ open, onClose }) => {
    const { push: pushToast } = useToast();
    const [members, setMembers] = useState([]);
    const [config, setConfig] = useState(null);
    const [recentPayments, setRecentPayments] = useState([]);
    const [selectedMembers, setSelectedMembers] = useState(new Set());
    const [sending, setSending] = useState(false);

    // Load members from both users and members nodes
    useEffect(() => {
        if (!open) return;

        const usersRef = ref(db, "users");
        const membersRef = ref(db, "members");
        const processedIds = new Set();
        const allMembers = [];

        const unsubUsers = onValue(usersRef, (snapshot) => {
            const users = snapshot.val() || {};
            Object.entries(users).forEach(([id, user]) => {
                if (user.role === "member") {
                    processedIds.add(id);
                    allMembers.push({
                        id,
                        name: user.fullName || user.name || user.displayName || "Unknown",
                        flat: user.flatNumber || user.flat || "N/A",
                        email: user.email || "",
                        dues: user.dues || 0,
                        paid: user.paid || 0,
                    });
                }
            });

            onValue(membersRef, (snapshot) => {
                const members = snapshot.val() || {};
                Object.entries(members).forEach(([id, member]) => {
                    if (!processedIds.has(id)) {
                        allMembers.push({
                            id,
                            name: member.name || "Unknown",
                            flat: member.flat || "N/A",
                            email: member.email || "",
                            dues: member.dues || 0,
                            paid: member.paid || 0,
                        });
                    }
                });
                setMembers(allMembers);
            });
        });

        return () => unsubUsers();
    }, [open]);

    // Load config
    useEffect(() => {
        if (!open) return;
        const configRef = ref(db, "config/maintenance");
        const unsubscribe = onValue(configRef, (snapshot) => {
            setConfig(snapshot.val() || null);
        });
        return () => unsubscribe();
    }, [open]);

    // Load recent payments
    useEffect(() => {
        if (!open) return;
        const paymentsRef = ref(db, "recentPayments");
        const unsubscribe = onValue(paymentsRef, (snapshot) => {
            const val = snapshot.val() || {};
            const list = Object.entries(val).map(([id, p]) => ({ id, ...p }));
            setRecentPayments(list);
        });
        return () => unsubscribe();
    }, [open]);

    // Helper function to check if member has paid for current billing cycle
    const hasPaidCurrentCycle = (member) => {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;

        const memberPayments = recentPayments.filter((p) => {
            if (p.email && member.email) {
                const emailsMatch = p.email.toLowerCase().trim() === member.email.toLowerCase().trim();
                if (!emailsMatch) return false;
            } else if (p.flat && member.flat) {
                const flatsMatch = String(p.flat).trim() === String(member.flat).trim();
                if (!flatsMatch) return false;
            } else {
                return false;
            }

            let paymentDate;
            if (p.createdAt && typeof p.createdAt === "number") {
                paymentDate = new Date(p.createdAt);
            } else if (p.date) {
                const parts = String(p.date).split("/");
                if (parts.length === 3) {
                    paymentDate = new Date(`${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`);
                } else {
                    paymentDate = new Date(p.date);
                }
            } else {
                return false;
            }

            if (isNaN(paymentDate.getTime())) return false;

            return paymentDate.getFullYear() === currentYear && paymentDate.getMonth() + 1 === currentMonth;
        });

        return memberPayments.length > 0;
    };

    // Calculate pending members
    const pendingMembers = useMemo(() => {
        if (!config) return [];
        
        const maintenance = Number(config.maintenanceCharge || 0);
        const water = Number(config.waterCharge || 0);
        const sinking = Number(config.sinkingFund || 0);
        const totalDue = maintenance + water + sinking;

        return members
            .filter((m) => !hasPaidCurrentCycle(m) && m.email && totalDue > 0)
            .map((m) => ({
                ...m,
                amountDue: totalDue,
            }));
    }, [members, config, recentPayments]);

    const getDueDate = () => {
        if (!config) return "—";
        const iso = config.dueDateISO;
        if (iso) {
            const date = new Date(iso);
            if (!isNaN(date)) {
                return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
            }
        }
        return config.dueDate ? `${config.dueDate} of each month` : "—";
    };

    const formatCurrency = (n) =>
        `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedMembers(new Set(pendingMembers.map((m) => m.id)));
        } else {
            setSelectedMembers(new Set());
        }
    };

    const handleSelectMember = (id) => {
        const newSelected = new Set(selectedMembers);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedMembers(newSelected);
    };

    const handleSendReminders = async () => {
        if (selectedMembers.size === 0) {
            pushToast({ type: "warning", title: "No Selection", description: "Please select at least one member." });
            return;
        }

        setSending(true);

        // Simulate sending emails (in a real app, this would call an email service API)
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const selectedMembersData = pendingMembers.filter((m) => selectedMembers.has(m.id));
        
        // In a real application, you would send emails here using an email service like:
        // - Firebase Functions with Nodemailer
        // - SendGrid API
        // - AWS SES
        // - Twilio SendGrid
        
        // For now, we'll just show a success message
        console.log("Sending reminders to:", selectedMembersData.map(m => ({
            name: m.name,
            email: m.email,
            flat: m.flat,
            amount: m.amountDue,
            dueDate: getDueDate()
        })));

        setSending(false);
        pushToast({
            type: "success",
            title: "Reminders Sent",
            description: `Payment reminders sent to ${selectedMembers.size} member${selectedMembers.size > 1 ? "s" : ""}.`,
        });
        setSelectedMembers(new Set());
        onClose();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#1f2937] rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <FaEnvelope className="text-purple-600 text-2xl" />
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Send Payment Reminders</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition"
                    >
                        <FaTimes className="text-xl" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {pendingMembers.length === 0 ? (
                        <div className="text-center py-12">
                            <FaCheckCircle className="text-6xl text-green-500 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
                                All Clear!
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400">
                                No pending payments for this month. All members have paid.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                                    <strong>Due Date:</strong> {getDueDate()}
                                </p>
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    <strong>Reminder will include:</strong> Member name, flat number, pending amount, and payment instructions.
                                </p>
                            </div>

                            <div className="mb-4 flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="selectAll"
                                    checked={selectedMembers.size === pendingMembers.length}
                                    onChange={handleSelectAll}
                                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <label htmlFor="selectAll" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Select All ({pendingMembers.length} member{pendingMembers.length > 1 ? "s" : ""})
                                </label>
                            </div>

                            <div className="space-y-2">
                                {pendingMembers.map((member) => (
                                    <div
                                        key={member.id}
                                        className={`p-4 rounded-lg border-2 transition cursor-pointer ${
                                            selectedMembers.has(member.id)
                                                ? "border-purple-600 bg-purple-50 dark:bg-purple-900/20"
                                                : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-purple-400"
                                        }`}
                                        onClick={() => handleSelectMember(member.id)}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3 flex-1">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedMembers.has(member.id)}
                                                    onChange={() => handleSelectMember(member.id)}
                                                    className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <div className="flex-1">
                                                    <h4 className="font-semibold text-gray-800 dark:text-white">
                                                        {member.name}
                                                    </h4>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                                        Flat: {member.flat} • {member.email}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-red-600 dark:text-red-400">
                                                    {formatCurrency(member.amountDue)}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Pending</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                {pendingMembers.length > 0 && (
                    <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {selectedMembers.size} member{selectedMembers.size !== 1 ? "s" : ""} selected
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSendReminders}
                                disabled={sending || selectedMembers.size === 0}
                                className={`px-6 py-2 rounded-md flex items-center gap-2 font-medium transition ${
                                    sending || selectedMembers.size === 0
                                        ? "bg-gray-400 cursor-not-allowed"
                                        : "bg-purple-600 hover:bg-purple-700 text-white"
                                }`}
                            >
                                <FaEnvelope />
                                {sending ? "Sending..." : "Send Reminders"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SendRemindersModal;
