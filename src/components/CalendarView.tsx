import React, { useState } from 'react';
import { Task } from '../types';
import { Calendar, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface CalendarViewProps {
  tasks: Task[];
  onToggleComplete: (id: string) => void;
  onOpenQuickAdd: (type: 'daily' | 'monthly' | 'yearly', date?: string) => void;
  onTaskClick: (id: string) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  tasks,
  onToggleComplete,
  onOpenQuickAdd,
  onTaskClick
}) => {
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [viewType, setViewType] = useState<'month' | 'week' | 'day'>('month');

  const monthNames = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];

  // Helper to format ISO YYYY-MM-DD
  const formatDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Khmer Lunar Date converter
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

  const handlePrev = () => {
    const nextDate = new Date(calendarDate);
    if (viewType === 'month') {
      nextDate.setMonth(calendarDate.getMonth() - 1);
    } else if (viewType === 'week') {
      nextDate.setDate(calendarDate.getDate() - 7);
    } else {
      nextDate.setDate(calendarDate.getDate() - 1);
    }
    setCalendarDate(nextDate);
  };

  const handleNext = () => {
    const nextDate = new Date(calendarDate);
    if (viewType === 'month') {
      nextDate.setMonth(calendarDate.getMonth() + 1);
    } else if (viewType === 'week') {
      nextDate.setDate(calendarDate.getDate() + 7);
    } else {
      nextDate.setDate(calendarDate.getDate() + 1);
    }
    setCalendarDate(nextDate);
  };

  const handleToday = () => {
    setCalendarDate(new Date());
  };

  // Rendering month cells logic
  const renderMonthCells = () => {
    const cells: React.ReactNode[] = [];
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    // Fill preceding month buffer days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = prevMonthTotalDays - i;
      cells.push(
        <div key={`prev-${day}`} className="calendar-day-cell p-1 rounded-lg border border-gray-150 dark:border-slate-800 opacity-25 flex flex-col justify-between font-mono text-[9px] select-none h-full">
          <div>{day}</div>
        </div>
      );
    }

    const todayStr = formatDateStr(new Date());

    // Fill current month days
    for (let day = 1; day <= totalDays; day++) {
      const dayDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dayDateStr === todayStr;

      const dayTasks = tasks.filter(t => t.date === dayDateStr);

      cells.push(
        <div 
          key={`day-${day}`} 
          onClick={() => onOpenQuickAdd('daily', dayDateStr)}
          className={`calendar-day-cell p-1.5 rounded-lg border border-gray-200/50 dark:border-slate-800 flex flex-col justify-between overflow-hidden cursor-pointer h-full transition-colors hover:bg-gold-500/5
            ${isToday ? 'calendar-day-today bg-gold-500/5 dark:bg-gold-500/10' : ''}`}
        >
          <div className="flex justify-between items-center w-full font-mono text-xs">
            <span className={`font-bold ${isToday ? 'text-gold-600 dark:text-gold-500' : 'text-gray-700 dark:text-white'}`}>{day}</span>
            {dayTasks.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse"></span>}
          </div>
          
          {dayTasks.length > 0 && (
            <div className="space-y-0.5 max-h-12 overflow-y-auto w-full mt-1">
              {dayTasks.slice(0, 3).map((t, idx) => {
                const isComp = t.status === 'Completed';
                let badgeCol = 'bg-emerald-500 text-white';
                if (isComp) {
                  badgeCol = 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 line-through';
                } else if (t.priority === 'High') {
                  badgeCol = 'bg-red-500 text-white';
                } else if (t.priority === 'Medium') {
                  badgeCol = 'bg-orange-400 text-white';
                }
                
                return (
                  <div 
                    key={idx} 
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskClick(t.id);
                    }}
                    className={`text-[8px] font-semibold px-1 rounded truncate tracking-tight py-0.5 hover:opacity-85 ${badgeCol}`}
                  >
                    {t.task}
                  </div>
                );
              })}
              {dayTasks.length > 3 && (
                <div className="text-[7px] text-gray-400 font-mono text-center">+{dayTasks.length - 3} more</div>
              )}
            </div>
          )}
        </div>
      );
    }

    return cells;
  };

  // Rendering week cells
  const renderWeekCells = () => {
    const cells: React.ReactNode[] = [];
    const startOfWeek = new Date(calendarDate);
    const dayOfWeek = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek); // Reset to Sunday

    const todayStr = formatDateStr(new Date());

    for (let i = 0; i < 7; i++) {
      const currentDay = new Date(startOfWeek);
      currentDay.setDate(startOfWeek.getDate() + i);
      const dayDateStr = formatDateStr(currentDay);
      const isToday = dayDateStr === todayStr;

      const dayTasks = tasks.filter(t => t.date === dayDateStr);

      cells.push(
        <div 
          key={`week-${i}`}
          onClick={() => onOpenQuickAdd('daily', dayDateStr)}
          className={`calendar-day-cell p-3 rounded-xl border border-gray-200/50 dark:border-slate-800 flex flex-col h-full min-h-[300px] cursor-pointer hover:bg-gold-500/5 transition-colors
            ${isToday ? 'calendar-day-today bg-gold-500/5 dark:bg-gold-500/10' : ''}`}
        >
          <div className="text-center border-b border-gray-100 dark:border-slate-800 pb-2 mb-3">
            <h5 className="text-[10px] font-mono text-gray-400 uppercase font-bold">{currentDay.toLocaleString('en-US', { weekday: 'short' })}</h5>
            <h4 className={`font-display font-bold text-lg ${isToday ? 'text-gold-500' : 'text-gray-800 dark:text-white'}`}>{currentDay.getDate()}</h4>
          </div>
          
          <div className="space-y-2 flex-1 overflow-y-auto pr-0.5">
            {dayTasks.map((t, idx) => {
              const isComp = t.status === 'Completed';
              const pCol = t.priority === 'High' ? 'border-red-500' : t.priority === 'Medium' ? 'border-orange-400' : 'border-emerald-500';
              return (
                <div 
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTaskClick(t.id);
                  }}
                  className={`p-2 border-l-2 bg-white dark:bg-slate-900 rounded shadow-sm text-[10px] ${pCol} ${isComp ? 'opacity-50 line-through' : ''}`}
                >
                  <p className="font-bold text-gray-700 dark:text-white truncate">{t.task}</p>
                  <p className="text-[8px] font-mono text-gray-400 mt-0.5">{t.time}</p>
                </div>
              );
            })}
            {dayTasks.length === 0 && (
              <p className="text-center text-gray-300 dark:text-gray-600 text-[10px] font-mono mt-8 select-none">Free</p>
            )}
          </div>
        </div>
      );
    }

    return cells;
  };

  // Rendering Day view events
  const renderDayView = () => {
    const dayStr = formatDateStr(calendarDate);
    const dayTasks = tasks.filter(t => t.date === dayStr);

    if (dayTasks.length === 0) {
      return (
        <div className="text-center py-16 text-gray-400 font-mono text-xs select-none">
          <span className="material-icons text-3xl mb-1 text-emerald-500">done_all</span>
          <p>Your calendar is empty for today!</p>
        </div>
      );
    }

    return (
      <div className="space-y-3 max-h-[400px] overflow-y-auto p-2">
        {dayTasks.map((t, idx) => {
          const isComp = t.status === 'Completed';
          return (
            <div 
              key={idx}
              onClick={() => onTaskClick(t.id)}
              className="p-3 bg-gray-50 dark:bg-slate-900 hover:scale-[1.01] transition-transform rounded-xl border border-gray-200/50 dark:border-slate-800 flex justify-between items-center cursor-pointer"
            >
              <div>
                <h4 className={`font-bold text-sm text-gray-800 dark:text-white truncate ${isComp ? 'line-through opacity-50' : ''}`}>{t.task}</h4>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{t.time} | {t.priority} Priority</p>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleComplete(t.id);
                }}
                className={`text-xs font-bold cursor-pointer ${isComp ? 'text-red-500 hover:text-red-600' : 'text-gold-500 hover:text-gold-600'}`}
              >
                {isComp ? 'Re-open' : 'Complete'}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-white/80 dark:bg-[#112240]/80 border border-gray-200/50 dark:border-gold-500/5 p-6 rounded-2xl shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-100 dark:border-gold-500/5 pb-6 mb-2">
        <div className="flex items-center gap-3">
          <span className="material-icons text-3xl text-gold-500">calendar_month</span>
          <div>
            <h3 className="font-display font-bold text-xl text-gray-800 dark:text-gold-500">
              {monthNames[calendarDate.getMonth()]} {calendarDate.getFullYear()}
            </h3>
            <p className="text-xs text-gray-400 font-mono">
              Khmer: {getKhmerLunarDate(calendarDate)}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 font-mono">
          {/* Calendar Views Selector */}
          <div className="inline-flex bg-gray-100 dark:bg-slate-800 p-1 rounded-lg">
            <button 
              onClick={() => setViewType('month')}
              className={`px-3 py-1 text-xs rounded-md font-semibold cursor-pointer ${viewType === 'month' ? 'bg-white dark:bg-slate-900 shadow-sm text-gray-700 dark:text-gold-500' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Month
            </button>
            <button 
              onClick={() => setViewType('week')}
              className={`px-3 py-1 text-xs rounded-md font-semibold cursor-pointer ${viewType === 'week' ? 'bg-white dark:bg-slate-900 shadow-sm text-gray-700 dark:text-gold-500' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Week
            </button>
            <button 
              onClick={() => setViewType('day')}
              className={`px-3 py-1 text-xs rounded-md font-semibold cursor-pointer ${viewType === 'day' ? 'bg-white dark:bg-slate-900 shadow-sm text-gray-700 dark:text-gold-500' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Day
            </button>
          </div>

          {/* Navigation Arrows */}
          <div className="flex items-center border border-gray-200 dark:border-gold-500/10 rounded-lg overflow-hidden">
            <button onClick={handlePrev} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-white cursor-pointer">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleToday} className="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 text-xs font-semibold text-gray-600 border-x border-gray-200 dark:border-gold-500/10 dark:text-white cursor-pointer">
              Today
            </button>
            <button onClick={handleNext} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-white cursor-pointer">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid rendering by viewType */}
      {viewType === 'month' && (
        <div className="space-y-2">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold font-mono text-gray-400 uppercase py-1 border-b border-gray-100 dark:border-gold-500/5">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>
          <div className="grid grid-cols-7 gap-1 auto-rows-[90px] md:auto-rows-[110px]">
            {renderMonthCells()}
          </div>
        </div>
      )}

      {viewType === 'week' && (
        <div className="space-y-2">
          <div className="grid grid-cols-7 gap-2">
            {renderWeekCells()}
          </div>
        </div>
      )}

      {viewType === 'day' && (
        <div className="space-y-4">
          <div className="text-center font-mono font-bold text-sm bg-gold-500/10 py-1.5 rounded-lg text-gold-600">
            {calendarDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          {renderDayView()}
        </div>
      )}

      {/* Legend colors guide */}
      <div className="mt-6 flex flex-wrap gap-4 justify-center border-t border-gray-100 dark:border-gold-500/5 pt-4 text-xs font-mono text-gray-400 select-none">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-500 rounded-full"></span> High Priority</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-orange-400 rounded-full"></span> Medium Priority</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-500 rounded-full"></span> Low Priority</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-gray-300 dark:bg-gray-600 rounded-full line-through"></span> Completed Task</span>
      </div>
    </div>
  );
};
