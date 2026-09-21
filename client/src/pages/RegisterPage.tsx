import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import { 
  UserCheck, 
  Building, 
  Shield, 
  AlertCircle, 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  Lock, 
  Mail, 
  User as UserIcon,
  BadgeCheck
} from 'lucide-react';

interface InviteInfo {
  token: string;
  role: string;
  departmentId: string | null;
  department: {
    id: string;
    name: string;
    code: string;
  } | null;
  position: string | null;
  expiresAt: string;
  createdByName?: string;
}

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    employeeId: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setFetchError('No registration token was provided. Please use the link sent by your administrator.');
      setLoading(false);
      return;
    }

    const verifyToken = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/auth/invite/${token}`);
        setInvite(res.data.data);
      } catch (err: any) {
        setFetchError(
          err.response?.data?.message || 'This registration link is invalid, expired, or has already been used.'
        );
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (formData.password !== formData.confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    if (formData.password.length < 8) {
      setSubmitError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/register-with-invite', {
        token,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        fullName: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
        employeeId: formData.employeeId.trim(),
        username: formData.username.toLowerCase().trim(),
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2500);
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || 'Failed to complete registration.');
    } finally {
      setSubmitting(false);
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
          Employee Registration
        </h2>
        <p className="mt-1 text-center text-sm text-slate-600">
          NKB Manufacturing Corp. SOP Management Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-slate-200">
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Verifying registration invitation link...
            </div>
          ) : fetchError ? (
            <div className="text-center py-6">
              <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900 mb-1">Registration Link Invalid</h3>
              <p className="text-xs text-slate-600 mb-6 max-w-sm mx-auto">{fetchError}</p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors"
              >
                Back to Login
              </Link>
            </div>
          ) : success ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3 animate-bounce" />
              <h3 className="text-lg font-bold text-slate-900">Registration Complete!</h3>
              <p className="text-xs text-slate-600 mt-1 mb-6">
                Your account has been successfully created. Redirecting to the corporate login page...
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow"
              >
                Proceed to Login Now →
              </Link>
            </div>
          ) : (
            <div>
              {/* Pre-assigned Assignment Details Banner */}
              {invite && (
                <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-800 uppercase tracking-wider">
                    <BadgeCheck className="w-4 h-4 text-blue-600" /> Pre-Assigned Enterprise Role
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Shield className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Role</span>
                        <span className="font-semibold">{invite.role.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Building className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Department</span>
                        <span className="font-semibold">
                          {invite.department ? `${invite.department.name} (${invite.department.code})` : 'Global / Executive'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {submitError && (
                <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <form className="space-y-4 text-xs" onSubmit={handleSubmit}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Maria"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Santos"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                    Employee ID / ID Number (for login) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EMP-105 or 2026-105"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">You can use this ID Number to log into the portal.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                      Official Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="m.santos@nkbmanufacturing.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                      Username *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="msantos"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none lowercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                    Password (min 8 chars) *
                  </label>
                  <div className="relative rounded-lg shadow-sm">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="block w-full px-3 pr-10 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
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

                <div>
                  <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                    Confirm Password *
                  </label>
                  <div className="relative rounded-lg shadow-sm">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className="block w-full px-3 pr-10 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                      title={showConfirmPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-3 py-2.5 px-4 rounded-lg font-semibold text-xs text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  {submitting ? 'Creating Account...' : 'Complete Self-Registration'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
