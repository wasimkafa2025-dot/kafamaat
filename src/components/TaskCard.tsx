import React from 'react';
import { Task } from '../types';
import { Check, Edit, Trash, Copy, Archive, CheckSquare, Square, Eye } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onToggleComplete: (id: string) => void;
  onEdit: (id: string, type: 'daily' | 'monthly' | 'yearly') => void;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onArchive?: (id: string) => void;
  onOpenDetails?: (id: string) => void;
  viewContext?: 'dashboard' | 'tracker' | 'search' | 'daily' | 'monthly' | 'yearly' | 'calendar';
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task: t,
  onToggleComplete,
  onEdit,
  onDelete,
  onDuplicate,
  onArchive,
  onOpenDetails,
  viewContext = 'tracker'
}) => {
  const isCompleted = t.status === 'Completed';

  const getSmartScore = (task: Task) => {
    const priorityWeight = { 'High': 100, 'Medium': 60, 'Low': 20 };
    const pScore = priorityWeight[task.priority] || 0;
    let uScore = 0;
    if (task.date) {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const taskDate = new Date(task.date);
        taskDate.setHours(0, 0, 0, 0);
        
        const diffTime = taskDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          uScore = 150 + Math.min(100, Math.abs(diffDays) * 5);
        } else if (diffDays === 0) {
          uScore = 120;
        } else if (diffDays === 1) {
          uScore = 90;
        } else if (diffDays <= 7) {
          uScore = 60 - (diffDays * 5);
        } else if (diffDays <= 30) {
          uScore = 30 - (diffDays * 0.5);
        } else {
          uScore = 5;
        }
      } catch (err) {}
    }
    return pScore + uScore;
  };

  let urgencyIndicator = null;
  if (!isCompleted) {
    const score = getSmartScore(t);
    if (score >= 180) {
      urgencyIndicator = (
        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold tracking-wider uppercase bg-red-100 text-red-700 dark:bg-red-950/45 dark:text-red-400 px-2 py-0.5 rounded-full shrink-0 border border-red-200/20 shadow-sm" title={`Overdue or High Priority urgent task (Workload Score: ${score})`}>
          🔥 Urgency: {score}
        </span>
      );
    } else if (score >= 110) {
      urgencyIndicator = (
        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold tracking-wider uppercase bg-amber-100 text-amber-700 dark:bg-amber-950/45 dark:text-amber-400 px-2 py-0.5 rounded-full shrink-0 border border-amber-200/20" title={`High-priority soon, or Medium-priority due now (Workload Score: ${score})`}>
          ⚡ Urgency: {score}
        </span>
      );
    } else {
      urgencyIndicator = (
        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold tracking-wider uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 px-2 py-0.5 rounded-full shrink-0 border border-emerald-200/20" title={`Workload Score: ${score}`}>
          💤 Urgency: {score}
        </span>
      );
    }
  }
  
  // Custom Urgency styling
  const prioClasses = {
    High: 'prio-badge-high',
    Medium: 'prio-badge-medium',
    Low: 'prio-badge-low'
  };
  const labelPrioClass = prioClasses[t.priority] || 'prio-badge-medium';

  // Check if due right now
  const isTaskDueNow = () => {
    if (t.status !== 'Pending') return false;
    if (!t.date || !t.time) return false;
    const now = new Date();
    const [hours, mins] = t.time.split(':');
    const taskTime = new Date(t.date);
    taskTime.setHours(parseInt(hours), parseInt(mins), 0, 0);
    return now >= taskTime;
  };

  const isDueNow = isTaskDueNow();

  // Drag and drop trigger support
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', t.id);
    e.currentTarget.classList.add('dragging');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('dragging');
  };

  const displayDate = t.type === 'yearly' ? `Month: ${t.month}` : (t.date || 'No Date');
  const displayTime = t.time || '12:00 AM';

  // Style overrides for task completeness
  const borderStyle = isCompleted 
    ? 'border-emerald-200/50 bg-[#E6F4EA]/40 dark:bg-[#112b1d] dark:border-emerald-950/30 shadow-xs' 
    : isDueNow 
      ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.25)] bg-amber-500/5 dark:bg-amber-500/5' 
      : 'border-gray-200/80 dark:border-slate-800 bg-white dark:bg-[#112240] hover:shadow-sm';

  const textStyle = isCompleted 
    ? 'text-gray-400 dark:text-gray-500 font-medium line-through underline decoration-gray-400/50 decoration-2' 
    : 'text-gray-800 dark:text-white';

  if (viewContext === 'tracker' || viewContext === 'search' || viewContext === 'daily' || viewContext === 'monthly' || viewContext === 'yearly') {
    let prioBadge = null;
    if (t.priority === 'High') {
      prioBadge = <span className="text-xs font-semibold px-4 py-1.5 rounded-full bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-200/30 dark:border-red-500/10 shrink-0">High</span>;
    } else if (t.priority === 'Medium') {
      prioBadge = <span className="text-xs font-semibold px-4 py-1.5 rounded-full bg-[#FEF3C7] text-[#B45309] dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/30 dark:border-amber-500/10 shrink-0">Medium</span>;
    } else {
      prioBadge = <span className="text-xs font-semibold px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-405 border border-emerald-200/30 dark:border-emerald-500/10 shrink-0">Low</span>;
    }

    return (
      <div 
        className={`task-card flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl border ${borderStyle} transition-all duration-300 dark:border-gold-500/10 group gap-4`}
        data-id={t.id}
        draggable={t.type === 'daily' && (viewContext === 'daily' || viewContext === 'tracker')}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <button 
            type="button"
            onClick={() => onToggleComplete(t.id)}
            className={`flex items-center justify-center w-6 h-6 rounded-lg transition-all border cursor-pointer shrink-0 ${
              isCompleted 
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-xs' 
                : 'border-gray-300 dark:border-slate-700 hover:border-gold-500 text-transparent hover:bg-gold-500/10'
            }`}
            title={isCompleted ? "Mark Pending" : "Mark Completed"}
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className={`font-sans font-bold text-base ${textStyle} truncate`}>
                {t.task}
              </h4>
              {isDueNow && !isCompleted && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-widest uppercase bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 rounded-full animate-pulse shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block animate-ping"></span>
                  DUE NOW
                </span>
              )}
              {urgencyIndicator}
            </div>
            
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 font-mono mt-1 flex-wrap">
              <span className="material-icons text-sm text-gray-400 dark:text-gray-500">calendar_today</span>
              <span>{displayDate}</span>
              <span className="text-amber-500 font-bold">•</span>
              <span className="text-amber-600 dark:text-amber-400 font-medium">{displayTime}</span>
              {t.tags && (
                <>
                  <span className="text-amber-500 font-bold">•</span>
                  <span className="text-[10px] text-gray-400 truncate max-w-[200px]" title={t.tags}>
                    {t.tags}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
          {prioBadge}
          
          <div className="flex items-center gap-2.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-250 py-1">
            {onOpenDetails && (
              <button 
                onClick={() => onOpenDetails(t.id)} 
                className="w-11 h-11 md:w-8 md:h-8 flex items-center justify-center bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-full shadow-sm hover:shadow hover:scale-105 active:scale-95 transition-all text-blue-500 dark:text-blue-400 cursor-pointer shrink-0"
                title="View Details"
              >
                <Eye className="w-5 h-5 md:w-4 md:h-4" />
              </button>
            )}
            <button 
              onClick={() => onEdit(t.id, t.type)} 
              className="w-11 h-11 md:w-8 md:h-8 flex items-center justify-center bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-full shadow-sm hover:shadow hover:scale-105 active:scale-95 transition-all text-amber-500 dark:text-amber-400 cursor-pointer shrink-0"
              title="Edit Task"
            >
              <Edit className="w-5 h-5 md:w-4 md:h-4" />
            </button>
            <button 
              onClick={() => onDelete(t.id)} 
              className="w-11 h-11 md:w-8 md:h-8 flex items-center justify-center bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-full shadow-sm hover:shadow hover:scale-105 active:scale-95 transition-all text-red-500 dark:text-red-400 cursor-pointer shrink-0"
              title="Delete Task"
            >
              <Trash className="w-5 h-5 md:w-4 md:h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback / standard grid task card
  const tagChips = t.tags ? t.tags.split(',').map((tag, idx) => (
    <span key={idx} className="text-[9px] bg-gold-500/10 text-gold-700 dark:text-gold-400 px-1.5 py-0.5 rounded">
      {tag.trim()}
    </span>
  )) : null;

  return (
    <div 
      className={`task-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gold-500/5 hover:shadow-md transition-all duration-300 relative group flex flex-col justify-between h-full ${
        isCompleted 
          ? 'task-card-completed-light dark:task-card-completed-dark' 
          : isDueNow 
            ? 'bg-amber-500/5 dark:bg-amber-500/10 border-2 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)]' 
            : 'bg-white/90 dark:bg-[#112240]'
      }`}
      data-id={t.id}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full ${labelPrioClass}`}>
              {t.priority} Priority
            </span>
            {isDueNow && !isCompleted && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-widest uppercase bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 rounded-full animate-pulse shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block animate-ping"></span>
                DUE NOW
              </span>
            )}
            {urgencyIndicator}
          </div>
          <div className="flex gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            {onDuplicate && (
              <button onClick={() => onDuplicate(t.id)} className="p-3 md:p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-gray-400 hover:text-gray-600 cursor-pointer" title="Duplicate">
                <Copy className="w-4 h-4 md:w-3.5 md:h-3.5" />
              </button>
            )}
            <button onClick={() => onEdit(t.id, t.type)} className="p-3 md:p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-gray-400 hover:text-gray-600 cursor-pointer" title="Edit">
              <span className="material-icons text-base md:text-xs">edit</span>
            </button>
            {onArchive && (
              <button onClick={() => onArchive(t.id)} className="p-3 md:p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-gray-400 hover:text-gray-600 cursor-pointer" title="Archive">
                <Archive className="w-4 h-4 md:w-3.5 md:h-3.5" />
              </button>
            )}
            <button onClick={() => onDelete(t.id)} className="p-3 md:p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-red-400 hover:text-red-600 cursor-pointer" title="Delete">
              <span className="material-icons text-base md:text-xs">delete</span>
            </button>
          </div>
        </div>

        <h4 className="font-display font-bold text-sm text-gray-800 dark:text-white mt-2 leading-snug truncate" title={t.task}>
          {isCompleted ? '✓ ' : ''}{t.task}
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed h-8">
          {t.description || 'No description provided.'}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100/50 dark:border-gold-500/5 flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1">
          {tagChips}
        </div>
        
        <div className="flex justify-between items-center">
          {t.type === 'yearly' ? (
            <div className="flex items-center gap-1 mt-1 text-[10px] font-mono text-gray-400">
              <span className="material-icons text-xs">calendar_view_year</span> Month: {t.month}
            </div>
          ) : (
            <div className={`flex items-center gap-1 mt-1 text-[10px] font-mono ${isDueNow && !isCompleted ? 'text-amber-500 font-bold animate-pulse' : 'text-gray-400'}`}>
              <span className="material-icons text-xs">schedule</span> {t.date} at {t.time}
            </div>
          )}
          
          <button 
            type="button"
            onClick={() => onToggleComplete(t.id)} 
            className={`text-xs flex items-center gap-1.5 font-semibold cursor-pointer py-1.5 px-2.5 rounded-lg border border-transparent hover:border-gray-100 dark:hover:border-slate-800 transition-all ${isCompleted ? 'text-red-500 hover:text-red-600 bg-red-50/50 dark:bg-red-950/10' : 'text-gold-500 hover:text-gold-600 bg-gold-500/5 dark:bg-gold-500/5'}`}
          >
            {isCompleted ? <CheckSquare className="w-4 h-4 md:w-3.5 md:h-3.5" /> : <Square className="w-4 h-4 md:w-3.5 md:h-3.5" />}
            <span>{isCompleted ? 'Completed' : 'Pending'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
