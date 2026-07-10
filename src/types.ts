export interface Task {
  id: string;
  type: 'daily' | 'monthly' | 'yearly';
  task: string;
  description: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  month: string; // Month name
  priority: 'High' | 'Medium' | 'Low';
  status: 'Pending' | 'Completed';
  createdAt: string;
  completedAt?: string | null;
  tags: string;
  userId: string;
  reminderSent?: boolean;
  dueAlerted?: boolean;
  telegramNotified?: boolean;
}

export interface Activity {
  id?: string;
  timestamp: string;
  message: string;
}

export interface BackupSnapshot {
  timestamp: string;
  data: string; // stringified tasks and archivedTasks
}

export interface AppSettings {
  theme: 'light' | 'dark';
  rememberMe: boolean;
  savedUsername: string;
}
