import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../firebase';

interface Notification {
  id: string;
  type: string;
  recipient: string;
  title: string;
  message: string;
  createdAt: any;
  quizId?: string;
  submissionId?: string;
}

interface NotificationBellProps {
  isAdmin: boolean;
  studentName?: string;
  studentClass?: string;
}

export function NotificationBell({ isAdmin, studentName, studentClass }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const storedReadIds = localStorage.getItem('readNotifications');
    if (storedReadIds) {
      setReadIds(new Set(JSON.parse(storedReadIds)));
    }
  }, []);

  useEffect(() => {
    let q;
    if (isAdmin) {
      q = query(
        collection(db, 'notifications'),
        where('recipient', '==', 'admins'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
    } else if (studentName && studentClass) {
      const studentRecipient = `${studentName}_${studentClass}`;
      q = query(
        collection(db, 'notifications'),
        where('recipient', 'in', ['all_students', studentRecipient]),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
    } else {
      return;
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      setNotifications(notifs);
    }, (error) => {
      console.error('Notification fetch error:', error);
    });

    return () => unsubscribe();
  }, [isAdmin, studentName, studentClass]);

  useEffect(() => {
    const unread = notifications.filter(n => !readIds.has(n.id)).length;
    setUnreadCount(unread);
  }, [notifications, readIds]);

  const markAsRead = (id: string) => {
    const newReadIds = new Set(readIds);
    newReadIds.add(id);
    setReadIds(newReadIds);
    localStorage.setItem('readNotifications', JSON.stringify(Array.from(newReadIds)));
  };

  const markAllAsRead = () => {
    const newReadIds = new Set(readIds);
    notifications.forEach(n => newReadIds.add(n.id));
    setReadIds(newReadIds);
    localStorage.setItem('readNotifications', JSON.stringify(Array.from(newReadIds)));
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-indigo-600 focus:outline-none"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 w-80 mt-2 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Thông báo</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Đánh dấu đã đọc tất cả
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-500 text-sm">
                Chưa có thông báo nào.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((notification) => {
                  const isRead = readIds.has(notification.id);
                  return (
                    <li
                      key={notification.id}
                      className={`px-4 py-3 hover:bg-gray-50 transition-colors ${isRead ? 'opacity-75' : 'bg-indigo-50/30'}`}
                      onClick={() => markAsRead(notification.id)}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h4 className={`text-sm ${isRead ? 'font-medium text-gray-800' : 'font-semibold text-indigo-900'}`}>
                          {notification.title}
                        </h4>
                        {!isRead && <span className="w-2 h-2 bg-indigo-600 rounded-full mt-1.5 flex-shrink-0"></span>}
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">{notification.message}</p>
                      {notification.createdAt && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          {notification.createdAt.toDate ? notification.createdAt.toDate().toLocaleString('vi-VN') : 'Vừa xong'}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
