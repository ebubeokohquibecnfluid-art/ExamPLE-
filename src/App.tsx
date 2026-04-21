import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  GraduationCap, 
  MessageSquare, 
  Send, 
  Loader2, 
  Sparkles, 
  School, 
  CheckCircle2,
  Languages,
  ChevronRight,
  Volume2,
  VolumeX,
  PlayCircle,
  Pause,
  RotateCcw,
  RotateCw,
  Image as ImageIcon,
  Plus,
  Wallet,
  Settings,
  X,
  ArrowLeft,
  Copy,
  ExternalLink,
  Users,
  TrendingUp,
  DollarSign,
  ArrowRight,
  Shield,
  Activity,
  LogOut,
  Lock,
  User,
  AlertCircle,
  Mic,
  MicOff
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BrowserRouter, Routes, Route, useParams, useNavigate, Link } from 'react-router-dom';
import { cn } from './lib/utils';

type StudentLevel = "Primary" | "Secondary" | "Exam";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  timestamp: Date;
  audio?: string;
}

interface UserProfile {
  uid: string;
  credits: number;
  schoolId?: string;
  role?: 'admin' | 'user';
}

// --- API CONFIGURATION ---
// Change this to your Replit URL after deploying the backend
const API_BASE_URL = (import.meta as any).env.VITE_API_URL || ''; 

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("App error:", event.error);
      setHasError(true);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-8 rounded-[40px] shadow-xl max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-slate-900 mb-2">Something went wrong</h1>
          <p className="text-sm text-slate-500 mb-6">We encountered an error. Please try refreshing the page.</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-nigeria-green text-white py-4 rounded-2xl font-black hover:bg-green-700 transition-all"
          >
            Refresh App
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

