import React, { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Briefcase, 
  Plus, 
  Search, 
  Filter, 
  Kanban, 
  List, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  AlertTriangle, 
  Tag, 
  ChevronLeft, 
  ChevronRight, 
  Edit3, 
  Trash2, 
  Receipt, 
  Phone, 
  ArrowRight, 
  ArrowLeft, 
  Sparkles,
  ExternalLink,
  SlidersHorizontal,
  Flame,
  CheckSquare,
  Camera,
  FileText
} from 'lucide-react';
import { db } from '../db/db.js';
import { DEFAULT_PROJECT_STAGES } from '../db/seedData.js';
import { 
  STAGE_CONFIG, 
  PRIORITY_CONFIG, 
  getDeliveryStatus, 
  getChecklistProgress, 
  PROJECT_PRIORITIES 
} from '../utils/projectUtils.js';
import { formatCurrency, formatDate, formatInvoiceNumber } from '../utils/formatters.js';
import { scheduleAutoSync } from '../utils/googleSheetsSync.js';
import { ProjectFormModal } from '../components/ProjectFormModal.jsx';
import { ProjectDeliveredModal } from '../components/ProjectDeliveredModal.jsx';
import { EquipmentCrewModal } from '../components/EquipmentCrewModal.jsx';
import { UndoToast } from '../components/UndoToast.jsx';

const ContractsModal = React.lazy(() => import('../components/ContractsModal.jsx').then(m => ({ default: m.ContractsModal })));

