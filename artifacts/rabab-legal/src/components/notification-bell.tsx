import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, AlertTriangle, Info, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface UserNotification {
  id: number;
  notificationId: number;
  titleAr: string;
  titleEn?: string;
  bodyAr: string;
  bodyEn?: string;
  type: 'update' | 'alert' | 'info' | 'legal_change';
  publishedAt?: string;
  readAt?: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  legal_change: <Bell className="w-3.5 h-3.5" style={{color:'hsl(47 100% 48%)'}} />,
  alert: <AlertTriangle className="w-3.5 h-3.5 text-red-500" />,
  update: <RefreshCw className="w-3.5 h-3.5 text-blue-500" />,
  info: <Info className="w-3.5 h-3.5 text-gray-500" />,
};

export function NotificationBell({ lang = 'ar' }: { lang?: 'ar' | 'en' }) {
  const [notifs, setNotifs] = useState<UserNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/notifications`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setNotifs(data.notifications ?? []);
      setUnread(data.unreadCount ?? 0);
    } catch {}
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const markAllRead = async () => {
    await fetch(`${API_BASE}/api/notifications/read-all`, { method: 'POST', credentials: 'include' });
    setNotifs(prev => prev.map(n => ({ ...n, readAt: new Date().toISOString() })));
    setUnread(0);
  };

  const markRead = async (id: number) => {
    await fetch(`${API_BASE}/api/notifications/${id}/read`, { method: 'POST', credentials: 'include' });
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    setUnread(prev => Math.max(0, prev - 1));
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        title={lang === 'ar' ? 'الإشعارات' : 'Notifications'}
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={cn(
          "absolute top-full mt-2 w-[min(20rem,calc(100vw-1.5rem))] bg-card border-2 border-secondary/50 rounded-xl shadow-xl z-50 overflow-hidden",
          lang === 'ar' ? 'right-0' : 'left-0'
        )} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <h3 className="font-bold text-sm text-primary">
              {lang === 'ar' ? 'الإشعارات' : 'Notifications'}
              {unread > 0 && <span className="mr-2 ml-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">{unread}</span>}
            </h3>
            {unread > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                <CheckCheck className="w-3.5 h-3.5" />
                {lang === 'ar' ? 'قراءة الكل' : 'Mark all read'}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                {lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}
              </div>
            ) : (
              notifs.map(n => (
                <div
                  key={n.id}
                  className={cn(
                    "px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer",
                    !n.readAt && "bg-primary/3"
                  )}
                  onClick={() => !n.readAt && markRead(n.id)}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">{TYPE_ICON[n.type]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {!n.readAt && <div className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                        <p className="font-bold text-xs text-foreground truncate">
                          {lang === 'ar' ? n.titleAr : (n.titleEn || n.titleAr)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                        {lang === 'ar' ? n.bodyAr : (n.bodyEn || n.bodyAr)}
                      </p>
                      {n.publishedAt && (
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {new Date(n.publishedAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
