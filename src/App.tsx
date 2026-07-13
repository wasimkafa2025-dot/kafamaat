import React, { useState, useEffect, useRef } from 'react';
import { Task, Activity, BackupSnapshot, AppSettings } from './types';
import { getActiveDb, getActiveDbMode, getFirebaseInstance } from './lib/firebase';
import { callGeminiProxy } from './lib/gemini';
import { sendTelegramMessage } from './lib/telegram';
import { TaskCard } from './components/TaskCard';
import { TaskForm } from './components/TaskForm';
import { CalendarView } from './components/CalendarView';
import { SettingsModal } from './components/SettingsModal';

import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where,
  getDocs,
  writeBatch
} from "firebase/firestore";
import { Chart } from 'chart.js/auto';
import { 
  Hourglass, 
  Sparkles, 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  FileUp, 
  FileDown, 
  History, 
  LogOut, 
  Settings, 
  Sun, 
  Moon, 
  Plus, 
  Search, 
  Volume2, 
  AlertCircle, 
  Info,
  Maximize2,
  Trash2,
  ListFilter,
  X,
  Wifi,
  WifiOff,
  Keyboard
} from 'lucide-react';

function generateUUID() {
  return 'tf_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
}

// Helper to determine greeting and icon based on system hour
function getTimeOfDayGreeting(): { text: string; icon: string } {
  const hour = new Date().getHours();
  if (hour < 12) {
    return { text: 'Good Morning', icon: 'wb_sunny' };
  } else if (hour < 17) {
    return { text: 'Good Afternoon', icon: 'wb_sunny' };
  } else {
    return { text: 'Good Evening', icon: 'nights_stay' };
  }
}

// Session-level tracking set to prevent double automated Telegram notifications due to React re-renders or concurrent interval ticks
const inFlightTelegramAlerts = new Set<string>();

