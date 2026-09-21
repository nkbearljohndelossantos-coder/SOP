import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  FileText,
  FilePlus2,
  Building2,
  Users,
  ShieldCheck,
  BarChart3,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { isAdmin, canCreateSOP } = useAuth();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/sops', label: 'All SOPs', icon: FileText, end: true },
    ...(canCreateSOP ? [{ to: '/sops/create', label: 'Create SOP', icon: FilePlus2, end: true }] : []),
    { to: '/departments', label: 'Departments', icon: Building2, end: true },
    ...(isAdmin ? [{ to: '/users', label: 'User Directory', icon: Users, end: true }] : []),
    ...(isAdmin ? [{ to: '/audit-logs', label: 'Audit Trail', icon: ShieldCheck, end: true }] : []),
    { to: '/reports', label: 'Reports & Matrix', icon: BarChart3, end: true },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0 min-h-[calc(100vh-4rem)] border-r border-slate-800">
      <div className="p-4 flex flex-col space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="mt-auto p-4 border-t border-slate-800 text-xs text-slate-400">
        <div className="font-semibold text-slate-300">NKB Manufacturing Corp.</div>
        <div>Standard Operating Procedures v1.0</div>
        <div className="mt-1 text-[11px] text-slate-400">ISO 9001 Compliant QMS</div>
      </div>
    </aside>
  );
};
