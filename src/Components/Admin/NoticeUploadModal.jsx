import { useState, useMemo } from "react";
import { ref as dbRef, push, onValue } from "firebase/database";
import { ref as stRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "../../firebase";
import { useToast } from "../Toast/useToast";
import { FaTimes, FaFileUpload, FaExclamationTriangle, FaClock, FaUsers, FaTag, FaCalendarAlt } from "react-icons/fa";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/jpg",
];

export default function NoticeUploadModal({ open, onClose }) {
  const { push: toast } = useToast();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState("");
  const [noticeDate, setNoticeDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [category, setCategory] = useState("general"); // maintenance | events | meetings | general | emergency
  const [audience, setAudience] = useState("all"); // all | flats
  const [allFlats, setAllFlats] = useState([]);
  const [flatQuery, setFlatQuery] = useState("");
  const [selectedFlats, setSelectedFlats] = useState([]); // array of flat numbers
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [task, setTask] = useState(null);
  const [etaSeconds, setEtaSeconds] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [autoResumed, setAutoResumed] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const stallRef = { timerId: null };

  const categories = [
    { value: "general", label: "General", color: "bg-gray-500" },
    { value: "maintenance", label: "Maintenance", color: "bg-blue-500" },
    { value: "events", label: "Events", color: "bg-green-500" },
    { value: "meetings", label: "Meetings", color: "bg-purple-500" },
    { value: "emergency", label: "Emergency", color: "bg-red-500" },
  ];

  const formatETA = (s) => {
    if (!Number.isFinite(s) || s <= 0) return "--";
    const m = Math.floor(s / 60);
    const sec = Math.max(0, Math.round(s - m * 60));
    if (m <= 0) return `${sec}s left`;
    return `${m}m ${sec}s left`;
  };

  const todayISO = useMemo(() => new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10), []);
  // initialize default date once
  if (!noticeDate) setNoticeDate(todayISO);

  // Load list of flats for selection when modal is open
  if (open && allFlats.length === 0) {
    try {
      const usersRef = dbRef(db, 'users');
      onValue(usersRef, (snap) => {
        const val = snap.val() || {};
        const flats = Object.values(val)
          .filter((u) => (u?.role || 'member') === 'member')
          .map((u) => String(u.flatNumber || '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
        const unique = Array.from(new Set(flats));
        setAllFlats(unique);
      }, { onlyOnce: true });
    } catch {/* ignore */}
  }

  if (!open) return null;

  const submit = async () => {
    if (!title.trim()) {
      toast({ type: "error", title: "Enter title" });
      return;
    }
    if (!description.trim()) {
      toast({ type: "error", title: "Enter description" });
      return;
    }
    // File is optional, but if provided, validate it
    if (file) {
      if (file.size > MAX_SIZE_BYTES) {
        toast({ type: "error", title: "File too large", description: "Max size is 10 MB" });
        return;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast({ type: "error", title: "Unsupported file type", description: "Please upload PDF, DOC, DOCX, JPG, or PNG" });
        return;
      }
    }
    // Ensure notice date is valid
    if (noticeDate) {
      const nd = new Date(noticeDate);
      if (isNaN(nd)) {
        toast({ type: 'error', title: 'Invalid notice date' });
        return;
      }
    }
    // Validate expiry date
    if (expiryDate) {
      const ed = new Date(expiryDate);
      const nd = noticeDate ? new Date(noticeDate) : new Date();
      if (isNaN(ed)) {
        toast({ type: 'error', title: 'Invalid expiry date' });
        return;
      }
      if (ed < nd) {
        toast({ type: 'error', title: 'Expiry date must be after notice date' });
        return;
      }
    }
    if (audience === 'flats' && selectedFlats.length === 0) {
      toast({ type: 'error', title: 'Select at least one flat' });
      return;
    }

    setSubmitting(true);
    setProgress(0);
    setEtaSeconds(null);
    setErrorMsg("");
    try {
      let url = null;
      let path = null;

      // Only upload file if one is provided
      if (file) {
        const name = `${Date.now()}_${file.name}`;
        path = `notices/${name}`;
        const storageRef = stRef(storage, path);
        const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });
        setTask(uploadTask);
        const start = Date.now();
        url = await new Promise((resolve, reject) => {
          uploadTask.on('state_changed',
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setProgress(pct);
              const elapsed = (Date.now() - start) / 1000;
              const speed = snap.bytesTransferred / Math.max(1, elapsed); // bytes/sec
              const remaining = Math.max(0, snap.totalBytes - snap.bytesTransferred);
              const eta = speed > 0 ? remaining / speed : null;
              setEtaSeconds(eta);
            },
            (err) => reject(err),
            async () => {
              try {
                // add a timeout guard for getDownloadURL
                const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out finalizing upload')), 15000));
                const urlP = getDownloadURL(uploadTask.snapshot.ref);
                const u = await Promise.race([urlP, timeout]);
                resolve(u);
              } catch (e) {
                reject(e);
              }
            }
          );

          // Stall watchdog: if still at 0% after 10s, try a one-time resume; if still 0% at 15s, abort
          let checks = 0;
          stallRef.timerId = setInterval(() => {
            checks += 1;
            const current = uploadTask.snapshot?.bytesTransferred || 0;
            if (current > 0) {
              clearInterval(stallRef.timerId);
              stallRef.timerId = null;
              return;
            }
            if (checks === 4 && uploadTask.snapshot?.state === 'running' && !autoResumed) {
              // after ~12s (3s*4), attempt resume once
              try { uploadTask.resume?.(); setAutoResumed(true); } catch { /* ignore */ }
            }
            if (checks >= 5) { // ~15s
              try { uploadTask.cancel?.(); } catch { /* ignore */ }
              clearInterval(stallRef.timerId);
              stallRef.timerId = null;
              reject(new Error('Upload stalled at 0%. Check network or Firebase Storage rules.'));
            }
          }, 3000);
        });
      }

      const rec = {
        title,
        ...(url && { url, path }),
        createdAt: Date.now(),
        uploadedBy: "admin",
        ...(description && { description }),
        ...(noticeDate && { noticeDate: new Date(noticeDate).getTime() }),
        ...(expiryDate && { expiryAt: new Date(expiryDate).getTime() }),
        category,
        audience,
        ...(audience === 'flats' && selectedFlats.length > 0 && { targetFlats: selectedFlats }),
      };
      await push(dbRef(db, "notices"), rec);
      toast({ type: "success", title: file ? "Notice uploaded successfully" : "Notice published successfully" });
      onClose?.();
      // Reset form
      setTitle("");
      setFile(null);
      setDescription("");
      setNoticeDate(todayISO);
      setExpiryDate("");
      setCategory("general");
      setAudience("all");
      setSelectedFlats([]);
      setProgress(0);
      setTask(null);
      setEtaSeconds(null);
      if (stallRef.timerId) { clearInterval(stallRef.timerId); stallRef.timerId = null; }
    } catch (err) {
      const code = err?.code || '';
      const msg = code.includes('unauthorized') ? 'Permission denied. Check Firebase Storage rules.'
        : code.includes('canceled') ? 'Upload canceled.'
        : err.message;
      setErrorMsg(msg || 'Upload failed');
      toast({ type: "error", title: "Upload failed", description: msg });
      try {
        await push(dbRef(db, 'logs/uploadErrors'), {
          createdAt: Date.now(),
          code: err?.code || null,
          message: err?.message || String(err),
          fileName: file?.name || null,
          fileType: file?.type || null,
          fileSize: file?.size || null,
          uploaderUid: auth?.currentUser?.uid || null,
        });
      } catch { /* ignore log errors */ }
    } finally {
      setSubmitting(false);
      if (stallRef.timerId) { clearInterval(stallRef.timerId); stallRef.timerId = null; }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={submitting ? undefined : onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="upload-notice-title"
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl bg-white dark:bg-[#1f2937] text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-[#1f2937] px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FaFileUpload className="text-amber-600 text-2xl" />
            <h2 id="upload-notice-title" className="text-xl font-semibold">Upload Society Notice</h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition disabled:opacity-50"
          >
            <FaTimes className="text-xl" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <FaTag className="text-gray-500" />
              Basic Information
            </h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notice Title <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#111827] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="e.g., Monthly Maintenance Payment Due"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#111827] px-4 py-2.5 text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="Provide details about the notice..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#111827] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/50"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={submitting}
              >
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Configuration */}
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <FaCalendarAlt className="text-gray-500" />
              Date Configuration
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notice Date
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#111827] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/50"
                  value={noticeDate}
                  onChange={(e) => setNoticeDate(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                  <FaClock className="text-xs" />
                  Expiry Date (Optional)
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#111827] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/50"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  min={noticeDate || todayISO}
                  disabled={submitting}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Notice will auto-hide after this date
                </p>
              </div>
            </div>
          </div>

          {/* Target Audience */}
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <FaUsers className="text-gray-500" />
              Target Audience
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Send Notice To
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#111827] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/50"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                disabled={submitting}
              >
                <option value="all">All Members</option>
                <option value="flats">Specific Flats</option>
              </select>
            </div>

            {audience === 'flats' && (
              <div className="rounded-lg border border-gray-300 dark:border-gray-600 p-4 bg-gray-50 dark:bg-[#111827]">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={flatQuery}
                    onChange={(e) => setFlatQuery(e.target.value)}
                    placeholder="Search flat (e.g., A-101)"
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1f2937] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/50"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="px-3 py-2 text-xs rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition"
                    onClick={() => setSelectedFlats(allFlats)}
                    disabled={submitting}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 text-xs rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                    onClick={() => setSelectedFlats([])}
                    disabled={submitting}
                  >
                    Clear
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto grid grid-cols-3 gap-2">
                  {allFlats
                    .filter((f) => !flatQuery || f.toLowerCase().includes(flatQuery.toLowerCase()))
                    .map((f) => {
                      const checked = selectedFlats.includes(f);
                      return (
                        <label
                          key={f}
                          className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer transition ${
                            checked
                              ? 'bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-500'
                              : 'bg-white dark:bg-[#1f2937] border border-gray-300 dark:border-gray-600 hover:border-amber-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedFlats((prev) => Array.from(new Set([...prev, f])));
                              else setSelectedFlats((prev) => prev.filter((x) => x !== f));
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                            disabled={submitting}
                          />
                          <span className="font-medium">{f}</span>
                        </label>
                      );
                    })}
                </div>

                {selectedFlats.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      Selected: {selectedFlats.length} flat{selectedFlats.length > 1 ? 's' : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedFlats.map((f) => (
                        <span
                          key={f}
                          className="text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Document Upload */}
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <FaFileUpload className="text-gray-500" />
              Upload Document <span className="text-xs text-gray-500 dark:text-gray-400">(Optional)</span>
            </h3>

            <div
              className={`rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/10'
                  : 'border-gray-300 dark:border-gray-600 hover:border-amber-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              } ${submitting ? 'opacity-50 pointer-events-none' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) setFile(f);
              }}
              onClick={() => !submitting && document.getElementById('notice-file-input')?.click()}
            >
              <FaFileUpload className="mx-auto mb-3 h-12 w-12 text-gray-400" />
              <div className="text-sm mb-2">
                <span className="text-amber-600 dark:text-amber-400 font-semibold">Click to upload</span>
                <span className="text-gray-600 dark:text-gray-400"> or drag and drop</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                PDF, DOC, DOCX, JPG, PNG up to 10MB
              </div>
              <input
                id="notice-file-input"
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                }}
                disabled={submitting}
              />
            </div>

            {file && (
              <div className="flex items-center gap-4 p-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-[#111827]">
                <div className="w-16 h-16 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 flex items-center justify-center text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20">
                  {file.type.includes('image') ? (
                    <img
                      src={URL.createObjectURL(file)}
                      alt="Preview"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    (file.type?.split('/')[1] || 'file').toUpperCase().slice(0, 4)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate text-gray-800 dark:text-white" title={file.name}>
                    {file.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type.split('/')[1]?.toUpperCase() || 'FILE'}
                  </div>
                </div>
                {!submitting && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="text-red-500 hover:text-red-700 transition"
                  >
                    <FaTimes />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Category Badge Preview */}
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-[#111827] border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Preview:</p>
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${
                  categories.find((c) => c.value === category)?.color || 'bg-gray-500'
                }`}
              >
                {categories.find((c) => c.value === category)?.label || 'General'}
              </span>
              {expiryDate && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
                  <FaClock className="text-xs" />
                  Expires: {new Date(expiryDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          </div>

          {/* Upload Progress */}
          {submitting && (
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center justify-between text-sm mb-2 text-amber-800 dark:text-amber-300">
                <span className="font-medium">Uploading notice...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-amber-200 dark:bg-amber-900/30 overflow-hidden">
                <div
                  className="h-2 bg-amber-600 dark:bg-amber-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {etaSeconds != null && (
                <div className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                  {formatETA(etaSeconds)}
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 flex items-start gap-3">
              <FaExclamationTriangle className="text-red-600 dark:text-red-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">Upload Failed</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-[#1f2937] px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            className="px-5 py-2.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition disabled:opacity-50"
            onClick={
              submitting
                ? () => {
                    try {
                      task?.cancel();
                    } catch {
                      /* ignore */
                    }
                  }
                : onClose
            }
            disabled={submitting && progress > 0}
          >
            {submitting ? (file ? 'Cancel Upload' : 'Cancel') : 'Cancel'}
          </button>
          <button
            className="px-6 py-2.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 transition"
            onClick={submit}
            disabled={submitting}
          >
            <FaFileUpload />
            {submitting ? (file ? 'Uploading...' : 'Publishing...') : errorMsg ? 'Retry' : 'Publish Notice'}
          </button>
        </div>
      </div>
    </div>
  );
}
