import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  X, 
  Camera, 
  Users, 
  Plus, 
  Trash2, 
  Edit2, 
  AlertTriangle, 
  CheckCircle, 
  Calendar,
  Layers,
  Wrench,
  UserCheck,
  Search,
  DollarSign
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, formatDate } from '../utils/formatters';

export function EquipmentCrewModal({ isOpen, onClose, settings }) {
  if (!isOpen) return null;

  const sym = settings?.currencySymbol || '₹';
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'equipment' | 'crew'

  // Live queries
  const allEquipment = useLiveQuery(() => db.equipment ? db.equipment.toArray() : [], []) || [];
  const equipment = allEquipment.filter(e => !e?.isDeleted);

  const allCrew = useLiveQuery(() => db.crew ? db.crew.toArray() : [], []) || [];
  const crew = allCrew.filter(c => !c?.isDeleted);

  const allProjects = useLiveQuery(() => db.projects ? db.projects.toArray() : [], []) || [];
  const projects = allProjects.filter(p => !p?.isDeleted && p.stage !== 'Delivered');

  // Search & Filter
  const [search, setSearch] = useState('');

  // Add Equipment State
  const [isAddingEquip, setIsAddingEquip] = useState(false);
  const [newEquip, setNewEquip] = useState({ name: '', category: 'Camera', serialNumber: '', status: 'available' });

  // Add Crew State
  const [isAddingCrew, setIsAddingCrew] = useState(false);
  const [newCrew, setNewCrew] = useState({ name: '', role: 'Cinematographer', phone: '', email: '', dailyRate: '' });

  // Handle Equipment Add
  const handleAddEquipment = async (e) => {
    e.preventDefault();
    if (!newEquip.name.trim()) return;
    try {
      await db.equipment.add({
        name: newEquip.name.trim(),
        category: newEquip.category || 'Camera',
        serialNumber: (newEquip.serialNumber || '').trim(),
        status: newEquip.status || 'available',
        isDeleted: false,
        createdAt: new Date().toISOString()
      });
      setNewEquip({ name: '', category: 'Camera', serialNumber: '', status: 'available' });
      setIsAddingEquip(false);
    } catch (err) {
      console.error('Failed to add equipment:', err);
    }
  };

  const handleDeleteEquipment = async (id) => {
    if (!window.confirm('Remove this equipment from studio inventory?')) return;
    await db.equipment.update(id, { isDeleted: true });
  };

  // Handle Crew Add
  const handleAddCrew = async (e) => {
    e.preventDefault();
    if (!newCrew.name.trim()) return;
    try {
      await db.crew.add({
        name: newCrew.name.trim(),
        role: newCrew.role || 'Cinematographer',
        phone: (newCrew.phone || '').trim(),
        email: (newCrew.email || '').trim(),
        dailyRate: Number(newCrew.dailyRate) || 0,
        isDeleted: false,
        createdAt: new Date().toISOString()
      });
      setNewCrew({ name: '', role: 'Cinematographer', phone: '', email: '', dailyRate: '' });
      setIsAddingCrew(false);
    } catch (err) {
      console.error('Failed to add crew member:', err);
    }
  };

  const handleDeleteCrew = async (id) => {
    if (!window.confirm('Remove this crew member from roster?')) return;
    await db.crew.update(id, { isDeleted: true });
  };

  // Compute Conflicts in Scheduled Projects
  // Map date -> list of assigned gear & crew
  const scheduleByDate = {};
  const conflicts = [];

  projects.forEach(p => {
    if (!p.eventDate) return;
    const dateKey = p.eventDate;
    if (!scheduleByDate[dateKey]) {
      scheduleByDate[dateKey] = [];
    }
    scheduleByDate[dateKey].push(p);
  });

  // Check for items assigned to multiple projects on same date
  Object.entries(scheduleByDate).forEach(([date, projs]) => {
    if (projs.length > 1) {
      const gearUsage = {};
      const crewUsage = {};

      projs.forEach(p => {
        (p.assignedEquipment || []).forEach(gearName => {
          if (!gearUsage[gearName]) gearUsage[gearName] = [];
          gearUsage[gearName].push(p.title);
        });
        (p.assignedCrew || []).forEach(crewName => {
          if (!crewUsage[crewName]) crewUsage[crewName] = [];
          crewUsage[crewName].push(p.title);
        });
      });

      Object.entries(gearUsage).forEach(([gear, projTitles]) => {
        if (projTitles.length > 1) {
          conflicts.push({
            type: 'Gear Conflict',
            name: gear,
            date,
            projects: projTitles
          });
        }
      });

      Object.entries(crewUsage).forEach(([crewMember, projTitles]) => {
        if (projTitles.length > 1) {
          conflicts.push({
            type: 'Crew Conflict',
            name: crewMember,
            date,
            projects: projTitles
          });
        }
      });
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Camera className="w-5 h-5 text-amber-400" />
              <span>Studio Gear & Crew Booking Tracker</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage inventory, crew roster, and prevent double-booking on shoot dates.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switchers */}
            <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'schedule'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Schedule & Conflicts {conflicts.length > 0 && `(${conflicts.length})`}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('equipment')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'equipment'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Equipment ({equipment.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('crew')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'crew'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Crew Roster ({crew.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab 1: Shoot Schedule & Conflicts */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            {/* Conflict Alert Banner */}
            {conflicts.length > 0 ? (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Double-Booking Conflicts Detected! ({conflicts.length})</span>
                </div>
                <div className="space-y-1.5">
                  {conflicts.map((c, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-900/80 rounded-xl border border-rose-500/20 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div>
                        <span className="font-semibold text-rose-300">[{c.type}] {c.name}</span>
                        <span className="text-slate-400 ml-2">on {formatDate(c.date)}</span>
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        Clashing Projects:{' '}
                        <span className="text-slate-200 font-medium">
                          {c.projects.join(' & ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-xs text-emerald-400">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>All scheduled shoots have unique equipment and crew assignments. Zero double-booking conflicts!</span>
              </div>
            )}

            {/* Upcoming Shoot Calendar / Timeline */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Scheduled Shoots & Resource Allocation
              </h3>

              {Object.keys(scheduleByDate).length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  No upcoming shoots with assigned dates found in active projects.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(scheduleByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateProjects]) => (
                    <div key={date} className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(date)}</span>
                        </div>
                        <span className="text-[10px] font-semibold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                          {dateProjects.length} Shoot{dateProjects.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {dateProjects.map(p => (
                          <div key={p.id} className="p-3 bg-slate-900/90 rounded-xl border border-slate-800/90 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-200">{p.title}</span>
                              <span className="text-[10px] font-mono text-amber-400">{p.eventType}</span>
                            </div>

                            {/* Assigned Crew */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="text-[10px] uppercase font-bold text-slate-500">Crew:</span>
                              {(p.assignedCrew && p.assignedCrew.length > 0) ? (
                                p.assignedCrew.map((c, i) => (
                                  <span key={i} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700">
                                    {c}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-600 italic">No crew assigned</span>
                              )}
                            </div>

                            {/* Assigned Gear */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] uppercase font-bold text-slate-500">Gear:</span>
                              {(p.assignedEquipment && p.assignedEquipment.length > 0) ? (
                                p.assignedEquipment.map((g, i) => (
                                  <span key={i} className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/20">
                                    {g}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-600 italic">No gear assigned</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Equipment Inventory */}
        {activeTab === 'equipment' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Studio Cameras, Lenses, Gimbals, Drones, Lighting & Audio
              </span>
              <button
                type="button"
                onClick={() => setIsAddingEquip(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Equipment</span>
              </button>
            </div>

            {isAddingEquip && (
              <form onSubmit={handleAddEquipment} className="p-4 bg-slate-950 border border-amber-500/30 rounded-2xl space-y-3 text-xs">
                <div className="font-semibold text-amber-300">New Equipment Item</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Equipment Name (e.g. Sony FX3 Body)"
                    value={newEquip.name}
                    onChange={(e) => setNewEquip({ ...newEquip, name: e.target.value })}
                    className="glass-input px-3 py-2 rounded-xl text-xs"
                  />
                  <select
                    value={newEquip.category}
                    onChange={(e) => setNewEquip({ ...newEquip, category: e.target.value })}
                    className="glass-input px-3 py-2 rounded-xl text-xs"
                  >
                    <option value="Camera">Camera</option>
                    <option value="Lens">Lens</option>
                    <option value="Gimbal">Gimbal / Stabilizer</option>
                    <option value="Drone">Drone</option>
                    <option value="Lighting">Lighting</option>
                    <option value="Audio">Audio</option>
                    <option value="Accessories">Accessories</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Serial / Tag # (e.g. FX3-01)"
                    value={newEquip.serialNumber}
                    onChange={(e) => setNewEquip({ ...newEquip, serialNumber: e.target.value })}
                    className="glass-input px-3 py-2 rounded-xl text-xs font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingEquip(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                  >
                    Save Equipment
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {equipment.map((item) => (
                <div key={item.id} className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-amber-500 block">
                      {item.category}
                    </span>
                    <span className="font-semibold text-slate-200 text-xs block mt-0.5">
                      {item.name}
                    </span>
                    {item.serialNumber && (
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                        SN: {item.serialNumber}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteEquipment(item.id)}
                    className="p-1 rounded-lg text-slate-500 hover:text-rose-400 transition-colors"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Crew Roster */}
        {activeTab === 'crew' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Cinematographers, Photographers, Drone Operators, Editors, Assistants
              </span>
              <button
                type="button"
                onClick={() => setIsAddingCrew(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Crew Member</span>
              </button>
            </div>

            {isAddingCrew && (
              <form onSubmit={handleAddCrew} className="p-4 bg-slate-950 border border-amber-500/30 rounded-2xl space-y-3 text-xs">
                <div className="font-semibold text-amber-300">New Crew Member</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Crew Name (e.g. Rahul Sharma)"
                    value={newCrew.name}
                    onChange={(e) => setNewCrew({ ...newCrew, name: e.target.value })}
                    className="glass-input px-3 py-2 rounded-xl text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Role (e.g. Lead Cinematographer)"
                    value={newCrew.role}
                    onChange={(e) => setNewCrew({ ...newCrew, role: e.target.value })}
                    className="glass-input px-3 py-2 rounded-xl text-xs"
                  />
                  <input
                    type="tel"
                    placeholder="Phone (e.g. +91 98765 43210)"
                    value={newCrew.phone}
                    onChange={(e) => setNewCrew({ ...newCrew, phone: e.target.value })}
                    className="glass-input px-3 py-2 rounded-xl text-xs font-mono"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="email"
                    placeholder="Email address"
                    value={newCrew.email}
                    onChange={(e) => setNewCrew({ ...newCrew, email: e.target.value })}
                    className="glass-input px-3 py-2 rounded-xl text-xs"
                  />
                  <input
                    type="number"
                    placeholder="Standard Daily Rate (₹)"
                    value={newCrew.dailyRate}
                    onChange={(e) => setNewCrew({ ...newCrew, dailyRate: e.target.value })}
                    className="glass-input px-3 py-2 rounded-xl text-xs font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingCrew(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                  >
                    Save Crew Member
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {crew.map((member) => (
                <div key={member.id} className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-amber-500 block">
                      {member.role}
                    </span>
                    <span className="font-semibold text-slate-200 text-xs block mt-0.5">
                      {member.name}
                    </span>
                    {member.phone && (
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                        {member.phone}
                      </span>
                    )}
                    {member.dailyRate > 0 && (
                      <span className="text-[10px] text-emerald-400 font-mono font-medium block mt-0.5">
                        Day Rate: {formatCurrency(member.dailyRate, sym)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteCrew(member.id)}
                    className="p-1 rounded-lg text-slate-500 hover:text-rose-400 transition-colors"
                    title="Remove member"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-500">
          <span>DR FILMS Studio Resource Management</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
