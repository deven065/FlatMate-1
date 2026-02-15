import { useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";
import { ref, push, set, update, get } from "firebase/database";
import { db } from "../../firebase";
import { processRazorpayPayment } from "../../utils/razorpay";

const PayModal = ({ open, onClose, uid, profile, dues = 0, onSuccess }) => {
  const [method, setMethod] = useState(null); // 'razorpay' | 'cash'
  const [loading, setLoading] = useState(false);

  // compute total amount to pay (not editable by user)
  const amount = Number(dues) > 0
    ? Number(dues)
    : Number(profile?.maintenance || 0) + Number(profile?.water || 0) + Number(profile?.sinking || 0);

  useEffect(() => {
    if (!open) {
      setMethod(null);
      setLoading(false);
    }
  }, [open]);

  const validate = () => {
    if (!method) return "Select a payment method.";
    if (!amount || amount <= 0) return "No amount due to pay.";
    // cash needs no extra validation
    return null;
  };

  const handlePay = async () => {
    const err = validate();
    if (err) return alert(err);

    setLoading(true);
    try {
      let receiptId;
      let paymentId = null;
      let orderId = null;
      const now = Date.now();

      // Handle Razorpay payment
      if (method === "razorpay") {
        try {
          const razorpayResult = await processRazorpayPayment({
            amount: amount,
            name: profile?.fullName || profile?.name || profile?.displayName || "Member",
            email: profile?.email || "",
            contact: profile?.phone || profile?.contact || "",
            description: `Maintenance payment for Flat ${profile?.flatNumber || profile?.flat || ""}`,
            notes: {
              uid: uid,
              flat: profile?.flatNumber || profile?.flat,
              email: profile?.email,
            },
          });

          if (!razorpayResult || !razorpayResult.receipt) {
            throw new Error("Invalid payment response from Razorpay");
          }

          receiptId = razorpayResult.receipt;
          paymentId = razorpayResult.payment_id;
          orderId = razorpayResult.order_id;
        } catch (razorpayError) {
          console.error("Razorpay payment error:", razorpayError);
          setLoading(false);
          const errorMessage = razorpayError?.message || razorpayError?.error?.description || "Payment processing failed. Please try again.";
          alert("Payment failed: " + errorMessage);
          return;
        }
      } else {
        // Cash payment
        receiptId = `RCPT-${now}-${Math.floor(Math.random()*9000+1000)}`;
      }

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
          method === "razorpay"
            ? { 
                payment_id: paymentId,
                order_id: orderId,
                gateway: "Razorpay"
              }
            : { note: "Paid in cash" },
        receipt: receiptId,
        date: new Date().toLocaleDateString("en-IN"),
        createdAt: now,
        previousDue: Number(prevDue),
        remainingDue,
        status: "completed"
      };

      // Save payment to database
      const paymentsRef = ref(db, "recentPayments");
      const newPaymentRef = push(paymentsRef);
      await set(newPaymentRef, payment);

      // Get current paid amount and update user's profile
      const userRef = ref(db, `users/${uid}`);
      const userSnapshot = await get(userRef);
      const currentPaid = Number(userSnapshot.val()?.paid || 0);
      const newTotalPaid = currentPaid + paid;

      await update(userRef, { 
        dues: remainingDue,
        paid: newTotalPaid,
        lastPayment: now
      });

      setLoading(false);
      alert(`Payment of ₹${paid.toFixed(2)} successful! Receipt: ${receiptId}`);
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Payment error:", error);
      setLoading(false);
      alert("Payment failed: " + (error?.message || "Unknown error"));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Pay Dues</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <FaTimes size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-5">
          {/* Payment Method Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
            <div className="flex gap-3">
              <button
                onClick={() => setMethod("razorpay")} 
                className={`flex-1 p-3 rounded border font-medium transition-colors ${
                  method==="razorpay" 
                    ? "bg-blue-600 text-white border-blue-600" 
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                💳 Online Payment
              </button>
              <button 
                onClick={() => setMethod("cash")} 
                className={`flex-1 p-3 rounded border font-medium transition-colors ${
                  method==="cash" 
                    ? "bg-blue-600 text-white border-blue-600" 
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                💵 Cash
              </button>
            </div>
          </div>

          {/* Total Amount Due (Read-only) */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-5">
            <div className="text-sm font-medium text-blue-700 mb-1">Total Amount Due</div>
            <div className="text-4xl font-bold text-blue-900 mb-1">
              ₹{Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-blue-600">Complete outstanding balance</div>
          </div>

          {method === "razorpay" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">✅</div>
                <div className="flex-1">
                  <div className="font-medium text-green-900 mb-1">Secure Online Payment</div>
                  <div className="text-sm text-green-700 mb-2">
                    Pay securely using UPI, Credit/Debit Cards, Net Banking, or Wallets via Razorpay.
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="inline-flex items-center px-2 py-1 bg-white rounded text-xs font-medium text-gray-700">
                      🔒 SSL Encrypted
                    </span>
                    <span className="inline-flex items-center px-2 py-1 bg-white rounded text-xs font-medium text-gray-700">
                      ⚡ Instant Receipt
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {method === "cash" && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">ℹ️</div>
                <div className="flex-1">
                  <div className="font-medium text-yellow-900 mb-1">Cash Payment</div>
                  <div className="text-sm text-yellow-700">
                    Please pay the amount in cash to the society office/treasurer. Click "Pay" after making the cash payment to record the transaction.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button 
              onClick={onClose} 
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handlePay} 
              disabled={loading} 
              className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Processing..." : method === "razorpay" ? "💳 Pay Now" : `Confirm Payment`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayModal;
