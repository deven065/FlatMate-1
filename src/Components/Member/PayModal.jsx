import { useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";
import { ref, push, set, update, get } from "firebase/database";
import { db } from "../../firebase";

const PayModal = ({ open, onClose, uid, profile, dues = 0, onSuccess }) => {
  const [method, setMethod] = useState(null); // 'upi' | 'card' | 'cash'
  const [loading, setLoading] = useState(false);

  // UPI
  const [upiId, setUpiId] = useState("");

  // Card
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCVV, setCardCVV] = useState("");

  // compute total amount to pay (not editable by user)
  const amount = Number(dues) > 0
    ? Number(dues)
    : Number(profile?.maintenance || 0) + Number(profile?.water || 0) + Number(profile?.sinking || 0);

  useEffect(() => {
    if (!open) {
      setMethod(null);
      setUpiId("");
      setCardName(""); setCardNumber(""); setCardExpiry(""); setCardCVV("");
      setLoading(false);
    }
  }, [open]);

  const validate = () => {
    if (!method) return "Select a payment method.";
    if (!amount || amount <= 0) return "No amount due to pay.";
    if (method === "upi") {
      if (!upiId || !/^[\w.\-]{3,}@[\w]+$/.test(upiId.trim())) return "Enter a valid UPI ID (e.g. name@bank).";
    }
    if (method === "card") {
      if (!cardName.trim()) return "Cardholder name is required.";
      const num = cardNumber.replace(/\s+/g, "");
      if (!/^\d{12,19}$/.test(num)) return "Enter a valid card number.";
      if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) return "Expiry must be MM/YY.";
      if (!/^\d{3,4}$/.test(cardCVV)) return "Enter a valid CVV.";
    }
    // cash needs no extra validation
    return null;
  };

  const maskCard = (num) => {
    const s = (num || "").replace(/\s+/g, "");
    if (s.length <= 4) return s;
    return "**** **** **** " + s.slice(-4);
  };

  const handlePay = async () => {
    const err = validate();
    if (err) return alert(err);

    setLoading(true);
    try {
      const now = Date.now();
      const receiptId = `RCPT-${now}-${Math.floor(Math.random()*9000+1000)}`;

      // determine previous due
      const prevDue = Number(dues) > 0 ? Number(dues) : amount;
      const paid = Number(amount);
      const remainingDue = Math.max(0, Number((prevDue - paid).toFixed(2)));

      const payment = {
        uid: uid || null,
        email: profile?.email || null,
        name: profile?.fullName || profile?.name || profile?.displayName || null,
        member: profile?.fullName || profile?.name || profile?.displayName || null,
        flat: profile?.flatNumber || profile?.flat || null,
        amount: Number(paid),
        method,
        methodDetails:
          method === "upi"
            ? { upi: upiId.trim() }
            : method === "card"
            ? { name: cardName.trim(), card: maskCard(cardNumber) }
            : { note: "Paid in cash" },
        receipt: receiptId,
        date: new Date().toLocaleDateString("en-IN"),
        createdAt: now,
        previousDue: Number(prevDue),
        remainingDue: Number(remainingDue),
      };

      // write recent payment
      const newRef = push(ref(db, "recentPayments"));
      await set(newRef, payment);

      // update user's dues and paid in users node to remaining due and increment paid
      if (uid) {
        const paidSnap = await get(ref(db, `users/${uid}/paid`));
        const currentPaid = Number(paidSnap.val() ?? 0);
        const newPaid = Number((currentPaid + paid).toFixed(2));
        await update(ref(db, `users/${uid}`), { dues: Number(remainingDue), paid: newPaid });
      }

      // Also update matching record in 'members' node (if present) so admin list reflects the change.
      try {
        const membersSnap = await get(ref(db, 'members'));
        if (membersSnap.exists()) {
          const membersObj = membersSnap.val();
          const match = Object.entries(membersObj).find(([, m]) => {
            if (!m) return false;
            const emailMatch = profile?.email && m.email === profile.email;
            const flatMatch = (profile?.flatNumber && m.flat === profile.flatNumber) || (profile?.flat && m.flat === profile.flat);
            return emailMatch || flatMatch;
          });
          if (match) {
            const [memberId, memberVal] = match;
            const memberPaid = Number(memberVal.paid || 0);
            const updatedMemberPaid = Number((memberPaid + paid).toFixed(2));
            await update(ref(db, `members/${memberId}`), { dues: Number(remainingDue), paid: updatedMemberPaid });
          }
        }
      } catch (err) {
        console.warn('Failed to update members node after payment', err);
      }

      setLoading(false);
      onSuccess && onSuccess(payment);
      onClose && onClose();
    } catch (e) {
      setLoading(false);
      alert("Payment failed: " + (e?.message || e));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg bg-white rounded shadow-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="font-semibold">Make Payment — ₹{Number(amount).toLocaleString("en-IN")}</div>
          <button onClick={onClose} className="text-gray-600"><FaTimes /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setMethod("upi")} className={`flex-1 p-2 rounded border ${method==="upi" ? "bg-blue-600 text-white" : "bg-white"}`}>UPI</button>
            <button onClick={() => setMethod("card")} className={`flex-1 p-2 rounded border ${method==="card" ? "bg-blue-600 text-white" : "bg-white"}`}>Card</button>
            <button onClick={() => setMethod("cash")} className={`flex-1 p-2 rounded border ${method==="cash" ? "bg-blue-600 text-white" : "bg-white"}`}>Cash</button>
          </div>

          {/* Total Amount Due (Read-only) */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-600 mb-1">Total Amount Due</div>
            <div className="text-3xl font-bold text-gray-900">₹{Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-xs text-gray-500 mt-1">This is your complete outstanding balance</div>
          </div>

          {method === "upi" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">UPI ID</label>
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="example@bank"
                className="w-full p-2 border rounded"
              />
              <div className="text-xs text-gray-500">After entering your UPI ID, click Pay to record the payment. (This UI records the payment; integrate a gateway for live UPI flow.)</div>
            </div>
          )}

          {method === "card" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Cardholder Name</label>
              <input value={cardName} onChange={(e) => setCardName(e.target.value)} className="w-full p-2 border rounded" />

              <label className="text-sm font-medium">Card Number</label>
              <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="1234 5678 9012 3456" className="w-full p-2 border rounded" />

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-sm font-medium">Expiry (MM/YY)</label>
                  <input value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} placeholder="MM/YY" className="w-full p-2 border rounded" />
                </div>
                <div className="w-32">
                  <label className="text-sm font-medium">CVV</label>
                  <input value={cardCVV} onChange={(e) => setCardCVV(e.target.value)} placeholder="123" className="w-full p-2 border rounded" />
                </div>
              </div>
            </div>
          )}

          {method === "cash" && (
            <div className="text-sm text-gray-700">
              Pay the amount in cash to the society office/treasurer and click Pay to record the transaction.
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded border">Cancel</button>
            <button onClick={handlePay} disabled={loading} className="px-4 py-2 rounded bg-blue-600 text-white">
              {loading ? "Processing..." : `Pay ₹${Number(amount).toLocaleString("en-IN")}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayModal;
