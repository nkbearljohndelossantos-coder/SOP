import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { User, Roles } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  systemConfig: { allowDemoAccounts: boolean; needsInitialAdmin: boolean } | null;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  demoLogin: (usernameOrEmail: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  checkSystemConfig: () => Promise<void>;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isDeptHead: boolean;
  isDeptRep: boolean;
  canCreateSOP: boolean;
  canManageUsers: boolean;
  canManageDepartments: boolean;
  userDepartmentId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem('sop_user');
    return cached ? JSON.parse(cached) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sop_auth_token'));
  const [loading, setLoading] = useState<boolean>(true);
  const [systemConfig, setSystemConfig] = useState<{ allowDemoAccounts: boolean; needsInitialAdmin: boolean } | null>(null);

  const checkSystemConfig = async () => {
    try {
      const res = await api.get('/auth/config');
      const cfg = res.data?.data || res.data;
      setSystemConfig({
        allowDemoAccounts: cfg.allowDemoAccounts ?? true,
        needsInitialAdmin: cfg.needsInitialAdmin ?? false,
      });
    } catch (err) {
      console.error('Failed to fetch system config', err);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      const fetchedUser = res.data?.user || res.data?.data || res.data;
      setUser(fetchedUser);
      localStorage.setItem('sop_user', JSON.stringify(fetchedUser));
    } catch {
      setUser(null);
      setToken(null);
      localStorage.removeItem('sop_user');
      localStorage.removeItem('sop_auth_token');
    }
  };

  useEffect(() => {
    const init = async () => {
      await checkSystemConfig();
      if (token) {
        await refreshUser();
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = async (emailOrUsernameOrId: string, password: string) => {
    const res = await api.post('/auth/login', {
      identifier: emailOrUsernameOrId,
      username: emailOrUsernameOrId,
      email: emailOrUsernameOrId,
      employeeId: emailOrUsernameOrId,
      password,
    });
    const receivedToken = res.data?.token || res.data?.data?.token;
    const receivedUser = res.data?.user || res.data?.data?.user;
    setToken(receivedToken);
    setUser(receivedUser);
    localStorage.setItem('sop_auth_token', receivedToken);
    localStorage.setItem('sop_user', JSON.stringify(receivedUser));
  };

  const demoLogin = async (usernameOrEmailOrId: string) => {
    const res = await api.post('/auth/demo-login', {
      identifier: usernameOrEmailOrId,
      username: usernameOrEmailOrId,
      email: usernameOrEmailOrId,
      employeeId: usernameOrEmailOrId,
    });
    const receivedToken = res.data?.token || res.data?.data?.token;
    const receivedUser = res.data?.user || res.data?.data?.user;
    setToken(receivedToken);
    setUser(receivedUser);
    localStorage.setItem('sop_auth_token', receivedToken);
    localStorage.setItem('sop_user', JSON.stringify(receivedUser));
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    } finally {
      setUser(null);
      setToken(null);
      localStorage.removeItem('sop_auth_token');
      localStorage.removeItem('sop_user');
    }
  };

  const isSuperAdmin = user?.role === Roles.SUPER_ADMIN;
  const isAdmin = isSuperAdmin || user?.role === Roles.ADMIN;
  const isDeptHead = user?.role === Roles.DEPARTMENT_HEAD;
  const isDeptRep = user?.role === Roles.DEPARTMENT_REPRESENTATIVE;

  const canCreateSOP = isAdmin || isDeptHead || isDeptRep || user?.role === 'SOP_CREATOR' || user?.role === Roles.CREATOR;
  const canManageUsers = isAdmin;
  const canManageDepartments = isAdmin;
  const userDepartmentId = user?.departmentId || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        systemConfig,
        login,
        demoLogin,
        logout,
        refreshUser,
        checkSystemConfig,
        isSuperAdmin,
        isAdmin,
        isDeptHead,
        isDeptRep,
        canCreateSOP,
        canManageUsers,
        canManageDepartments,
        userDepartmentId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
