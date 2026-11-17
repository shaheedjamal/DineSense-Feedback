import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getStoredToken, setStoredToken } from '../services/api';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  venueName: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: {
    full_name: string;
    email: string;
    password: string;
    restaurant_name?: string;
    location?: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setVenueName(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
      setVenueName(res.data.venue?.restaurant_name || null);
    } catch {
      setStoredToken(null);
      setUser(null);
      setVenueName(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await api.post('/auth/login', { email, password });
    setStoredToken(res.data.access_token);
    setUser(res.data.user);
    await refreshUser();
    return res.data.user as User;
  };

  const register = async (payload: {
    full_name: string;
    email: string;
    password: string;
    restaurant_name?: string;
    location?: string;
  }): Promise<User> => {
    const res = await api.post('/auth/register', payload);
    setStoredToken(res.data.access_token);
    setUser(res.data.user);
    await refreshUser();
    return res.data.user as User;
  };

  const logout = async (): Promise<void> => {
    try {
      if (getStoredToken()) {
        await api.post('/auth/logout');
      }
    } catch {
      // Ignore network errors on logout
    } finally {
      setStoredToken(null);
      setUser(null);
      setVenueName(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, venueName, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
