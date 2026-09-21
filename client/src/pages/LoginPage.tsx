import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, AlertCircle, ShieldAlert, UserCheck, Eye, EyeOff } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, demoLogin, systemConfig, checkSystemConfig } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkSystemConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(identifier, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials or account deactivated.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSwitch = async (demoUsernameOrEmail: string) => {
    setError(null);
    setLoading(true);
    try {
      await demoLogin(demoUsernameOrEmail);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to authenticate demo user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-nkb-navy text-white flex items-center justify-center font-black tracking-tighter text-2xl shadow-lg border-2 border-nkb-gold">
            NKB
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-slate-900">
          NKB Manufacturing Corp.
        </h2>
        <p className="mt-1 text-center text-sm text-slate-600">
          Standard Operating Procedure (SOP) Management System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-slate-200">
          {systemConfig?.needsInitialAdmin && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start space-x-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold block">First-Time Setup Required</span>
                No administrator account exists yet.
                <Link to="/setup" className="font-semibold text-blue-600 hover:underline block mt-1">
                  Click here to initialize Super Admin →
                </Link>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                ID Number, Email, or Username
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. EMP-001, username, or email"
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                {systemConfig?.allowDemoAccounts && (
                  <span className="text-[11px] text-blue-600 font-mono">Demo: DemoPassword123!</span>
                )}
              </div>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          {/* Quick Demo Switcher - Guarded strictly by allowDemoAccounts */}
          {systemConfig?.allowDemoAccounts && (
            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-600" /> Demo Personas (Development Only)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                  DEV MODE
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleDemoSwitch('admin')}
                  className="p-2.5 text-left rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-slate-800 block">System Administrator (IT)</span>
                    <span className="text-[11px] text-slate-500 font-mono">admin@nkb.local • Super Admin</span>
                  </div>
                  <span className="text-blue-600 font-semibold">1-Click Switch →</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoSwitch('depthead_qc')}
                  className="p-2.5 text-left rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-slate-800 block">Bombita, Raniella Camille</span>
                    <span className="text-[11px] text-slate-500 font-mono">r.bombita@nkb.local • QC Head (Approver)</span>
                  </div>
                  <span className="text-blue-600 font-semibold">1-Click Switch →</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoSwitch('depthead_wh')}
                  className="p-2.5 text-left rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-slate-800 block">Luy, Rodello</span>
                    <span className="text-[11px] text-slate-500 font-mono">r.luy@nkb.local • Warehouse Head (Approver)</span>
                  </div>
                  <span className="text-blue-600 font-semibold">1-Click Switch →</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoSwitch('creator')}
                  className="p-2.5 text-left rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-slate-800 block">Alonzo, Merry Jean I.</span>
                    <span className="text-[11px] text-slate-500 font-mono">m.alonzo@nkb.local • SOP Creator</span>
                  </div>
                  <span className="text-blue-600 font-semibold">1-Click Switch →</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoSwitch('employee')}
                  className="p-2.5 text-left rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-slate-800 block">Delos Santos, Earl John</span>
                    <span className="text-[11px] text-slate-500 font-mono">e.delossantos@nkb.local • Read-Only Staff</span>
                  </div>
                  <span className="text-blue-600 font-semibold">1-Click Switch →</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