export default function App() {
  // --- CORE APP STATES ---
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    const saved = localStorage.getItem('taskflow_user');
    return saved || null;
  });
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [backupHistory, setBackupHistory] = useState<BackupSnapshot[]>([]);
  const [dbMode, setDbMode] = useState<'user' | 'workspace'>(getActiveDbMode());
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);
  const [reportLang, setReportLang] = useState<'km-KH' | 'en-US'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('taskflow_report_lang') as any) || 'km-KH';
    }
    return 'km-KH';
  });

  // Views Routing: dashboard, daily-tasks, monthly-tasks, yearly-tasks, calendar, task-tracker, search-filter, archive
  const [activeView, setActiveView] = useState<'dashboard' | 'daily-tasks' | 'monthly-tasks' | 'yearly-tasks' | 'calendar' | 'task-tracker' | 'search-filter' | 'archive'>('dashboard');
  
  // Design details
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('taskflow_theme') as any) || 'light';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Forms pre-fills
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [quickAddModal, setQuickAddModal] = useState<{ open: boolean; type: 'daily' | 'monthly' | 'yearly'; date?: string }>({ open: false, type: 'daily' });
  const [detailModalTask, setDetailModalTask] = useState<Task | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Custom auth states
  const [usernameInput, setUsernameInput] = useState('kafa');
  const [passwordInput, setPasswordInput] = useState('wasim');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotPasswordPanel, setForgotPasswordPanel] = useState(false);
  const [forgotAnswer, setForgotAnswer] = useState('');
  const [newPasswordVal, setNewPassword] = useState('');

  // Search filter options
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState<'all' | 'daily' | 'monthly' | 'yearly'>('all');
  const [searchPriority, setSearchPriority] = useState<'all' | 'High' | 'Medium' | 'Low'>('all');
  const [searchStatus, setSearchStatus] = useState<'all' | 'Pending' | 'Completed'>('all');

  // Specific search query boxes inside Daily/Monthly/Yearly lists
  const [dailyFilterQuery, setDailyFilterQuery] = useState('');
  const [monthlyFilterQuery, setMonthlyFilterQuery] = useState('');
  const [yearlyFilterQuery, setYearlyFilterQuery] = useState('');

  // Specific status filters inside Daily/Monthly/Yearly lists
  const [dailyStatusFilter, setDailyStatusFilter] = useState<'all' | 'Pending' | 'Completed'>('all');
  const [monthlyStatusFilter, setMonthlyStatusFilter] = useState<'all' | 'Pending' | 'Completed'>('all');
  const [yearlyStatusFilter, setYearlyStatusFilter] = useState<'all' | 'Pending' | 'Completed'>('all');

  // Sorting preferences inside Daily/Monthly/Yearly lists
  const [dailySortBy, setDailySortBy] = useState<'date' | 'priority' | 'status' | 'smart'>('date');
  const [monthlySortBy, setMonthlySortBy] = useState<'date' | 'priority' | 'status' | 'smart'>('date');
  const [yearlySortBy, setYearlySortBy] = useState<'date' | 'priority' | 'status' | 'smart'>('date');

  // AI Productivity Summary
  const [aiSummaryRange, setAiSummaryRange] = useState<'today' | 'week'>('today');
  const [aiSummaryOutput, setAiSummaryOutput] = useState('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  // AI Chat Assistant Panel
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState<Array<{ role: 'user' | 'model'; text: string }>>([
    { role: 'model', text: 'Hi! Ask me about your tasks — e.g. "What should I focus on today?" or "Am I behind on anything?"' }
  ]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatLoading, setAiChatLoading] = useState(false);

  // Alarm popup
  const [activeAlarm, setActiveAlarm] = useState<Task | null>(null);

  // References
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<any>(null);
  const aiChatEndRef = useRef<HTMLDivElement | null>(null);
  const hasAttemptedOfflineSync = useRef(false);

  // Khmer date logic
  const [liveKhmerDate, setLiveKhmerDate] = useState('');
  const [liveTime, setLiveTime] = useState('');

  // Profile picture state
  const [profilePic, setProfilePic] = useState<string | null>(() => {
    return localStorage.getItem('taskflow_profile_pic') || null;
  });

  const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setProfilePic(base64String);
        localStorage.setItem('taskflow_profile_pic', base64String);
        logActivity('Profile picture uploaded successfully for Mr. Kafa');
      };
      reader.readAsDataURL(file);
    }
  };

  // Import/Export in JSON File
  const handleExportJSON = () => {
    try {
      const exportData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        tasks: tasks,
        archivedTasks: archivedTasks
      };
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `taskcal_export_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      logActivity("Exported tasks data to JSON file successfully");
    } catch (err) {
      alert("Failed to export data: " + (err as Error).message);
    }
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const importedData = JSON.parse(content);
        
        if (!importedData || (!Array.isArray(importedData.tasks) && !Array.isArray(importedData.archivedTasks))) {
          throw new Error("Invalid JSON format. Must contain tasks list.");
        }

        const newTasks = Array.isArray(importedData.tasks) ? importedData.tasks : [];
        const newArchived = Array.isArray(importedData.archivedTasks) ? importedData.archivedTasks : [];

        setTasks(newTasks);
        setArchivedTasks(newArchived);

        const db = getActiveDb();
        const promises = [
          ...newTasks.map(t => setDoc(doc(db, "tasks", t.id), { ...t, userId: currentUser })),
          ...newArchived.map(t => setDoc(doc(db, "tasks", t.id), { ...t, userId: currentUser, isArchived: true }))
        ];
        
        await Promise.all(promises).catch(err => {
          console.warn("Some firestore updates failed or offline:", err);
        });

        logActivity(`Imported ${newTasks.length} tasks and ${newArchived.length} archived tasks from JSON successfully`);
        alert(`Successfully imported ${newTasks.length} tasks and ${newArchived.length} archived tasks!`);
      } catch (err) {
        alert("Failed to import JSON file: " + (err as Error).message);
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // --- ALARM CHIME SYNTHESIZER ---
  const playAlertChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = audioCtx.currentTime;
      playTone(523.25, now, 0.3); // C5
      playTone(659.25, now + 0.15, 0.3); // E5
      playTone(783.99, now + 0.3, 0.4); // G5
    } catch (e) {
      console.warn('Synth error:', e);
    }
  };

  // --- LOG ACTIVITY TIMELINE ---
  const logActivity = (message: string) => {
    const log: Activity = {
      timestamp: new Date().toLocaleTimeString() + ' ' + new Date().toLocaleDateString(),
      message
    };
    setActivities(prev => {
      const updated = [log, ...prev].slice(0, 50);
      localStorage.setItem('taskflow_activities', JSON.stringify(updated));
      return updated;
    });
  };

  // --- ONLINE/OFFLINE EVENT LISTENERS ---
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      logActivity('Network connection restored. All offline task mutations synchronized with Cloud Firestore successfully.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      logActivity('Offline mode activated. Tasks are fully functional offline; offline actions will be queued and synchronized once the internet is restored.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- GLOBAL KEYBOARD SHORTCUTS ENGINE ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. ESCAPE key: always close any open overlay or modal first
      if (e.key === 'Escape') {
        let closedSomething = false;
        if (showSettingsModal) {
          setShowSettingsModal(false);
          closedSomething = true;
        }
        if (showBackupModal) {
          setShowBackupModal(false);
          closedSomething = true;
        }
        if (quickAddModal.open) {
          setQuickAddModal({ open: false, type: 'daily' });
          setEditTask(null);
          closedSomething = true;
        }
        if (detailModalTask) {
          setDetailModalTask(null);
          closedSomething = true;
        }
        if (closedSomething) {
          e.preventDefault();
        }
        return;
      }

      // Check if user is typing in an editable field (inputs, textareas, or contenteditables)
      const activeEl = document.activeElement;
      const isEditing = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.hasAttribute('contenteditable') ||
        (activeEl as HTMLElement).isContentEditable
      );

      if (isEditing) {
        return;
      }

      // 2. '/' key: Focus the primary search input on the page
      if (e.key === '/') {
        // Find visible text inputs whose placeholder contains "Search"
        const searchInputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
        const visibleSearchInput = searchInputs.find(input => {
          const style = window.getComputedStyle(input);
          return (input.placeholder && input.placeholder.toLowerCase().includes('search')) &&
                 style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 input.getBoundingClientRect().width > 0;
        });

        if (visibleSearchInput) {
          e.preventDefault();
          visibleSearchInput.focus();
          visibleSearchInput.select();
        }
        return;
      }

      // 3. 'n' / 'N' key: Open lightning quick add task modal
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        
        // Match active view to task list category
        let type: 'daily' | 'monthly' | 'yearly' = 'daily';
        if (activeView === 'monthly-tasks') {
          type = 'monthly';
        } else if (activeView === 'yearly-tasks') {
          type = 'yearly';
        }

        setQuickAddModal({ open: true, type });
        logActivity(`Quick-add task editor triggered via [N] shortcut key in ${activeView} view.`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeView, quickAddModal, detailModalTask, showBackupModal, showSettingsModal]);

  // --- SYSTEM SNAPSHOT SNAPSHOTS ---
  const triggerAutoBackup = (taskList: Task[], archiveList: Task[]) => {
    const timestamp = new Date().toLocaleString();
    const backupStr = JSON.stringify({ tasks: taskList, archivedTasks: archiveList });
    
    setBackupHistory(prev => {
      if (prev.length > 0 && prev[0].data === backupStr) return prev;
      const updated = [{ timestamp, data: backupStr }, ...prev].slice(0, 10);
      localStorage.setItem('taskflow_backup_history', JSON.stringify(updated));
      return updated;
    });
  };

  // --- THEME APPLY ENGINE ---
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('taskflow_theme', theme);
  }, [theme]);

  // --- REAL-TIME TIME & LUNAR DATES ---
  useEffect(() => {
    const getKhmerLunarDate = (d: Date) => {
      const khmerNumbers = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
      const toKhmerNum = (num: number) => String(num).split('').map(digit => khmerNumbers[parseInt(digit)] || digit).join('');
      const khMonths = ['មិគសិរ', 'បុស្ស', 'មាឃ', 'ផល្គុន', 'ចេត្រ', 'ពិសាខ', 'ជេស្ឋ', 'អាសាឍ', 'ស្រាពណ៍', 'ភទ្របទ', 'អស្សុជ', 'កក្ដិក'];
      const khZodiac = ['ជូត', 'ឆ្លូវ', 'ខាល', 'ថោះ', 'រោង', 'ម្សាញ់', 'មមី', 'មមែ', 'វក', 'រកា', 'ចរ', 'កុរ'];
      const khEra = ['ឯកស័ក', 'ទោស័ក', 'ត្រីស័ក', 'ចត្វាស័ក', 'បញ្ចស័ក', 'ឆស័ក', 'សប្តស័ក', 'អដ្ឋស័ក', 'នព្វស័ក', 'សំរឹទ្ធិស័ក'];

      const baseDate = new Date(2026, 6, 8); // July 8, 2026
      const diffDays = Math.round((d.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
      let lunarAge = (22 + diffDays) % 30;
      if (lunarAge < 0) lunarAge += 30;
      
      const lunarDay = Math.floor(lunarAge) % 15 + 1;
      const isKert = (Math.floor(lunarAge) < 15);
      const statusLabel = isKert ? 'កើត' : 'រោច';
      
      const monthIdx = Math.abs(7 + Math.floor(diffDays / 29.53)) % 12;
      const yearOffset = d.getFullYear() - 2026;
      const zodiacIdx = (6 + yearOffset + 120) % 12;
      const eraIdx = (1 + yearOffset + 100) % 10;
      const budEra = 2570 + yearOffset;
      
      return `${toKhmerNum(lunarDay)} ${statusLabel} ខែ${khMonths[monthIdx]} ឆ្នាំ${khZodiac[zodiacIdx]} ${khEra[eraIdx]} ព.ស. ${toKhmerNum(budEra)}`;
    };

    const updateClock = () => {
      const now = new Date();
      setLiveTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setLiveKhmerDate(getKhmerLunarDate(now));
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    if (aiChatEndRef.current) {
      aiChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiChatMessages, aiChatOpen]);

  // Load baseline local backups on mount
  useEffect(() => {
    const savedActivities = localStorage.getItem('taskflow_activities');
    if (savedActivities) {
      try {
        setActivities(JSON.parse(savedActivities));
      } catch (_) {}
    }
    const savedSnapshots = localStorage.getItem('taskflow_backup_history');
    if (savedSnapshots) {
      try {
        setBackupHistory(JSON.parse(savedSnapshots));
      } catch (_) {}
    }
  }, []);

  // --- FIRESTORE SYNCHRONIZATION POOL ---
  useEffect(() => {
    if (!currentUser) return;

    hasAttemptedOfflineSync.current = false;

    // Connect to Firestore collection dynamically
    const db = getActiveDb();
    setDbMode(getActiveDbMode());

    // Query tasks specifically for current logged-in userId
    const qTasks = query(collection(db, "tasks"), where("userId", "==", currentUser));
    
    logActivity(`Connected with Cloud Firestore [${getActiveDbMode() === 'user' ? 'custom project' : 'workspace project'}]`);

    const unsubscribe = onSnapshot(qTasks, (snapshot) => {
      const isResetActive = localStorage.getItem('taskflow_reset_active') === 'true';
      if (isResetActive) {
        setTasks([]);
        setArchivedTasks([]);
        if (snapshot.empty) {
          localStorage.removeItem('taskflow_reset_active');
        }
        return;
      }

      const activeList: Task[] = [];
      const archivedList: Task[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data() as Task;
        // Check if document is archived
        if (data.status === 'Completed' && (data as any).isArchived) {
          archivedList.push(data);
        } else {
          activeList.push(data);
        }
      });

      // Also support legacy/local tasks fallback if firestore is newly connected and completely empty
      if (activeList.length === 0 && archivedList.length === 0) {
        if (!hasAttemptedOfflineSync.current) {
          hasAttemptedOfflineSync.current = true;
          // Pre-load from local storage or wait
          const localTasks = localStorage.getItem(`taskflow_tasks_${currentUser}`);
          if (localTasks) {
            try {
              const parsed = JSON.parse(localTasks);
              setTasks(parsed);
              // Write them back to cloud to synchronize
              parsed.forEach((t: Task) => {
                setDoc(doc(db, "tasks", t.id), { ...t, userId: currentUser }).catch(() => {});
              });
              return;
            } catch (_) {}
          }
        }
      } else {
        hasAttemptedOfflineSync.current = true;
      }

      setTasks(activeList);
      setArchivedTasks(archivedList);

      localStorage.setItem(`taskflow_tasks_${currentUser}`, JSON.stringify(activeList));
      triggerAutoBackup(activeList, archivedList);
    }, (error) => {
      console.warn("Firestore listener failed, using offline fallback:", error);
      // Fallback seamlessly to localstorage
      const localTasks = localStorage.getItem(`taskflow_tasks_${currentUser}`);
      if (localTasks) {
        try {
          setTasks(JSON.parse(localTasks));
        } catch (_) {}
      }
    });

    return () => unsubscribe();
  }, [currentUser, dbMode]);

  // --- REAL-TIME DUE ALARMS & AUTOMATIC TELEGRAM ALERTS ---
  useEffect(() => {
    if (!currentUser || tasks.length === 0) return;

    const checkInterval = setInterval(async () => {
      const now = new Date();
      
      // 1. Task Alarm due trigger
      tasks.forEach((t) => {
        if (t.status === 'Pending' && t.date && t.time) {
          const [h, m] = t.time.split(':');
          const taskTime = new Date(t.date);
          taskTime.setHours(parseInt(h), parseInt(m), 0, 0);

          if (now >= taskTime && !t.dueAlerted) {
            // Trigger Alarm UI modal
            setActiveAlarm(t);
            playAlertChime();
            
            // Mark as alerted
            const updated = { ...t, dueAlerted: true };
            const db = getActiveDb();
            setDoc(doc(db, "tasks", t.id), updated).catch(() => {});
          }
        }
      });

      // 2. Automated Telegram alerts before one day (Exactly 24 hours / 1 day)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      for (const t of tasks) {
        if (t.status === 'Pending' && t.date === tomorrowStr && !t.telegramNotified) {
          // Guard against in-flight duplicate dispatching
          if (inFlightTelegramAlerts.has(t.id)) {
            continue;
          }
          inFlightTelegramAlerts.add(t.id);

          // Send Telegram message proxied securely through server
          const priorityEmoji = t.priority === 'High' ? '🔴' : t.priority === 'Medium' ? '🟡' : '🟢';
          const messageText = `<b>🔔 TaskFlow Alert</b>\n\n` +
                              `Hello Mr. Kafa, here is your upcoming task:\n\n` +
                              `📋 <b>Title:</b> <i>${t.task}</i>\n` +
                              `📅 <b>Date:</b> <code>${t.date || '--'}</code>\n` +
                              `🕒 <b>Time:</b> <code>${t.time || '--:--'}</code>\n` +
                              `⚡ <b>Priority:</b> ${priorityEmoji} <b>${t.priority}</b>\n\n` +
                              `Thank you!`;
          
          try {
            const success = await sendTelegramMessage(messageText);
            if (success) {
              const updated = { ...t, telegramNotified: true };
              const db = getActiveDb();
              await setDoc(doc(db, "tasks", t.id), updated).catch(() => {});
              logActivity(`Sent automated Telegram alert 1 day before for: "${t.task}"`);
            } else {
              // Failed to send, remove from in-flight tracker to allow future retry
              inFlightTelegramAlerts.delete(t.id);
            }
          } catch (err) {
            console.error("Failed sending Telegram message in interval loop:", err);
            inFlightTelegramAlerts.delete(t.id);
          }
        }
      }
    }, 10000); // Check every 10 seconds for real-time accuracy

    return () => clearInterval(checkInterval);
  }, [currentUser, tasks]);

  // --- CHART RENDERING ENGINE (CHART.JS) ---
  useEffect(() => {
    if (!currentUser || activeView !== 'dashboard') return;

    // Grab statistics
    const dCompleted = tasks.filter(t => t.type === 'daily' && t.status === 'Completed').length;
    const dPending = tasks.filter(t => t.type === 'daily' && t.status === 'Pending').length;

    const mCompleted = tasks.filter(t => t.type === 'monthly' && t.status === 'Completed').length;
    const mPending = tasks.filter(t => t.type === 'monthly' && t.status === 'Pending').length;

    const yCompleted = tasks.filter(t => t.type === 'yearly' && t.status === 'Completed').length;
    const yPending = tasks.filter(t => t.type === 'yearly' && t.status === 'Pending').length;

    if (chartCanvasRef.current) {
      const isDark = theme === 'dark';
      const labelColor = isDark ? '#FFD700' : '#4B5563';
      const gridColor = isDark ? 'rgba(255, 215, 0, 0.1)' : 'rgba(0, 0, 0, 0.05)';

      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }

      chartInstanceRef.current = new Chart(chartCanvasRef.current, {
        type: 'bar',
        data: {
          labels: ['Daily Tasks', 'Monthly Tasks', 'Yearly Tasks'],
          datasets: [
            {
              label: 'Completed Tasks',
              data: [dCompleted, mCompleted, yCompleted],
              backgroundColor: '#34C759',
              borderRadius: 8
            },
            {
              label: 'Pending Tasks',
              data: [dPending, mPending, yPending],
              backgroundColor: '#FF9500',
              borderRadius: 8
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { 
              grid: { color: gridColor }, 
              ticks: { color: labelColor, font: { family: 'JetBrains Mono', size: 9 } } 
            },
            y: { 
              grid: { color: gridColor }, 
              ticks: { color: labelColor, font: { family: 'JetBrains Mono', size: 9 } } 
            }
          },
          plugins: {
            legend: { 
              labels: { color: labelColor, font: { family: 'Inter', size: 10 } } 
            }
          }
        }
      });
    }

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [currentUser, activeView, tasks, theme]);

  // --- ACTIONS: WRITE / DELETE FIREBASE ASYNC ---
  const handleAddTask = async (taskData: Partial<Task>, type: 'daily' | 'monthly' | 'yearly') => {
    if (!currentUser) return;

    const taskId = generateUUID();
    const newTask: Task = {
      id: taskId,
      type,
      task: taskData.task!,
      description: taskData.description || '',
      date: taskData.date || '',
      time: taskData.time || '',
      month: taskData.month || '',
      priority: taskData.priority || 'Medium',
      status: 'Pending',
      createdAt: new Date().toISOString(),
      tags: taskData.tags || '',
      userId: currentUser
    };

    // Update local state and localStorage immediately
    const updatedTasks = [...tasks, newTask];
    setTasks(updatedTasks);
    localStorage.setItem(`taskflow_tasks_${currentUser}`, JSON.stringify(updatedTasks));

    try {
      const db = getActiveDb();
      await setDoc(doc(db, "tasks", taskId), newTask);
      logActivity(`Created ${type} task: "${taskData.task}"`);
    } catch (e) {
      console.warn("Firestore write failed, using local/offline storage:", e);
      logActivity(`Offline write for task: "${taskData.task}"`);
    }

    setQuickAddModal({ open: false, type: 'daily' });
  };

  const handleUpdateTask = async (taskData: Partial<Task>) => {
    if (!editTask) return;

    const updated: Task = {
      ...editTask,
      ...taskData,
    } as Task;

    // Update local state and localStorage immediately
    const updatedTasks = tasks.map(t => t.id === editTask.id ? updated : t);
    setTasks(updatedTasks);
    localStorage.setItem(`taskflow_tasks_${currentUser}`, JSON.stringify(updatedTasks));

    try {
      const db = getActiveDb();
      await setDoc(doc(db, "tasks", editTask.id), updated);
      logActivity(`Updated task: "${taskData.task}"`);
    } catch (e) {
      console.warn("Firestore update failed, using local/offline storage:", e);
    }

    setEditTask(null);
    setQuickAddModal({ open: false, type: 'daily' });
  };

  const handleToggleComplete = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const updated: Task = {
      ...task,
      status: task.status === 'Completed' ? 'Pending' : 'Completed',
      completedAt: task.status === 'Completed' ? null : new Date().toISOString()
    };

    // Update local state and localStorage immediately
    const updatedTasks = tasks.map(t => t.id === id ? updated : t);
    setTasks(updatedTasks);
    localStorage.setItem(`taskflow_tasks_${currentUser}`, JSON.stringify(updatedTasks));

    try {
      const db = getActiveDb();
      await setDoc(doc(db, "tasks", id), updated);
      logActivity(`Toggled completion of task: "${task.task}"`);
    } catch (e) {
      console.warn("Firestore write failed, using local/offline storage:", e);
    }
  };

  const handleDeleteTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Update local state and localStorage immediately
    const updatedTasks = tasks.filter(t => t.id !== id);
    setTasks(updatedTasks);
    localStorage.setItem(`taskflow_tasks_${currentUser}`, JSON.stringify(updatedTasks));

    try {
      const db = getActiveDb();
      await deleteDoc(doc(db, "tasks", id));
      logActivity(`Deleted task: "${task.task}"`);
    } catch (e) {
      console.warn("Firestore delete failed, using local/offline storage:", e);
    }
  };

  const handleDuplicateTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const newId = generateUUID();
    const cloned: Task = {
      ...task,
      id: newId,
      task: `${task.task} (Copy)`,
      createdAt: new Date().toISOString(),
      completedAt: null,
      status: 'Pending'
    };

    // Update local state and localStorage immediately
    const updatedTasks = [...tasks, cloned];
    setTasks(updatedTasks);
    localStorage.setItem(`taskflow_tasks_${currentUser}`, JSON.stringify(updatedTasks));

    try {
      const db = getActiveDb();
      await setDoc(doc(db, "tasks", newId), cloned);
      logActivity(`Duplicated task: "${task.task}"`);
    } catch (e) {
      console.warn("Firestore duplicate failed, using local/offline storage:", e);
    }
  };

  const handleArchiveTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const updated = {
      ...task,
      isArchived: true,
      status: 'Completed' as const
    };

    // Update local states immediately
    const updatedTasks = tasks.filter(t => t.id !== id);
    const updatedArchived = [...archivedTasks, updated];
    setTasks(updatedTasks);
    setArchivedTasks(updatedArchived);
    localStorage.setItem(`taskflow_tasks_${currentUser}`, JSON.stringify(updatedTasks));

    try {
      const db = getActiveDb();
      await setDoc(doc(db, "tasks", id), updated);
      logActivity(`Archived completed task: "${task.task}"`);
    } catch (e) {
      console.warn("Firestore archive failed, using local/offline storage:", e);
    }
  };

  const handleRestoreArchived = async (id: string) => {
    const task = archivedTasks.find(t => t.id === id);
    if (!task) return;

    const updated = {
      ...task,
      isArchived: false,
      status: 'Pending' as const
    };

    // Update local states immediately
    const updatedArchived = archivedTasks.filter(t => t.id !== id);
    const updatedTasks = [...tasks, updated];
    setTasks(updatedTasks);
    setArchivedTasks(updatedArchived);
    localStorage.setItem(`taskflow_tasks_${currentUser}`, JSON.stringify(updatedTasks));

    try {
      const db = getActiveDb();
      await setDoc(doc(db, "tasks", id), updated);
      logActivity(`Restored task from archive: "${task.task}"`);
    } catch (e) {
      console.warn("Firestore restore failed, using local/offline storage:", e);
    }
  };

  // Permanent Delete
  const handlePermanentDelete = async (id: string) => {
    // Update local archived state immediately
    const updatedArchived = archivedTasks.filter(t => t.id !== id);
    setArchivedTasks(updatedArchived);

    try {
      const db = getActiveDb();
      await deleteDoc(doc(db, "tasks", id));
      logActivity(`Permanently deleted task from cloud storage`);
    } catch (e) {
      console.warn("Firestore permanent delete failed, using local/offline storage:", e);
    }
  };

  // --- RECALCULATE GLOBAL PRODUCTIVITY WEIGHTS ---
  const calculateStats = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayList = tasks.filter(t => t.date === todayStr);
    const todayCompleted = todayList.filter(t => t.status === 'Completed').length;
    const todayPending = todayList.filter(t => t.status === 'Pending').length;

    const currentMonthNum = new Date().getMonth();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonthName = months[currentMonthNum];
    const monthlyList = tasks.filter(t => t.type === 'monthly' && t.month === currentMonthName);

    const yearlyList = tasks.filter(t => t.type === 'yearly');

    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'Completed').length;

    let pointsEarned = 0;
    let pointsTotal = 0;
    tasks.forEach(t => {
      const w = t.priority === 'High' ? 3 : t.priority === 'Medium' ? 2 : 1;
      pointsTotal += w;
      if (t.status === 'Completed') pointsEarned += w;
    });

    const efficiencyScore = pointsTotal > 0 ? Math.round((pointsEarned / pointsTotal) * 100) : 0;

    return {
      todayCount: todayList.length,
      todayCompleted,
      todayPending,
      monthlyCount: monthlyList.length,
      monthlyCompleted: monthlyList.filter(t => t.status === 'Completed').length,
      monthlyPending: monthlyList.filter(t => t.status === 'Pending').length,
      yearlyCount: yearlyList.length,
      yearlyCompleted: yearlyList.filter(t => t.status === 'Completed').length,
      yearlyPending: yearlyList.filter(t => t.status === 'Pending').length,
      totalCount: total,
      completedCount: completed,
      pendingCount: total - completed,
      efficiencyScore,
      highPriorityCount: tasks.filter(t => t.priority === 'High').length,
      mediumPriorityCount: tasks.filter(t => t.priority === 'Medium').length,
      lowPriorityCount: tasks.filter(t => t.priority === 'Low').length,
    };
  };

  const stats = calculateStats();

  // --- AI FEATURES CONTROLLERS ---
  const handleGenerateSummary = async () => {
    setAiSummaryLoading(true);
    try {
      const pendingText = tasks
        .filter(t => t.status === 'Pending')
        .slice(0, 10)
        .map(t => `- ${t.task} [${t.priority} priority] (due ${t.date || t.month})`)
        .join('\n');

      const completedText = tasks
        .filter(t => t.status === 'Completed')
        .slice(0, 10)
        .map(t => `- ${t.task}`)
        .join('\n');

      const prompt = `Review my current productivity status.
Here are my pending tasks:
${pendingText || 'None'}

Here are some of my recently completed tasks:
${completedText || 'None'}

Please write a warm, encouraging, conversational summary report (3-4 sentences maximum). Offer one specific suggestion on what task or project to prioritize today. Provide output in plain text, do not use lists, asterisks or preamble.
${reportLang === 'km-KH' ? 'CRITICAL: The entire final report MUST be written in natural, fluent, professional Khmer language (ភាសាខ្មែរ). Do not include any English translations.' : ''}`;

      const response = await callGeminiProxy(prompt);
      if (response) {
        setAiSummaryOutput(response);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiChatInput.trim()) return;

    const userMsg = aiChatInput.trim();
    setAiChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setAiChatInput('');
    setAiChatLoading(true);

    try {
      const pendingList = tasks.filter(t => t.status === 'Pending').map(t => `${t.task} [${t.priority}]`).join('; ');
      const overdueList = tasks.filter(t => {
        if (t.status === 'Completed' || !t.date) return false;
        return new Date(t.date) < new Date();
      }).map(t => t.task).join('; ');

      const prompt = `You are a helpful, smart, professional task flow assistant for TaskFlow Pro. Use this current snapshot:
Pending Tasks: ${pendingList || 'None'}
Overdue: ${overdueList || 'None'}

User asked: "${userMsg}"
Keep answers clear, highly conversational (2-3 sentences max) and encouraging. Avoid bullet lists unless explicitly asked.`;

      const reply = await callGeminiProxy(prompt);
      if (reply) {
        setAiChatMessages(prev => [...prev, { role: 'model', text: reply.trim() }]);
      }
    } catch (_) {
      setAiChatMessages(prev => [...prev, { role: 'model', text: 'Sorry, I couldn\'t reach the AI proxy. Make sure your Gemini Key is active in Settings.' }]);
    } finally {
      setAiChatLoading(false);
    }
  };

  // --- MANUAL SNAPSHOT TIMELINES SNAP RESTORE ---
  const restoreSnapshot = (snap: BackupSnapshot) => {
    try {
      const parsed = JSON.parse(snap.data);
      if (parsed.tasks) {
        // Overwrite Firestore batch-wise or overwrite local
        setTasks(parsed.tasks);
        if (parsed.archivedTasks) setArchivedTasks(parsed.archivedTasks);
        
        // Write snapshot back to active firestore
        const db = getActiveDb();
        parsed.tasks.forEach((t: Task) => {
          setDoc(doc(db, "tasks", t.id), { ...t, userId: currentUser }).catch(() => {});
        });

        logActivity(`Restored task flow SNAPSHOT timeline backup successfully`);
        setShowBackupModal(false);
      }
    } catch (_) {}
  };

  // --- LOGIN CONTROLLER ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameInput.trim().toLowerCase() === 'kafa' && passwordInput === 'wasim') {
      const user = 'Kafa';
      setCurrentUser(user);
      localStorage.setItem('taskflow_user', user);
      logActivity('User successfully authenticated via system credentials form');
    } else {
      alert('Invalid Username or Password! (Hint: user is kafa, password is wasim)');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('taskflow_user');
    logActivity('User logged out safely');
  };

  const handleSecurityReset = () => {
    if (forgotAnswer.trim().toLowerCase() === 'wasim') {
      if (newPasswordVal.trim().length < 4) {
        alert('Password must be at least 4 characters long.');
        return;
      }
      setPasswordInput(newPasswordVal);
      setForgotPasswordPanel(false);
      alert('Password updated in login panel! Sign in now.');
    } else {
      alert('Incorrect security answer! Founder is Wasim.');
    }
  };

  // --- FILTERED ARRAYS ---
  const sortTasks = (list: Task[], sortBy: 'date' | 'priority' | 'status' | 'smart') => {
    return [...list].sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        const timeA = a.time || '';
        const timeB = b.time || '';
        return timeA.localeCompare(timeB);
      } else if (sortBy === 'priority') {
        const priorityWeight = { 'High': 3, 'Medium': 2, 'Low': 1 };
        const weightA = priorityWeight[a.priority] || 0;
        const weightB = priorityWeight[b.priority] || 0;
        if (weightA !== weightB) {
          return weightB - weightA; // High priority first
        }
        return (a.date || '').localeCompare(b.date || '');
      } else if (sortBy === 'status') {
        const statusWeight = { 'Pending': 1, 'Completed': 2 };
        const weightA = statusWeight[a.status] || 0;
        const weightB = statusWeight[b.status] || 0;
        if (weightA !== weightB) {
          return weightA - weightB; // Pending first
        }
        return (a.date || '').localeCompare(b.date || '');
      } else if (sortBy === 'smart') {
        // Pending tasks always come before completed tasks for smart prioritization
        if (a.status !== b.status) {
          return a.status === 'Pending' ? -1 : 1;
        }

        const getSmartScore = (t: Task) => {
          // Priority component
          const priorityWeight = { 'High': 100, 'Medium': 60, 'Low': 20 };
          const pScore = priorityWeight[t.priority] || 0;

          // Urgency / Due date component
          let uScore = 0;
          if (t.date) {
            try {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const taskDate = new Date(t.date);
              taskDate.setHours(0, 0, 0, 0);
              
              const diffTime = taskDate.getTime() - today.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

              if (diffDays < 0) {
                // Overdue is extremely urgent
                uScore = 150 + Math.min(100, Math.abs(diffDays) * 5);
              } else if (diffDays === 0) {
                // Due today
                uScore = 120;
              } else if (diffDays === 1) {
                // Due tomorrow
                uScore = 90;
              } else if (diffDays <= 7) {
                // Due this week
                uScore = 60 - (diffDays * 5);
              } else if (diffDays <= 30) {
                // Due this month
                uScore = 30 - (diffDays * 0.5);
              } else {
                uScore = 5;
              }
            } catch (err) {
              uScore = 0;
            }
          }
          return pScore + uScore;
        };

        const scoreA = getSmartScore(a);
        const scoreB = getSmartScore(b);
        if (scoreA !== scoreB) {
          return scoreB - scoreA; // Highest score first
        }
        return a.task.localeCompare(b.task);
      }
      return 0;
    });
  };

  const getFilteredDaily = () => {
    let list = tasks.filter(t => t.type === 'daily');
    if (dailyStatusFilter !== 'all') {
      list = list.filter(t => t.status === dailyStatusFilter);
    }
    if (dailyFilterQuery.trim()) {
      const q = dailyFilterQuery.toLowerCase().trim();
      list = list.filter(t => t.task.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    return sortTasks(list, dailySortBy);
  };

  const getFilteredMonthly = () => {
    let list = tasks.filter(t => t.type === 'monthly');
    if (monthlyStatusFilter !== 'all') {
      list = list.filter(t => t.status === monthlyStatusFilter);
    }
    if (monthlyFilterQuery.trim()) {
      const q = monthlyFilterQuery.toLowerCase().trim();
      list = list.filter(t => t.task.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    return sortTasks(list, monthlySortBy);
  };

  const getFilteredYearly = () => {
    let list = tasks.filter(t => t.type === 'yearly');
    if (yearlyStatusFilter !== 'all') {
      list = list.filter(t => t.status === yearlyStatusFilter);
    }
    if (yearlyFilterQuery.trim()) {
      const q = yearlyFilterQuery.toLowerCase().trim();
      list = list.filter(t => t.task.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    return sortTasks(list, yearlySortBy);
  };

  const getFilteredSearchList = () => {
    return tasks.filter(t => {
      const textMatches = !searchQuery.trim() || 
        t.task.toLowerCase().includes(searchQuery.toLowerCase().trim()) || 
        t.description.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        t.tags.toLowerCase().includes(searchQuery.toLowerCase().trim());
      
      const categoryMatches = searchCategory === 'all' || t.type === searchCategory;
      const priorityMatches = searchPriority === 'all' || t.priority === searchPriority;
      const statusMatches = searchStatus === 'all' || t.status === searchStatus;

      return textMatches && categoryMatches && priorityMatches && statusMatches;
    });
  };

  // Reset core data records
  const handleResetData = async () => {
    if (confirm('Are you sure you want to delete all tasks (Daily, Monthly, and Yearly) and reset your Dashboard data?')) {
      // 1. Set the reset active flag in localStorage to prevent listener restoration during deletions
      localStorage.setItem('taskflow_reset_active', 'true');
      
      // 2. Reset React States for tasks only immediately
      setTasks([]);
      setArchivedTasks([]);
      
      // 3. Clear Local Storage tasks record for this user immediately
      localStorage.removeItem(`taskflow_tasks_${currentUser}`);
      
      try {
        const db = getActiveDb();
        // 4. Fetch all tasks associated with this user directly from Firestore
        const q = query(collection(db, "tasks"), where("userId", "==", currentUser));
        const querySnapshot = await getDocs(q);
        
        // 5. Delete from Firestore in a batch
        if (!querySnapshot.empty) {
          const batch = writeBatch(db);
          querySnapshot.forEach((docSnap) => {
            batch.delete(docSnap.ref);
          });
          await batch.commit();
          // Note: The real-time listener will clear the taskflow_reset_active flag 
          // once it receives the confirmed empty snapshot from Firestore.
        } else {
          // If Firestore was already empty, clear the flag immediately
          localStorage.removeItem('taskflow_reset_active');
        }
      } catch (err) {
        console.warn("Firestore batch delete during reset failed (possibly offline or rules issue):", err);
        // Clear flag on failure/offline to allow standard synchronization to resume
        localStorage.removeItem('taskflow_reset_active');
      }
      
      logActivity('All task records and dashboard data reset successfully');
      alert('All task records in Daily, Monthly, and Yearly trackers, and Dashboard data have been reset successfully.');
    }
  };

  // Drag-and-drop end reordering update
  const handleTaskDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    const draggedIndex = tasks.findIndex(t => t.id === draggedId);
    if (draggedIndex === -1) return;

    const listCopy = [...tasks];
    const [removed] = listCopy.splice(draggedIndex, 1);
    listCopy.splice(targetIndex, 0, removed);
    
    setTasks(listCopy);
    // Silent save
    localStorage.setItem(`taskflow_tasks_${currentUser}`, JSON.stringify(listCopy));
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[#F8E9A1] via-white to-[#F8E9A1] dark:from-[#0B1F3A] dark:via-[#112240] dark:to-[#0B1F3A] transition-colors duration-500">
        <div className="relative max-w-md w-full bg-white/85 backdrop-blur-md rounded-3xl shadow-2xl p-8 border border-white/20 dark:bg-[#112240]/80 dark:border-gold-500/15 animate-fade-in">
          
          {/* Logo Title */}
          <div className="text-center mb-6 select-none">
            <div className="inline-flex w-14 h-14 bg-gold-500 text-white rounded-full items-center justify-center shadow-lg animate-bounce">
              <Hourglass className="w-8 h-8" />
            </div>
            <h2 className="font-serif font-bold text-3xl tracking-widest text-[#C59B27] uppercase mt-4">TaskFlow Pro</h2>
            <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wider">Enterprise Task Synchronization</p>
          </div>

          {!forgotPasswordPanel ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input 
                    type="text" 
                    required 
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Enter username" 
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:outline-none dark:bg-slate-900/50 dark:border-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-gray-500 uppercase">Password</label>
                  <button 
                    type="button" 
                    onClick={() => setForgotPasswordPanel(true)}
                    className="text-xs text-[#C59B27] hover:underline cursor-pointer font-medium"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    required 
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter password" 
                    className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-xl focus:outline-none dark:bg-slate-900/50 dark:border-slate-800 dark:text-white"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gold-500 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  id="remember" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-gray-300 text-gold-500 focus:ring-gold-500 mr-2 cursor-pointer"
                />
                <label htmlFor="remember" className="text-xs text-gray-500 dark:text-gray-300 select-none cursor-pointer">Remember my login credentials</label>
              </div>

              <button 
                type="submit" 
                className="w-full py-3 bg-[#C59B27] hover:bg-[#A8801B] text-white font-bold rounded-xl transition-all shadow hover:shadow-lg flex items-center justify-center gap-1.5 cursor-pointer uppercase text-xs tracking-wider"
              >
                <span>Secure Sign In</span>
              </button>
            </form>
          ) : (
            <div className="space-y-5 animate-fade-in">
              <div>
                <h3 className="font-display font-bold text-lg text-gray-800 dark:text-gold-500">Security Challenge</h3>
                <p className="text-xs text-gray-500 dark:text-gray-300 font-mono mt-1">Answer challenge question for user <b>kafa</b>.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Who is the founder? (Default: "Wasim")</label>
                  <input 
                    type="text" 
                    value={forgotAnswer}
                    onChange={(e) => setForgotAnswer(e.target.value)}
                    placeholder="Your answer" 
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg dark:bg-slate-900/50 dark:border-slate-800 dark:text-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">New Password</label>
                  <input 
                    type="password" 
                    value={newPasswordVal}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 4 characters" 
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg dark:bg-slate-900/50 dark:border-slate-800 dark:text-white text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={handleSecurityReset}
                  className="flex-1 py-2 bg-gold-500 text-white rounded-lg hover:bg-gold-600 transition-colors text-xs font-bold cursor-pointer"
                >
                  Update Password
                </button>
                <button 
                  onClick={() => setForgotPasswordPanel(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-xs font-bold cursor-pointer"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-gray-100 dark:border-slate-800 pt-4 text-center">
            <span className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">Enterprise Edition v2026.1</span>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row relative">
      
      {/* ================= COLLAPSIBLE SIDEBAR ================= */}
      <aside 
        className={`bg-white border-r border-gray-100 flex-shrink-0 flex flex-col transition-all duration-300 z-50 fixed md:sticky top-0 h-screen dark:bg-[#112240] dark:border-gold-500/10 shadow-sm
          ${sidebarCollapsed ? 'w-20' : 'w-64'} 
          ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Brand logo banner */}
        <div className="flex-shrink-0 p-6 flex items-center justify-between border-b border-gray-100 dark:border-gold-500/10">
          <div className="flex items-center gap-2.5 overflow-hidden select-none">
            <span className="font-serif font-bold text-2xl tracking-widest text-[#C59B27] whitespace-nowrap">TASKCAL</span>
          </div>
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 hover:text-gray-600 cursor-pointer hidden md:block"
          >
            <span className="material-icons text-sm">{sidebarCollapsed ? 'chevron_right' : 'chevron_left'}</span>
          </button>
        </div>

        {/* User initials / upload photo banner */}
        {!sidebarCollapsed && (
          <div className="flex-shrink-0 mx-4 my-5 p-4 bg-white border border-gray-100/50 rounded-2xl shadow-sm flex flex-col items-center justify-center text-center dark:bg-[#0c1a30] dark:border-gold-500/15 animate-fade-in-scale select-none">
            <div className="relative group w-16 h-16 mb-2 rounded-full overflow-hidden border-2 border-[#C59B27]/50 hover:border-[#C59B27] transition-all">
              {profilePic ? (
                <img 
                  src={profilePic} 
                  alt="MK, Mr. Kafa" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-[#C59B27] text-white font-serif font-bold flex items-center justify-center text-xl shadow shadow-amber-500/20">
                  MK
                </div>
              )}
              {/* Camera Hover Overlay */}
              <label 
                htmlFor="profile-pic-uploader"
                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white animate-fade-in"
              >
                <span className="material-icons text-lg">photo_camera</span>
                <input 
                  type="file" 
                  id="profile-pic-uploader" 
                  accept="image/*" 
                  onChange={handleProfilePicChange} 
                  className="hidden" 
                />
              </label>
            </div>
            <h4 className="font-bold text-sm text-gray-800 dark:text-gold-500 leading-tight">MK, Mr. Kafa</h4>
            <p className="text-[10px] text-gray-400 mt-1 font-mono uppercase tracking-wider">Workspace Master</p>
            {profilePic && (
              <button 
                onClick={() => {
                  setProfilePic(null);
                  localStorage.removeItem('taskflow_profile_pic');
                  logActivity('Profile picture removed');
                }}
                className="text-[9px] text-red-500 hover:underline mt-1 cursor-pointer transition-all"
              >
                Remove photo
              </button>
            )}
          </div>
        )}

        {/* Dynamic scroll list of view elements */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar py-2">
          <nav className="px-4 space-y-1">
            <button 
              onClick={() => { setView('dashboard'); setMobileSidebarOpen(false); }}
              className={`sidebar-item w-full flex items-center gap-3 px-4 py-3.5 md:px-3.5 md:py-2.5 rounded-xl cursor-pointer text-left text-xs font-semibold
                ${activeView === 'dashboard' ? 'active text-[#C59B27]' : 'text-gray-600 dark:text-gray-300'}`}
            >
              <LayoutDashboard className="w-4.5 h-4.5 shrink-0 text-[#C59B27]" />
              {!sidebarCollapsed && <span>Dashboard</span>}
            </button>

            <button 
              onClick={() => { setView('daily-tasks'); setMobileSidebarOpen(false); }}
              className={`sidebar-item w-full flex items-center justify-between px-4 py-3.5 md:px-3.5 md:py-2.5 rounded-xl cursor-pointer text-left text-xs font-semibold
                ${activeView === 'daily-tasks' ? 'active text-[#C59B27]' : 'text-gray-600 dark:text-gray-300'}`}
            >
              <div className="flex items-center gap-3">
                <span className="material-icons text-[#C59B27] text-lg select-none">today</span>
                {!sidebarCollapsed && <span>Daily Tasks</span>}
              </div>
              {!sidebarCollapsed && (
                <span className="text-[10px] bg-gold-500/10 text-[#C59B27] px-2 py-0.5 rounded-full font-mono">
                  {tasks.filter(t => t.type === 'daily' && t.status === 'Pending').length}
                </span>
              )}
            </button>

            <button 
              onClick={() => { setView('monthly-tasks'); setMobileSidebarOpen(false); }}
              className={`sidebar-item w-full flex items-center justify-between px-4 py-3.5 md:px-3.5 md:py-2.5 rounded-xl cursor-pointer text-left text-xs font-semibold
                ${activeView === 'monthly-tasks' ? 'active text-[#C59B27]' : 'text-gray-600 dark:text-gray-300'}`}
            >
              <div className="flex items-center gap-3">
                <span className="material-icons text-[#C59B27] text-lg select-none">date_range</span>
                {!sidebarCollapsed && <span>Monthly Tasks</span>}
              </div>
              {!sidebarCollapsed && (
                <span className="text-[10px] bg-gold-500/10 text-[#C59B27] px-2 py-0.5 rounded-full font-mono">
                  {tasks.filter(t => t.type === 'monthly' && t.status === 'Pending').length}
                </span>
              )}
            </button>

            <button 
              onClick={() => { setView('yearly-tasks'); setMobileSidebarOpen(false); }}
              className={`sidebar-item w-full flex items-center justify-between px-4 py-3.5 md:px-3.5 md:py-2.5 rounded-xl cursor-pointer text-left text-xs font-semibold
                ${activeView === 'yearly-tasks' ? 'active text-[#C59B27]' : 'text-gray-600 dark:text-gray-300'}`}
            >
              <div className="flex items-center gap-3">
                <span className="material-icons text-[#C59B27] text-lg select-none">calendar_today</span>
                {!sidebarCollapsed && <span>Yearly Tasks</span>}
              </div>
              {!sidebarCollapsed && (
                <span className="text-[10px] bg-gold-500/10 text-[#C59B27] px-2 py-0.5 rounded-full font-mono">
                  {tasks.filter(t => t.type === 'yearly' && t.status === 'Pending').length}
                </span>
              )}
            </button>

            <button 
              onClick={() => { setView('calendar'); setMobileSidebarOpen(false); }}
              className={`sidebar-item w-full flex items-center gap-3 px-4 py-3.5 md:px-3.5 md:py-2.5 rounded-xl cursor-pointer text-left text-xs font-semibold
                ${activeView === 'calendar' ? 'active text-[#C59B27]' : 'text-gray-600 dark:text-gray-300'}`}
            >
              <CalendarIcon className="w-4.5 h-4.5 shrink-0 text-[#C59B27]" />
              {!sidebarCollapsed && <span>Lunar Calendar</span>}
            </button>

            <button 
              onClick={handleResetData}
              className="sidebar-item w-full flex items-center gap-3 px-4 py-3.5 md:px-3.5 md:py-2.5 rounded-xl cursor-pointer text-left text-xs font-semibold text-red-500 hover:bg-red-500/5 transition-all"
            >
              <Trash2 className="w-4.5 h-4.5 shrink-0 text-red-500" />
              {!sidebarCollapsed && <span>Reset Data</span>}
            </button>

          </nav>

          <div className="mx-4 my-3 h-px bg-gray-100 dark:bg-gold-500/10"></div>

          {/* Backup utilities block */}
          <div className="px-4 space-y-1">
            {/* Hidden but kept in system code per user instruction
            <button 
              onClick={() => setShowBackupModal(true)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl text-gray-600 hover:bg-gold-500/5 hover:text-[#C59B27] transition-all dark:text-gray-300 cursor-pointer text-xs text-left"
            >
              <History className="w-4 h-4 shrink-0 text-[#C59B27]" />
              {!sidebarCollapsed && <span>Backup timeline</span>}
            </button>
            */}

            {/* Export JSON Button */}
            <button 
              onClick={handleExportJSON}
              className="w-full flex items-center gap-3 p-3.5 md:p-2.5 rounded-xl text-gray-600 hover:bg-gold-500/5 hover:text-[#C59B27] transition-all dark:text-gray-300 cursor-pointer text-xs text-left"
            >
              <FileDown className="w-4 h-4 shrink-0 text-[#C59B27]" />
              {!sidebarCollapsed && <span>Export JSON</span>}
            </button>

            {/* Import JSON Button */}
            <label 
              className="w-full flex items-center gap-3 p-3.5 md:p-2.5 rounded-xl text-gray-600 hover:bg-gold-500/5 hover:text-[#C59B27] transition-all dark:text-gray-300 cursor-pointer text-xs text-left"
            >
              <FileUp className="w-4 h-4 shrink-0 text-[#C59B27]" />
              <input 
                type="file" 
                accept=".json" 
                onChange={handleImportJSON} 
                className="hidden" 
              />
              {!sidebarCollapsed && <span>Import JSON</span>}
            </label>

            <button 
              onClick={() => setShowSettingsModal(true)}
              className="w-full flex items-center gap-3 p-3.5 md:p-2.5 rounded-xl text-gray-600 hover:bg-gold-500/5 hover:text-[#C59B27] transition-all dark:text-gray-300 cursor-pointer text-xs text-left"
            >
              <Settings className="w-4 h-4 shrink-0 text-[#C59B27]" />
              {!sidebarCollapsed && <span>Cloud Sync / AI</span>}
            </button>
            
            {/* Keyboard Shortcuts Info Section */}
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gold-500/10">
              {sidebarCollapsed ? (
                <div className="group relative flex justify-center py-2 text-gray-400 dark:text-gray-500 hover:text-[#C59B27] cursor-help">
                  <Keyboard className="w-4.5 h-4.5 shrink-0" />
                  
                  {/* Tooltip on Hover */}
                  <div className="absolute left-16 bottom-0 w-48 bg-white dark:bg-[#112240] border border-gray-200 dark:border-gold-500/15 rounded-xl p-3 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 text-[10px] font-sans text-gray-600 dark:text-gray-300 pointer-events-none">
                    <p className="font-bold text-gray-800 dark:text-gold-500 mb-2 font-serif tracking-wide text-xs">SHORTCUTS</p>
                    <div className="space-y-1.5 font-mono">
                      <div className="flex justify-between items-center"><span className="bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-gray-200/50 dark:border-slate-700">N</span> <span>New Task</span></div>
                      <div className="flex justify-between items-center"><span className="bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-gray-200/50 dark:border-slate-700">/</span> <span>Search</span></div>
                      <div className="flex justify-between items-center"><span className="bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-gray-200/50 dark:border-slate-700">ESC</span> <span>Close</span></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-gray-50/50 dark:bg-slate-900/30 border border-gray-150/50 dark:border-gold-500/5 rounded-2xl">
                  <h5 className="text-[10px] font-serif font-bold tracking-widest text-gold-700 dark:text-gold-500 uppercase mb-2 flex items-center gap-1.5 select-none">
                    <Keyboard className="w-3.5 h-3.5" />
                    <span>Keyboard Shortcuts</span>
                  </h5>
                  <div className="space-y-1.5 text-[10px] font-mono text-gray-500 dark:text-gray-400">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 dark:text-gray-500">Create Task</span>
                      <kbd className="bg-white dark:bg-[#112240] px-1.5 py-0.5 rounded border border-gray-250 dark:border-slate-800 font-bold text-gray-700 dark:text-gold-500 shadow-sm text-[9px]">N</kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 dark:text-gray-500">Focus Search</span>
                      <kbd className="bg-white dark:bg-[#112240] px-1.5 py-0.5 rounded border border-gray-250 dark:border-slate-800 font-bold text-gray-700 dark:text-gold-500 shadow-sm text-[9px]">/</kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 dark:text-gray-500">Close Modals</span>
                      <kbd className="bg-white dark:bg-[#112240] px-1.5 py-0.5 rounded border border-gray-250 dark:border-slate-800 font-bold text-gray-700 dark:text-gold-500 shadow-sm text-[9px]">ESC</kbd>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Secure Logout Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gold-500/10 space-y-2">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-3.5 md:p-2.5 rounded-xl text-gray-500 hover:bg-red-500/5 hover:text-red-500 transition-colors cursor-pointer text-xs font-semibold"
          >
            <LogOut className="w-4.5 h-4.5 shrink-0" />
            {!sidebarCollapsed && <span>Secure Logout</span>}
          </button>
          {!sidebarCollapsed && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 text-center font-mono select-none">
              v1.2.5 • Rev 2026-07-10
            </div>
          )}
        </div>
      </aside>

      {/* Sidebar Mobile Overlay */}
      {mobileSidebarOpen && (
        <div 
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 z-40 md:hidden transition-opacity"
        ></div>
      )}

      {/* ================= PRIMARY WORKSPACE PANEL ================= */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Header toolbar */}
        <header className="sticky top-0 bg-white/95 dark:bg-[#0B1F3A]/95 backdrop-blur-md border-b border-gray-100 dark:border-gold-500/10 z-30 px-6 py-4 flex items-center justify-between shadow-sm select-none">
          <div className="flex items-center gap-3.5">
            <button 
              onClick={() => setMobileSidebarOpen(true)}
              className="p-1.5 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gold-500 md:hidden cursor-pointer"
            >
              <span className="material-icons">menu</span>
            </button>
            
            <div>
              <h1 className="font-serif font-bold text-lg md:text-xl tracking-widest text-[#1f2937] dark:text-[#E2E8F0] uppercase">
                {activeView.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </h1>
            </div>
          </div>

          {/* User information & Calendar states */}
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:flex flex-col items-end">
              <span id="header-date" className="text-sm font-semibold text-gray-800 dark:text-gold-500">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
              <span id="header-khmer-date" className="text-[10px] text-[#C59B27] font-medium tracking-wide mt-0.5 font-khmer">
                {liveKhmerDate}
              </span>
            </div>

            {/* Connection Status Indicator */}
            <div 
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-semibold transition-all select-none ${
                isOnline 
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-400 dark:border-emerald-500/10' 
                  : 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/5 dark:text-red-400 dark:border-red-500/10 animate-pulse'
              }`}
              title={isOnline ? "Connected and synchronized with Cloud database" : "Working offline - updates are saved locally and will auto-sync once restored"}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <WifiOff className="w-3.5 h-3.5 text-red-500 shrink-0" />}
              <span className="hidden md:inline">{isOnline ? 'Cloud Synced' : 'Offline Mode'}</span>
            </div>

            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-gold-500 transition-colors cursor-pointer"
              title="Toggle theme mode"
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            <div className="h-6 w-px bg-gray-100 dark:bg-gold-500/15"></div>

            <button 
              onClick={() => {
                let defaultType: 'daily' | 'monthly' | 'yearly' = 'daily';
                if (activeView === 'monthly-tasks') defaultType = 'monthly';
                else if (activeView === 'yearly-tasks') defaultType = 'yearly';
                setQuickAddModal({ open: true, type: defaultType });
              }}
              className="bg-[#C59B27] hover:bg-[#A8801B] text-white px-5 py-2.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-amber-500/10 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Entry</span>
            </button>
          </div>
        </header>

        {/* View Deck Panel */}
        <div id="view-deck" className="p-4 md:p-8 flex-1">
          
          {/* ================= VIEW: DASHBOARD ================= */}
          {activeView === 'dashboard' && (
            <div className="space-y-8 animate-fade-in">
              {/* Welcome banner */}
              <div className="bg-gradient-to-r from-gold-500 to-amber-500 rounded-3xl p-6 md:p-8 text-slate-900 relative overflow-hidden shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="relative z-10 text-center md:text-left space-y-2">
                  <h1 className="font-display text-2xl md:text-3xl font-bold">{getTimeOfDayGreeting().text}, {currentUser}!</h1>
                  <p className="text-slate-800 text-xs md:text-sm max-w-md leading-relaxed">
                    You have executed <span className="font-bold bg-white px-1.5 py-0.5 rounded-md text-xs font-mono">{stats.efficiencyScore}%</span> of today's workload. Let's finish strong!
                  </p>
                  
                  <div className="pt-2 flex flex-wrap justify-center md:justify-start gap-2">
                    <span className="text-[10px] bg-slate-900/10 px-2.5 py-1 rounded-full font-mono font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-[#FF3B30] rounded-full animate-pulse"></span>
                      {stats.todayPending} Pending Today
                    </span>
                    <span className="text-[10px] bg-slate-900/10 px-2.5 py-1 rounded-full font-mono font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-[#FF9500] rounded-full animate-ping"></span>
                      {tasks.filter(t => t.priority === 'High' && t.status === 'Pending').length} High Priority Pending
                    </span>
                  </div>
                </div>

                <div className="w-24 h-24 relative select-none">
                  <span className="material-icons text-white text-7xl animate-spin-slow opacity-60">{getTimeOfDayGreeting().icon}</span>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <div className="bg-white/80 border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between dark:bg-[#112240] dark:border-gold-500/5 group hover:-translate-y-0.5 transition-transform">
                  <div>
                    <h4 className="text-xs text-gray-400 font-mono">Today's Total</h4>
                    <div className="font-display font-bold text-2xl text-gray-800 dark:text-white mt-1">{stats.todayCount}</div>
                    <p className="text-[9px] text-gray-400 font-mono mt-1">✓ {stats.todayCompleted} / ⌛ {stats.todayPending}</p>
                  </div>
                  <span className="material-icons text-xl text-[#C59B27] p-3 bg-amber-500/10 rounded-full select-none">today</span>
                </div>

                <div className="bg-white/80 border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between dark:bg-[#112240] dark:border-gold-500/5 group hover:-translate-y-0.5 transition-transform">
                  <div>
                    <h4 className="text-xs text-gray-400 font-mono">Monthly Total</h4>
                    <div className="font-display font-bold text-2xl text-gray-800 dark:text-white mt-1">{stats.monthlyCount}</div>
                    <p className="text-[9px] text-gray-400 font-mono mt-1">✓ {stats.monthlyCompleted} / ⌛ {stats.monthlyPending}</p>
                  </div>
                  <span className="material-icons text-xl text-[#C59B27] p-3 bg-amber-500/10 rounded-full select-none">date_range</span>
                </div>

                <div className="bg-white/80 border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between dark:bg-[#112240] dark:border-gold-500/5 group hover:-translate-y-0.5 transition-transform">
                  <div>
                    <h4 className="text-xs text-gray-400 font-mono">Yearly Goals</h4>
                    <div className="font-display font-bold text-2xl text-gray-800 dark:text-white mt-1">{stats.yearlyCount}</div>
                    <p className="text-[9px] text-gray-400 font-mono mt-1">✓ {stats.yearlyCompleted} / ⌛ {stats.yearlyPending}</p>
                  </div>
                  <span className="material-icons text-xl text-[#C59B27] p-3 bg-amber-500/10 rounded-full select-none">calendar_today</span>
                </div>

                <div className="bg-white/80 border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between dark:bg-[#112240] dark:border-gold-500/5 group hover:-translate-y-0.5 transition-transform">
                  <div>
                    <h4 className="text-xs text-gray-400 font-mono">Efficiency Level</h4>
                    <div className="font-display font-bold text-2xl text-gray-800 dark:text-white mt-1">{stats.efficiencyScore}%</div>
                    <p className="text-[9px] text-gray-400 font-mono mt-1">{stats.efficiencyScore > 80 ? 'Elite Performance' : 'Standard Focused'}</p>
                  </div>
                  <span className="material-icons text-xl text-[#C59B27] p-3 bg-amber-500/10 rounded-full select-none">stars</span>
                </div>
              </div>

              {/* Chart & Breakdowns */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* Completion Charts */}
                <div className="xl:col-span-2 bg-white/80 dark:bg-[#112240]/80 border border-gray-200/50 dark:border-gold-500/5 p-6 rounded-2xl shadow-sm space-y-4">
                  <h3 className="font-display font-bold text-lg text-gray-800 dark:text-gold-500 flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                    <span className="material-icons text-gold-500 text-lg">analytics</span> Completed vs Pending Ratio
                  </h3>
                  <div className="h-64 relative">
                    <canvas ref={chartCanvasRef}></canvas>
                  </div>
                </div>

                {/* Priority distribution */}
                <div className="bg-white/80 dark:bg-[#112240]/80 border border-gray-200/50 dark:border-gold-500/5 p-6 rounded-2xl shadow-sm space-y-5">
                  <h3 className="font-display font-bold text-lg text-gray-800 dark:text-gold-500 flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                    <span className="material-icons text-gold-500 text-lg">pie_chart</span> Urgency Breakdowns
                  </h3>

                  <div className="space-y-4 font-mono text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#FF3B30] rounded-sm"></span>High Priority</span>
                        <span className="font-bold">{stats.highPriorityCount}</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className="bg-[#FF3B30] h-full" style={{ width: `${stats.highPriorityCount ? (stats.highPriorityCount / (tasks.length || 1)) * 100 : 0}%` }}></div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#FF9500] rounded-sm"></span>Medium Priority</span>
                        <span className="font-bold">{stats.mediumPriorityCount}</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className="bg-[#FF9500] h-full" style={{ width: `${stats.mediumPriorityCount ? (stats.mediumPriorityCount / (tasks.length || 1)) * 100 : 0}%` }}></div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#34C759] rounded-sm"></span>Low Priority</span>
                        <span className="font-bold">{stats.lowPriorityCount}</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className="bg-[#34C759] h-full" style={{ width: `${stats.lowPriorityCount ? (stats.lowPriorityCount / (tasks.length || 1)) * 100 : 0}%` }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl space-y-2 text-xs">
                    <span className="font-bold text-amber-600 dark:text-gold-500 flex items-center gap-1"><span className="material-icons text-sm">tips_and_updates</span> TaskFlow Coach</span>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      Always prioritize <b>High Priority</b> elements. Automatic 1-day Telegram notifications are actively polling due schedules.
                    </p>
                  </div>
                </div>

              </div>

              {/* AI Productivity Summary Report Panel */}
              <div className="bg-white/80 dark:bg-[#112240]/80 border border-gray-200/50 dark:border-gold-500/5 p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3 flex-wrap gap-3">
                  <h3 className="font-display font-bold text-lg text-gray-800 dark:text-gold-500 flex items-center gap-2">
                    <span className="material-icons text-gold-500">auto_awesome</span> AI Executive Productivity report
                  </h3>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-gray-50 dark:bg-slate-900/60 p-0.5 rounded-md border border-gray-150/50 dark:border-gold-500/10">
                      <button
                        type="button"
                        onClick={() => {
                          setReportLang('km-KH');
                          localStorage.setItem('taskflow_report_lang', 'km-KH');
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer select-none ${
                          reportLang === 'km-KH'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                        }`}
                        title="Khmer Language (ភាសាខ្មែរ)"
                      >
                        KM 🇰🇭
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReportLang('en-US');
                          localStorage.setItem('taskflow_report_lang', 'en-US');
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer select-none ${
                          reportLang === 'en-US'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                        }`}
                        title="English"
                      >
                        EN 🇺🇸
                      </button>
                    </div>

                    <button 
                      onClick={handleGenerateSummary}
                      disabled={aiSummaryLoading}
                      className="bg-gold-500 hover:bg-gold-600 text-white px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{aiSummaryLoading ? (reportLang === 'km-KH' ? 'កំពុងបង្កើត...' : 'Generating...') : (reportLang === 'km-KH' ? 'បង្កើតរបាយការណ៍' : 'Generate report')}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 text-xs md:text-sm text-gray-600 dark:text-gray-300 leading-relaxed font-sans">
                  {aiSummaryOutput ? (
                    <p className={`bg-gold-500/5 border border-gold-500/15 p-4 rounded-xl leading-loose ${reportLang === 'km-KH' ? 'font-khmer' : 'font-mono'}`}>{aiSummaryOutput}</p>
                  ) : (
                    <p className={`text-gray-400 dark:text-gray-500 text-[11px] ${reportLang === 'km-KH' ? 'font-khmer' : 'font-mono'}`}>
                      {reportLang === 'km-KH' 
                        ? 'សូមចុចលើប៊ូតុង "បង្កើតរបាយការណ៍" ដើម្បីពិនិត្យមើលការវិភាគវឌ្ឍនភាពស្វ័យប្រវត្តដែលសំយោគដោយ Gemini AI។'
                        : 'Click "Generate report" to review automated progress analyses synthesized by Gemini AI.'
                      }
                    </p>
                  )}
                </div>
              </div>

              {/* Upcoming schedule grid list */}
              <div className="bg-white/80 dark:bg-[#112240]/80 border border-gray-200/50 dark:border-gold-500/5 p-6 rounded-2xl shadow-sm space-y-4">
                <h3 className="font-display font-bold text-lg text-gray-800 dark:text-gold-500 flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                  <span className="material-icons text-gold-500">schedule</span> Upcoming Schedules (Next 5 Tasks)
                </h3>
                
                <div className="space-y-3">
                  {tasks.filter(t => t.status === 'Pending').slice(0, 5).map((t, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl flex justify-between items-center hover:scale-[1.005] transition-transform">
                      <div>
                        <h4 className="font-bold text-xs text-gray-800 dark:text-white">{t.task}</h4>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">{t.date} @ {t.time} | Month: {t.month || '--'}</p>
                      </div>
                      <span className="text-[10px] bg-gold-500/15 text-gold-600 font-bold px-2 py-0.5 rounded font-mono uppercase">{t.priority}</span>
                    </div>
                  ))}
                  {tasks.filter(t => t.status === 'Pending').length === 0 && (
                    <div className="text-center py-6 text-gray-400 font-mono text-xs">Nothing scheduled. Add a new task above!</div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ================= VIEW: DAILY TASKS ================= */}
          {activeView === 'daily-tasks' && (
            <div className="animate-fade-in">
              <div className="bg-white/85 dark:bg-[#112240] border border-gray-200/50 dark:border-gold-500/5 p-6 rounded-2xl shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-800 pb-4 mb-4">
                  <h3 className="font-serif font-bold text-xl tracking-widest text-[#C59B27] uppercase">DAILY TASKS TRACKER</h3>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                      <span className="text-[11px] font-mono text-gray-400 dark:text-gray-300 whitespace-nowrap">Sort by:</span>
                      <select
                        value={dailySortBy}
                        onChange={(e) => setDailySortBy(e.target.value as any)}
                        className="text-xs bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer hover:border-[#C59B27] transition-all"
                      >
                        <option value="date">Date & Time</option>
                        <option value="priority">Priority</option>
                        <option value="status">Status</option>
                        <option value="smart">Smart Sort ✨</option>
                      </select>
                      
                      <span className="text-[11px] font-mono text-gray-400 dark:text-gray-300 whitespace-nowrap sm:ml-2">Status:</span>
                      <select
                        value={dailyStatusFilter}
                        onChange={(e) => setDailyStatusFilter(e.target.value as any)}
                        className="text-xs bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer hover:border-[#C59B27] transition-all"
                      >
                        <option value="all">All Tasks</option>
                        <option value="Pending">Pending ⌛</option>
                        <option value="Completed">Completed ✓</option>
                      </select>
                      
                      <button
                        type="button"
                        onClick={() => setDailySortBy(dailySortBy === 'smart' ? 'date' : 'smart')}
                        className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer select-none border whitespace-nowrap ${
                          dailySortBy === 'smart'
                            ? 'bg-amber-500 text-white border-amber-500 shadow-sm hover:bg-amber-600'
                            : 'bg-gold-500/10 text-[#C59B27] border-gold-500/20 hover:bg-gold-500/20'
                        }`}
                        title="Balances high priority and closest due dates dynamically"
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>Smart Sort</span>
                      </button>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                      <input 
                        type="text" 
                        value={dailyFilterQuery}
                        onChange={(e) => setDailyFilterQuery(e.target.value)}
                        placeholder="Search Daily Task..." 
                        className="w-full pl-9 pr-4 py-1.5 text-xs border border-gray-200 rounded-full focus:outline-none dark:bg-slate-900/50 dark:border-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 min-h-[300px]">
                  {getFilteredDaily().map((t, idx) => (
                    <div 
                      key={t.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleTaskDrop(e, idx)}
                    >
                      <TaskCard 
                        task={t} 
                        onToggleComplete={handleToggleComplete}
                        onEdit={(id) => { setEditTask(t); setQuickAddModal({ open: true, type: 'daily' }); }}
                        onDelete={handleDeleteTask}
                        onDuplicate={handleDuplicateTask}
                        onArchive={handleArchiveTask}
                        onOpenDetails={(id) => setDetailModalTask(t)}
                        viewContext="daily"
                      />
                    </div>
                  ))}
                  {getFilteredDaily().length === 0 && (
                    <div className="text-center py-12 text-gray-400 font-mono text-xs">No daily tasks matching current query.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= VIEW: MONTHLY TASKS ================= */}
          {activeView === 'monthly-tasks' && (
            <div className="animate-fade-in">
              <div className="bg-white/85 dark:bg-[#112240] border border-gray-200/50 dark:border-gold-500/5 p-6 rounded-2xl shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-800 pb-4 mb-4">
                  <h3 className="font-serif font-bold text-xl tracking-widest text-[#C59B27] uppercase">Monthly Milestones</h3>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                      <span className="text-[11px] font-mono text-gray-400 dark:text-gray-300 whitespace-nowrap">Sort by:</span>
                      <select
                        value={monthlySortBy}
                        onChange={(e) => setMonthlySortBy(e.target.value as any)}
                        className="text-xs bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer hover:border-[#C59B27] transition-all"
                      >
                        <option value="date">Date & Time</option>
                        <option value="priority">Priority</option>
                        <option value="status">Status</option>
                        <option value="smart">Smart Sort ✨</option>
                      </select>

                      <span className="text-[11px] font-mono text-gray-400 dark:text-gray-300 whitespace-nowrap sm:ml-2">Status:</span>
                      <select
                        value={monthlyStatusFilter}
                        onChange={(e) => setMonthlyStatusFilter(e.target.value as any)}
                        className="text-xs bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer hover:border-[#C59B27] transition-all"
                      >
                        <option value="all">All Tasks</option>
                        <option value="Pending">Pending ⌛</option>
                        <option value="Completed">Completed ✓</option>
                      </select>
                      
                      <button
                        type="button"
                        onClick={() => setMonthlySortBy(monthlySortBy === 'smart' ? 'date' : 'smart')}
                        className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer select-none border whitespace-nowrap ${
                          monthlySortBy === 'smart'
                            ? 'bg-amber-500 text-white border-amber-500 shadow-sm hover:bg-amber-600'
                            : 'bg-gold-500/10 text-[#C59B27] border-gold-500/20 hover:bg-gold-500/20'
                        }`}
                        title="Balances high priority and closest due dates dynamically"
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>Smart Sort</span>
                      </button>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                      <input 
                        type="text" 
                        value={monthlyFilterQuery}
                        onChange={(e) => setMonthlyFilterQuery(e.target.value)}
                        placeholder="Search monthly list..." 
                        className="w-full pl-9 pr-4 py-1.5 text-xs border border-gray-200 rounded-full focus:outline-none dark:bg-slate-900/50 dark:border-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 min-h-[300px]">
                  {getFilteredMonthly().map(t => (
                    <TaskCard 
                      key={t.id}
                      task={t} 
                      onToggleComplete={handleToggleComplete}
                      onEdit={(id) => { setEditTask(t); setQuickAddModal({ open: true, type: 'monthly' }); }}
                      onDelete={handleDeleteTask}
                      onDuplicate={handleDuplicateTask}
                      onArchive={handleArchiveTask}
                      onOpenDetails={(id) => setDetailModalTask(t)}
                      viewContext="monthly"
                    />
                  ))}
                  {getFilteredMonthly().length === 0 && (
                    <div className="text-center py-12 text-gray-400 font-mono text-xs">No monthly tasks matching query.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= VIEW: YEARLY TASKS ================= */}
          {activeView === 'yearly-tasks' && (
            <div className="animate-fade-in">
              <div className="bg-white/85 dark:bg-[#112240] border border-gray-200/50 dark:border-gold-500/5 p-6 rounded-2xl shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-800 pb-4 mb-4">
                  <h3 className="font-serif font-bold text-xl tracking-widest text-[#C59B27] uppercase">Yearly Tasks</h3>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                      <span className="text-[11px] font-mono text-gray-400 dark:text-gray-300 whitespace-nowrap">Sort by:</span>
                      <select
                        value={yearlySortBy}
                        onChange={(e) => setYearlySortBy(e.target.value as any)}
                        className="text-xs bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer hover:border-[#C59B27] transition-all"
                      >
                        <option value="date">Date & Time</option>
                        <option value="priority">Priority</option>
                        <option value="status">Status</option>
                        <option value="smart">Smart Sort ✨</option>
                      </select>

                      <span className="text-[11px] font-mono text-gray-400 dark:text-gray-300 whitespace-nowrap sm:ml-2">Status:</span>
                      <select
                        value={yearlyStatusFilter}
                        onChange={(e) => setYearlyStatusFilter(e.target.value as any)}
                        className="text-xs bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer hover:border-[#C59B27] transition-all"
                      >
                        <option value="all">All Tasks</option>
                        <option value="Pending">Pending ⌛</option>
                        <option value="Completed">Completed ✓</option>
                      </select>
                      
                      <button
                        type="button"
                        onClick={() => setYearlySortBy(yearlySortBy === 'smart' ? 'date' : 'smart')}
                        className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer select-none border whitespace-nowrap ${
                          yearlySortBy === 'smart'
                            ? 'bg-amber-500 text-white border-amber-500 shadow-sm hover:bg-amber-600'
                            : 'bg-gold-500/10 text-[#C59B27] border-gold-500/20 hover:bg-gold-500/20'
                        }`}
                        title="Balances high priority and closest due dates dynamically"
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>Smart Sort</span>
                      </button>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                      <input 
                        type="text" 
                        value={yearlyFilterQuery}
                        onChange={(e) => setYearlyFilterQuery(e.target.value)}
                        placeholder="Search yearly list..." 
                        className="w-full pl-9 pr-4 py-1.5 text-xs border border-gray-200 rounded-full focus:outline-none dark:bg-slate-900/50 dark:border-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 min-h-[300px]">
                  {getFilteredYearly().map(t => (
                    <TaskCard 
                      key={t.id}
                      task={t} 
                      onToggleComplete={handleToggleComplete}
                      onEdit={(id) => { setEditTask(t); setQuickAddModal({ open: true, type: 'yearly' }); }}
                      onDelete={handleDeleteTask}
                      onDuplicate={handleDuplicateTask}
                      onArchive={handleArchiveTask}
                      onOpenDetails={(id) => setDetailModalTask(t)}
                      viewContext="yearly"
                    />
                  ))}
                  {getFilteredYearly().length === 0 && (
                    <div className="text-center py-12 text-gray-400 font-mono text-xs">No yearly milestones matching query.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= VIEW: CALENDAR ================= */}
          {activeView === 'calendar' && (
            <div className="animate-fade-in">
              <CalendarView 
                tasks={tasks}
                onToggleComplete={handleToggleComplete}
                onOpenQuickAdd={(type, date) => setQuickAddModal({ open: true, type, date })}
                onTaskClick={(id) => {
                  const t = tasks.find(item => item.id === id);
                  if (t) setDetailModalTask(t);
                }}
              />
            </div>
          )}

        </div>

      </main>

      {/* ================= MODALS & OVERLAYS ================= */}

      {/* MODAL: Lightning Quick Add Task */}
      {quickAddModal.open && (
        <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#112240] border border-gray-250 dark:border-gold-500/10 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <button 
              onClick={() => { setQuickAddModal({ open: false, type: 'daily' }); setEditTask(null); }}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 dark:hover:text-gold-500 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-serif font-bold text-lg text-gray-800 dark:text-gold-500 mb-4 select-none">
              {editTask ? 'Edit Task Schedule' : 'Lightning Quick Add Task'}
            </h3>

            <TaskForm 
              type={quickAddModal.type}
              editTask={editTask}
              onSubmit={editTask ? handleUpdateTask : (data) => handleAddTask(data, quickAddModal.type)}
              onCancel={() => { setQuickAddModal({ open: false, type: 'daily' }); setEditTask(null); }}
              showDelete={!!editTask}
              onDelete={() => { if (editTask) { handleDeleteTask(editTask.id); setEditTask(null); setQuickAddModal({ open: false, type: 'daily' }); } }}
            />
          </div>
        </div>
      )}

      {/* MODAL: Task Details Inspector */}
      {detailModalTask && (
        <div className="fixed inset-0 bg-black/60 z-[999] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#112240] border border-gray-200 dark:border-gold-500/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button 
              onClick={() => setDetailModalTask(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 dark:hover:text-gold-500 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <span className="text-[9px] font-bold tracking-widest uppercase bg-gold-500/10 text-gold-700 dark:text-gold-450 px-2.5 py-0.5 rounded-full">
                {detailModalTask.type.toUpperCase()} TASK
              </span>
              <span className={`text-[9px] font-bold tracking-widest uppercase px-2.5 py-0.5 rounded-full ${
                detailModalTask.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {detailModalTask.status}
              </span>
            </div>

            <h3 className="font-serif font-bold text-lg md:text-xl text-gray-800 dark:text-white mb-2 pr-6 leading-snug">
              {detailModalTask.task}
            </h3>

            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-gray-500 dark:text-gray-400 border-y border-gray-100 dark:border-slate-800 py-3 mb-4 select-none">
              <div className="flex items-center gap-1">
                <span className="material-icons text-sm text-gray-400 dark:text-gold-500">calendar_today</span>
                <span>{detailModalTask.type === 'yearly' ? `Month: ${detailModalTask.month}` : detailModalTask.date}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="material-icons text-xs text-gold-500">schedule</span>
                <span>{detailModalTask.time || '--:--'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="material-icons text-sm text-red-500">flag</span>
                <span>{detailModalTask.priority} Priority</span>
              </div>
            </div>

            <div className="mb-4">
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Description</h4>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-sans max-h-40 overflow-y-auto pr-1">
                {detailModalTask.description || 'No description provided.'}
              </p>
            </div>

            {detailModalTask.tags && (
              <div className="mb-6">
                <h4 className="text-[10px] font-mono uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Tags</h4>
                <div className="flex flex-wrap gap-1.5">
                  {detailModalTask.tags.split(',').map((tag, idx) => (
                    <span key={idx} className="text-[9px] bg-gold-500/10 text-gold-700 dark:text-gold-400 px-2.5 py-1 rounded font-mono">
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button 
                onClick={() => { setEditTask(detailModalTask); setQuickAddModal({ open: true, type: detailModalTask.type }); setDetailModalTask(null); }}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Edit Task
              </button>
              <button 
                onClick={() => { handleToggleComplete(detailModalTask.id); setDetailModalTask(null); }}
                className="flex-1 py-2.5 bg-[#C59B27] hover:bg-[#A8801B] text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                {detailModalTask.status === 'Completed' ? 'Mark Pending' : 'Mark Completed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BackupSnap History Timeline restore */}
      {showBackupModal && (
        <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#112240] border border-gray-250 dark:border-gold-500/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button 
              onClick={() => setShowBackupModal(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 dark:hover:text-gold-500 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-display font-bold text-lg text-gray-800 dark:text-gold-500 mb-1 flex items-center gap-1.5 select-none">
              <span className="material-icons text-lg">history_toggle_off</span> Restore Snapshots Timeline
            </h3>
            <p className="text-xs text-gray-400 font-mono mb-4">TaskFlow Pro auto-saves key snapshots. Select any point below to restore:</p>

            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 text-xs">
              {backupHistory.map((b, index) => (
                <div key={index} className="p-3 bg-gray-50 dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-xl flex items-center justify-between">
                  <div className="font-mono">
                    <span className="font-bold text-gray-800 dark:text-gold-500">Snapshot #{backupHistory.length - index}</span>
                    <p className="text-[10px] text-gray-400 mt-0.5">{b.timestamp}</p>
                  </div>
                  <button 
                    onClick={() => restoreSnapshot(b)}
                    className="px-3 py-1.5 bg-[#C59B27] hover:bg-[#A8801B] text-white font-bold rounded-lg text-[10px] cursor-pointer"
                  >
                    RESTORE
                  </button>
                </div>
              ))}
              {backupHistory.length === 0 && (
                <p className="text-center text-gray-400 py-6 font-mono">No auto snapshots logged yet. Simply update tasks to write snapshot points.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Cloud Sync Database Config & Settings */}
      {showSettingsModal && (
        <SettingsModal 
          onClose={() => setShowSettingsModal(false)}
          onRefreshState={() => setDbMode(getActiveDbMode())}
        />
      )}

      {/* MODAL: Active Due Alert Reminder Pop */}
      {activeAlarm && (
        <div className="fixed inset-0 bg-black/65 z-[9999] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#112240] border border-amber-500/30 rounded-3xl max-w-sm w-full p-6 shadow-2xl text-center">
            
            <div className="relative w-16 h-16 mx-auto mb-4 flex items-center justify-center select-none">
              <span className="absolute inset-0 rounded-full bg-amber-500/25 animate-ping"></span>
              <div className="relative w-12 h-12 bg-amber-500 text-white rounded-full flex items-center justify-center">
                <span className="material-icons text-2xl animate-bounce">notifications_active</span>
              </div>
            </div>

            <span className="text-[9px] font-bold tracking-widest uppercase bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 px-3 py-1 rounded-full">
              TASK DUE NOW
            </span>

            <h3 className="font-serif font-bold text-lg text-gray-800 dark:text-white mt-4 mb-1.5">
              {activeAlarm.task}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-300 font-mono mb-4 h-12 overflow-y-auto leading-relaxed px-2">
              {activeAlarm.description || 'No description provided.'}
            </p>

            <div className="flex gap-2">
              <button 
                onClick={() => {
                  // Snooze 5 mins
                  const d = new Date(Date.now() + 5 * 60 * 1000);
                  const hh = String(d.getHours()).padStart(2, '0');
                  const mm = String(d.getMinutes()).padStart(2, '0');
                  const updatedTask = {
                    ...activeAlarm,
                    time: `${hh}:${mm}`,
                    dueAlerted: false
                  };
                  const db = getActiveDb();
                  setDoc(doc(db, "tasks", activeAlarm.id), updatedTask).catch(() => {});
                  setActiveAlarm(null);
                }}
                className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Snooze (5m)
              </button>
              <button 
                onClick={() => {
                  handleToggleComplete(activeAlarm.id);
                  setActiveAlarm(null);
                }}
                className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= FLOATING ACTION BUTTON: AI CHAT ASSISTANT ================= */}
      <button 
        onClick={() => setAiChatOpen(!aiChatOpen)}
        className="fixed bottom-6 right-6 z-[999] w-14 h-14 bg-gradient-to-br from-gold-500 to-amber-500 text-white rounded-full shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none"
        title="AI Assistant Chat"
      >
        <Sparkles className="w-6 h-6 animate-pulse" />
      </button>

      {/* AI Chat Drawer Panel */}
      {aiChatOpen && (
        <div className="fixed bottom-24 right-6 z-[999] w-[calc(100vw-3rem)] max-w-sm h-[28rem] bg-white dark:bg-[#112240] border border-gray-200 dark:border-gold-500/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-scale">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gold-500 to-amber-500 text-slate-900 flex-shrink-0">
            <h4 className="font-display font-bold text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-slate-900" />
              <span>AI Chat Coach</span>
            </h4>
            <button 
              onClick={() => setAiChatOpen(false)}
              className="text-slate-950 hover:opacity-85 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs leading-normal">
            {aiChatMessages.map((m, idx) => (
              <div key={idx} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 select-none
                  ${m.role === 'user' ? 'bg-gray-200 text-gray-700' : 'bg-gold-500/15 text-gold-600 dark:text-gold-500'}`}>
                  <span className="material-icons text-[10px]">{m.role === 'user' ? 'person' : 'auto_awesome'}</span>
                </div>
                <div className={`rounded-xl rounded-tl-none px-3 py-2 max-w-[85%]
                  ${m.role === 'user' ? 'bg-gold-500 text-slate-900 font-medium' : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {aiChatLoading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-gold-500/15 text-gold-600 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons text-xs animate-spin">refresh</span>
                </div>
                <div className="bg-gray-100 dark:bg-slate-800 text-gray-400 rounded-xl px-3 py-2 font-mono text-[10px]">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={aiChatEndRef}></div>
          </div>

          {/* Ask form */}
          <form onSubmit={handleSendChatMessage} className="flex items-center gap-2 p-3 border-t border-gray-100 dark:border-gold-500/10 flex-shrink-0">
            <input 
              type="text" 
              required
              value={aiChatInput}
              onChange={(e) => setAiChatInput(e.target.value)}
              placeholder="Ask about my workloads today..." 
              className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg dark:bg-slate-900/50 dark:border-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
            <button 
              type="submit" 
              disabled={aiChatLoading}
              className="w-9 h-9 shrink-0 bg-gold-500 hover:bg-gold-600 text-white rounded-lg flex items-center justify-center cursor-pointer transition-colors"
            >
              <span className="material-icons text-sm select-none">send</span>
            </button>
          </form>
        </div>
      )}

    </div>
  );

  // Helper View Router
  function setView(view: any) {
    setActiveView(view);
  }
}
