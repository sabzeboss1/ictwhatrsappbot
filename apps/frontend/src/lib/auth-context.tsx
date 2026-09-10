import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'agent';
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (token: string, userData: AuthUser) => void;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const token = localStorage.getItem('ict_auth_token');
    const storedUser = localStorage.getItem('ict_user_data');

    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        // Valider avec l'API
        api
          .get('/api/auth/me')
          .then((res) => {
            setUser(res.data.user);
            localStorage.setItem('ict_user_data', JSON.stringify(res.data.user));
          })
          .catch(() => {
            // Jeton invalide
            localStorage.removeItem('ict_auth_token');
            localStorage.removeItem('ict_user_data');
            setUser(null);
          })
          .finally(() => setLoading(false));
        return;
      } catch (e) {
        localStorage.removeItem('ict_auth_token');
        localStorage.removeItem('ict_user_data');
      }
    }
    setLoading(false);
  }, []);

  const login = (token: string, userData: AuthUser) => {
    localStorage.setItem('ict_auth_token', token);
    localStorage.setItem('ict_user_data', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('ict_auth_token');
    localStorage.removeItem('ict_user_data');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAdmin: user?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
