import React, { useState, useEffect } from 'react';
import { Task } from '../types';
import { callGeminiProxy } from '../lib/gemini';
import { Sparkles, Calendar, Clock, Tag, ArrowRight, Save, RotateCcw, Mic, MicOff } from 'lucide-react';

interface TaskFormProps {
  type: 'daily' | 'monthly' | 'yearly';
  editTask?: Task | null;
  onSubmit: (taskData: Partial<Task>) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  showDelete?: boolean;
}

export const TaskForm: React.FC<TaskFormProps> = ({
  type,
  editTask,
  onSubmit,
  onCancel,
  onDelete,
  showDelete = false
}) => {
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('12:00');
  const [month, setMonth] = useState('January');
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [status, setStatus] = useState<'Pending' | 'Completed'>('Pending');
  const [tags, setTags] = useState('');
  const [aiInput, setAiInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiDescLoading, setAiDescLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [speechLang, setSpeechLang] = useState<'km-KH' | 'en-US'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('taskflow_speech_lang') as any) || 'km-KH';
    }
    return 'km-KH';
  });
  const recognitionRef = React.useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const toggleSpeechRecognition = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Web Speech API is not supported in this browser. Please try using a modern browser like Chrome or Safari.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = speechLang;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError('');
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setSpeechError('Mic access denied');
        } else {
          setSpeechError(`Error: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setDescription(prev => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed} ${transcript}` : transcript;
          });
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  // Sync form states with pre-filled inputs when editTask changes
  useEffect(() => {
    if (editTask) {
      setTaskName(editTask.task);
      setDescription(editTask.description || '');
      setPriority(editTask.priority);
      setStatus(editTask.status);
      setTags(editTask.tags || '');
      if (editTask.type === 'yearly') {
        setMonth(editTask.month || 'October');
      } else {
        setDate(editTask.date || '');
        setTime(editTask.time || '12:00');
      }
    } else {
      setTaskName('');
      setDescription('');
      setPriority('Medium');
      setStatus('Pending');
      setTags('');
      setMonth('October');
      const todayStr = new Date().toISOString().split('T')[0];
      setDate(todayStr);
      setTime('12:00');
    }
  }, [editTask, type]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) return;

    const data: Partial<Task> = {
      task: taskName.trim(),
      description: description.trim(),
      priority,
      status,
      tags: tags.trim(),
    };

    if (type === 'yearly') {
      data.month = month;
    } else {
      data.date = date;
      data.time = time;
      data.month = new Date(date).toLocaleString('default', { month: 'long' });
    }

    onSubmit(data);
  };

  const handleAiSmartFill = async () => {
    if (!aiInput.trim()) return;
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayWeekday = new Date().toLocaleDateString('en-US', { weekday: 'long' });

      const schema = {
        type: 'OBJECT',
        properties: {
          task: { type: 'STRING' },
          description: { type: 'STRING' },
          date: { type: 'STRING' },
          time: { type: 'STRING' },
          month: { type: 'STRING' },
          priority: { type: 'STRING', enum: ['High', 'Medium', 'Low'] },
          tags: { type: 'STRING' }
        },
        required: ['task', 'priority']
      };

      const prompt = `You are a parsing assistant. Parse the text into fields. Today is ${todayWeekday}, ${todayStr}.
Text to parse: "${aiInput}"`;

      const responseText = await callGeminiProxy(prompt, {
        systemInstruction: `Parse sentences into structured tasks. Resolve relative days (e.g. tomorrow, next Wednesday) based on today's date ${todayStr}. Outputs must match the requested JSON schema constraints.`,
        jsonSchema: schema
      });

      if (responseText) {
        const parsed = JSON.parse(responseText);
        if (parsed.task) setTaskName(parsed.task);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.priority) setPriority(parsed.priority);
        if (parsed.tags) setTags(parsed.tags);
        if (type === 'yearly' && parsed.month) {
          setMonth(parsed.month);
        } else {
          if (parsed.date) setDate(parsed.date);
          if (parsed.time) setTime(parsed.time);
        }
      }
    } catch (error) {
      console.error('AI smart fill failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAiGenerateDesc = async () => {
    if (!taskName.trim()) return;
    setAiDescLoading(true);
    try {
      const prompt = `Write a concise, professional task description (1-2 sentences) for a ${priority} priority ${type} task titled "${taskName}". Do not copy the title. Plain text output only, no quotes, no conversational filler.`;
      const response = await callGeminiProxy(prompt);
      if (response) {
        setDescription(response.trim());
      }
    } catch (error) {
      console.error('AI description generator failed:', error);
    } finally {
      setAiDescLoading(false);
    }
  };

  const formTitleText = editTask 
    ? `Edit ${type.charAt(0).toUpperCase() + type.slice(1)} Task` 
    : `Add ${type.charAt(0).toUpperCase() + type.slice(1)} Task`;

  return (
    <div className="space-y-5">
      {/* AI Smart Creator Panel (Only visible on Add Task) */}
      {!editTask && (
        <div className="p-3 bg-gold-500/5 border border-gold-500/20 rounded-xl space-y-2">
          <label className="flex items-center gap-1 text-xs font-semibold text-gold-600 dark:text-gold-500 select-none">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>AI Smart Creator</span>
          </label>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="e.g. Call supplier tomorrow at 3pm, high priority" 
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg dark:bg-slate-900/50 dark:border-slate-800 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
            <button 
              type="button" 
              onClick={handleAiSmartFill}
              disabled={loading}
              className="px-3 py-1.5 bg-gold-500 hover:bg-gold-600 text-white rounded-lg flex items-center gap-1 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors"
            >
              {loading ? (
                <span className="material-icons text-sm animate-spin">refresh</span>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  <span>Fill</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[10px] text-gray-400">Describe the task in plain words and click Fill to automatically fill fields below.</p>
        </div>
      )}

      {/* Main interactive form */}
      <form onSubmit={handleFormSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">TASK/OBJECTIVE TITLE</label>
          <input 
            type="text" 
            required 
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="What needs to be done?" 
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg dark:bg-[#0c1a30] dark:border-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold-500 text-sm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">DESCRIPTION (OPTIONAL)</label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-slate-900/60 p-0.5 rounded-md border border-gray-150/50 dark:border-gold-500/10">
                <button
                  type="button"
                  onClick={() => {
                    setSpeechLang('km-KH');
                    localStorage.setItem('taskflow_speech_lang', 'km-KH');
                  }}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer select-none ${
                    speechLang === 'km-KH'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                  }`}
                  title="Voice Input in Khmer Language (ភាសាខ្មែរ)"
                >
                  KM 🇰🇭
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpeechLang('en-US');
                    localStorage.setItem('taskflow_speech_lang', 'en-US');
                  }}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer select-none ${
                    speechLang === 'en-US'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                  }`}
                  title="Voice Input in English"
                >
                  EN 🇺🇸
                </button>
              </div>

              <button 
                type="button" 
                onClick={toggleSpeechRecognition}
                className={`text-[10px] flex items-center gap-1 font-semibold cursor-pointer select-none transition-colors px-2 py-0.5 rounded-md ${
                  isListening 
                    ? 'text-red-500 bg-red-500/10 border border-red-500/20 animate-pulse' 
                    : 'text-gold-600 dark:text-gold-500 hover:bg-gold-500/5 hover:underline border border-transparent'
                }`}
                title={isListening ? "Stop dictation" : `Start Voice dictation in ${speechLang === 'km-KH' ? 'Khmer' : 'English'}`}
              >
                {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                <span>{isListening ? 'Listening...' : 'Voice Memo'}</span>
              </button>
              {speechError && (
                <span className="text-[9px] text-red-500 max-w-[80px] truncate" title={speechError}>
                  {speechError}
                </span>
              )}
              <button 
                type="button" 
                disabled={!taskName.trim() || aiDescLoading}
                onClick={handleAiGenerateDesc}
                className="text-[10px] text-gold-600 dark:text-gold-500 hover:underline flex items-center gap-0.5 font-semibold cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3" />
                <span>{aiDescLoading ? 'Thinking...' : 'Generate with AI'}</span>
              </button>
            </div>
          </div>
          <textarea 
            rows={2} 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter task context, milestones or checklist items..." 
            className="w-full px-3.5 py-2 border border-gray-200 rounded-lg dark:bg-[#0c1a30] dark:border-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold-500 text-xs resize-none"
          />
        </div>

        {/* Dynamic Month or Date Fields */}
        {type === 'yearly' ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">TARGET MONTH</label>
              <select 
                value={month} 
                onChange={(e) => setMonth(e.target.value)}
                required 
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold-500 focus:outline-none dark:bg-[#0c1a30] dark:border-slate-800 dark:text-white text-xs"
              >
                {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">PRIORITY LEVEL</label>
              <select 
                value={priority} 
                onChange={(e) => setPriority(e.target.value as any)}
                required 
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold-500 focus:outline-none dark:bg-[#0c1a30] dark:border-slate-800 dark:text-white text-xs"
              >
                <option value="High">🔴 High Priority</option>
                <option value="Medium">🟡 Medium Priority</option>
                <option value="Low">🟢 Low Priority</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">DATE / DEADLINE</label>
              <input 
                type="date" 
                required 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold-500 focus:outline-none dark:bg-[#0c1a30] dark:border-slate-800 dark:text-white text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">PRIORITY LEVEL</label>
              <select 
                value={priority} 
                onChange={(e) => setPriority(e.target.value as any)}
                required 
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold-500 focus:outline-none dark:bg-[#0c1a30] dark:border-slate-800 dark:text-white text-xs"
              >
                <option value="High">🔴 High Priority</option>
                <option value="Medium">🟡 Medium Priority</option>
                <option value="Low">🟢 Low Priority</option>
              </select>
            </div>
          </div>
        )}

        {type !== 'yearly' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">SCHEDULED TIME</label>
              <input 
                type="time" 
                required 
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold-500 focus:outline-none dark:bg-[#0c1a30] dark:border-slate-800 dark:text-white text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">TAGS (OPTIONAL)</label>
              <input 
                type="text" 
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Work, Quick, Personal" 
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold-500 focus:outline-none dark:bg-[#0c1a30] dark:border-slate-800 dark:text-white text-xs"
              />
            </div>
          </div>
        )}

        {type === 'yearly' && (
          <div>
            <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">TAGS (OPTIONAL)</label>
            <input 
              type="text" 
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Work, Quick, Personal" 
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold-500 focus:outline-none dark:bg-[#0c1a30] dark:border-slate-800 dark:text-white text-xs"
            />
          </div>
        )}

        {editTask && (
          <div>
            <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">STATUS</label>
            <select 
              value={status} 
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold-500 focus:outline-none dark:bg-[#0c1a30] dark:border-slate-800 dark:text-white text-xs"
            >
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        )}

        <div className="flex justify-end items-center gap-4 pt-4 border-t border-gray-100 dark:border-slate-800">
          {onCancel && (
            <button 
              type="button" 
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium cursor-pointer transition-colors"
            >
              Cancel
            </button>
          )}

          {showDelete && onDelete && (
            <button 
              type="button" 
              onClick={onDelete}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-sm font-semibold rounded-full cursor-pointer transition-colors"
            >
              Delete
            </button>
          )}

          <button 
            type="submit" 
            className="px-6 py-2 bg-[#C59B27] hover:bg-[#B38A1E] text-white font-semibold rounded-full shadow-md hover:shadow transition-all text-sm cursor-pointer"
          >
            Save Entry
          </button>
        </div>
      </form>
    </div>
  );
};
