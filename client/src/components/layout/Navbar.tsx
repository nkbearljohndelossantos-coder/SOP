import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { NotificationDropdown } from '../common/NotificationDropdown';
import { LogOut, User as UserIcon, Building2, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getRoleBadge = (role?: string) => {
    if (!role) return null;
    const cleanRole = role.replace(/_/g, ' ');
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100/70 text-blue-900 border border-blue-200">
        <Shield className="w-3 h-3 text-blue-700" />
        {cleanRole}
      </span>
    );
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center space-x-3">
        <div className="flex items-center gap-2 font-bold text-lg text-nkb-navy">
          <div className="w-8 h-8 rounded-lg bg-nkb-navy text-white flex items-center justify-center font-black tracking-tighter text-sm shadow">
            NKB
          </div>
          <span className="hidden sm:inline text-slate-800 font-extrabold tracking-tight">
            SOP Management System
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <NotificationDropdown />

        <div className="h-6 w-px bg-slate-200" />

        {user && (
          <div className="flex items-center space-x-3">
            <div className="hidden md:flex flex-col items-end">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-slate-800">
                  {user.firstName} {user.lastName}
                </span>
                {getRoleBadge(user.role)}
              </div>
              <div className="flex items-center space-x-1 text-xs text-slate-500">
                {user.department ? (
                  <>
                    <Building2 className="w-3 h-3 text-slate-400" />
                    <span>{user.department.name}</span>
                  </>
                ) : (
                  <span>Executive / Cross-Department</span>
                )}
              </div>
            </div>

            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 font-semibold text-sm">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>

            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
              title="Log out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