function AdminDashboard({ showToast }: { showToast: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const [stats, setStats] = useState<any>(null);
  const [schools, setSchools] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [activePanel, setActivePanel] = useState<string | null>(null);

  const ADMIN_SECRET = "exam-admin-2026";

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${ADMIN_SECRET}` };
      const [statsRes, schoolsRes, withdrawalsRes, activityRes, usersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/stats`, { headers }),
        fetch(`${API_BASE_URL}/admin/schools`, { headers }),
        fetch(`${API_BASE_URL}/admin/withdrawals`, { headers }),
        fetch(`${API_BASE_URL}/admin/activity`, { headers }),
        fetch(`${API_BASE_URL}/admin/users`, { headers })
      ]);

      if (statsRes.ok && schoolsRes.ok && withdrawalsRes.ok && activityRes.ok && usersRes.ok) {
        setStats(await statsRes.json());
        setSchools(await schoolsRes.json());
        setWithdrawals(await withdrawalsRes.json());
        setActivity(await activityRes.json());
        setUsers(await usersRes.json());
      } else {
        setError("Failed to fetch admin data");
      }
    } catch (err) {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedAuth = localStorage.getItem('admin_auth');
    if (savedAuth === ADMIN_SECRET) {
      setIsAuthenticated(true);
      fetchData();
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_SECRET) {
      setIsAuthenticated(true);
      localStorage.setItem('admin_auth', ADMIN_SECRET);
      setLoading(true);
      fetchData();
    } else {
      showToast("Invalid password", "error");
    }
  };

  const markAsPaid = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/withdrawals/mark-paid`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ADMIN_SECRET}`
        },
        body: JSON.stringify({ withdrawal_id: id })
      });
      if (res.ok) {
        fetchData();
        showToast("Marked as paid", "success");
      }
    } catch (err) {
      showToast("Failed to mark as paid", "error");
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[40px] p-10 max-w-md w-full shadow-2xl"
        >
          <div className="text-center mb-8">
            <div className="bg-slate-900 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-black text-slate-900">Admin Access</h2>
            <p className="text-sm text-slate-500">Enter secret key to continue</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Secret Key</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-4 text-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm shadow-lg hover:bg-slate-800 transition-all active:scale-95">
              Unlock Dashboard
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans pb-12">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-lg">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-nigeria-green" />
          <h1 className="text-lg font-black leading-tight">ExamPLE Admin 🛡️</h1>
        </div>
        <button 
          onClick={() => {
            localStorage.removeItem('admin_auth');
            setIsAuthenticated(false);
          }}
          className="p-2 hover:bg-white/10 rounded-full transition-all"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="p-6 max-w-4xl mx-auto space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { id: 'users', label: 'Users', value: stats?.totalUsers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
            { id: 'schools', label: 'Schools', value: stats?.totalSchools, icon: School, color: 'text-purple-600', bg: 'bg-purple-50' },
            { id: 'revenue', label: 'Revenue', value: `₦${stats?.totalRevenue?.toLocaleString()}`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
            { id: 'payouts', label: 'Payouts', value: `₦${stats?.totalWithdrawals?.toLocaleString()}`, icon: Wallet, color: 'text-orange-600', bg: 'bg-orange-50' },
          ].map((s, i) => (
            <button 
              key={i} 
              onClick={() => setActivePanel(activePanel === s.id ? null : s.id)}
              className={cn(
                "bg-white p-5 rounded-3xl border transition-all text-left group relative hover:scale-105 active:scale-95",
                activePanel === s.id ? "border-slate-900 ring-2 ring-slate-900/10 shadow-lg" : "border-slate-200 shadow-sm"
              )}
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", s.bg)}>
                <s.icon className={cn("w-5 h-5", s.color)} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
              <p className="text-xl font-black text-slate-900">{s.value}</p>
              <div className="absolute top-4 right-4 text-[8px] font-bold text-slate-300 uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                {activePanel === s.id ? "Tap to close" : "Tap to view"}
              </div>
            </button>
          ))}
        </div>

        {/* Detailed Panels */}
        <AnimatePresence mode="wait">
          {activePanel === 'users' && (
            <motion.section 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" /> User Directory
              </h2>
              <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Student</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">School</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Credits</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Expiry</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {users.map((u) => (
                        <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-slate-800">{u.displayName || u.uid.slice(0, 8)}</p>
                            <p className="text-[10px] text-slate-400">{u.uid}</p>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600 font-medium">{u.school_name}</td>
                          <td className="px-6 py-4 text-sm font-black text-nigeria-green">{u.credits}</td>
                          <td className="px-6 py-4 text-[10px] text-slate-500">
                            {u.expiry_date ? new Date(u.expiry_date).toLocaleDateString() : "Never"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.section>
          )}

          {activePanel === 'schools' && (
            <motion.section 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <School className="w-5 h-5 text-purple-500" /> Registered Schools
              </h2>
              <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden text-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">School Name</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Code</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Students</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Earnings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {schools.map((s) => (
                        <tr key={s.school_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-sm font-bold text-slate-800">{s.school_name}</td>
                          <td className="px-6 py-4 text-xs font-mono font-black text-purple-600">{s.referral_code}</td>
                          <td className="px-6 py-4 text-xs font-bold text-slate-600">{s.total_students}</td>
                          <td className="px-6 py-4 text-sm font-black text-nigeria-green">₦{s.total_earnings?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.section>
          )}

          {activePanel === 'revenue' && (
            <motion.section 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-500" /> Revenue Ranking
              </h2>
              <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 space-y-3">
                  {schools.sort((a, b) => (b.total_earnings || 0) - (a.total_earnings || 0)).filter(s => (s.total_earnings || 0) > 0).map((s, i) => (
                    <div key={s.school_id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-black">#{i+1}</div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{s.school_name}</p>
                          <p className="text-[10px] text-slate-400">{s.referral_code}</p>
                        </div>
                      </div>
                      <p className="text-base font-black text-nigeria-green">₦{s.total_earnings.toLocaleString()}</p>
                    </div>
                  ))}
                  {schools.filter(s => (s.total_earnings || 0) > 0).length === 0 && (
                    <div className="py-10 text-center text-sm text-slate-400 italic">No revenue generated yet</div>
                  )}
                </div>
              </div>
            </motion.section>
          )}

          {activePanel === 'payouts' && (
            <motion.section 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-orange-500" /> Withdrawal Requests
              </h2>
              <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">School</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {withdrawals.map((w) => (
                        <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-slate-800">{w.school_name}</p>
                            <p className="text-[10px] text-slate-400">{new Date(w.timestamp).toLocaleDateString()}</p>
                          </td>
                          <td className="px-6 py-4 text-sm font-black text-slate-900">₦{w.amount.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-black uppercase",
                              w.status === 'paid' ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                            )}>
                              {w.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {w.status === 'pending' && (
                              <button 
                                onClick={() => markAsPaid(w.id)}
                                className="bg-nigeria-green text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition-all shadow-md active:scale-95"
                              >
                                Mark Paid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {withdrawals.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400 italic">No withdrawal requests found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Default Activity Feed (when no panel is active) */}
        {!activePanel && (
          <motion.section 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" /> System Activity
            </h2>
            <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 space-y-4">
                {activity.map((a, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors rounded-2xl border border-transparent hover:border-slate-100">
                    <div className={cn(
                      "p-3 rounded-xl",
                      a.type === 'payment' ? 'bg-green-50 text-green-600' : 
                      a.type === 'school_registration' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'
                    )}>
                      {a.type === 'payment' ? <DollarSign className="w-4 h-4" /> : 
                       a.type === 'school_registration' ? <School className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {a.type === 'payment' ? `Subscription: ₦${a.details?.amount}` : 
                         a.type === 'school_registration' ? `School Platform Launched: ${a.details?.school_name}` : `Withdrawal Request: ${a.details?.school_name}`}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-400 font-medium">{new Date(a.timestamp).toLocaleDateString()} at {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <div className="w-1 h-1 bg-slate-300 rounded-full" />
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{a.type}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {activity.length === 0 && (
                  <div className="py-20 text-center text-sm text-slate-400 italic">No recent activity detected</div>
                )}
              </div>
            </div>
          </motion.section>
        )}
      </main>
    </div>
  );
}

function SchoolDashboard({ showToast }: { showToast: (msg: string, type?: 'success' | 'error' | 'info') => void }) {
  const { school_slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchDashboard = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/school-dashboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_slug })
      });
      
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        setError("School not found");
      }
    } catch (err) {
      setError("Could not load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedAuth = localStorage.getItem(`school_auth_${school_slug}`);
    if (savedAuth === 'true') {
      setIsLoggedIn(true);
      fetchDashboard();
    } else {
      setLoading(false);
    }
  }, [school_slug]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    try {
      const res = await fetch(`${API_BASE_URL}/school-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_slug, password })
      });
      if (res.ok) {
        setIsLoggedIn(true);
        localStorage.setItem(`school_auth_${school_slug}`, 'true');
        setLoading(true);
        fetchDashboard();
      } else {
        showToast("Invalid password", "error");
      }
    } catch (err) {
      showToast("Login failed", "error");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/schools/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referral_code: resetCode, new_password: newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Password reset successfully! Please log in.", "success");
        setShowReset(false);
        setResetCode('');
        setNewPassword('');
      } else {
        showToast(data.error || "Reset failed. Check referral code.", "error");
      }
    } catch (err) {
      showToast("Reset failed", "error");
    } finally {
      setResetting(false);
    }
  };

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(withdrawalAmount);
    if (isNaN(amount) || amount < 5000) {
      showToast("Minimum withdrawal is ₦5,000", "error");
      return;
    }

    if (amount > data.total_earnings) {
      showToast("Insufficient balance", "error");
      return;
    }

    setWithdrawing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/request-withdrawal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: data.school_id, amount })
      });
      const result = await res.json();
      
      if (res.ok) {
        showToast(result.message, "success");
        setWithdrawalAmount('');
        fetchDashboard(); // Refresh data
      } else {
        showToast(result.error || "Withdrawal failed", "error");
      }
    } catch (err) {
      showToast("Withdrawal request failed", "error");
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-nigeria-green animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[40px] p-10 max-w-md w-full shadow-2xl"
        >
          <div className="text-center mb-8">
            <div className="bg-nigeria-green/10 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-nigeria-green" />
            </div>
            <h2 className="text-2xl font-black text-slate-900">{showReset ? "Reset Password" : "School Login"}</h2>
            <p className="text-sm text-slate-500">
              {showReset 
                ? "Verify your school's referral code to set a new password."
                : `Enter your admin password to access the dashboard for ${school_slug === 'dashboard' ? 'your school' : <b>{school_slug}</b>}`
              }
            </p>
          </div>

          {!showReset ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Admin Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-4 text-sm focus:ring-2 focus:ring-nigeria-green/10 focus:border-nigeria-green outline-none transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
              <button 
                type="submit" 
                disabled={loggingIn}
                className="w-full bg-nigeria-green text-white py-4 rounded-2xl font-black text-sm shadow-lg hover:bg-green-700 transition-all active:scale-95"
              >
                {loggingIn ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Unlock Dashboard"}
              </button>
              
              <div className="flex flex-col gap-3">
                <button 
                  type="button"
                  onClick={() => setShowReset(true)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-all"
                >
                  Forgot password?
                </button>
                <Link to="/" className="text-center text-xs text-slate-400 hover:text-slate-600 transition-all">
                  Back to Home
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Referral Code</label>
                  <input 
                    type="text" 
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-sm focus:ring-2 focus:ring-nigeria-green/10 focus:border-nigeria-green outline-none uppercase"
                    placeholder="e.g. AB1234"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">New Password</label>
                  <input 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-sm focus:ring-2 focus:ring-nigeria-green/10 focus:border-nigeria-green outline-none"
                    placeholder="Create a new password"
                    required
                  />
                </div>
              </div>
              <button 
                type="submit" 
                disabled={resetting}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm shadow-lg transition-all active:scale-95"
              >
                {resetting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Reset & Save Password"}
              </button>
              <button 
                type="button"
                onClick={() => setShowReset(false)}
                className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600 transition-all"
              >
                Back to Login
              </button>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="bg-red-100 p-4 rounded-full mb-4">
          <X className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">{error}</h2>
        <p className="text-slate-500 mb-6">Please check the URL or contact support.</p>
        <Link to="/" className="bg-nigeria-green text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-green-900/10">
          Go Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans pb-12">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-nigeria-green p-2 rounded-xl">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 leading-tight">ExamPLE Dashboard 🎓</h1>
            <p className="text-xs text-slate-500 font-medium">School: {data.school_name} 🏫</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link 
            to={`/${school_slug}`}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
          >
            Student App <ArrowRight className="w-3 h-3" />
          </Link>
          <button 
            onClick={() => {
              localStorage.removeItem(`school_auth_${school_slug}`);
              setIsLoggedIn(false);
            }}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-red-500 transition-all"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="p-6 max-w-lg mx-auto space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-blue-50 p-4 rounded-2xl">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Students</p>
              <p className="text-2xl font-black text-slate-900">{data.total_students}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-orange-50 p-4 rounded-2xl">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Users</p>
              <p className="text-2xl font-black text-slate-900">{data.active_users}</p>
            </div>
          </div>

          <div className="bg-nigeria-green p-6 rounded-[32px] shadow-lg shadow-green-900/10 flex items-center gap-4 text-white">
            <div className="bg-white/20 p-4 rounded-2xl">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Total Earnings</p>
              <p className="text-2xl font-black">₦{data.total_earnings.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Earnings Info */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 mb-2">Revenue Share</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            You earn <span className="text-nigeria-green font-bold">40%</span> of every student subscription. Payments are processed automatically.
          </p>
        </div>

        {/* Referral Section */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-slate-900">Your School Link</h3>
          <div className="flex items-center gap-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <code className="text-xs font-bold text-slate-600 flex-1 truncate">
              {window.location.origin}/{school_slug}
            </code>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/${school_slug}`);
                showToast("Link copied!", "success");
              }}
              className="p-2 hover:bg-white rounded-xl text-nigeria-green transition-all"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-slate-400 font-medium text-center">
            Share this link with your students to increase your earnings 🚀
          </p>
        </div>

        {/* Withdrawal Section */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Withdrawal</h3>
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Available</p>
              <p className="text-sm font-black text-nigeria-green">₦{data.total_earnings.toLocaleString()}</p>
            </div>
          </div>

          <form onSubmit={handleWithdrawal} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount (Min ₦5,000)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₦</span>
                <input 
                  type="number" 
                  placeholder="5000" 
                  value={withdrawalAmount}
                  onChange={(e) => setWithdrawalAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-8 pr-4 py-4 text-sm focus:ring-2 focus:ring-nigeria-green/20 focus:border-nigeria-green outline-none transition-all"
                />
              </div>
            </div>
            <button 
              type="submit" 
              disabled={withdrawing || !withdrawalAmount || Number(withdrawalAmount) < 5000}
              className="w-full bg-nigeria-green text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-green-900/10 hover:bg-green-700 transition-all disabled:bg-slate-200 disabled:shadow-none active:scale-95"
            >
              {withdrawing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Request Withdrawal"}
            </button>
          </form>

          {data.withdrawals && data.withdrawals.length > 0 && (
            <div className="pt-6 border-t border-slate-100">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Withdrawal History</h4>
              <div className="space-y-3">
                {data.withdrawals.map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-xs font-bold text-slate-800">₦{w.amount.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400">{new Date(w.timestamp).toLocaleDateString()}</p>
                    </div>
                    <div className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase",
                      w.status === 'paid' ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                    )}>
                      {w.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Activity Placeholder */}
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900">Recent Activity</h3>
          </div>
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                    <Users className="w-4 h-4 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">New Student Joined</p>
                    <p className="text-[10px] text-slate-400">{i} hour{i > 1 ? 's' : ''} ago</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-nigeria-green">+₦0</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function MainApp({ user, profile, onLogin, onLogout, refreshProfile, showToast, showSettings, setShowSettings }: { user: any | null, profile: UserProfile | null, onLogin: () => void, onLogout: () => void, refreshProfile: () => void, showToast: (msg: string, type?: any) => void, showSettings: boolean, setShowSettings: (show: boolean) => void }) {
  const { school_slug } = useParams();
  const navigate = useNavigate();
  
  // State
  const [level, setLevel] = useState<StudentLevel>('Secondary');
  const [subject, setSubject] = useState('');
  const [question, setQuestion] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [usePidgin, setUsePidgin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [activeAudioMessageId, setActiveAudioMessageId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [invalidSlug, setInvalidSlug] = useState<string | null>(null);
  
  // Modals
  const [showTopUp, setShowTopUp] = useState(false);
  const [showSchoolReg, setShowSchoolReg] = useState(false);
  const [registeredSchool, setRegisteredSchool] = useState<any>(null);
  
  // Inputs
  const [schoolCodeInput, setSchoolCodeInput] = useState('');
  const [schoolNameInput, setSchoolNameInput] = useState('');
  const [schoolPasswordInput, setSchoolPasswordInput] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          handleTranscription(base64Audio);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      showToast("Could not access microphone. Please check permissions.", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleTranscription = async (audioBase64: string) => {
    setTranscribing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64 })
      });
      const data = await res.json();
      if (data.text) {
        setQuestion(prev => prev ? `${prev} ${data.text}` : data.text);
      }
    } catch (err) {
      console.error("Transcription error:", err);
    } finally {
      setTranscribing(false);
    }
  };

  const userId = user?.uid || "guest";
  const credits = profile?.credits || 0;
  const chatEndRef = useRef<HTMLDivElement>(null);

  const createWavBlob = (pcmData: Int16Array, sampleRate: number) => {
    const buffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(buffer);

    // RIFF identifier
    view.setUint32(0, 0x52494646, false);
    // file length
    view.setUint32(4, 36 + pcmData.length * 2, true);
    // RIFF type
    view.setUint32(8, 0x57415645, false);
    // format chunk identifier
    view.setUint32(12, 0x666d7420, false);
    // format chunk length
    view.setUint32(16, 16, true); 
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    view.setUint32(36, 0x64617461, false);
    // data chunk length
    view.setUint32(40, pcmData.length * 2, true);

    for (let i = 0; i < pcmData.length; i++) {
      view.setInt16(44 + i * 2, pcmData[i], true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  // Load School Context
  useEffect(() => {
    if (school_slug) {
      const fetchSchool = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/schools/by-slug/${school_slug}`);
          if (res.ok) {
            const data = await res.json();
            setSchoolName(data.school_name);
            setSchoolId(data.school_id);
            setInvalidSlug(null);
          } else {
            console.warn("School not found, reverting to default");
            setSchoolName(null);
            setSchoolId(null);
            setInvalidSlug(school_slug);
            setTimeout(() => setInvalidSlug(null), 5000);
          }
        } catch (err) {
          console.error("Error fetching school context:", err);
        }
      };
      fetchSchool();
    } else {
      setSchoolName(null);
      setSchoolId(null);
    }
  }, [school_slug]);

  // Automatic school joining
  useEffect(() => {
    if (schoolId && userId !== 'guest' && profile && profile.schoolId !== schoolId) {
      const autoJoin = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/whatsapp/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, user_message: `JOIN ${schoolId}` })
          });
          if (res.ok) {
            refreshProfile();
            showToast(`Automatically joined ${schoolName || 'school'}!`, 'success');
          }
        } catch (e) {
          console.error("Auto-join failed", e);
        }
      };
      autoJoin();
    }
  }, [schoolId, userId, profile?.schoolId, schoolName]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Handle Payment Success Redirect
  useEffect(() => {
    if (window.location.pathname === '/payment-success') {
      showToast("Payment successful! Your credits have been updated.", "success");
      // Clean up the URL
      window.history.replaceState({}, document.title, "/");
      refreshProfile();
    }
  }, []);

  // Initial credit check removed as we use Firestore onSnapshot in App component

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImageBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() && !imageBase64) return;
    if (credits < 1) {
      setShowTopUp(true);
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
      image: imageBase64 || undefined,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setQuestion('');
    setImageBase64(null);
    setLoading(true);
    setError(null);

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/ask-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          level,
          subject,
          questionText: userMsg.content || "Explain this image",
          usePidgin,
          imageBase64: userMsg.image,
          school_id: schoolId,
          school_slug: school_slug,
          isVoice: isRecording // Charge 2 units if currently recording or just finished voice interaction
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.debug || data.error || "Something went wrong.");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      
      const assistantMsgId = (Date.now() + 1).toString();
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMsg]);
      setLoading(false); // Stop loading spinner once stream starts

      let fullContent = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
              refreshProfile();
              continue;
            }
            try {
              const data = JSON.parse(dataStr);
              if (data.error) throw new Error(data.debug || data.error);
              if (data.text) {
                fullContent += data.text;
                // Clean up unnecessary $ signs around single variables or simple formulas
                const cleanedContent = fullContent.replace(/\$([a-zA-Z0-9\s=\+\-\*\/]+)\$/g, '$1');
                setMessages(prev => prev.map(m => 
                  m.id === assistantMsgId ? { ...m, content: cleanedContent } : m
                ));
              }
            } catch (e) {
              console.error("Parse error:", e);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Submit error:", err);
      setError(err.message || "Teacher is busy. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const playAudio = async (text: string, messageId: string) => {
    if (activeAudioMessageId === messageId) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
      return;
    }

    // Stop previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    setAudioLoading(true);
    setActiveAudioMessageId(messageId);
    
    try {
      const res = await fetch(`${API_BASE_URL}/get-audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, usePidgin, user_id: userId })
      });
      const data = await res.json();
      
      if (data.audio) {
        let blob: Blob;
        
        if (data.mimeType === 'audio/mpeg') {
          // Direct MP3 from Cloud TTS
          const audioBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
          blob = new Blob([audioBytes], { type: 'audio/mpeg' });
        } else {
          // Fallback raw PCM from Gemini
          const audioData = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0)).buffer;
          const int16Array = new Int16Array(audioData);
          blob = createWavBlob(int16Array, 24000);
        }
        
        const url = URL.createObjectURL(blob);
        
        const audio = new Audio(url);
        audio.preload = "auto";
        audioRef.current = audio;
        setAudioUrl(url);
        
        audio.onended = () => {
          setIsPlaying(false);
          setActiveAudioMessageId(null);
        };

        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          setError("Audio playback interrupted.");
          setIsPlaying(false);
          setActiveAudioMessageId(null);
        };

        await audio.play();
        setIsPlaying(true);
      }
    } catch (err: any) {
      console.error("Audio error:", err);
      setError(err.message || "Could not play audio.");
      setActiveAudioMessageId(null);
    } finally {
      setAudioLoading(false);
    }
  };

  const seekAudio = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.duration, audioRef.current.currentTime + seconds));
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    setActiveAudioMessageId(null);
  };

  const handleJoinSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolCodeInput.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/whatsapp/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, user_message: `JOIN ${schoolCodeInput}` })
      });
      const data = await res.json();
      
      if (data.message.includes("Welcome to ExamPLE")) {
        const schoolMatch = data.message.match(/Powered by (.*) 🏫/);
        if (schoolMatch && schoolMatch[1]) {
          // Try to get the slug for redirection
          const searchSlug = schoolCodeInput.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const slugRes = await fetch(`${API_BASE_URL}/api/schools/by-slug/${searchSlug}`);
          if (slugRes.ok) {
            const slugData = await slugRes.json();
            navigate(`/${slugData.school_slug}`);
          } else {
            // Fallback: try direct code lookup if it was a code
            const codeRes = await fetch(`${API_BASE_URL}/api/schools/by-slug/${schoolCodeInput.toLowerCase()}`);
            if (codeRes.ok) {
              const codeData = await codeRes.json();
              navigate(`/${codeData.school_slug}`);
            } else {
              setSchoolName(schoolMatch[1]);
              setSchoolId(schoolCodeInput);
            }
          }
          setShowSettings(false);
          setSchoolCodeInput('');
          showToast(`Success! You are now connected to ${schoolMatch[1]}`, "success");
        }
      } else {
        showToast(data.message, "info");
      }
    } catch (err) {
      console.error("Join school error:", err);
      showToast("Could not join school. Please check the code.", "error");
    }
  };

  const handleBuyCredits = async (plan: string, amount: number, creditsToAdd: number) => {
    if (!user?.email) {
      showToast("Please log in to buy credits", "error");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/payments/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          amount,
          userId: userId,
          planName: plan
        })
      });
      
      const data = await res.json();
      
      if (data.status && data.data.authorization_url) {
        // Redirect to Paystack checkout
        window.location.href = data.data.authorization_url;
      } else {
        throw new Error(data.message || "Failed to initialize payment");
      }
    } catch (err: any) {
      console.error("Payment error:", err);
      showToast(err.message || "Payment initialization failed", "error");
    }
  };

  const handleSchoolRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolNameInput.trim() || !schoolPasswordInput.trim()) {
      showToast("School name and password are required", "error");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/register-school`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          school_name: schoolNameInput,
          password: schoolPasswordInput
        })
      });
      const data = await res.json();
      if (res.ok) {
        setRegisteredSchool(data);
        setShowSchoolReg(false);
        setSchoolNameInput('');
        setSchoolPasswordInput('');
        showToast("School registered successfully!", "success");
      } else {
        showToast(data.error || "Registration failed.", "error");
      }
    } catch (err) {
      console.error("Registration error:", err);
      showToast("Registration failed.", "error");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F0F2F5] font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-nigeria-green text-white px-4 py-3 flex items-center justify-between shadow-md z-20">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-full">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">ExamPLE</h1>
            <p className="text-[10px] opacity-90 font-medium uppercase tracking-wider">
              {schoolName ? `Powered by ${schoolName} 🏫` : "ExamPLE AI Tutor 🎓"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <button 
              onClick={() => setShowTopUp(true)}
              className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full flex items-center gap-2 transition-all"
            >
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <span className="text-xs font-bold">{credits} Credits</span>
            </button>
          )}
          
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-white/10 rounded-full transition-all"
            title="Settings & School Registration"
          >
            <Settings className="w-5 h-5" />
          </button>

          {!user && (
            <button 
              onClick={onLogin}
              className="bg-white text-nigeria-green px-4 py-1.5 rounded-full text-xs font-black shadow-sm hover:bg-slate-100 transition-all"
            >
              Join
            </button>
          )}
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 max-w-xs">
              <Sparkles className="w-12 h-12 text-nigeria-green mx-auto mb-4 opacity-20" />
              <h2 className="text-xl font-bold text-slate-800 mb-2">Welcome to ExamPLE!</h2>
              <p className="text-sm text-slate-500 mb-6">
                {schoolName ? `Let's help you pass your exams with ${schoolName}!` : "Ask any question, upload a photo of your homework, or just say hello!"}
              </p>
              <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={() => setQuestion("Explain the water cycle in simple English")}
                  className="text-xs bg-slate-50 hover:bg-slate-100 p-3 rounded-xl text-slate-600 font-medium transition-all text-left"
                >
                  "Explain the water cycle..."
                </button>
                <button 
                  onClick={() => setQuestion("How do I solve quadratic equations?")}
                  className="text-xs bg-slate-50 hover:bg-slate-100 p-3 rounded-xl text-slate-600 font-medium transition-all text-left"
                >
                  "How do I solve quadratic..."
                </button>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={cn(
              "flex flex-col max-w-[85%]",
              msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
            )}
          >
            <div className={cn(
              "p-4 rounded-2xl shadow-sm relative",
              msg.role === 'user' 
                ? "bg-nigeria-green text-white rounded-tr-none" 
                : "bg-white text-slate-800 rounded-tl-none border border-slate-200"
            )}>
              {msg.image && msg.image.trim() !== "" && (
                <img 
                  src={msg.image} 
                  alt="Uploaded" 
                  className="rounded-lg mb-3 max-h-60 object-cover w-full"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="markdown-body text-sm">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
              
              {msg.role === 'assistant' && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <button 
                      onClick={() => playAudio(msg.content, msg.id)}
                      disabled={audioLoading && activeAudioMessageId !== msg.id}
                      className="flex items-center gap-2 text-nigeria-green font-bold text-xs hover:opacity-80 transition-all"
                    >
                      {audioLoading && activeAudioMessageId === msg.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (isPlaying && activeAudioMessageId === msg.id) ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                      {(isPlaying && activeAudioMessageId === msg.id) ? "Pause" : 
                       (activeAudioMessageId === msg.id && !isPlaying) ? "Resume" : "Listen to Explanation"}
                    </button>
                    <span className="text-[10px] text-slate-400">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {activeAudioMessageId === msg.id && (
                    <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl">
                      <button 
                        onClick={() => seekAudio(-5)}
                        className="p-1 hover:bg-slate-200 rounded-lg transition-all text-slate-600"
                        title="Rewind 5s"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => playAudio(msg.content, msg.id)}
                        className="p-1 hover:bg-slate-200 rounded-lg transition-all text-nigeria-green"
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={() => seekAudio(5)}
                        className="p-1 hover:bg-slate-200 rounded-lg transition-all text-slate-600"
                        title="Forward 5s"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              {msg.role === 'user' && (
                <span className="text-[10px] text-white/60 mt-2 block text-right">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </motion.div>
        ))}

        {loading && (
          <div className="flex items-start mr-auto max-w-[85%]">
            <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-nigeria-green animate-spin" />
              <span className="text-sm text-slate-500 font-medium">Teacher is thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <div className="bg-red-50 text-red-600 text-xs px-4 py-2 rounded-full border border-red-100 font-medium">
              {error}
            </div>
          </div>
        )}

        {invalidSlug && (
          <div className="flex justify-center">
            <div className="bg-amber-50 text-amber-700 text-xs px-4 py-2 rounded-full border border-amber-100 font-medium shadow-sm animate-bounce">
              School not found. Continue with ExamPLE.
            </div>
          </div>
        )}
        
        <div ref={chatEndRef} />
      </main>

      {/* Input Area */}
      <div className="bg-white border-t border-slate-200 p-4 pb-8 z-20">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex items-end gap-1 sm:gap-2">
            <div className="flex-1 bg-slate-100 rounded-3xl p-0.5 sm:p-1 flex items-end border border-slate-200 focus-within:border-nigeria-green transition-all overflow-hidden">
              <label className="p-2 sm:p-3 cursor-pointer hover:bg-slate-200 rounded-full transition-all text-slate-500 shrink-0">
                <ImageIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
              
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={transcribing ? "Transcribing..." : "Type question..."}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-3 px-1 sm:px-2 max-h-32 resize-none outline-none min-w-0"
                rows={1}
                disabled={transcribing}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />

              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  "p-2 sm:p-3 rounded-full transition-all shrink-0",
                  isRecording ? "bg-red-100 text-red-600 animate-pulse" : "hover:bg-slate-200 text-slate-500"
                )}
                title={isRecording ? "Stop Recording" : "Voice Input"}
              >
                {isRecording ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
              </button>
              
              <button
                type="button"
                onClick={() => setUsePidgin(!usePidgin)}
                className={cn(
                  "m-1 px-2 sm:px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase transition-all shrink-0 whitespace-nowrap",
                  usePidgin ? "bg-yellow-400 text-green-900" : "bg-slate-200 text-slate-500"
                )}
              >
                {usePidgin ? "Pidgin" : "Eng"}
              </button>

              <button
                type="submit"
                disabled={loading || transcribing || (!question.trim() && !imageBase64)}
                className={cn(
                  "m-1 p-2 sm:p-3 rounded-full transition-all flex items-center justify-center shrink-0",
                  (loading || transcribing || (!question.trim() && !imageBase64)) 
                    ? "text-slate-300" 
                    : "bg-nigeria-green text-white shadow-md hover:bg-green-700 active:scale-95"
                )}
              >
                {transcribing || loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
          
          {imageBase64 && imageBase64.trim() !== "" && (
            <div className="mt-3 relative inline-block">
              <img src={imageBase64} alt="Preview" className="w-20 h-20 object-cover rounded-xl border-2 border-nigeria-green" />
              <button 
                onClick={() => setImageBase64(null)}
                className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-md"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="mt-4 flex items-center justify-center gap-4">
            <select 
              value={level} 
              onChange={(e) => setLevel(e.target.value as StudentLevel)}
              className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-transparent border-none focus:ring-0 outline-none cursor-pointer"
            >
              <option value="Primary">Primary</option>
              <option value="Secondary">Secondary</option>
              <option value="Exam">Exam Prep</option>
            </select>
            <div className="w-px h-3 bg-slate-300" />
            <input 
              type="text" 
              placeholder="Subject (e.g. Math)" 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-transparent border-none focus:ring-0 outline-none w-24"
            />
          </div>
        </form>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showTopUp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[40px] p-8 max-w-md w-full shadow-2xl relative"
            >
              <button onClick={() => setShowTopUp(false)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full">
                <X className="w-6 h-6 text-slate-400" />
              </button>
              
              <div className="text-center mb-8">
                <div className="bg-yellow-100 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-yellow-600" />
                </div>
                <h2 className="text-2xl font-black text-slate-900">Buy Credits</h2>
                <p className="text-sm text-slate-500">Choose a plan to continue learning</p>
              </div>

              <div className="space-y-3">
                {[
                  { name: 'Basic', price: 2500, credits: 50, color: 'bg-blue-50 border-blue-100 text-blue-700' },
                  { name: 'Premium', price: 4500, credits: 100, color: 'bg-green-50 border-green-100 text-green-700' },
                  { name: 'Max', price: 6500, credits: 250, color: 'bg-purple-50 border-purple-100 text-purple-700' },
                  { name: 'Top-up', price: 500, credits: 10, color: 'bg-yellow-50 border-yellow-100 text-yellow-700' },
                ].map((plan) => (
                  <button
                    key={plan.name}
                    onClick={() => handleBuyCredits(plan.name, plan.price, plan.credits)}
                    className={cn(
                      "w-full p-5 rounded-3xl border-2 flex items-center justify-between transition-all hover:scale-[1.02] active:scale-[0.98]",
                      plan.color
                    )}
                  >
                    <div className="text-left">
                      <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-1">
                        {plan.name} {plan.name !== 'Top-up' && " (30 Days)"}
                      </p>
                      <p className="text-2xl font-black">₦{plan.price.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black">{plan.credits}</p>
                      <p className="text-[10px] font-bold uppercase opacity-60">Units</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[40px] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-slate-900">Settings</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="space-y-6">
                {user && (
                  <>
                    <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-3 mb-4">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="User" className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-nigeria-green/10 flex items-center justify-center">
                          <User className="w-6 h-6 text-nigeria-green" />
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-bold text-slate-800 truncate">{user.displayName}</p>
                        <div className="flex items-center gap-1">
                          <p className="text-[9px] font-black text-nigeria-green bg-green-50 px-1.5 py-0.5 rounded-md uppercase tracking-wider">{user.code || 'NO CODE'}</p>
                        </div>
                      </div>
                      <button onClick={onLogout} className="p-2 hover:bg-red-50 text-red-500 rounded-xl transition-all">
                        <LogOut className="w-5 h-5" />
                      </button>
                    </div>
                    
                    {user.code && (
                      <div className="bg-slate-900 rounded-2xl p-4 text-white relative overflow-hidden group mb-4">
                        <div className="relative z-10">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Your Student Code</p>
                          <div className="flex items-center justify-between">
                            <p className="text-lg font-black tracking-widest">{user.code}</p>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(user.code || '');
                                showToast("Code copied to clipboard", "success");
                              }}
                              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-[9px] text-slate-500 mt-2 italic">Save this code to login from any device.</p>
                        </div>
                        <Shield className="absolute -right-4 -bottom-4 w-24 h-24 text-white/5 -rotate-12" />
                      </div>
                    )}
                  </>
                )}

                <form onSubmit={handleJoinSchool} className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Connect to School</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="School name or referral code" 
                      value={schoolCodeInput}
                      onChange={(e) => setSchoolCodeInput(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-nigeria-green/20 focus:border-nigeria-green outline-none transition-all"
                    />
                    <button type="submit" className="bg-nigeria-green text-white px-6 rounded-2xl font-bold text-sm hover:bg-green-700 transition-all">
                      Join
                    </button>
                  </div>
                </form>

                <div className="pt-6 border-t border-slate-100">
                  <button 
                    onClick={() => {
                      setShowSettings(false);
                      setShowSchoolReg(true);
                    }}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-white p-2 rounded-xl shadow-sm group-hover:scale-110 transition-all">
                        <School className="w-5 h-5 text-nigeria-green" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-800">Register Your School</p>
                        <p className="text-[10px] text-slate-500">Get your own white-label SaaS</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showSchoolReg && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[40px] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-8">
                <button onClick={() => { setShowSchoolReg(false); setShowSettings(true); }} className="p-2 hover:bg-slate-100 rounded-full">
                  <ArrowLeft className="w-6 h-6 text-slate-400" />
                </button>
                <h2 className="text-2xl font-black text-slate-900">School SaaS</h2>
              </div>

              <form onSubmit={handleSchoolRegister} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">School Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Green Field Academy" 
                      value={schoolNameInput}
                      onChange={(e) => setSchoolNameInput(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-sm focus:ring-2 focus:ring-nigeria-green/20 focus:border-nigeria-green outline-none transition-all"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Admin Password</label>
                    <input 
                      type="password" 
                      placeholder="Create a strong password" 
                      value={schoolPasswordInput}
                      onChange={(e) => setSchoolPasswordInput(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-sm focus:ring-2 focus:ring-nigeria-green/20 focus:border-nigeria-green outline-none transition-all"
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="w-full bg-nigeria-green text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-green-900/10 hover:bg-green-700 transition-all active:scale-95">
                  Launch Platform
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {registeredSchool && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[40px] p-8 max-w-md w-full shadow-2xl text-center"
            >
              <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-nigeria-green" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">Platform Ready!</h2>
              <p className="text-sm text-slate-500 mb-6">
                Congratulations! <strong>{registeredSchool.school_name}</strong> is now live.
              </p>
              
              <div className="bg-slate-50 rounded-3xl p-6 mb-6 space-y-4 text-left">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Your School Link</p>
                  <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-slate-200">
                    <code className="text-xs font-bold text-slate-700 flex-1 truncate">
                      {window.location.origin}/{registeredSchool.school_slug}
                    </code>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/${registeredSchool.school_slug}`);
                        showToast("Link copied!", "success");
                      }}
                      className="p-2 hover:bg-slate-50 rounded-lg text-nigeria-green"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Referral Code</p>
                  <p className="text-lg font-black text-nigeria-green">{registeredSchool.referral_code}</p>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={() => {
                    const slug = registeredSchool.school_slug;
                    setRegisteredSchool(null);
                    navigate(`/${slug}/dashboard`);
                  }}
                  className="w-full bg-nigeria-green text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-green-900/10 hover:bg-green-700 transition-all"
                >
                  Go to School Dashboard
                </button>
                <button 
                  onClick={() => {
                    const slug = registeredSchool.school_slug;
                    setRegisteredSchool(null);
                    navigate(`/${slug}`);
                  }}
                  className="w-full bg-slate-100 text-slate-700 py-4 rounded-2xl font-black text-lg hover:bg-slate-200 transition-all"
                >
                  Go to Student App
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SupportBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const quickReplies = [
    "How do I join?",
    "I forgot my student code",
    "How do I pay for credits?",
    "How do schools register?",
    "Forgot school password",
    "How do credits work?"
  ];

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user' as const, content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/support/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: messages, message: text })
      });
      const data = await res.json();
      if (res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
      }
    } catch (err) {
      console.error("Support chat error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[300]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-20 right-0 w-[350px] max-w-[calc(100vw-2rem)] h-[500px] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-nigeria-green p-5 text-white">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-black text-lg">ExamPLE Support</h3>
                <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/20 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-white/80 font-medium">Always here to help</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.length === 0 && (
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-200 text-sm text-slate-700 leading-relaxed shadow-sm">
                    Hello! I'm your ExamPLE Support AI. How can I help you today?
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {quickReplies.map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="text-left text-xs bg-white border border-slate-200 p-3 rounded-xl hover:border-nigeria-green hover:text-nigeria-green transition-all shadow-sm font-medium"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed",
                    m.role === 'user' 
                      ? "bg-nigeria-green text-white rounded-tr-none" 
                      : "bg-white text-slate-700 border border-slate-200 rounded-tl-none shadow-sm"
                  )}>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm">
                    <Loader2 className="w-4 h-4 text-nigeria-green animate-spin" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <form 
              onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
              className="p-4 border-t border-slate-100 flex gap-2 bg-white"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-nigeria-green/20 focus:border-nigeria-green"
              />
              <button 
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-nigeria-green text-white p-2 rounded-xl hover:bg-green-700 disabled:bg-slate-200 transition-all shadow-md active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-nigeria-green text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [loginStep, setLoginStep] = useState<'choice' | 'student' | 'return' | 'recover'>('choice');
  const [loginName, setLoginName] = useState('');
  const [returningCode, setReturningCode] = useState('');
  const [recoveryName, setRecoveryName] = useState('');
  const [recoverySlug, setRecoverySlug] = useState('');
  const [recoveredCode, setRecoveredCode] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

  const generateStudentCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchProfile = async (uid: string, displayName?: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/simple`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, displayName })
      });
      if (res.status === 429) {
        localStorage.removeItem('temp_user');
        localStorage.removeItem('exam_uid');
        localStorage.removeItem('exam_user');
        setUser(null);
        setProfile(null);
        setShowCodeModal(false);
        setLoginStep('return');
        setShowLoginModal(true);
        showToast("An account already exists from your network. Please log in with your Student Code.", "error");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
      showToast("Connection error. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/students/recover-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: recoveryName, school_slug: recoverySlug })
      });
      const data = await res.json();
      if (res.ok) {
        setRecoveredCode(data.code);
        showToast("Account found!", "success");
      } else {
        showToast(data.error || "Could not recover code", "error");
      }
    } catch (err) {
      showToast("Connection failed", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedUid = localStorage.getItem('exam_uid');
    if (savedUid) {
      const savedUser = JSON.parse(localStorage.getItem('exam_user') || '{}');
      setUser(savedUser);
      fetchProfile(savedUid);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    fetchProfile(user.uid);
  }, [user?.uid]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim()) return;
    
    const code = generateStudentCode();
    const uid = `user_${code}`;
    const newUser = { uid, displayName: loginName, email: `${uid}@example.com`, code };
    
    setGeneratedCode(code);
    setIsLoggingOut(false);
    
    // Store temporarily until they click "I've Saved It"
    localStorage.setItem('temp_user', JSON.stringify(newUser));
    setShowCodeModal(true);
    setShowLoginModal(false);
  };

  const handleLoginWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = returningCode.trim().toUpperCase();
    if (!cleanCode) return;

    setLoading(true);
    try {
      const uid = cleanCode.startsWith('USER_') ? cleanCode : `user_${cleanCode}`;
      const res = await fetch(`${API_BASE_URL}/api/auth/simple`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, returnOnly: true })
      });
      
      if (res.ok) {
        const data = await res.json();
        const displayCode = cleanCode.replace('USER_', '');
        const newUser = { uid, displayName: data.displayName || "Student", email: `${uid}@example.com`, code: displayCode };
        
        localStorage.setItem('exam_uid', uid);
        localStorage.setItem('exam_user', JSON.stringify(newUser));
        setUser(newUser);
        setProfile(data);
        setShowLoginModal(false);
        setLoginStep('choice');
        setReturningCode('');
        showToast("Welcome back!", "success");
      } else {
        showToast("Invalid code. Please check and try again.", "error");
      }
    } catch (err) {
      showToast("Connection failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const finalizeLogin = () => {
    const tempUser = localStorage.getItem('temp_user');
    if (tempUser) {
      const userObj = JSON.parse(tempUser);
      localStorage.setItem('exam_uid', userObj.uid);
      localStorage.setItem('exam_user', tempUser);
      localStorage.removeItem('temp_user');
      setUser(userObj);
      fetchProfile(userObj.uid, userObj.displayName);
      setShowCodeModal(false);
      setLoginStep('choice');
      setLoginName('');
      setRecoveryName('');
      setRecoverySlug('');
      setRecoveredCode(null);
      showToast(`Welcome, ${userObj.displayName}!`, "success");
    }
  };

  const handleLogout = () => {
    if (user?.code) {
      setGeneratedCode(user.code);
      setIsLoggingOut(true);
      setShowCodeModal(true);
      setShowSettings(false);
    } else {
      performLogout();
    }
  };

  const performLogout = () => {
    localStorage.removeItem('exam_uid');
    localStorage.removeItem('exam_user');
    setUser(null);
    setProfile(null);
    setShowCodeModal(false);
    showToast("Logged out successfully", "info");
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-nigeria-green animate-spin" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainApp user={user} profile={profile} onLogin={() => { console.log("Login clicked"); setShowLoginModal(true); }} onLogout={handleLogout} refreshProfile={() => user && fetchProfile(user.uid)} showToast={showToast} showSettings={showSettings} setShowSettings={setShowSettings} />} />
          <Route path="/admin" element={<AdminDashboard showToast={showToast} />} />
          <Route path="/:school_slug" element={<MainApp user={user} profile={profile} onLogin={() => { console.log("Login clicked"); setShowLoginModal(true); }} onLogout={handleLogout} refreshProfile={() => user && fetchProfile(user.uid)} showToast={showToast} showSettings={showSettings} setShowSettings={setShowSettings} />} />
          <Route path="/:school_slug/dashboard" element={<SchoolDashboard showToast={showToast} />} />
        </Routes>
      </BrowserRouter>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px]"
            style={{ 
              backgroundColor: toast.type === 'success' ? '#008751' : toast.type === 'error' ? '#ef4444' : '#1e293b',
              color: 'white'
            }}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
            <span className="text-sm font-bold">{toast.message}</span>
          </motion.div>
        )}

        {showCodeModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] p-10 max-w-md w-full shadow-2xl text-center"
            >
              <div className="bg-nigeria-green/10 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Shield className="w-10 h-10 text-nigeria-green" />
              </div>
              
              <h2 className="text-2xl font-black text-slate-900 mb-2">
                {isLoggingOut ? "Logout Confirmation" : "Save Your Student Code"}
              </h2>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                {isLoggingOut 
                  ? "Before you log out, make sure you have your Student Code. You will need it to log back in next time."
                  : "This is your unique access code. Screenshot it or write it down. You'll need it to log back into your account."}
              </p>
              
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-8 mb-8 relative group">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-left ml-1">Your Code</p>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-black tracking-[0.2em] text-slate-900">{generatedCode}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(generatedCode);
                      showToast("Code copied to clipboard!", "success");
                    }}
                    className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-nigeria-green hover:text-nigeria-green transition-all"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(generatedCode);
                    if (isLoggingOut) {
                      performLogout();
                    } else {
                      finalizeLogin();
                    }
                  }}
                  className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-slate-900/20 hover:scale-[1.02] transition-all"
                >
                  I've Saved It
                </button>
                
                {isLoggingOut && (
                  <button 
                    onClick={() => setShowCodeModal(false)}
                    className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-all"
                  >
                    Cancel Logout
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {showLoginModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] p-10 max-w-md w-full shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="bg-nigeria-green/10 p-3 rounded-2xl">
                  {loginStep !== 'choice' ? (
                    <button onClick={() => {
                      if (loginStep === 'recover' && recoveredCode) {
                        setRecoveredCode(null);
                      } else {
                        setLoginStep(loginStep === 'recover' ? 'return' : 'choice');
                      }
                    }} className="hover:scale-110 transition-all">
                      <ArrowLeft className="w-8 h-8 text-nigeria-green" />
                    </button>
                  ) : (
                    <GraduationCap className="w-8 h-8 text-nigeria-green" />
                  )}
                </div>
                <button onClick={() => { setShowLoginModal(false); setLoginStep('choice'); setRecoveredCode(null); }} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>
              
              {loginStep === 'choice' ? (
                <>
                  <h2 className="text-2xl font-black text-slate-900 mb-2">Join ExamPLE</h2>
                  <p className="text-sm text-slate-500 mb-8">Choose how you want to use the platform.</p>
                  
                  <div className="space-y-4">
                    <button 
                      onClick={() => setLoginStep('student')}
                      className="w-full flex items-center gap-4 p-6 bg-slate-50 rounded-3xl border-2 border-transparent hover:border-nigeria-green hover:bg-white transition-all group text-left"
                    >
                      <div className="bg-white p-3 rounded-2xl shadow-sm group-hover:scale-110 transition-all">
                        <Plus className="w-6 h-6 text-nigeria-green" />
                      </div>
                      <div>
                        <p className="font-black text-slate-900">New Student</p>
                        <p className="text-xs text-slate-500">Create a fresh learning account</p>
                      </div>
                    </button>

                    <button 
                      onClick={() => setLoginStep('return')}
                      className="w-full flex items-center gap-4 p-6 bg-slate-50 rounded-3xl border-2 border-transparent hover:border-blue-500 hover:bg-white transition-all group text-left"
                    >
                      <div className="bg-white p-3 rounded-2xl shadow-sm group-hover:scale-110 transition-all">
                        <RotateCw className="w-6 h-6 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-black text-slate-900">Returning Student</p>
                        <p className="text-xs text-slate-500">Enter your code to get back in</p>
                      </div>
                    </button>

                    <button 
                      onClick={() => {
                        setShowLoginModal(false);
                        setShowSettings(true);
                      }}
                      className="w-full flex items-center gap-4 p-6 bg-slate-50 rounded-3xl border-2 border-transparent hover:border-purple-500 hover:bg-white transition-all group text-left"
                    >
                      <div className="bg-white p-3 rounded-2xl shadow-sm group-hover:scale-110 transition-all">
                        <School className="w-6 h-6 text-purple-500" />
                      </div>
                      <div>
                        <p className="font-black text-slate-900">I am a School</p>
                        <p className="text-xs text-slate-500">Register or manage school portal</p>
                      </div>
                    </button>
                  </div>
                </>
              ) : loginStep === 'return' ? (
                <>
                  <h2 className="text-2xl font-black text-slate-900 mb-2">Welcome Back</h2>
                  <p className="text-sm text-slate-500 mb-8">Enter your Student Code to restore your account.</p>
                  
                  <form onSubmit={handleLoginWithCode} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Student Code</label>
                      <input 
                        type="text" 
                        autoFocus
                        value={returningCode}
                        onChange={(e) => setReturningCode(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-center text-xl font-black tracking-widest focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all uppercase"
                        placeholder="e.g. A1B2C3"
                        required
                      />
                    </div>
                    <button 
                      type="submit" 
                      className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-blue-900/10 hover:bg-blue-700 transition-all active:scale-95"
                    >
                      Restore Account
                    </button>
                    <button 
                      type="button"
                      onClick={() => setLoginStep('recover')}
                      className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600 transition-all"
                    >
                      Lost your code?
                    </button>
                  </form>
                </>
              ) : loginStep === 'recover' ? (
                <>
                  <h2 className="text-2xl font-black text-slate-900 mb-2">Recover Code</h2>
                  {!recoveredCode ? (
                    <>
                      <p className="text-sm text-slate-500 mb-8">Enter your name to find your account. If you joined through a school, also add the school slug.</p>
                      <form onSubmit={handleRecoverCode} className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-nigeria-green/10 focus:border-nigeria-green outline-none"
                            placeholder="e.g. Ebube Okoh"
                            value={recoveryName}
                            onChange={(e) => setRecoveryName(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">School Slug <span className="text-slate-300 normal-case font-semibold">(optional — school students only)</span></label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-nigeria-green/10 focus:border-nigeria-green outline-none"
                            placeholder="e.g. kings-college — leave blank if you joined independently"
                            value={recoverySlug}
                            onChange={(e) => setRecoverySlug(e.target.value)}
                          />
                        </div>
                        <button className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black">Find My Code</button>
                      </form>
                    </>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-slate-500 mb-6">Account found! Here is your code:</p>
                      <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-6 mb-6">
                        <span className="text-2xl font-black tracking-widest text-slate-900">{recoveredCode}</span>
                      </div>
                      <div className="space-y-3">
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(recoveredCode);
                            showToast("Code copied!", "success");
                          }}
                          className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-700 py-4 rounded-2xl font-bold"
                        >
                          <Copy className="w-4 h-4" /> Copy Code
                        </button>
                        <button 
                          onClick={() => {
                            setReturningCode(recoveredCode);
                            setLoginStep('return');
                            setRecoveredCode(null);
                          }}
                          className="w-full bg-nigeria-green text-white py-4 rounded-2xl font-black shadow-lg"
                        >
                          Go to Login
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-black text-slate-900 mb-2">Student Login</h2>
                  <p className="text-sm text-slate-500 mb-8">Enter your name to start learning with ExamPLE.</p>
                  
                  <form onSubmit={handleLoginSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Your Name</label>
                      <input 
                        type="text" 
                        autoFocus
                        value={loginName}
                        onChange={(e) => setLoginName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-nigeria-green/10 focus:border-nigeria-green outline-none transition-all"
                        placeholder="e.g. Ebube Okoh"
                        required
                      />
                    </div>
                    <button 
                      type="submit" 
                      className="w-full bg-nigeria-green text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-green-900/10 hover:bg-green-700 transition-all active:scale-95"
                    >
                      Start Learning
                    </button>
                  </form>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <SupportBot />
    </ErrorBoundary>
  );
}
