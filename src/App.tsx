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
import { doc, onSnapshot } from 'firebase/firestore';
import { db as firestoreDb } from './firebase';

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
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const ADMIN_SECRET = "exam-admin-2026";

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${ADMIN_SECRET}` };
      const [statsRes, schoolsRes, withdrawalsRes, activityRes] = await Promise.all([
        fetch('/admin/stats', { headers }),
        fetch('/admin/schools', { headers }),
        fetch('/admin/withdrawals', { headers }),
        fetch('/admin/activity', { headers })
      ]);

      if (statsRes.ok && schoolsRes.ok && withdrawalsRes.ok && activityRes.ok) {
        setStats(await statsRes.json());
        setSchools(await schoolsRes.json());
        setWithdrawals(await withdrawalsRes.json());
        setActivity(await activityRes.json());
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
      const res = await fetch('/admin/withdrawals/mark-paid', {
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
            { label: 'Users', value: stats?.totalUsers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Schools', value: stats?.totalSchools, icon: School, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Revenue', value: `₦${stats?.totalRevenue?.toLocaleString()}`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Payouts', value: `₦${stats?.totalWithdrawals?.toLocaleString()}`, icon: Wallet, color: 'text-orange-600', bg: 'bg-orange-50' },
          ].map((s, i) => (
            <div key={i} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", s.bg)}>
                <s.icon className={cn("w-5 h-5", s.color)} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
              <p className="text-xl font-black text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Withdrawals Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-orange-500" /> Pending Payouts
            </h2>
          </div>
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
                  {withdrawals.filter(w => w.status === 'pending').map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-800">{w.school_name}</p>
                        <p className="text-[10px] text-slate-400">{new Date(w.timestamp).toLocaleDateString()}</p>
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-slate-900">₦{w.amount.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-[10px] font-black uppercase">Pending</span>
                      </td>
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => markAsPaid(w.id)}
                          className="bg-nigeria-green text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition-all"
                        >
                          Mark Paid
                        </button>
                      </td>
                    </tr>
                  ))}
                  {withdrawals.filter(w => w.status === 'pending').length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400 italic">No pending withdrawals</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Schools List */}
          <section className="space-y-4">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <School className="w-5 h-5 text-purple-500" /> Schools
            </h2>
            <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 space-y-4">
                {schools.map((s) => (
                  <div key={s.school_id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{s.school_name}</p>
                      <p className="text-[10px] text-slate-400">{s.total_students} Students</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-nigeria-green">₦{s.total_earnings.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Activity Feed */}
          <section className="space-y-4">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" /> Activity
            </h2>
            <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 space-y-4">
                {activity.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 border-b border-slate-50 last:border-0">
                    <div className={cn(
                      "p-2 rounded-lg",
                      a.type === 'payment' ? 'bg-green-50 text-green-600' : 
                      a.type === 'school_registration' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'
                    )}>
                      {a.type === 'payment' ? <DollarSign className="w-3 h-3" /> : 
                       a.type === 'school_registration' ? <School className="w-3 h-3" /> : <Wallet className="w-3 h-3" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        {a.type === 'payment' ? `New Payment: ₦${a.amount}` : 
                         a.type === 'school_registration' ? `New School: ${a.school_name}` : `Withdrawal: ${a.school_name}`}
                      </p>
                      <p className="text-[10px] text-slate-400">{new Date(a.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
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

  const fetchDashboard = async () => {
    try {
      const res = await fetch("/school-dashboard", {
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
      const res = await fetch("/school-login", {
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
      const res = await fetch("/request-withdrawal", {
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
            <h2 className="text-2xl font-black text-slate-900">School Login</h2>
            <p className="text-sm text-slate-500">Enter your admin password to access the dashboard for <b>{school_slug}</b></p>
          </div>
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
            <Link to="/" className="block text-center text-xs text-slate-400 hover:text-slate-600 transition-all">
              Back to Home
            </Link>
          </form>
        </motion.div>
      </div>
    );
  }
