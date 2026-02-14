import {
  FaUsers,
  FaMoneyBillWave,
  FaExclamationCircle,
  FaQuestionCircle,
} from "react-icons/fa";
import { useEffect, useState } from "react";
import { db } from "../../firebase";
import { ref, onValue } from "firebase/database";

const StatCard = ({ icon, label, value, color }) => (
  <div className="flex items-center gap-4 p-4 rounded-lg bg-white dark:bg-[#1f2937] text-gray-800 dark:text-white shadow-md w-full">
    <div className={`text-2xl ${color}`}>{icon}</div>
    <div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  </div>
);

export default function DashboardStats() {
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalCollected: 0,
    totalDues: 0,
    openQueries: 0,
  });
  
  const [config, setConfig] = useState(null);
  const [recentPayments, setRecentPayments] = useState([]);

  // Helper function to check if member has paid for current billing cycle
  const hasPaidCurrentCycle = (member) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12
    
    const memberPayments = recentPayments.filter(p => {
      // Prioritize email matching (most accurate)
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
      if (p.createdAt && typeof p.createdAt === 'number') {
        paymentDate = new Date(p.createdAt);
      } else if (p.date) {
        const parts = String(p.date).split('/');
        if (parts.length === 3) {
          paymentDate = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
        } else {
          paymentDate = new Date(p.date);
        }
      } else {
        return false;
      }
      
      if (isNaN(paymentDate.getTime())) return false;
      
      return paymentDate.getFullYear() === currentYear && 
             (paymentDate.getMonth() + 1) === currentMonth;
    });
    
    return memberPayments.length > 0;
  };

  // Load maintenance config
  useEffect(() => {
    const configRef = ref(db, "config/maintenance");
    const unsubscribe = onValue(configRef, (snapshot) => {
      setConfig(snapshot.val() || null);
    });
    return () => unsubscribe();
  }, []);

  // Load recent payments
  useEffect(() => {
    const paymentsRef = ref(db, 'recentPayments');
    const off = onValue(paymentsRef, (snap) => {
      const val = snap.val() || {};
      const list = Object.entries(val).map(([id, p]) => ({ id, ...p }));
      setRecentPayments(list);
    });
    return () => off();
  }, []);

  useEffect(() => {
    const usersRef = ref(db, "users");
    const membersRef = ref(db, "members");
    const queriesRef = ref(db, "queries");

    let totalMembers = 0;
    let totalCollected = 0;
    let totalDues = 0;
    
    const processedIds = new Set(); // To avoid duplicates
    const allMembers = []; // Store all members for payment checking

    // 🔹 FETCH FROM users NODE
    onValue(usersRef, (snapshot) => {
      const users = snapshot.val() || {};
      
      // Reset counts
      totalMembers = 0;
      totalCollected = 0;
      totalDues = 0;
      processedIds.clear();
      allMembers.length = 0;

      Object.entries(users).forEach(([id, user]) => {
        if (user.role === "member") {
          processedIds.add(id);
          const memberData = {
            id,
            email: user.email,
            flat: user.flatNumber,
            dues: user.dues,
            paid: user.paid
          };
          allMembers.push(memberData);
          totalMembers++;
          totalCollected += Number(user.paid || 0);
        }
      });

      // 🔹 FETCH FROM members NODE
      onValue(membersRef, (snapshot) => {
        const members = snapshot.val() || {};

        Object.entries(members).forEach(([id, member]) => {
          // Skip if already counted from users
          if (processedIds.has(id)) return;
          
          const memberData = {
            id,
            email: member.email,
            flat: member.flat,
            dues: member.dues,
            paid: member.paid
          };
          allMembers.push(memberData);
          totalMembers++;
          totalCollected += Number(member.paid || 0);
        });

        // Calculate totalDues for members who haven't paid this cycle
        allMembers.forEach(member => {
          // Skip if member has paid for current cycle
          if (hasPaidCurrentCycle(member)) return;
          
          // Calculate dues from config (ignore database dues field)
          let dues = 0;
          if (config) {
            const maintenance = Number(config.maintenanceCharge || 0);
            const water = Number(config.waterCharge || 0);
            const sinking = Number(config.sinkingFund || 0);
            dues = maintenance + water + sinking;
          }
          totalDues += dues;
        });

        setStats((prev) => ({
          ...prev,
          totalMembers,
          totalCollected,
          totalDues,
        }));
      });
    });

    // 🔹 FETCH OPEN QUERIES
    onValue(queriesRef, (snapshot) => {
      const data = snapshot.val() || {};
      let openQueries = 0;

      Object.values(data).forEach((query) => {
        if (query.status === "open") openQueries++;
      });

      setStats((prev) => ({ ...prev, openQueries }));
    });
  }, [config, recentPayments]);

  return (
    <div className="flex flex-row justify-between gap-4 w-full flex-wrap xl:flex-nowrap">
      <StatCard
        icon={<FaUsers />}
        label="Total Members"
        value={stats.totalMembers}
        color="text-blue-500"
      />
      <StatCard
        icon={<FaMoneyBillWave />}
        label="Total Collected"
        value={`₹${stats.totalCollected.toLocaleString()}`}
        color="text-green-500"
      />
      <StatCard
        icon={<FaExclamationCircle />}
        label="Outstanding Dues"
        value={`₹${stats.totalDues.toLocaleString()}`}
        color="text-red-500"
      />
      <StatCard
        icon={<FaQuestionCircle />}
        label="Open Queries"
        value={stats.openQueries}
        color="text-yellow-500"
      />
    </div>
  );
}