export function ProjectsPage({ onViewInvoice, onGoToTrash, initialSelectedProjectId = null }) {
  const [currentView, setCurrentView] = useState('kanban'); // 'kanban' | 'list' | 'calendar'
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [deliveredPromptProject, setDeliveredPromptProject] = useState(null);
  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
  const [contractProject, setContractProject] = useState(null);

  // Undo Toast state
  const [undoState, setUndoState] = useState(null);

  // Calendar view navigation state
  const [calendarMonthDate, setCalendarMonthDate] = useState(new Date());

  // Dexie live queries
  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const stages = settings?.projectStages || DEFAULT_PROJECT_STAGES;
  const sym = settings?.currencySymbol || '₹';

  const rawProjects = useLiveQuery(() => db.projects?.toArray() || [], []) || [];
  const customers = useLiveQuery(() => db.customers?.toArray() || [], []) || [];
  const invoices = useLiveQuery(() => db.invoices?.toArray() || [], []) || [];

  // Filter active (non-deleted) projects
  const activeProjects = useMemo(() => {
    return rawProjects.filter(p => !p.isDeleted);
  }, [rawProjects]);

  // Create an invoice lookup map for quick balance / status resolution
  const invoiceMap = useMemo(() => {
    const map = new Map();
    invoices.forEach(inv => {
      if (inv.id) map.set(Number(inv.id), inv);
    });
    return map;
  }, [invoices]);

  // Customer ID / Phone lookup map for live client sync
  const customerMap = useMemo(() => {
    const map = new Map();
    customers.forEach(c => {
      if (c.id) map.set(Number(c.id), c);
      if (c.phone) {
        const clean = String(c.phone).replace(/\D/g, '');
        if (clean) map.set(`phone:${clean}`, c);
      }
    });
    return map;
  }, [customers]);

  const resolveProjectClient = useCallback((proj) => {
    if (!proj) return null;
    const cid = proj.customerId || proj.clientId;
    if (cid && customerMap.has(Number(cid))) {
      return customerMap.get(Number(cid));
    }
    const cleanPhone = proj.clientPhone ? String(proj.clientPhone).replace(/\D/g, '') : '';
    if (cleanPhone && customerMap.has(`phone:${cleanPhone}`)) {
      return customerMap.get(`phone:${cleanPhone}`);
    }
    return null;
  }, [customerMap]);

  // Filter and search projects
  const filteredProjects = useMemo(() => {
    return activeProjects.filter(proj => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const liveCust = resolveProjectClient(proj);
        const resolvedName = (liveCust?.name || proj.clientName || '').toLowerCase();
        const resolvedCompany = (liveCust?.company || '').toLowerCase();
        const titleMatch = (proj.title || '').toLowerCase().includes(q);
        const clientMatch = resolvedName.includes(q) || resolvedCompany.includes(q);
        const eventMatch = (proj.eventType || '').toLowerCase().includes(q);
        const invMatch = (proj.invoiceNumber || '').toString().toLowerCase().includes(q);
        if (!titleMatch && !clientMatch && !eventMatch && !invMatch) {
          return false;
        }
      }

      // Stage filter
      if (stageFilter !== 'all' && proj.stage !== stageFilter) {
        return false;
      }

      // Priority filter
      if (priorityFilter !== 'all' && proj.priority !== priorityFilter) {
        return false;
      }

      // Urgency filter
      if (urgencyFilter !== 'all') {
        const delivery = getDeliveryStatus(proj.deliveryDueDate, proj.stage);
        if (urgencyFilter === 'overdue' && delivery.status !== 'overdue') return false;
        if (urgencyFilter === 'due_soon' && (delivery.status !== 'due-soon' && delivery.status !== 'due_soon' && delivery.status !== 'due-today' && delivery.status !== 'due_today')) return false;
        if (urgencyFilter === 'delivered' && proj.stage !== 'Delivered') return false;
      }

      return true;
    });
  }, [activeProjects, searchQuery, stageFilter, priorityFilter, urgencyFilter]);

  // Project statistics
  const stats = useMemo(() => {
    const total = activeProjects.length;
    const editing = activeProjects.filter(p => p.stage === 'Editing').length;
    const ready = activeProjects.filter(p => p.stage === 'Ready').length;
    const overdue = activeProjects.filter(p => {
      if (p.stage === 'Delivered' || !p.deliveryDueDate) return false;
      const d = getDeliveryStatus(p.deliveryDueDate, p.stage);
      return d.status === 'overdue';
    }).length;
    const delivered = activeProjects.filter(p => p.stage === 'Delivered').length;

    return { total, editing, ready, overdue, delivered };
  }, [activeProjects]);

  // Handle stage change (e.g. from Kanban arrows or dropdown)
  const handleUpdateStage = async (project, newStage) => {
    if (project.stage === newStage) return;

    const isNowDelivered = newStage === 'Delivered';
    const nowIso = new Date().toISOString();

    await db.projects.update(project.id, {
      stage: newStage,
      deliveredAt: isNowDelivered ? nowIso : (newStage === 'Delivered' ? project.deliveredAt : null),
      updatedAt: nowIso
    });

    scheduleAutoSync(1000);

    if (isNowDelivered) {
      setDeliveredPromptProject({
        ...project,
        stage: 'Delivered',
        deliveredAt: nowIso
      });
    }
  };

  // Step stage backward or forward
  const handleStepStage = (project, direction) => {
    const currentIdx = stages.indexOf(project.stage);
    if (currentIdx === -1) return;
    const nextIdx = currentIdx + direction;
    if (nextIdx >= 0 && nextIdx < stages.length) {
      handleUpdateStage(project, stages[nextIdx]);
    }
  };

  // Soft Delete a project with Undo Toast
  const handleDeleteProject = async (project) => {
    const nowIso = new Date().toISOString();
    await db.projects.update(project.id, {
      isDeleted: true,
      deletedAt: nowIso,
      updatedAt: nowIso
    });

    scheduleAutoSync(1000);

    setUndoState({
      message: `Project "${project.title}" moved to Trash.`,
      undo: async () => {
        await db.projects.update(project.id, {
          isDeleted: false,
          deletedAt: null,
          restoredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        scheduleAutoSync(1000);
      }
    });
  };

  // Open Edit Project modal
  const handleEdit = (project) => {
    setEditingProject(project);
    setIsFormModalOpen(true);
  };

  // Handle Saved Project from modal
  const handleProjectSaved = (savedProj, wasDelivered) => {
    if (wasDelivered) {
      setDeliveredPromptProject(savedProj);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Undo Toast */}
      {undoState && (
        <UndoToast
          message={undoState.message}
          onUndo={undoState.undo}
          onDismiss={() => setUndoState(null)}
        />
      )}

      {/* Delivered WhatsApp Prompt Modal */}
      <ProjectDeliveredModal
        project={deliveredPromptProject}
        settings={settings}
        isOpen={Boolean(deliveredPromptProject)}
        onClose={() => setDeliveredPromptProject(null)}
      />

      {/* Project Form Modal (Create / Edit) */}
      <ProjectFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingProject(null);
        }}
        initialProject={editingProject}
        customers={customers}
        invoices={invoices}
        settings={settings}
        onSaved={handleProjectSaved}
      />

      {/* Equipment & Crew Tracker Modal */}
      <EquipmentCrewModal
        isOpen={isEquipmentModalOpen}
        onClose={() => setIsEquipmentModalOpen(false)}
        settings={settings}
      />

      {/* Shoot Contract / Service Agreement Modal */}
      {Boolean(contractProject) && (
        <React.Suspense fallback={null}>
          <ContractsModal
            isOpen={Boolean(contractProject)}
            onClose={() => setContractProject(null)}
            project={contractProject}
            settings={settings}
          />
        </React.Suspense>
      )}

      {/* Header & Stats Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2.5">
                <span>Projects & Job Tracker</span>
                <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                  {stats.total} Active
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage post-production pipeline, shoot dates, delivery commitments, and client handoffs
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* View Switcher Tabs */}
          <div className="bg-slate-900 border border-slate-800 p-1 rounded-xl flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentView('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'kanban'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'list'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentView('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'calendar'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsEquipmentModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-semibold transition-all cursor-pointer shadow-sm hover:border-amber-500/40"
            title="Equipment & Crew Booking Schedule and Inventory"
          >
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>Gear & Crew Schedule</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingProject(null);
              setIsFormModalOpen(true);
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl shadow-lg shadow-amber-500/20 text-xs transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Quick KPI Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">In Editing</span>
            <span className="text-xl font-display font-bold text-purple-400">{stats.editing}</span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">Ready for Delivery</span>
            <span className="text-xl font-display font-bold text-teal-400">{stats.ready}</span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
            <Sparkles className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">Overdue Deadlines</span>
            <span className={`text-xl font-display font-bold ${stats.overdue > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
              {stats.overdue}
            </span>
          </div>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
            stats.overdue > 0 ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse' : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">Total Delivered</span>
            <span className="text-xl font-display font-bold text-emerald-400">{stats.delivered}</span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects, client, event, bill..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            >
              &times;
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
          {/* Stage filter */}
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-amber-500/50 shrink-0"
          >
            <option value="all">All Stages</option>
            {stages.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>

          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-amber-500/50 shrink-0"
          >
            <option value="all">All Priorities</option>
            {PROJECT_PRIORITIES.map(p => (
              <option key={p} value={p}>{p} Priority</option>
            ))}
          </select>

          {/* Urgency filter */}
          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-amber-500/50 shrink-0"
          >
            <option value="all">All Deadlines</option>
            <option value="overdue">Overdue Only</option>
            <option value="due_soon">Due This Week (≤3d)</option>
            <option value="delivered">Delivered</option>
          </select>
        </div>
      </div>

      {/* Empty State */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-3">
          <Briefcase className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-300">No projects found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || stageFilter !== 'all' || priorityFilter !== 'all' || urgencyFilter !== 'all'
              ? 'Try adjusting your search or filters to see more projects.'
              : 'Create your first production project to track shoots, editing deadlines, and deliverables.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingProject(null);
              setIsFormModalOpen(true);
            }}
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Project</span>
          </button>
        </div>
      ) : (
        <>
          {/* VIEW 1: KANBAN BOARD */}
          {currentView === 'kanban' && (
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar items-start">
              {stages.map((stageName) => {
                const stageProjects = filteredProjects.filter(p => p.stage === stageName);
                const stageCfg = STAGE_CONFIG[stageName] || {
                  color: 'bg-slate-800 text-slate-300 border-slate-700',
                  barColor: 'bg-amber-500',
                  headerBg: 'bg-slate-900'
                };

                return (
                  <div
                    key={stageName}
                    className="w-80 shrink-0 bg-slate-900/70 border border-slate-800/90 rounded-2xl flex flex-col max-h-[78vh]"
                  >
                    {/* Column Header */}
                    <div className={`p-3.5 border-b border-slate-800 rounded-t-2xl flex items-center justify-between ${stageCfg.headerBg}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${stageCfg.barColor}`} />
                        <h4 className="font-bold text-slate-200 text-xs tracking-wide">
                          {stageName}
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                        {stageProjects.length}
                      </span>
                    </div>

                    {/* Column Cards */}
                    <div className="p-2.5 space-y-3 overflow-y-auto flex-1 no-scrollbar">
                      {stageProjects.length === 0 ? (
                        <div className="text-center py-8 text-[11px] text-slate-500 border border-dashed border-slate-800/80 rounded-xl">
                          No jobs in {stageName}
                        </div>
                      ) : (
                        stageProjects.map((proj) => {
                          const delivery = getDeliveryStatus(proj.deliveryDueDate, proj.stage);
                          const progress = getChecklistProgress(proj.checklist);
                          const priorityCfg = PRIORITY_CONFIG[proj.priority] || PRIORITY_CONFIG['Medium'];
                          const linkedInv = proj.invoiceId ? invoiceMap.get(Number(proj.invoiceId)) : null;

                          return (
                            <div
                              key={proj.id}
                              className="p-3.5 bg-slate-950/90 rounded-xl border border-slate-800 hover:border-amber-500/40 shadow-sm space-y-2.5 transition-all text-xs group"
                            >
                              {/* Top row: Priority & Event Type */}
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-md border ${priorityCfg.color}`}>
                                  {proj.priority === 'Urgent' && <Flame className="w-3 h-3 inline mr-1 text-rose-400" />}
                                  {proj.priority}
                                </span>
                                <span className="text-[10px] font-medium text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md truncate max-w-[120px]">
                                  {proj.eventType || 'Event'}
                                </span>
                              </div>

                              {/* Title & Client */}
                              <div>
                                <h5 className="font-bold text-slate-100 text-xs leading-snug group-hover:text-amber-300 transition-colors">
                                  {proj.title}
                                </h5>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                                  <span className="text-slate-300 font-medium truncate">{resolveProjectClient(proj)?.name || proj.clientName || 'Valued Client'}</span>
                                  {proj.clientPhone && (
                                    <>
                                      <span>•</span>
                                      <span className="font-mono text-[10px]">{resolveProjectClient(proj)?.phone || proj.clientPhone}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Delivery Due Date Badge */}
                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-900">
                                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>Due: {proj.deliveryDueDate ? formatDate(proj.deliveryDueDate) : 'None'}</span>
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${delivery.badgeColor}`}>
                                  {delivery.label}
                                </span>
                              </div>

                              {/* Linked Invoice Payment Badge */}
                              <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/80 flex items-center justify-between text-[11px]">
                                {linkedInv ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => onViewInvoice && onViewInvoice(linkedInv.id)}
                                      className="font-mono text-amber-400/90 hover:text-amber-300 flex items-center gap-1"
                                      title="Click to view linked invoice"
                                    >
                                      <Receipt className="w-3 h-3" />
                                      <span>#{formatInvoiceNumber(linkedInv.invoiceNumber)}</span>
                                    </button>
                                    <span className={`px-1.5 py-0.5 rounded font-semibold text-[10px] ${
                                      linkedInv.status === 'paid'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : linkedInv.status === 'partially_paid'
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : 'bg-rose-500/20 text-rose-400'
                                    }`}>
                                      {linkedInv.status === 'paid' ? 'Paid' : `Due: ${formatCurrency(linkedInv.balanceDue, sym)}`}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-slate-500 text-[10px] italic">No bill linked</span>
                                )}
                              </div>

                              {/* Checklist Progress */}
                              {proj.checklist && proj.checklist.length > 0 && (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                                    <span className="flex items-center gap-1">
                                      <CheckSquare className="w-3 h-3 text-slate-500" />
                                      <span>Checklist</span>
                                    </span>
                                    <span className="font-mono">{progress.completed}/{progress.total} ({progress.percent}%)</span>
                                  </div>
                                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
                                    <div
                                      className="bg-amber-500 h-full rounded-full transition-all duration-300"
                                      style={{ width: `${progress.percent}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Card Actions & Stage Controls */}
                              <div className="flex items-center justify-between pt-2 border-t border-slate-900">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleStepStage(proj, -1)}
                                    disabled={stages.indexOf(proj.stage) <= 0}
                                    title="Move stage back"
                                    className="p-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <ArrowLeft className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleStepStage(proj, 1)}
                                    disabled={stages.indexOf(proj.stage) >= stages.length - 1}
                                    title="Move stage forward"
                                    className="p-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setContractProject(proj)}
                                    className="p-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors"
                                    title="Shoot Agreement / Contract"
                                  >
                                    <FileText className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(proj)}
                                    className="p-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors"
                                    title="Edit project"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProject(proj)}
                                    className="p-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                                    title="Move to Trash"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 2: LIST VIEW */}
          {currentView === 'list' && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Project Title</th>
                      <th className="py-3 px-4 font-semibold">Client</th>
                      <th className="py-3 px-4 font-semibold">Event Type</th>
                      <th className="py-3 px-4 font-semibold">Due Date</th>
                      <th className="py-3 px-4 font-semibold">Stage</th>
                      <th className="py-3 px-4 font-semibold">Priority</th>
                      <th className="py-3 px-4 font-semibold">Linked Bill</th>
                      <th className="py-3 px-4 font-semibold">Progress</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredProjects.map((proj) => {
                      const delivery = getDeliveryStatus(proj.deliveryDueDate, proj.stage);
                      const progress = getChecklistProgress(proj.checklist);
                      const priorityCfg = PRIORITY_CONFIG[proj.priority] || PRIORITY_CONFIG['Medium'];
                      const linkedInv = proj.invoiceId ? invoiceMap.get(Number(proj.invoiceId)) : null;

                      return (
                        <tr key={proj.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-slate-200 block truncate max-w-xs">
                              {proj.title}
                            </span>
                            {proj.eventDate && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                Shoot: {formatDate(proj.eventDate)}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-slate-300">
                            <span className="font-medium block">{resolveProjectClient(proj)?.name || proj.clientName || '—'}</span>
                            {(resolveProjectClient(proj)?.phone || proj.clientPhone) && (
                              <span className="text-[10px] text-slate-500 font-mono block">
                                {resolveProjectClient(proj)?.phone || proj.clientPhone}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full text-[10px] border border-slate-700">
                              {proj.eventType || 'Wedding'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-mono text-slate-300 block text-[11px]">
                              {proj.deliveryDueDate ? formatDate(proj.deliveryDueDate) : '—'}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded border ${delivery.badgeColor} mt-0.5 inline-block`}>
                              {delivery.label}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <select
                              value={proj.stage}
                              onChange={(e) => handleUpdateStage(proj, e.target.value)}
                              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-200 focus:outline-none focus:border-amber-500/50"
                            >
                              {stages.map(st => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`text-[10px] px-2 py-0.5 rounded-md border ${priorityCfg.color}`}>
                              {proj.priority}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            {linkedInv ? (
                              <button
                                type="button"
                                onClick={() => onViewInvoice && onViewInvoice(linkedInv.id)}
                                className="text-left font-mono text-[11px] hover:underline"
                              >
                                <span className="text-amber-400 block font-semibold">
                                  #{formatInvoiceNumber(linkedInv.invoiceNumber)}
                                </span>
                                <span className={`text-[10px] ${linkedInv.status === 'paid' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {linkedInv.status === 'paid' ? 'Paid' : formatCurrency(linkedInv.balanceDue, sym)}
                                </span>
                              </button>
                            ) : (
                              <span className="text-slate-500 text-[10px]">—</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="w-24 space-y-1">
                              <span className="text-[10px] font-mono text-slate-400 block">
                                {progress.completed}/{progress.total}
                              </span>
                              <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                                <div
                                  className="bg-amber-500 h-full rounded-full"
                                  style={{ width: `${progress.percent}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setContractProject(proj)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition-colors"
                                title="Shoot Agreement / Contract"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEdit(proj)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition-colors"
                                title="Edit project"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteProject(proj)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 transition-colors"
                                title="Move to Trash"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW 3: CALENDAR VIEW */}
          {currentView === 'calendar' && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
              {/* Month Navigation */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-amber-400" />
                  <h4 className="font-display font-bold text-slate-100 text-base">
                    {calendarMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </h4>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(calendarMonthDate);
                      d.setMonth(d.getMonth() - 1);
                      setCalendarMonthDate(d);
                    }}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarMonthDate(new Date())}
                    className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(calendarMonthDate);
                      d.setMonth(d.getMonth() + 1);
                      setCalendarMonthDate(d);
                    }}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center text-xs">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="py-2 text-slate-500 font-bold uppercase text-[10px]">
                    {day}
                  </div>
                ))}

                {(() => {
                  const year = calendarMonthDate.getFullYear();
                  const month = calendarMonthDate.getMonth();
                  const firstDayIndex = new Date(year, month, 1).getDay();
                  const totalDays = new Date(year, month + 1, 0).getDate();

                  const cells = [];
                  for (let i = 0; i < firstDayIndex; i++) {
                    cells.push(
                      <div key={`empty-${i}`} className="min-h-24 p-1.5 rounded-xl bg-slate-950/20 border border-slate-900/40 opacity-30" />
                    );
                  }

                  for (let day = 1; day <= totalDays; day++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayProjects = filteredProjects.filter(p => p.deliveryDueDate === dateStr);
                    const isToday = new Date().toISOString().split('T')[0] === dateStr;

                    cells.push(
                      <div
                        key={dateStr}
                        className={`min-h-24 p-1.5 rounded-xl border text-left flex flex-col justify-between transition-colors ${
                          isToday
                            ? 'bg-amber-950/20 border-amber-500/50'
                            : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                            isToday ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                          }`}>
                            {day}
                          </span>
                          {dayProjects.length > 0 && (
                            <span className="text-[10px] font-mono text-amber-400 font-bold">
                              {dayProjects.length} due
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 overflow-y-auto max-h-20 no-scrollbar">
                          {dayProjects.map(p => (
                            <div
                              key={p.id}
                              onClick={() => handleEdit(p)}
                              className={`p-1 rounded text-[10px] font-medium truncate cursor-pointer transition-colors border ${
                                p.stage === 'Delivered'
                                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/40'
                                  : 'bg-amber-950/40 text-amber-300 border-amber-800/40 hover:bg-amber-900/50'
                              }`}
                              title={`${p.title} (${p.stage}) - Click to edit`}
                            >
                              {p.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return cells;
                })()}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
