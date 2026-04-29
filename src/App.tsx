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
  MicOff,
  Trophy,
  Clock,
  BarChart2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Award,
  ChevronDown,
  Flame,
  Zap,
  Trash2,
  GitBranch,
  UserCheck,
  UserX,
  UserPlus
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BrowserRouter, Routes, Route, useParams, useNavigate, Link } from 'react-router-dom';
import { cn } from './lib/utils';

type StudentLevel = "Primary" | "Secondary" | "Exam";

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'join-prompt';
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
  expiry_date?: string;
  trial_expires_at?: string;
  school?: {
    school_name: string;
    school_slug: string;
    primary_color?: string;
    logo_url?: string;
    tagline?: string;
  };
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
  const [topupUid, setTopupUid] = useState('');
  const [topupCredits, setTopupCredits] = useState(50);
  const [topupLoading, setTopupLoading] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<any | null>(null);
  const [schoolStudents, setSchoolStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'user' | 'school'; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [githubSync, setGithubSync] = useState<{ entries: any[]; lastFailure: any; message?: string } | null>(null);
  const [githubSyncLoading, setGithubSyncLoading] = useState(false);

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

  const fetchGithubSync = async () => {
    setGithubSyncLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/github-sync-status`, {
        headers: { 'x-admin-secret': ADMIN_SECRET }
      });
      if (res.ok) {
        setGithubSync(await res.json());
      }
    } catch (_) {
    } finally {
      setGithubSyncLoading(false);
    }
  };

  useEffect(() => {
    const savedAuth = localStorage.getItem('admin_auth');
    if (savedAuth === ADMIN_SECRET) {
      setIsAuthenticated(true);
      fetchData();
      fetchGithubSync();
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
      fetchGithubSync();
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

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topupUid.trim()) return showToast("Please select or enter a user ID", "error");
    setTopupLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_SECRET}` },
        body: JSON.stringify({ uid: topupUid.trim(), credits: topupCredits })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Done! ${data.displayName} now has ${data.creditsAfter} credits (was ${data.creditsBefore})`, "success");
        setTopupUid('');
        fetchData();
      } else {
        showToast(data.error || "Top-up failed", "error");
      }
    } catch {
      showToast("Connection error", "error");
    } finally {
      setTopupLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const url = deleteConfirm.type === 'user'
        ? `${API_BASE_URL}/admin/users/${deleteConfirm.id}`
        : `${API_BASE_URL}/admin/schools/${deleteConfirm.id}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${ADMIN_SECRET}` }
      });
      if (res.ok) {
        showToast(`${deleteConfirm.type === 'user' ? 'Student' : 'School'} deleted`, 'success');
        setDeleteConfirm(null);
        if (deleteConfirm.type === 'user' && selectedSchool) {
          setSchoolStudents(prev => prev.filter(s => s.uid !== deleteConfirm.id));
        }
        fetchData();
      } else {
        const data = await res.json();
        showToast(data.error || 'Delete failed', 'error');
      }
    } catch { showToast('Connection error', 'error'); }
    finally { setDeleting(false); }
  };

  const handleViewSchoolStudents = async (school: any) => {
    setSelectedSchool(school);
    setLoadingStudents(true);
    setSchoolStudents([]);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/schools/${school.school_id}/students`, {
        headers: { 'Authorization': `Bearer ${ADMIN_SECRET}` }
      });
      if (res.ok) setSchoolStudents(await res.json());
    } catch { /* silent */ }
    finally { setLoadingStudents(false); }
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

        {/* Top-up Card */}
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2 mb-5">
            <Zap className="w-5 h-5 text-yellow-500" /> Top-up Credits
          </h2>
          <form onSubmit={handleTopup} className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">User ID</label>
              <input
                type="text"
                value={topupUid}
                onChange={e => setTopupUid(e.target.value)}
                placeholder="Tap a user row below, or paste UID here"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none transition-all font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Credits to Add</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {[10, 50, 100, 250, 500].map(n => (
                  <button key={n} type="button" onClick={() => setTopupCredits(n)}
                    className={cn("px-4 py-2 rounded-xl text-xs font-black transition-all", topupCredits === n ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                    {n}
                  </button>
                ))}
                <input type="number" min={1} value={topupCredits} onChange={e => setTopupCredits(Number(e.target.value))}
                  className="w-20 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-center focus:ring-2 focus:ring-slate-900/10 outline-none" />
              </div>
            </div>
            <button type="submit" disabled={topupLoading || !topupUid.trim()}
              className="w-full bg-nigeria-green text-white py-3 rounded-2xl font-black text-sm shadow hover:opacity-90 transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2">
              {topupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {topupLoading ? "Adding credits..." : `Add ${topupCredits} credits`}
            </button>
          </form>
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
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Access Until</th>
                        <th className="px-4 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {users.map((u) => (
                        <tr key={u.uid}
                          onClick={() => { setTopupUid(u.uid); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className="hover:bg-yellow-50 transition-colors cursor-pointer group"
                          title="Tap to select for top-up">
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-slate-800 group-hover:text-yellow-700">{u.displayName || u.uid.slice(0, 8)}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{u.uid}</p>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600 font-medium">{u.school_name}</td>
                          <td className="px-6 py-4 text-sm font-black text-nigeria-green">{u.credits}</td>
                          <td className="px-6 py-4 text-[10px]">
                            {u.expiry_date ? (
                              <div>
                                <span className="text-[8px] font-black text-purple-400 uppercase block">Plan</span>
                                <span className="text-slate-600">{new Date(u.expiry_date).toLocaleDateString()}</span>
                              </div>
                            ) : u.trial_expires_at ? (
                              <div>
                                <span className="text-[8px] font-black text-blue-400 uppercase block">Trial</span>
                                <span className={new Date(u.trial_expires_at) < new Date() ? "text-red-400 line-through" : "text-slate-600"}>
                                  {new Date(u.trial_expires_at).toLocaleDateString()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">No expiry</span>
                            )}
                          </td>
                          <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setDeleteConfirm({ type: 'user', id: u.uid, name: u.displayName || u.uid.slice(0, 10) })}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                              title="Delete student"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
                        <th className="px-4 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {schools.map((s) => (
                        <tr
                          key={s.school_id}
                          onClick={() => handleViewSchoolStudents(s)}
                          className="hover:bg-purple-50 transition-colors cursor-pointer group"
                          title="Click to view students"
                        >
                          <td className="px-6 py-4 text-sm font-bold text-slate-800 group-hover:text-purple-700">{s.school_name}</td>
                          <td className="px-6 py-4 text-xs font-mono font-black text-purple-600">{s.referral_code}</td>
                          <td className="px-6 py-4 text-xs font-bold text-slate-600">{s.total_students}</td>
                          <td className="px-6 py-4 text-sm font-black text-nigeria-green">₦{s.total_earnings?.toLocaleString()}</td>
                          <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setDeleteConfirm({ type: 'school', id: s.school_id, name: s.school_name })}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                              title="Delete school"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
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
                            {w.bank_account_number ? (
                              <div className="mt-1.5 bg-blue-50 rounded-xl px-3 py-2 space-y-0.5">
                                <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Transfer To</p>
                                <p className="text-xs font-bold text-slate-800">{w.bank_account_name}</p>
                                <p className="text-[10px] text-slate-600">{w.bank_name} · {w.bank_account_number}</p>
                              </div>
                            ) : (
                              <p className="text-[10px] text-orange-500 font-bold mt-1">No bank details on file</p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm font-black text-slate-900">₦{w.amount.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            {w.status === 'approved' || w.status === 'paid' ? (
                              <div>
                                <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-green-100 text-green-700 block w-fit">Approved</span>
                                {w.approved_at && <p className="text-[9px] text-slate-400 mt-1">{new Date(w.approved_at).toLocaleDateString()}</p>}
                              </div>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-orange-100 text-orange-700">Pending</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {w.status === 'pending' && (
                              <button
                                onClick={() => markAsPaid(w.id)}
                                className="bg-nigeria-green text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition-all shadow-md active:scale-95"
                              >
                                Approve Transfer
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
        {/* GitHub Sync History */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-slate-600" /> GitHub Sync
            </h2>
            <button
              onClick={fetchGithubSync}
              disabled={githubSyncLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all disabled:opacity-40"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", githubSyncLoading && "animate-spin")} />
              Refresh
            </button>
          </div>
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
            {githubSyncLoading && !githubSync ? (
              <div className="py-12 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : githubSync?.entries?.length === 0 || !githubSync ? (
              <div className="py-12 text-center text-sm text-slate-400 italic">
                {githubSync?.message ?? "No sync history available"}
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {githubSync.entries.map((entry: any, i: number) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-4 px-6 py-4",
                      entry.status === 'failed' ? "bg-red-50/60" : "bg-green-50/30"
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                      entry.status === 'failed' ? "bg-red-100" : "bg-green-100"
                    )}>
                      {entry.status === 'failed'
                        ? <XCircle className="w-4 h-4 text-red-500" />
                        : <CheckCircle className="w-4 h-4 text-green-600" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          "text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                          entry.status === 'failed'
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        )}>
                          {entry.status}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">{entry.timestamp}</span>
                      </div>
                      {entry.detail && (
                        <p className={cn(
                          "mt-1.5 text-xs font-mono whitespace-pre-wrap break-words",
                          entry.status === 'failed' ? "text-red-700" : "text-slate-500"
                        )}>
                          {entry.detail.trim()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[28px] w-full max-w-sm shadow-2xl p-6 space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-base font-black text-slate-900">Delete {deleteConfirm.type === 'user' ? 'Student' : 'School'}?</h3>
                <p className="text-sm text-slate-500">
                  <span className="font-bold text-slate-700">{deleteConfirm.name}</span> will be permanently removed.
                  {deleteConfirm.type === 'school' && ' All enrolled students will be unlinked.'}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* School Students Modal */}
      <AnimatePresence>
        {selectedSchool && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-base font-black text-slate-900">{selectedSchool.school_name}</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5">{schoolStudents.length} student{schoolStudents.length !== 1 ? 's' : ''} enrolled</p>
                </div>
                <button onClick={() => setSelectedSchool(null)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                {loadingStudents ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-nigeria-green animate-spin" />
                  </div>
                ) : schoolStudents.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-400 italic">No students enrolled yet</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {schoolStudents.map((s) => {
                      const hasActivePlan = s.expiry_date && new Date(s.expiry_date) > new Date();
                      const hasTrial = s.trial_expires_at && new Date(s.trial_expires_at) > new Date();
                      return (
                        <div key={s.uid} className="px-6 py-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-black text-purple-500">
                                {(s.displayName || s.uid || '?')[0].toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{s.displayName || s.uid}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{s.uid?.slice(0, 14)}…</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-sm font-black text-nigeria-green">{s.credits} cr</p>
                              <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                                hasActivePlan ? 'bg-green-100 text-green-600' :
                                hasTrial ? 'bg-blue-100 text-blue-500' :
                                'bg-red-50 text-red-400'
                              }`}>
                                {hasActivePlan ? 'Subscribed' : hasTrial ? 'Trial' : 'Expired'}
                              </span>
                            </div>
                            <button
                              onClick={() => setDeleteConfirm({ type: 'user', id: s.uid, name: s.displayName || s.uid.slice(0, 10) })}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                              title="Delete student"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [savingBank, setSavingBank] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);
  const [customColor, setCustomColor] = useState('#008751');
  const [customLogo, setCustomLogo] = useState('');
  const [customTagline, setCustomTagline] = useState('');
  const [savingCustom, setSavingCustom] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [customHeaderImage, setCustomHeaderImage] = useState('');
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const [migrationRequests, setMigrationRequests] = useState<any[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  const fetchDashboard = async () => {
    const savedPwd = localStorage.getItem(`school_pwd_${school_slug}`) || '';
    try {
      const res = await fetch(`${API_BASE_URL}/school-dashboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_slug, password: savedPwd })
      });
      
      if (res.ok) {
        const result = await res.json();
        setData(result);
        // Also fetch migration requests
        if (result.school_id && savedPwd) {
          fetch(`${API_BASE_URL}/api/schools/${result.school_id}/migration-requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: savedPwd })
          }).then(r => r.json()).then(d => {
            if (d.requests) setMigrationRequests(d.requests);
          }).catch(() => {});
        }
      } else if (res.status === 401 || res.status === 400) {
        // Password missing or invalid — clear saved auth and show login
        localStorage.removeItem(`school_auth_${school_slug}`);
        localStorage.removeItem(`school_pwd_${school_slug}`);
        setIsLoggedIn(false);
      } else if (res.status === 404) {
        setError("not_found");
      } else {
        setError("server_error");
      }
    } catch (err) {
      setError("server_error");
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentHistory = async () => {
    const savedPwd = localStorage.getItem(`school_pwd_${school_slug}`) || '';
    if (!school_slug || !savedPwd) return;
    setLoadingPayments(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/payments/school/${school_slug}`, {
        headers: { 'x-school-password': savedPwd }
      });
      if (res.ok) {
        const result = await res.json();
        setPaymentHistory(result.payments || []);
      }
    } catch { /* silent */ }
    finally { setLoadingPayments(false); }
  };

  useEffect(() => {
    const savedAuth = localStorage.getItem(`school_auth_${school_slug}`);
    const savedPwd = localStorage.getItem(`school_pwd_${school_slug}`);
    if (savedAuth === 'true' && savedPwd) {
      setIsLoggedIn(true);
      fetchDashboard();
      fetchPaymentHistory();
    } else {
      // Clear stale auth flag if password is missing
      if (savedAuth === 'true' && !savedPwd) {
        localStorage.removeItem(`school_auth_${school_slug}`);
      }
      setLoading(false);
    }
  }, [school_slug]);

  useEffect(() => {
    if (data) {
      setCustomColor(data.primary_color || '#008751');
      setCustomLogo(data.logo_url || '');
      setCustomTagline(data.tagline || '');
      setCustomHeaderImage(data.header_image_url || '');
    }
  }, [data]);

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
        localStorage.setItem(`school_pwd_${school_slug}`, password);
        setLoading(true);
        fetchDashboard();
        fetchPaymentHistory();
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

  const handleSaveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim() || !bankAccountNumber.trim() || !bankAccountName.trim()) {
      showToast("All bank fields are required", "error"); return;
    }
    setSavingBank(true);
    try {
      const savedPwd = localStorage.getItem(`school_pwd_${school_slug}`) || '';
      const res = await fetch(`${API_BASE_URL}/api/schools/save-bank-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_slug, password: savedPwd, bank_name: bankName, bank_account_number: bankAccountNumber, bank_account_name: bankAccountName })
      });
      const result = await res.json();
      if (res.ok) {
        showToast("Bank details saved!", "success");
        setShowBankForm(false);
        fetchDashboard();
      } else {
        showToast(result.error || "Failed to save bank details", "error");
      }
    } catch { showToast("Connection error", "error"); }
    finally { setSavingBank(false); }
  };

  const handleSaveCustomization = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCustom(true);
    try {
      const savedPwd = localStorage.getItem(`school_pwd_${school_slug}`) || '';
      const res = await fetch(`${API_BASE_URL}/api/schools/save-customization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_slug, password: savedPwd, primary_color: customColor, logo_url: customLogo, tagline: customTagline, header_image_url: customHeaderImage })
      });
      const result = await res.json();
      if (res.ok) {
        showToast("Customisation saved!", "success");
        setShowCustomForm(false);
        fetchDashboard();
      } else {
        showToast(result.error || "Failed to save customisation", "error");
      }
    } catch { showToast("Connection error", "error"); }
    finally { setSavingCustom(false); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast("Logo must be under 2 MB", "error"); return; }
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const res = await fetch(`${API_BASE_URL}/api/schools/upload-logo`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) { setCustomLogo(data.logo_url); showToast("Logo uploaded!", "success"); }
      else showToast(data.error || "Upload failed", "error");
    } catch { showToast("Upload failed", "error"); }
    finally { setUploadingLogo(false); if (logoInputRef.current) logoInputRef.current.value = ''; }
  };

  const handleHeaderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast("Header image must be under 5 MB", "error"); return; }
    setUploadingHeader(true);
    try {
      const formData = new FormData();
      formData.append('header', file);
      const res = await fetch(`${API_BASE_URL}/api/schools/upload-header`, { method: 'POST', body: formData });
      const result = await res.json();
      if (res.ok) { setCustomHeaderImage(result.header_image_url); showToast("Header image uploaded!", "success"); }
      else showToast(result.error || "Upload failed", "error");
    } catch { showToast("Upload failed", "error"); }
    finally { setUploadingHeader(false); if (headerInputRef.current) headerInputRef.current.value = ''; }
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
                : <>Enter your admin password to access the dashboard for <b>{school_slug === 'dashboard' ? 'your school' : school_slug}</b></>
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
    const isNotFound = error === "not_found";
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="bg-red-100 p-4 rounded-full mb-4">
          <X className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">
          {isNotFound ? "School not found" : "Could not load dashboard"}
        </h2>
        {isNotFound ? (
          <div className="max-w-sm text-left mb-6">
            <p className="text-slate-500 text-sm mb-3 text-center">
              The URL <code className="bg-slate-100 px-1 rounded text-xs break-all">{window.location.pathname}</code> does not match any registered school.
            </p>
            <p className="text-slate-500 text-sm mb-3 text-center">
              If you are the school admin, your dashboard URL was shown when you registered. It looks like:
            </p>
            <code className="block bg-slate-100 rounded-xl px-4 py-3 text-xs text-slate-700 text-center break-all mb-3">
              exam-ple.xyz/<strong>your-school-name</strong>/dashboard
            </code>
            <p className="text-slate-500 text-xs text-center">
              The URL is based on the exact school name you typed when registering. Contact support if you cannot find it.
            </p>
          </div>
        ) : (
          <p className="text-slate-500 mb-6 text-sm">Connection error — please try again or contact support.</p>
        )}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {!isNotFound && (
            <button
              onClick={() => { setError(null); setLoading(true); fetchDashboard(); }}
              className="bg-nigeria-green text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-green-900/10"
            >
              Try Again
            </button>
          )}
          <Link to="/" className="bg-slate-200 text-slate-700 px-8 py-3 rounded-2xl font-bold">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const dashboardLogoUrl = customLogo || data?.logo_url;

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans pb-12 relative">
      {/* School logo watermark background */}
      {dashboardLogoUrl && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <img
            src={dashboardLogoUrl}
            alt=""
            style={{
              width: '70vw',
              maxWidth: '500px',
              height: 'auto',
              opacity: 0.07,
              filter: 'grayscale(30%)',
              userSelect: 'none',
              draggable: false,
            } as React.CSSProperties}
          />
        </div>
      )}
      {/* Header */}
      <header
        className="px-6 py-4 flex items-center justify-between sticky top-0 z-20 relative overflow-hidden border-b"
        style={{
          backgroundColor: dashboardLogoUrl ? customColor : '#fff',
          borderColor: dashboardLogoUrl ? 'transparent' : '#e2e8f0',
          ...(customHeaderImage ? {
            backgroundImage: `url(${customHeaderImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : {})
        }}
      >
        {customHeaderImage && (
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
        )}
        <div className="flex items-center gap-3 relative z-10">
          <div className="p-2 rounded-xl" style={{ backgroundColor: customHeaderImage ? 'rgba(255,255,255,0.2)' : customColor }}>
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className={`text-lg font-black leading-tight ${customHeaderImage ? 'text-white' : 'text-slate-900'}`}>ExamPLE Dashboard 🎓</h1>
            <p className={`text-xs font-medium ${customHeaderImage ? 'text-white/80' : 'text-slate-500'}`}>School: {data.school_name} 🏫</p>
          </div>
        </div>
        <div className="flex items-center gap-2 relative z-10">
          <Link 
            to={`/${school_slug}`}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${customHeaderImage ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
          >
            Student App <ArrowRight className="w-3 h-3" />
          </Link>
          <button 
            onClick={() => {
              localStorage.removeItem(`school_auth_${school_slug}`);
              setIsLoggedIn(false);
            }}
            className={`p-2 rounded-xl transition-all ${customHeaderImage ? 'text-white/70 hover:bg-white/20 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-red-500'}`}
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

        {/* School Links */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 mb-3">Your School Links</h3>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Student Portal</p>
              <div className="flex items-center gap-2 bg-slate-50 rounded-2xl px-4 py-2">
                <code className="text-xs text-slate-600 flex-1 break-all">exam-ple.xyz/{school_slug}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(`https://exam-ple.xyz/${school_slug}`); showToast("Portal link copied!", "success"); }}
                  className="flex-shrink-0 p-1.5 hover:bg-slate-200 rounded-lg text-nigeria-green"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Your Dashboard</p>
              <div className="flex items-center gap-2 bg-slate-50 rounded-2xl px-4 py-2">
                <code className="text-xs text-slate-600 flex-1 break-all">exam-ple.xyz/{school_slug}/dashboard</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(`https://exam-ple.xyz/${school_slug}/dashboard`); showToast("Dashboard link copied!", "success"); }}
                  className="flex-shrink-0 p-1.5 hover:bg-slate-200 rounded-lg text-nigeria-green"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Earnings Info */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 mb-2">Revenue Share</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            You earn <span className="text-nigeria-green font-bold">40%</span> of every student subscription automatically. The remaining 60% goes to ExamPLE. Payments are recorded with full details below.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-2xl p-3 text-center">
              <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">Your Share</p>
              <p className="text-lg font-black text-green-700">40%</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-3 text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Platform</p>
              <p className="text-lg font-black text-slate-600">60%</p>
            </div>
          </div>
        </div>

        {/* Payment History */}
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900">Payment History</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">All subscriptions paid by your students</p>
            </div>
            <button
              onClick={fetchPaymentHistory}
              disabled={loadingPayments}
              className="text-[10px] font-black text-nigeria-green uppercase tracking-widest hover:underline disabled:opacity-50"
            >
              {loadingPayments ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {loadingPayments ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-nigeria-green animate-spin" />
            </div>
          ) : paymentHistory.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-400">No payments recorded yet</p>
              <p className="text-[10px] text-slate-300 mt-1">Payments will appear here as students subscribe</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {paymentHistory.map((p: any, i: number) => (
                <div key={p.reference || i} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{p.userName || p.user_name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {p.planName || p.plan_name} Plan · {new Date(p.timestamp).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-slate-700">₦{Number(p.totalAmount ?? p.total_amount).toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-nigeria-green">+₦{Number(p.schoolShare ?? p.school_share).toLocaleString()} yours</p>
                      <p className="text-[10px] text-slate-400">₦{Number(p.platformShare ?? p.platform_share).toLocaleString()} platform</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
          {/* Bank Account Details */}
          <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-black text-slate-700">Bank Account</p>
                {data.bank_account_number ? (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {data.bank_account_name} · {data.bank_name} · ····{data.bank_account_number?.slice(-4)}
                  </p>
                ) : (
                  <p className="text-[10px] text-orange-500 font-bold mt-0.5">No bank account added yet</p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowBankForm(f => !f);
                  if (data.bank_name) { setBankName(data.bank_name); setBankAccountNumber(data.bank_account_number); setBankAccountName(data.bank_account_name); }
                }}
                className="text-[10px] font-black text-nigeria-green uppercase tracking-widest hover:underline"
              >
                {showBankForm ? 'Cancel' : data.bank_account_number ? 'Edit' : 'Add'}
              </button>
            </div>
            {showBankForm && (
              <form onSubmit={handleSaveBankDetails} className="space-y-3 mt-3 pt-3 border-t border-slate-200">
                <input type="text" placeholder="Bank Name (e.g. First Bank)" value={bankName}
                  onChange={e => setBankName(e.target.value)} required
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-nigeria-green/20 focus:border-nigeria-green outline-none" />
                <input type="text" placeholder="Account Number" value={bankAccountNumber}
                  onChange={e => setBankAccountNumber(e.target.value)} required maxLength={10}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-nigeria-green/20 focus:border-nigeria-green outline-none font-mono" />
                <input type="text" placeholder="Account Name" value={bankAccountName}
                  onChange={e => setBankAccountName(e.target.value)} required
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-nigeria-green/20 focus:border-nigeria-green outline-none" />
                <button type="submit" disabled={savingBank}
                  className="w-full bg-nigeria-green text-white py-3 rounded-xl font-black text-sm hover:bg-green-700 transition-all disabled:opacity-50 active:scale-95">
                  {savingBank ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save Bank Details"}
                </button>
              </form>
            )}
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Withdrawal</h3>
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Available</p>
              <p className="text-sm font-black text-nigeria-green">₦{data.total_earnings.toLocaleString()}</p>
            </div>
          </div>

          {!data.bank_account_number ? (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-center">
              <p className="text-xs font-bold text-orange-700">Add your bank account details above before requesting a withdrawal.</p>
            </div>
          ) : (
            <form onSubmit={handleWithdrawal} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount (Min ₦5,000)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₦</span>
                  <input
                    type="number" placeholder="5000" value={withdrawalAmount}
                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-8 pr-4 py-4 text-sm focus:ring-2 focus:ring-nigeria-green/20 focus:border-nigeria-green outline-none transition-all"
                  />
                </div>
              </div>
              <button type="submit" disabled={withdrawing || !withdrawalAmount || Number(withdrawalAmount) < 5000}
                className="w-full bg-nigeria-green text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-green-900/10 hover:bg-green-700 transition-all disabled:bg-slate-200 disabled:shadow-none active:scale-95">
                {withdrawing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Request Withdrawal"}
              </button>
            </form>
          )}

          {data.withdrawals && data.withdrawals.length > 0 && (
            <div className="pt-6 border-t border-slate-100">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Withdrawal History</h4>
              <div className="space-y-3">
                {data.withdrawals.map((w: any) => (
                  <div key={w.id} className="flex items-start justify-between py-2">
                    <div>
                      <p className="text-xs font-bold text-slate-800">₦{w.amount.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400">{new Date(w.timestamp).toLocaleDateString()}</p>
                    </div>
                    <div>
                      {w.status === 'approved' || w.status === 'paid' ? (
                        <div className="text-right">
                          <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-green-100 text-green-700 block">Approved</span>
                          <p className="text-[9px] text-green-600 mt-1">Funds within 48hrs</p>
                        </div>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-orange-100 text-orange-700">Pending</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* School Customisation */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900">School Branding</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Customise how students see your school</p>
            </div>
            <button
              onClick={() => setShowCustomForm(f => !f)}
              className="text-[10px] font-black text-nigeria-green uppercase tracking-widest hover:underline"
            >
              {showCustomForm ? 'Cancel' : 'Edit'}
            </button>
          </div>
          {!showCustomForm ? (
            <div className="flex items-center gap-3 bg-slate-50 rounded-2xl p-4">
              {customLogo ? (
                <img src={customLogo} alt="School logo" className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-slate-200" />
              ) : (
                <div className="w-8 h-8 rounded-xl flex-shrink-0" style={{ backgroundColor: customColor || '#008751' }} />
              )}
              <div className="min-w-0">
                {customTagline && <p className="text-xs font-bold text-slate-700 truncate">{customTagline}</p>}
                {!customTagline && !customLogo && <p className="text-[10px] text-slate-400 italic">No custom branding set</p>}
                {customLogo && !customTagline && <p className="text-[10px] text-slate-500">Logo uploaded</p>}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveCustomization} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Brand Colour</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={customColor}
                    onChange={e => setCustomColor(e.target.value)}
                    className="w-12 h-10 rounded-xl border border-slate-200 cursor-pointer p-1 bg-white"
                  />
                  <input
                    type="text"
                    value={customColor}
                    onChange={e => setCustomColor(e.target.value)}
                    placeholder="#008751"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-nigeria-green/20 focus:border-nigeria-green outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">School Logo (optional)</label>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                <div className="flex items-center gap-3">
                  {customLogo ? (
                    <img src={customLogo} alt="Logo preview" className="w-12 h-12 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-6 h-6 text-slate-300" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 hover:bg-slate-100 transition-all disabled:opacity-50"
                  >
                    {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {uploadingLogo ? 'Uploading…' : (customLogo ? 'Change Logo' : 'Upload Logo')}
                  </button>
                  {customLogo && (
                    <button type="button" onClick={() => setCustomLogo('')} className="p-2 text-slate-400 hover:text-red-400 transition-all">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 ml-1">PNG, JPG or SVG · Max 2 MB</p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Header Image (optional)</label>
                <p className="text-[10px] text-slate-400 ml-1 mb-2">Replaces the colour bar — use a school banner or photo</p>
                <input ref={headerInputRef} type="file" accept="image/*" onChange={handleHeaderUpload} className="hidden" />
                {customHeaderImage ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 h-20">
                    <img src={customHeaderImage} alt="Header preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setCustomHeaderImage('')}
                      className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => headerInputRef.current?.click()}
                    disabled={uploadingHeader}
                    className="w-full flex items-center justify-center gap-2 bg-slate-50 border border-dashed border-slate-300 rounded-xl px-4 py-4 text-sm text-slate-500 hover:bg-slate-100 transition-all disabled:opacity-50"
                  >
                    {uploadingHeader ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {uploadingHeader ? 'Uploading…' : 'Upload Header Image'}
                  </button>
                )}
                <p className="text-[10px] text-slate-400 ml-1">PNG, JPG · Max 5 MB · Wide/landscape images work best</p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tagline (optional)</label>
                <input
                  type="text"
                  placeholder="Empowering students across Nigeria"
                  value={customTagline}
                  onChange={e => setCustomTagline(e.target.value)}
                  maxLength={80}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-nigeria-green/20 focus:border-nigeria-green outline-none"
                />
              </div>
              <button type="submit" disabled={savingCustom}
                className="w-full bg-nigeria-green text-white py-3 rounded-xl font-black text-sm hover:bg-green-700 transition-all disabled:opacity-50 active:scale-95">
                {savingCustom ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save Branding"}
              </button>
            </form>
          )}
        </div>

        {/* Student List */}
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Your Students</h3>
            <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
              {(data.students || []).length}
            </span>
          </div>
          {(data.students || []).length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-400">No students yet</p>
              <p className="text-[10px] text-slate-300 mt-1">Share your school link to get students enrolled</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {(data.students || []).map((s: any) => {
                const hasActivePlan = s.expiry_date && new Date(s.expiry_date) > new Date();
                const hasTrial = s.trial_expires_at && new Date(s.trial_expires_at) > new Date();
                return (
                  <div key={s.uid} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-black text-blue-500">
                          {(s.displayName || s.uid || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{s.displayName || s.uid}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{s.uid?.slice(0, 12)}…</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-nigeria-green">{s.credits} cr</p>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                        hasActivePlan ? 'bg-green-100 text-green-600' :
                        hasTrial ? 'bg-blue-100 text-blue-500' :
                        'bg-red-50 text-red-400'
                      }`}>
                        {hasActivePlan ? 'Subscribed' : hasTrial ? 'Trial' : 'Expired'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Migration Requests */}
        {migrationRequests.length > 0 && (
          <div className="bg-white rounded-[32px] border border-amber-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-amber-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <UserPlus className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-black text-slate-900">Migration Requests</h3>
                <p className="text-[10px] text-slate-400">Independent students who want to join your school</p>
              </div>
              <span className="text-[10px] font-black text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
                {migrationRequests.length} pending
              </span>
            </div>
            <div className="divide-y divide-slate-50">
              {migrationRequests.map((req: any) => (
                <div key={req.id} className="px-6 py-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-black text-amber-500">
                      {(req.displayName || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{req.displayName}</p>
                    <p className="text-[10px] text-slate-400">Wants to join as a school student</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      disabled={decidingId === req.id}
                      onClick={async () => {
                        setDecidingId(req.id);
                        try {
                          const savedPwd = localStorage.getItem(`school_pwd_${school_slug}`) || '';
                          const res = await fetch(`${API_BASE_URL}/api/schools/migration-requests/${req.id}/decide`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: 'approve', password: savedPwd })
                          });
                          if (res.ok) {
                            setMigrationRequests(prev => prev.filter(r => r.id !== req.id));
                            showToast(`${req.displayName} approved and added to your school!`, 'success');
                            fetchDashboard();
                          } else {
                            showToast("Approval failed", "error");
                          }
                        } catch { showToast("Request failed", "error"); }
                        finally { setDecidingId(null); }
                      }}
                      className="flex items-center gap-1 bg-nigeria-green text-white px-3 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
                    >
                      {decidingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                      Approve
                    </button>
                    <button
                      disabled={decidingId === req.id}
                      onClick={async () => {
                        setDecidingId(req.id);
                        try {
                          const savedPwd = localStorage.getItem(`school_pwd_${school_slug}`) || '';
                          const res = await fetch(`${API_BASE_URL}/api/schools/migration-requests/${req.id}/decide`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: 'reject', password: savedPwd })
                          });
                          if (res.ok) {
                            setMigrationRequests(prev => prev.filter(r => r.id !== req.id));
                            showToast(`${req.displayName}'s request rejected — they remain independent.`, 'info');
                          } else {
                            showToast("Rejection failed", "error");
                          }
                        } catch { showToast("Request failed", "error"); }
                        finally { setDecidingId(null); }
                      }}
                      className="flex items-center gap-1 bg-slate-100 text-slate-600 px-3 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
                    >
                      <UserX className="w-3 h-3" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MainApp({ user, profile, onLogin, onLogout, refreshProfile, showToast, showSettings, setShowSettings, newlyCreated }: { user: any | null, profile: UserProfile | null, onLogin: () => void, onLogout: () => void, refreshProfile: () => void, showToast: (msg: string, type?: any) => void, showSettings: boolean, setShowSettings: (show: boolean) => void, newlyCreated: boolean }) {
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
  const [activeAudioMessageId, setActiveAudioMessageId] = useState<string | null>(null);
  const [fallbackVoiceUsed, setFallbackVoiceUsed] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const playbackStartRef = useRef<number>(0);
  const playbackOffsetRef = useRef<number>(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [invalidSlug, setInvalidSlug] = useState<string | null>(null);
  
  // Modals
  const [showTopUp, setShowTopUp] = useState(false);
  const [paymentEmail, setPaymentEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [showSchoolReg, setShowSchoolReg] = useState(false);
  const [registeredSchool, setRegisteredSchool] = useState<any>(null);
  const [pendingPlan, setPendingPlan] = useState<{ name: string; price: number; credits: number } | null>(null);
  
  // Inputs
  const [schoolCodeInput, setSchoolCodeInput] = useState('');
  const [schoolNameInput, setSchoolNameInput] = useState('');
  const [schoolPasswordInput, setSchoolPasswordInput] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteType, setDeleteType] = useState<'temporary' | 'permanent'>('temporary');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationRequested, setMigrationRequested] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── EXAM & PROGRESS STATE ──
  const [activeView, setActiveView] = useState<'chat' | 'exam' | 'progress'>('chat');
  const [examPhase, setExamPhase] = useState<'setup' | 'running' | 'results'>('setup');
  const [examConfig, setExamConfig] = useState({ subject: '', examType: 'WAEC', numQuestions: 20, timeMinutes: 30 });
  const [examSession, setExamSession] = useState<any>(null);
  const [examQuestions, setExamQuestions] = useState<any[]>([]);
  const [examAnswers, setExamAnswers] = useState<Record<number, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [examResults, setExamResults] = useState<any>(null);
  const [progressData, setProgressData] = useState<{ subjects: any[], weakTopics: any[] }>({ subjects: [], weakTopics: [] });
  const [examLoading, setExamLoading] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);
  const [examSubMode, setExamSubMode] = useState<'practice' | 'pastq'>('practice');
  const [pastqYear, setPastqYear] = useState(2023);
  const [pastqMode, setPastqMode] = useState<'similar' | 'simulate'>('simulate');

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Pick the best supported MIME type — Android Chrome often records ogg, not webm
      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      const chosenType = preferredTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';
      const mediaRecorder = chosenType
        ? new MediaRecorder(stream, { mimeType: chosenType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Use the recorder's actual mimeType so Gemini gets the correct format header
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
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

      // Auto-stop after 30 seconds to keep audio payload manageable
      recordingTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
          showToast("Recording stopped (30 second limit).", "info");
        }
      }, 30000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      showToast("Could not access microphone. Please check permissions.", "error");
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleTranscription = async (audioBase64: string) => {
    setTranscribing(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s hard limit
    try {
      const res = await fetch(`${API_BASE_URL}/api/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64 }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.text) {
        setQuestion(prev => prev ? `${prev} ${data.text}` : data.text);
      } else {
        showToast("Couldn't hear that clearly. Please type your question.", "info");
      }
    } catch (err: any) {
      console.error("Transcription error:", err);
      const msg = err?.name === 'AbortError'
        ? "Transcription timed out. Please type your question."
        : "Voice input failed. Please type your question.";
      showToast(msg, "error");
    } finally {
      clearTimeout(timeout);
      setTranscribing(false);
    }
  };

  const userId = user?.uid || "guest";
  const credits = profile?.credits || 0;

  const trialExpired = (() => {
    if (!profile || !user) return false;
    const subExpiry = profile.expiry_date ? new Date(profile.expiry_date) : null;
    if (subExpiry && subExpiry > new Date()) return false;
    const trialExpiry = (profile as any).trial_expires_at ? new Date((profile as any).trial_expires_at) : null;
    if (!trialExpiry) return false;
    return trialExpiry < new Date();
  })();

  useEffect(() => {
    if (trialExpired && user) setShowTopUp(true);
  }, [trialExpired, user]);

  // After a visitor signs up with a pending paid plan, auto-trigger payment
  useEffect(() => {
    if (user && pendingPlan) {
      const plan = pendingPlan;
      setPendingPlan(null);
      handleBuyCredits(plan.name, plan.price, plan.credits);
    }
  }, [user]);

  const chatEndRef = useRef<HTMLDivElement>(null);


  // Load School Context
  useEffect(() => {
    const NON_SCHOOL_PATHS = ['payment-success', 'admin', 'settings', 'register'];
    if (school_slug && !NON_SCHOOL_PATHS.includes(school_slug)) {
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

  // School joining: new students auto-join; existing independent students see a migration dialog
  useEffect(() => {
    if (!schoolId || !userId || userId === 'guest' || !profile) return;
    if (profile.schoolId === schoolId) return; // already linked — nothing to do
    if (profile.schoolId) return; // linked to a DIFFERENT school — don't override

    if (newlyCreated) {
      // Brand-new account: immediately link to the school they joined through
      fetch(`${API_BASE_URL}/api/schools/link-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: userId, school_id: schoolId })
      }).then(r => {
        if (r.ok) {
          refreshProfile();
          showToast(`Welcome to ${schoolName || 'school'}!`, 'success');
        }
      }).catch(e => console.error("Auto-join failed", e));
    } else {
      // Existing independent student visiting a school link — ask before linking
      setShowMigrationDialog(true);
    }
  }, [schoolId, userId, profile?.schoolId, schoolName, newlyCreated]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Handle Payment Success Redirect — two-step:
  // Step 1 (mount): capture reference from URL immediately and clean up the URL
  const pendingPaymentRef = useRef<string | null>(null);
  useEffect(() => {
    if (window.location.pathname !== '/payment-success') return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('reference') || params.get('trxref');
    if (ref) pendingPaymentRef.current = ref;
    window.history.replaceState({}, document.title, '/');
  }, []);

  // Step 2: once we have a real userId, call the verify endpoint to allocate credits
  useEffect(() => {
    if (!pendingPaymentRef.current || !userId || userId === 'guest') return;
    const reference = pendingPaymentRef.current;
    pendingPaymentRef.current = null; // prevent double-fire

    const verifyPayment = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/payments/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference, userId }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          let msg: string;
          if (data.testMode) {
            msg = "Test payment received. Credits are not added in test mode — go live to activate subscriptions.";
          } else if (data.alreadyProcessed) {
            msg = "Payment already applied to your account!";
          } else {
            msg = `${data.planName || 'Plan'} activated! ${data.credits ? `+${data.credits} credits added.` : ''}`;
          }
          showToast(msg, data.testMode ? "info" : "success");
        } else {
          showToast("Payment received — credits will update shortly.", "success");
        }
      } catch {
        showToast("Payment received — credits will update shortly.", "success");
      } finally {
        refreshProfile();
      }
    };
    verifyPayment();
  }, [userId]);

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

    // Visitor (not logged in) — show question + join-prompt card in chat
    if (!user) {
      const visitorMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: question,
        image: imageBase64 || undefined,
        timestamp: new Date(),
      };
      const joinMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'join-prompt',
        content: '',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, visitorMsg, joinMsg]);
      setQuestion('');
      setImageBase64(null);
      return;
    }

    if (credits < 1 || trialExpired) {
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
      let lineBuffer = "";

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return;
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') {
          refreshProfile();
          return;
        }
        try {
          const data = JSON.parse(dataStr);
          if (data.error) throw new Error(data.debug || data.error);
          if (data.text) {
            fullContent += data.text;
            const cleanedContent = fullContent
              .replace(/\$\$([^$]+)\$\$/g, '$1')
              .replace(/\$([^$\n]{1,200})\$/g, '$1');
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId ? { ...m, content: cleanedContent } : m
            ));
          }
        } catch (e) {
          // Silently ignore parse errors for partial/malformed chunks
        }
      };

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        // Keep the last (potentially incomplete) line in the buffer
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          processLine(line);
        }
      }

      // Process any remaining buffered content
      if (lineBuffer) processLine(lineBuffer);
    } catch (err: any) {
      console.error("Submit error:", err);
      setError(err.message || "Teacher is busy. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- Web Audio API helpers (work reliably on mobile after async fetches) ---
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const stopCurrentSource = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch {}
      audioSourceRef.current = null;
    }
  };

  const startBufferPlayback = (ctx: AudioContext, buffer: AudioBuffer, offset: number) => {
    stopCurrentSource();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (audioSourceRef.current === source) {
        audioSourceRef.current = null;
        playbackOffsetRef.current = 0;
        setIsPlaying(false);
        setActiveAudioMessageId(null);
        setFallbackVoiceUsed(false);
      }
    };
    audioSourceRef.current = source;
    playbackStartRef.current = ctx.currentTime;
    source.start(0, offset);
    setIsPlaying(true);
  };

  const playAudio = async (text: string, messageId: string) => {
    const ctx = getAudioCtx();

    // Unlock AudioContext during user gesture — must happen before any await
    if (ctx.state === 'suspended') ctx.resume();

    // Toggle pause/resume for same message
    if (activeAudioMessageId === messageId) {
      if (isPlaying) {
        // Pause: snapshot how far we got
        playbackOffsetRef.current += ctx.currentTime - playbackStartRef.current;
        stopCurrentSource();
        setIsPlaying(false);
      } else if (audioBufferRef.current) {
        // Resume from saved offset
        startBufferPlayback(ctx, audioBufferRef.current, playbackOffsetRef.current);
      }
      return;
    }

    // New message — stop whatever was playing
    stopCurrentSource();
    window.speechSynthesis?.cancel();
    playbackOffsetRef.current = 0;
    audioBufferRef.current = null;

    setAudioLoading(true);
    setActiveAudioMessageId(messageId);
    setFallbackVoiceUsed(false);
    setIsPlaying(false);

    try {
      const res = await fetch(`${API_BASE_URL}/get-audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, usePidgin, user_id: userId })
      });
      const data = await res.json();

      if (data.audio) {
        const rawBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
        let audioBuffer: AudioBuffer;

        if (data.mimeType === 'audio/pcm' || !data.mimeType) {
          // Raw signed 16-bit LE mono PCM at 24 kHz — decode directly, no WAV wrapper needed
          const int16 = new Int16Array(rawBytes.buffer);
          audioBuffer = ctx.createBuffer(1, int16.length, 24000);
          const channel = audioBuffer.getChannelData(0);
          for (let i = 0; i < int16.length; i++) channel[i] = int16[i] / 32768;
        } else {
          // Encoded format (mp3, ogg, etc.) — let the browser decode it
          audioBuffer = await ctx.decodeAudioData(rawBytes.buffer.slice(0));
        }

        audioBufferRef.current = audioBuffer;
        setFallbackVoiceUsed(data.fallbackUsed === true);
        startBufferPlayback(ctx, audioBuffer, 0);
      } else {
        // Gemini TTS unavailable — fall back to browser speech synthesis
        if ('speechSynthesis' in window) {
          const cleanText = text.replace(/#+\s/g, '').replace(/[*_`]/g, '').trim().slice(0, 600);
          const utterance = new SpeechSynthesisUtterance(cleanText);
          utterance.rate = 0.92;
          utterance.pitch = 1.05;
          utterance.onend = () => { setIsPlaying(false); setActiveAudioMessageId(null); };
          utterance.onerror = () => { setIsPlaying(false); setActiveAudioMessageId(null); };
          window.speechSynthesis.speak(utterance);
          setIsPlaying(true);
          setFallbackVoiceUsed(true);
        } else {
          setError(data.error || "Voice unavailable.");
          setActiveAudioMessageId(null);
        }
      }
    } catch (err: any) {
      console.error("Audio error:", err);
      setError("Could not load audio. Please try again.");
      setActiveAudioMessageId(null);
    } finally {
      setAudioLoading(false);
    }
  };

  const seekAudio = (seconds: number) => {
    const ctx = audioCtxRef.current;
    const buffer = audioBufferRef.current;
    if (!ctx || !buffer) return;
    const currentOffset = isPlaying
      ? playbackOffsetRef.current + (ctx.currentTime - playbackStartRef.current)
      : playbackOffsetRef.current;
    const newOffset = Math.max(0, Math.min(buffer.duration, currentOffset + seconds));
    playbackOffsetRef.current = newOffset;
    if (isPlaying) startBufferPlayback(ctx, buffer, newOffset);
  };

  const stopAudio = () => {
    stopCurrentSource();
    window.speechSynthesis?.cancel();
    playbackOffsetRef.current = 0;
    audioBufferRef.current = null;
    setIsPlaying(false);
    setActiveAudioMessageId(null);
    setFallbackVoiceUsed(false);
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
    if (!user) { showToast("Please log in to buy credits", "error"); return; }

    // Use stored profile email, or the one just entered in the modal
    const emailToUse = (profile?.email as string) || paymentEmail.trim();
    if (!emailToUse) {
      showToast("Please enter your email address for the receipt", "error");
      return;
    }

    // Persist the email if it wasn't already saved
    if (!profile?.email && emailToUse && userId) {
      setSavingEmail(true);
      try {
        await fetch(`${API_BASE_URL}/api/user/save-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: userId, email: emailToUse })
        });
        await refreshProfile();
      } catch { /* proceed anyway */ }
      finally { setSavingEmail(false); }
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/payments/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailToUse,
          amount,
          userId: userId,
          planName: plan,
          callbackBase: window.location.origin
        })
      });
      const data = await res.json();
      if (data.status && data.data.authorization_url) {
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

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (deleteType === 'permanent' && deleteConfirmText !== 'DELETE') {
      showToast("Type DELETE to confirm permanent deletion", "error");
      return;
    }
    setDeletingAccount(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/account/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, type: deleteType })
      });
      const data = await res.json();
      if (res.ok) {
        setShowDeleteModal(false);
        setShowSettings(false);
        showToast(deleteType === 'permanent' ? "Account permanently deleted." : "Account deactivated. You can reactivate by logging in.", "info");
        localStorage.removeItem('exam_uid');
        localStorage.removeItem('exam_user');
        onLogout();
      } else {
        showToast(data.error || "Failed to delete account.", "error");
      }
    } catch (err) {
      console.error("Delete account error:", err);
      showToast("Failed to delete account.", "error");
    } finally {
      setDeletingAccount(false);
    }
  };

  // ── EXAM HANDLERS ──
  const startExam = async (forceMode?: 'similar' | 'simulate') => {
    if (!user) { onLogin(); return; }
    if (!examConfig.subject.trim()) { showToast("Please enter a subject", "error"); return; }
    const cost = examConfig.numQuestions;
    if (credits < cost) { setShowTopUp(true); return; }
    setExamLoading(true);
    const resolvedMode = forceMode ?? pastqMode;
    try {
      const res = await fetch(`${API_BASE_URL}/api/exam/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId, subject: examConfig.subject, level,
          exam_type: examConfig.examType, num_questions: examConfig.numQuestions,
          time_minutes: examConfig.timeMinutes,
          ...(examSubMode === 'pastq' ? { year: pastqYear, mode: resolvedMode } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate exam');
      setExamSession(data);
      setExamQuestions(data.questions);
      setExamAnswers({});
      setCurrentQ(0);
      setTimeLeft(examConfig.timeMinutes * 60);
      setExamPhase('running');
      refreshProfile();
    } catch (e: any) {
      showToast(e.message || 'Failed to start exam', 'error');
    } finally {
      setExamLoading(false);
    }
  };

  const handleSubmitExam = async () => {
    if (!examSession) return;
    setExamPhase('results'); // prevent double submit
    try {
      const res = await fetch(`${API_BASE_URL}/api/exam/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: examSession.session_id, user_id: userId, answers: examAnswers }),
      });
      const data = await res.json();
      setExamResults(data);
      setExpandedResult(null);
    } catch {
      showToast('Failed to submit exam', 'error');
    }
  };

  const fetchProgress = async () => {
    if (!user) return;
    setProgressLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/progress/${userId}`);
      const data = await res.json();
      setProgressData({ subjects: data.subjects || [], weakTopics: data.weakTopics || [] });
    } catch { /* silent */ } finally {
      setProgressLoading(false);
    }
  };

  // Exam countdown timer
  useEffect(() => {
    if (activeView !== 'exam' || examPhase !== 'running') return;
    if (timeLeft <= 0) { handleSubmitExam(); return; }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [activeView, examPhase, timeLeft]);

  // Fetch progress when tab is opened
  useEffect(() => {
    if (activeView === 'progress' && user) fetchProgress();
  }, [activeView, user]);

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const schoolLogoUrl = profile?.school?.logo_url;

  return (
    <div className="flex flex-col h-screen bg-[#F0F2F5] font-sans overflow-hidden relative">
      {/* School logo watermark background */}
      {schoolLogoUrl && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <img
            src={schoolLogoUrl}
            alt=""
            style={{
              width: '70vw',
              maxWidth: '500px',
              height: 'auto',
              opacity: 0.07,
              filter: 'grayscale(30%)',
              userSelect: 'none',
              draggable: false,
            } as React.CSSProperties}
          />
        </div>
      )}
      {/* Header */}
      <header
        className="text-white px-4 py-3 flex items-center justify-between shadow-md z-20 relative overflow-hidden"
        style={{
          backgroundColor: profile?.school?.primary_color || '#008751',
          ...(profile?.school?.header_image_url ? {
            backgroundImage: `url(${profile.school.header_image_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : {})
        }}
      >
        {profile?.school?.header_image_url && (
          <div className="absolute inset-0 bg-black/45" aria-hidden="true" />
        )}
        <div className="flex items-center gap-3 relative z-10 min-w-0 flex-1">
          {profile?.school?.logo_url ? (
            <img
              src={profile.school.logo_url}
              alt={profile.school.school_name}
              className="w-10 h-10 rounded-full object-cover bg-white/20 flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="bg-white/20 p-2 rounded-full flex-shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight truncate">
              {profile?.school?.school_name || 'ExamPLE'}
            </h1>
            <p className="text-[10px] opacity-90 font-medium uppercase tracking-wider truncate">
              {profile?.school?.tagline || (schoolName ? `Powered by ${schoolName}` : 'AI Tutor')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 relative z-10 flex-shrink-0 ml-2">
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

          {user && (
            <button
              onClick={onLogout}
              className="p-2 hover:bg-white/10 rounded-full transition-all"
              title="Log out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}

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

      {/* Tab bar */}
      <nav className="bg-white border-b border-slate-200 flex z-10 shrink-0">
        {([['chat','AI Tutor', MessageSquare],['exam','Exam Mode', Trophy],['progress','Progress', BarChart2]] as const).map(([view, label, Icon]) => (
          <button key={view} onClick={() => setActiveView(view)}
            className={cn("flex-1 flex flex-col items-center py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all", activeView === view ? "text-nigeria-green border-b-2 border-nigeria-green bg-green-50/50" : "text-slate-400 hover:text-slate-600")}
          >
            <Icon className="w-4 h-4 mb-0.5" />
            {label}
          </button>
        ))}
      </nav>

      {/* ── CHAT VIEW ── */}
      {activeView === 'chat' && <>
      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-4">
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

            <div className="bg-nigeria-green/5 border border-nigeria-green/20 rounded-3xl p-5 max-w-xs w-full text-left">
              <p className="text-sm font-black text-nigeria-green mb-3 leading-snug">
                Pass WAEC, NECO, JAMB and School Exams faster with AI
              </p>
              <ul className="space-y-2">
                {[
                  { icon: Trophy, text: 'Practice real exam questions' },
                  { icon: BarChart2, text: 'See your weak topics' },
                  { icon: CheckCircle2, text: 'Get marking scheme explanations' },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                    <Icon className="w-3.5 h-3.5 text-nigeria-green flex-shrink-0" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          // --- Join-prompt card for visitors ---
          if (msg.role === 'join-prompt') {
            const plans = [
              { name: 'Free', price: 0,    credits: 10,  duration: '7 days',  color: 'bg-green-50 border-nigeria-green text-nigeria-green', badge: 'No payment needed' },
              { name: 'Basic',   price: 2500,  credits: 50,  duration: '30 days', color: 'bg-blue-50 border-blue-200 text-blue-700', badge: null },
              { name: 'Premium', price: 4500,  credits: 100, duration: '30 days', color: 'bg-purple-50 border-purple-200 text-purple-700', badge: 'Most popular' },
              { name: 'Max',     price: 6500,  credits: 250, duration: '30 days', color: 'bg-amber-50 border-amber-200 text-amber-700', badge: 'Best value' },
            ];
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="mr-auto items-start max-w-[90%] w-full"
              >
                <div className="bg-white rounded-2xl rounded-tl-none border border-slate-200 shadow-sm p-4">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-1">
                    <GraduationCap className="w-5 h-5 text-nigeria-green" />
                    <span className="text-sm font-black text-slate-800">Join ExamPLE to get your answer</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">Start free — no payment needed. Upgrade anytime for more credits.</p>

                  {/* Pricing plans */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {plans.map((plan) => (
                      <button
                        key={plan.name}
                        onClick={() => {
                          if (plan.price === 0) {
                            onLogin();
                          } else {
                            setPendingPlan({ name: plan.name, price: plan.price, credits: plan.credits });
                            onLogin();
                          }
                        }}
                        className={cn(
                          "relative border-2 rounded-2xl p-3 text-left transition-all hover:scale-[1.03] active:scale-95",
                          plan.color
                        )}
                      >
                        {plan.badge && (
                          <span className="absolute -top-2 left-3 text-[9px] font-black uppercase tracking-wider bg-white border border-current rounded-full px-2 py-0.5">
                            {plan.badge}
                          </span>
                        )}
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{plan.name}</p>
                        <p className="text-xl font-black leading-none mb-1">
                          {plan.price === 0 ? 'Free' : `₦${plan.price.toLocaleString()}`}
                        </p>
                        <p className="text-[11px] font-bold">{plan.credits} units</p>
                        <p className="text-[10px] opacity-60">{plan.duration}</p>
                      </button>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Other options</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>

                  {/* School paths */}
                  <div className="space-y-2">
                    <button
                      onClick={onLogin}
                      className="w-full flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 hover:border-nigeria-green hover:bg-green-50 transition-all text-left group"
                    >
                      <div className="bg-white p-2 rounded-xl shadow-sm shrink-0 group-hover:scale-110 transition-all">
                        <Users className="w-4 h-4 text-nigeria-green" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800">Joining through your school?</p>
                        <p className="text-[10px] text-slate-500">Sign up then enter your school's referral code</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setShowSettings(true)}
                      className="w-full flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 hover:border-purple-400 hover:bg-purple-50 transition-all text-left group"
                    >
                      <div className="bg-white p-2 rounded-xl shadow-sm shrink-0 group-hover:scale-110 transition-all">
                        <School className="w-4 h-4 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800">I am a School</p>
                        <p className="text-[10px] text-slate-500">Register or manage your school portal</p>
                      </div>
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          }

          // --- Regular user / assistant messages ---
          return (
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
                      {fallbackVoiceUsed && (
                        <span className="ml-auto text-[10px] text-amber-500 font-medium">
                          Using backup voice
                        </span>
                      )}
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
          );
        })}

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
      {/* END CHAT VIEW */}
      </>}

      {/* ── EXAM VIEW ── */}
      {activeView === 'exam' && (
        <div className="flex-1 overflow-y-auto">
          {examPhase === 'setup' && (
            <div className="p-4 max-w-md mx-auto">
              {/* Sub-mode switcher */}
              <div className="bg-white rounded-2xl p-1 border border-slate-200 flex mb-4 shadow-sm">
                <button onClick={() => setExamSubMode('practice')}
                  className={cn("flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5",
                    examSubMode === 'practice' ? "bg-nigeria-green text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                ><Trophy className="w-3.5 h-3.5" /> Practice Test</button>
                <button onClick={() => setExamSubMode('pastq')}
                  className={cn("flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5",
                    examSubMode === 'pastq' ? "bg-nigeria-green text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                ><BookOpen className="w-3.5 h-3.5" /> Past Questions</button>
              </div>

              {/* Shared config fields */}
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 mb-3 space-y-4">

                {examSubMode === 'pastq' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
                    <p className="text-xs font-black text-blue-700 mb-0.5">Past Question Bank</p>
                    <p className="text-[11px] text-blue-600">AI simulates real past paper style and content for your chosen year</p>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Subject *</label>
                  <input
                    type="text" placeholder="e.g. Biology, Chemistry, Mathematics..."
                    value={examConfig.subject}
                    onChange={e => setExamConfig(c => ({ ...c, subject: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-nigeria-green transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Exam Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['WAEC','NECO','JAMB'].map(t => (
                      <button key={t} onClick={() => setExamConfig(c => ({ ...c, examType: t }))}
                        className={cn("py-2.5 rounded-2xl text-sm font-black transition-all border", examConfig.examType === t ? "bg-nigeria-green text-white border-nigeria-green" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-nigeria-green")}
                      >{t}</button>
                    ))}
                  </div>
                </div>

                {/* Past Questions: Year picker */}
                {examSubMode === 'pastq' && (
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Year</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[2024,2023,2022,2021,2020,2019,2018,2017,2016,2015].map(y => (
                        <button key={y} onClick={() => setPastqYear(y)}
                          className={cn("py-2 rounded-xl text-xs font-black transition-all border", pastqYear === y ? "bg-nigeria-green text-white border-nigeria-green" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-nigeria-green")}
                        >{y}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Questions</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[10,20,30].map(n => (
                        <button key={n} onClick={() => setExamConfig(c => ({ ...c, numQuestions: n }))}
                          className={cn("py-2 rounded-xl text-sm font-black transition-all border", examConfig.numQuestions === n ? "bg-nigeria-green text-white border-nigeria-green" : "bg-slate-50 text-slate-600 border-slate-200")}
                        >{n}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">Time (mins)</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[15,30,45].map(t => (
                        <button key={t} onClick={() => setExamConfig(c => ({ ...c, timeMinutes: t }))}
                          className={cn("py-2 rounded-xl text-sm font-black transition-all border", examConfig.timeMinutes === t ? "bg-nigeria-green text-white border-nigeria-green" : "bg-slate-50 text-slate-600 border-slate-200")}
                        >{t}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-3 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 font-medium">
                  Costs <span className="font-black">{examConfig.numQuestions} credits</span> · You have <span className="font-black">{credits}</span> · Full WAEC marking scheme included
                </p>
              </div>

              {/* Action buttons */}
              {examSubMode === 'practice' ? (
                <button onClick={() => startExam()} disabled={examLoading || !examConfig.subject.trim()}
                  className={cn("w-full py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-2",
                    examLoading || !examConfig.subject.trim() ? "bg-slate-200 text-slate-400" : "bg-nigeria-green text-white shadow-lg hover:bg-green-700 active:scale-95"
                  )}
                >
                  {examLoading ? <><Loader2 className="w-5 h-5 animate-spin" />Generating…</> : <><Trophy className="w-5 h-5" />Start Practice Exam</>}
                </button>
              ) : (
                <div className="space-y-2">
                  <button onClick={() => startExam('simulate')} disabled={examLoading || !examConfig.subject.trim()}
                    className={cn("w-full py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2",
                      examLoading || !examConfig.subject.trim() ? "bg-slate-200 text-slate-400" : "bg-nigeria-green text-white shadow-lg hover:bg-green-700 active:scale-95"
                    )}
                  >
                    {examLoading ? <><Loader2 className="w-5 h-5 animate-spin" />Generating…</> : <>📄 Simulate {pastqYear} Past Paper</>}
                  </button>
                  <button onClick={() => startExam('similar')} disabled={examLoading || !examConfig.subject.trim()}
                    className={cn("w-full py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 border-2",
                      examLoading || !examConfig.subject.trim() ? "border-slate-200 text-slate-400" : "border-nigeria-green text-nigeria-green bg-green-50 hover:bg-green-100 active:scale-95"
                    )}
                  >
                    ✨ Generate Similar Questions
                  </button>
                </div>
              )}
            </div>
          )}

          {examPhase === 'running' && examQuestions.length > 0 && (
            <div className="flex flex-col h-full">
              {/* Timer bar */}
              <div className={cn("px-4 py-2 flex items-center justify-between shrink-0", timeLeft < 120 ? "bg-red-500 text-white" : "bg-slate-800 text-white")}>
                <span className="text-xs font-bold">Q {currentQ + 1}/{examQuestions.length} — {examConfig.subject} {examConfig.examType}</span>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span className="font-black text-sm tabular-nums">{fmtTime(timeLeft)}</span>
                </div>
              </div>

              {/* Question */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 mb-4">
                  <p className="text-xs font-bold text-nigeria-green uppercase tracking-wider mb-2">Question {currentQ + 1}</p>
                  <p className="text-sm font-medium text-slate-800 leading-relaxed">{examQuestions[currentQ]?.q}</p>
                </div>

                <div className="space-y-2.5">
                  {examQuestions[currentQ]?.opts?.map((opt: string, i: number) => {
                    const letter = opt[0];
                    const selected = examAnswers[currentQ] === letter;
                    return (
                      <button key={i} onClick={() => setExamAnswers(a => ({ ...a, [currentQ]: letter }))}
                        className={cn("w-full text-left p-4 rounded-2xl border-2 font-medium text-sm transition-all",
                          selected ? "border-nigeria-green bg-green-50 text-nigeria-green font-bold" : "border-slate-200 bg-white text-slate-700 hover:border-nigeria-green/40"
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Navigation */}
              <div className="bg-white border-t border-slate-200 p-4 shrink-0">
                {/* Answer dots */}
                <div className="flex gap-1 flex-wrap justify-center mb-3">
                  {examQuestions.map((_: any, i: number) => (
                    <button key={i} onClick={() => setCurrentQ(i)}
                      className={cn("w-6 h-6 rounded-full text-[9px] font-black transition-all",
                        i === currentQ ? "bg-nigeria-green text-white scale-110" :
                        examAnswers[i] ? "bg-green-200 text-green-700" : "bg-slate-200 text-slate-400"
                      )}
                    >{i + 1}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentQ(q => Math.max(0, q - 1))} disabled={currentQ === 0}
                    className="flex-1 py-3 rounded-2xl font-bold text-sm border border-slate-200 text-slate-600 disabled:opacity-30 active:scale-95"
                  >← Prev</button>
                  {currentQ < examQuestions.length - 1
                    ? <button onClick={() => setCurrentQ(q => q + 1)} className="flex-1 py-3 rounded-2xl font-bold text-sm bg-slate-800 text-white active:scale-95">Next →</button>
                    : <button onClick={handleSubmitExam} className="flex-1 py-3 rounded-2xl font-black text-sm bg-nigeria-green text-white shadow-md active:scale-95">Submit Exam ✓</button>
                  }
                </div>
              </div>
            </div>
          )}

          {examPhase === 'results' && examResults && (
            <div className="p-4 max-w-md mx-auto">
              {/* Score card */}
              <div className={cn("rounded-3xl p-6 text-center mb-4 shadow-sm", examResults.score / examResults.total >= 0.5 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200")}>
                <div className="text-5xl font-black mb-1">
                  {examResults.score / examResults.total >= 0.7 ? '🏆' : examResults.score / examResults.total >= 0.5 ? '👍' : '📚'}
                </div>
                <div className={cn("text-4xl font-black mb-1", examResults.score / examResults.total >= 0.5 ? "text-green-700" : "text-red-600")}>
                  {examResults.score}/{examResults.total}
                </div>
                <p className="text-sm font-bold text-slate-600">{Math.round((examResults.score / examResults.total) * 100)}% — {examResults.subject} {examConfig.examType}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {examResults.score / examResults.total >= 0.7 ? "Excellent! You're exam-ready." : examResults.score / examResults.total >= 0.5 ? "Good effort. Review the wrong ones." : "Keep practising — you'll get there!"}
                </p>
              </div>

              {/* Per-question results */}
              <div className="space-y-2 mb-4">
                {examResults.results?.map((r: any, i: number) => (
                  <div key={i} className={cn("bg-white rounded-2xl border overflow-hidden", r.correct ? "border-green-200" : "border-red-200")}>
                    <button onClick={() => setExpandedResult(expandedResult === i ? null : i)}
                      className="w-full flex items-center gap-3 p-3 text-left"
                    >
                      {r.correct
                        ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                        : <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                      }
                      <span className="text-xs font-medium text-slate-700 flex-1 line-clamp-2">{i + 1}. {r.q}</span>
                      <ChevronDown className={cn("w-4 h-4 text-slate-400 shrink-0 transition-transform", expandedResult === i ? "rotate-180" : "")} />
                    </button>
                    {expandedResult === i && (
                      <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                        <div className="flex gap-2 flex-wrap text-xs">
                          <span className="bg-green-100 text-green-700 px-2 py-1 rounded-lg font-bold">✓ {r.ans}</span>
                          {!r.correct && <span className="bg-red-100 text-red-700 px-2 py-1 rounded-lg font-bold">Your answer: {r.userAns ?? 'Skipped'}</span>}
                        </div>
                        {r.scheme && (
                          <div className="bg-blue-50 rounded-xl p-3">
                            <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider mb-1">WAEC Marking Scheme</p>
                            <p className="text-xs text-blue-800 whitespace-pre-line leading-relaxed">{r.scheme}</p>
                          </div>
                        )}
                        {!r.correct && r.why_wrong && (
                          <div className="bg-red-50 rounded-xl p-3">
                            <p className="text-[10px] font-black text-red-600 uppercase tracking-wider mb-2">Why You Got This Wrong</p>
                            {r.why_wrong.map((w: string, j: number) => (
                              <div key={j} className="flex items-start gap-1.5 mb-1">
                                <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                                <span className="text-xs text-red-700 font-medium">{w}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button onClick={() => { setExamPhase('setup'); setExamResults(null); setExamSession(null); setExamQuestions([]); }}
                className="w-full py-4 rounded-2xl bg-nigeria-green text-white font-black text-sm flex items-center justify-center gap-2 shadow-md active:scale-95"
              >
                <RefreshCw className="w-4 h-4" /> Try Another Exam
              </button>
            </div>
          )}

          {examPhase === 'results' && !examResults && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-nigeria-green" />
            </div>
          )}
        </div>
      )}

      {/* ── PROGRESS VIEW ── */}
      {activeView === 'progress' && (
        <div className="flex-1 overflow-y-auto p-4 max-w-md mx-auto w-full">
          {!user ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <BarChart2 className="w-16 h-16 text-slate-300 mb-4" />
              <h3 className="text-lg font-bold text-slate-700 mb-2">Track Your Progress</h3>
              <p className="text-sm text-slate-500 mb-6">Log in to see your subject performance and weak topics.</p>
              <button onClick={onLogin} className="bg-nigeria-green text-white px-6 py-3 rounded-2xl font-bold text-sm">Log In</button>
            </div>
          ) : progressLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-nigeria-green" />
            </div>
          ) : progressData.subjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <Award className="w-16 h-16 text-slate-300 mb-4" />
              <h3 className="text-lg font-bold text-slate-700 mb-2">No data yet</h3>
              <p className="text-sm text-slate-500 mb-6">Complete an exam in Exam Mode to start tracking your progress.</p>
              <button onClick={() => setActiveView('exam')} className="bg-nigeria-green text-white px-6 py-3 rounded-2xl font-bold text-sm">Take a Practice Exam</button>
            </div>
          ) : (
            <div className="space-y-4 pb-8">
              <div>
                <h2 className="text-base font-black text-slate-900 mb-3">
                  {profile?.displayName?.split(' ')[0] ?? 'Your'}'s Progress
                </h2>
                <div className="space-y-3">
                  {progressData.subjects.map((s: any) => (
                    <div key={s.subject} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-800">{s.subject}</span>
                        <span className={cn("text-sm font-black", s.pct >= 70 ? "text-green-600" : s.pct >= 50 ? "text-yellow-600" : "text-red-500")}>
                          {s.pct}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div className={cn("h-2.5 rounded-full transition-all", s.pct >= 70 ? "bg-green-500" : s.pct >= 50 ? "bg-yellow-400" : "bg-red-400")}
                          style={{ width: `${s.pct}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1.5">{s.correct}/{s.total} correct</p>
                      {s.pct < 60 && <p className="text-[10px] text-red-500 font-bold mt-0.5">⚠️ Needs improvement</p>}
                    </div>
                  ))}
                </div>
              </div>

              {progressData.weakTopics.length > 0 && (
                <div>
                  <h3 className="text-sm font-black text-slate-700 mb-2 flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-red-500" /> Weak Topics to Focus On
                  </h3>
                  <div className="space-y-2">
                    {progressData.weakTopics.map((t: any, i: number) => (
                      <div key={i} className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-red-700">{t.topic}</p>
                          <p className="text-[10px] text-red-500">{t.subject}</p>
                        </div>
                        <span className="text-sm font-black text-red-600">{t.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={fetchProgress}
                className="w-full py-3 rounded-2xl border border-slate-200 text-slate-500 font-bold text-xs flex items-center justify-center gap-2 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
          )}
        </div>
      )}

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
              {!trialExpired && (
                <button onClick={() => setShowTopUp(false)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              )}
              
              <div className="text-center mb-8">
                <div className={`${trialExpired ? 'bg-red-100' : 'bg-yellow-100'} w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4`}>
                  <Sparkles className={`w-8 h-8 ${trialExpired ? 'text-red-500' : 'text-yellow-600'}`} />
                </div>
                <h2 className="text-2xl font-black text-slate-900">
                  {trialExpired ? 'Subscribe to Continue' : 'Buy Credits'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {trialExpired
                    ? 'Your 7-day free trial has ended. Choose a plan to keep learning.'
                    : 'Choose a plan to continue learning'}
                </p>
              </div>

              {/* Email field — only shown if student hasn't saved an email yet */}
              {!(profile?.email as string) && (
                <div className="mb-6 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Email for receipt
                  </label>
                  <input
                    type="email"
                    placeholder="yourname@email.com"
                    value={paymentEmail}
                    onChange={e => setPaymentEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-nigeria-green/20 focus:border-nigeria-green outline-none"
                  />
                  <p className="text-[10px] text-slate-400 ml-1">
                    Paystack sends your receipt here. Saved once — never asked again.
                  </p>
                </div>
              )}

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
                    disabled={savingEmail || (!(profile?.email as string) && !paymentEmail.trim())}
                    className={cn(
                      "w-full p-5 rounded-3xl border-2 flex items-center justify-between transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:scale-100 disabled:cursor-not-allowed",
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
              {(profile?.email as string) && (
                <p className="text-[10px] text-slate-400 text-center mt-3">
                  Receipt goes to: <span className="font-bold text-slate-600">{profile?.email as string}</span>
                </p>
              )}
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

                {user && (
                  <div className="pt-6 border-t border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-3">Danger Zone</p>
                    <div className="space-y-2">
                      <button
                        onClick={() => { setDeleteType('temporary'); setDeleteConfirmText(''); setShowDeleteModal(true); }}
                        className="w-full flex items-center justify-between p-4 bg-orange-50 rounded-2xl hover:bg-orange-100 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-white p-2 rounded-xl shadow-sm">
                            <Pause className="w-5 h-5 text-orange-500" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-slate-800">Deactivate Account</p>
                            <p className="text-[10px] text-slate-500">Temporarily hide your account</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </button>
                      <button
                        onClick={() => { setDeleteType('permanent'); setDeleteConfirmText(''); setShowDeleteModal(true); }}
                        className="w-full flex items-center justify-between p-4 bg-red-50 rounded-2xl hover:bg-red-100 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-white p-2 rounded-xl shadow-sm">
                            <Trash2 className="w-5 h-5 text-red-500" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-slate-800">Delete Account</p>
                            <p className="text-[10px] text-slate-500">Permanently erase all your data</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </button>
                    </div>
                  </div>
                )}
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
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Student Portal</p>
                  <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-slate-200">
                    <code className="text-xs font-bold text-slate-700 flex-1 break-all">
                      exam-ple.xyz/{registeredSchool.school_slug}
                    </code>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`https://exam-ple.xyz/${registeredSchool.school_slug}`);
                        showToast("Link copied!", "success");
                      }}
                      className="p-2 hover:bg-slate-100 rounded-lg text-nigeria-green flex-shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1">Your Dashboard (save this!)</p>
                  <div className="flex items-center gap-2 bg-orange-50 p-3 rounded-xl border border-orange-200">
                    <code className="text-xs font-bold text-orange-700 flex-1 break-all">
                      exam-ple.xyz/{registeredSchool.school_slug}/dashboard
                    </code>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`https://exam-ple.xyz/${registeredSchool.school_slug}/dashboard`);
                        showToast("Dashboard link copied!", "success");
                      }}
                      className="p-2 hover:bg-orange-100 rounded-lg text-orange-600 flex-shrink-0"
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

        {/* Migration Dialog — shown when an independent student visits a school URL */}
        {showMigrationDialog && !migrationRequested && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[40px] p-8 max-w-sm w-full shadow-2xl"
            >
              <div className="w-16 h-16 rounded-full bg-nigeria-green/10 flex items-center justify-center mx-auto mb-4">
                <School className="w-8 h-8 text-nigeria-green" />
              </div>
              <h2 className="text-xl font-black text-slate-900 text-center mb-1">Join {schoolName || 'this school'}?</h2>
              <p className="text-sm text-slate-500 text-center mb-6 leading-relaxed">
                You're already registered as an <strong>independent student</strong>. Would you like to migrate to <strong>{schoolName || 'this school'}</strong>?
                <br /><br />
                The school admin will review your request. If approved, 40% of your subscription fees will support the school.
              </p>
              <div className="space-y-3">
                <button
                  onClick={async () => {
                    if (!userId || !schoolId) return;
                    setMigrationLoading(true);
                    try {
                      const res = await fetch(`${API_BASE_URL}/api/schools/migration-request`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ uid: userId, school_id: schoolId })
                      });
                      const data = await res.json();
                      if (res.ok) {
                        setMigrationRequested(true);
                        showToast("Migration request sent! The school admin will review it.", "success");
                      } else {
                        showToast(data.error || "Request failed", "error");
                      }
                    } catch (e) {
                      showToast("Could not send request", "error");
                    } finally {
                      setMigrationLoading(false);
                      setShowMigrationDialog(false);
                    }
                  }}
                  disabled={migrationLoading}
                  className="w-full bg-nigeria-green text-white py-4 rounded-2xl font-black shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {migrationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Migrate to {schoolName || 'School'}
                </button>
                <button
                  onClick={() => {
                    setShowMigrationDialog(false);
                    navigate('/');
                  }}
                  className="w-full bg-slate-100 text-slate-700 py-4 rounded-2xl font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <UserX className="w-4 h-4" />
                  Remain Independent
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showDeleteModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[40px] p-8 max-w-sm w-full shadow-2xl"
            >
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${deleteType === 'permanent' ? 'bg-red-100' : 'bg-orange-100'}`}>
                {deleteType === 'permanent' ? <Trash2 className="w-8 h-8 text-red-500" /> : <Pause className="w-8 h-8 text-orange-500" />}
              </div>
              <h2 className="text-xl font-black text-slate-900 text-center mb-1">
                {deleteType === 'permanent' ? 'Delete Account' : 'Deactivate Account'}
              </h2>
              <p className="text-sm text-slate-500 text-center mb-6">
                {deleteType === 'permanent'
                  ? 'This will permanently erase all your data and cannot be undone.'
                  : 'Your account will be hidden. You can reactivate it by logging back in.'}
              </p>
              {deleteType === 'permanent' && (
                <div className="mb-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-2">
                    Type DELETE to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full bg-slate-50 border border-red-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none transition-all font-mono"
                  />
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount || (deleteType === 'permanent' && deleteConfirmText !== 'DELETE')}
                  className={`flex-1 py-3 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2 ${deleteType === 'permanent' ? 'bg-red-500 hover:bg-red-600' : 'bg-orange-500 hover:bg-orange-600'}`}
                >
                  {deletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {deleteType === 'permanent' ? 'Delete Forever' : 'Deactivate'}
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
  const [newlyCreated, setNewlyCreated] = useState(false);
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

  // Admin bypass: read ?admin=<token> from URL and persist in sessionStorage
  const getAdminBypass = (): string | null => {
    if (typeof window === 'undefined') return null;
    const urlParam = new URLSearchParams(window.location.search).get('admin');
    if (urlParam) {
      sessionStorage.setItem('admin_bypass', urlParam);
      // Clean it from the URL without a reload
      const url = new URL(window.location.href);
      url.searchParams.delete('admin');
      window.history.replaceState({}, '', url.toString());
    }
    return sessionStorage.getItem('admin_bypass');
  };

  const fetchProfile = async (uid: string, displayName?: string) => {
    const adminBypass = getAdminBypass();
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/simple`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(adminBypass ? { "x-admin-bypass": adminBypass } : {}),
        },
        body: JSON.stringify({ uid, displayName })
      });
      if (res.status === 429) {
        // IP limit hit — undo the local account creation and guide them to log in
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
        if (data.newlyCreated) setNewlyCreated(true);
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
      showToast("Connection error. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Pre-fill school slug in recover form if the user is on a school URL
  useEffect(() => {
    if (loginStep === 'recover' && !recoverySlug) {
      const pathSegment = window.location.pathname.split('/').filter(Boolean)[0];
      const knownRoutes = ['admin', 'payment-success'];
      if (pathSegment && !knownRoutes.includes(pathSegment) && !pathSegment.includes('dashboard')) {
        setRecoverySlug(pathSegment);
      }
    }
  }, [loginStep]);

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
          <Route path="/" element={<MainApp user={user} profile={profile} onLogin={() => { console.log("Login clicked"); setShowLoginModal(true); }} onLogout={handleLogout} refreshProfile={() => user && fetchProfile(user.uid)} showToast={showToast} showSettings={showSettings} setShowSettings={setShowSettings} newlyCreated={newlyCreated} />} />
          <Route path="/admin" element={<AdminDashboard showToast={showToast} />} />
          <Route path="/payment-success" element={<MainApp user={user} profile={profile} onLogin={() => { console.log("Login clicked"); setShowLoginModal(true); }} onLogout={handleLogout} refreshProfile={() => user && fetchProfile(user.uid)} showToast={showToast} showSettings={showSettings} setShowSettings={setShowSettings} newlyCreated={newlyCreated} />} />
          <Route path="/:school_slug" element={<MainApp user={user} profile={profile} onLogin={() => { console.log("Login clicked"); setShowLoginModal(true); }} onLogout={handleLogout} refreshProfile={() => user && fetchProfile(user.uid)} showToast={showToast} showSettings={showSettings} setShowSettings={setShowSettings} newlyCreated={newlyCreated} />} />
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
