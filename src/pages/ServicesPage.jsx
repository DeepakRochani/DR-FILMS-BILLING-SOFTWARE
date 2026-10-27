import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Edit2, Trash2, Search, Filter, Layers, Film, Camera, Video, Image, Printer, RotateCcw, RefreshCw, CheckCircle2 } from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency, UNIT_LABELS, UNIT_SHORT, CATEGORY_LABELS, CATEGORY_COLORS } from '../utils/formatters';
import { Modal } from '../components/Modal';
import { DEFAULT_SERVICES } from '../db/seedData';
import { updateServiceAndCascade, reconcileAllBillsWithCatalog } from '../utils/catalogSync';
import { scheduleAutoSync } from '../utils/googleSheetsSync';

const CATEGORY_ICONS = {
  video_editing: Film,
  photo_editing: Image,
  photography: Camera,
  videography: Video,
  printing: Printer,
  other: Layers
};

export function ServicesPage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: 'video_editing',
    unit: 'per_video',
    rate: '',
    description: ''
  });

  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const sym = settings?.currencySymbol || '₹';

  // Live Query from IndexedDB
  const services = useLiveQuery(() => db.services.toArray(), []) || [];

  // Filter services
  const filteredServices = services.filter(service => {
    const matchesCategory = selectedCategory === 'all' || service.category === selectedCategory;
    const matchesSearch = service.name.toLowerCase().includes(search.toLowerCase()) ||
      (service.description && service.description.toLowerCase().includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const openAddModal = () => {
    setEditingService(null);
    setFormData({
      name: '',
      category: 'video_editing',
      unit: 'per_video',
      rate: '',
      description: '',
      updateDrafts: false
    });
    setIsModalOpen(true);
  };

  const openEditModal = (service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      category: service.category,
      unit: service.unit,
      rate: service.rate,
      description: service.description || '',
      updateDrafts: false
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.rate === '') return;

    const payload = {
      name: formData.name.trim(),
      category: formData.category,
      unit: formData.unit,
      rate: Number(formData.rate) || 0,
      description: formData.description.trim()
    };

    if (editingService) {
      const res = await updateServiceAndCascade(editingService.id, payload, editingService.name, { updateDrafts: Boolean(formData.updateDrafts) });
      if (res.updatedCount > 0) {
        showToast(`Updated "${payload.name}" and refreshed ${res.updatedCount} draft bill(s) (${res.updatedInvoiceNumbers.join(', ')})!`);
      } else {
        showToast(`Updated "${payload.name}" in services catalog.`);
      }
    } else {
      await db.services.add({
        ...payload,
        createdAt: new Date().toISOString()
      });
      scheduleAutoSync(500);
      showToast(`Added "${payload.name}" to services catalog.`);
    }

    setIsModalOpen(false);
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to remove "${name}" from your services catalog?`)) {
      await db.services.delete(id);
      scheduleAutoSync(500);
    }
  };

  const handleRestoreDefaults = async () => {
    if (window.confirm('Restore default services catalog? Existing custom services will remain.')) {
      for (const def of DEFAULT_SERVICES) {
        const exists = services.find(s => s.name === def.name);
        if (!exists) {
          await db.services.add({ ...def, createdAt: new Date().toISOString() });
        }
      }
      scheduleAutoSync(500);
    }
  };

  const handleSyncAllBills = async () => {
    try {
      const res = await reconcileAllBillsWithCatalog({ updateDrafts: true });
      if (res.updatedCount > 0) {
        showToast(`Refreshed ${res.updatedCount} draft bill(s) with catalog (${res.updatedInvoiceNumbers.join(', ')})!`);
      } else {
        showToast('All draft bills are already aligned with your catalog (sent & paid bills remain locked).');
      }
    } catch (e) {
      console.warn('Sync all bills error:', e);
    }
  };

  const categories = [
    { id: 'all', label: 'All Services' },
    { id: 'video_editing', label: 'Video Editing' },
    { id: 'photography', label: 'Photography' },
    { id: 'videography', label: 'Videography' },
    { id: 'photo_editing', label: 'Photo Editing' },
    { id: 'printing', label: 'Printing' },
    { id: 'other', label: 'Other' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-xl font-semibold shadow-xl shadow-amber-500/20 text-xs flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-slate-950" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-amber-400" />
            <span>Services & Rates Catalog</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Manage your creative services, standard rates, and billing units.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncAllBills}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 text-xs font-medium py-2.5 px-3 rounded-xl border border-slate-700 transition-colors"
            title="Refresh all bills with current catalog service names and rates"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            <span>Sync All Bills</span>
          </button>

          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium py-2.5 px-3 rounded-xl border border-slate-700 transition-colors"
            title="Restore Default Catalog Items"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Add Missing Defaults</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm py-2.5 px-4 rounded-xl shadow-lg shadow-amber-500/15 transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add Service</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search services by title or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm placeholder:text-slate-500"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`text-xs px-3.5 py-1.5 rounded-xl whitespace-nowrap transition-all font-medium border ${
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm font-semibold'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Services Grid */}
      {filteredServices.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6">
          <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-slate-300">No services found</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search ? 'Try adjusting your search filter or category.' : 'Start by adding your first creative service or restoring defaults.'}
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="mt-4 inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold px-4 py-2 rounded-xl border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Service</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredServices.map((service) => {
            const Icon = CATEGORY_ICONS[service.category] || Layers;
            const categoryBadgeColor = CATEGORY_COLORS[service.category] || CATEGORY_COLORS.other;

            return (
              <div
                key={service.id}
                className="glass-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-slate-700 transition-all group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-amber-400 shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${categoryBadgeColor}`}>
                        {CATEGORY_LABELS[service.category] || service.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => openEditModal(service)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                        title="Edit Service"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(service.id, service.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        title="Delete Service"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="font-semibold text-slate-100 text-base leading-snug">
                    {service.name}
                  </h3>

                  {service.description && (
                    <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                      {service.description}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-baseline justify-between">
                  <div className="flex items-baseline gap-1">
                    <span className="font-display font-bold text-lg text-amber-400">
                      {formatCurrency(service.rate, sym)}
                    </span>
                    <span className="text-xs font-medium text-slate-400">
                      {UNIT_SHORT[service.unit] || service.unit}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-500 font-mono">
                    {UNIT_LABELS[service.unit] || service.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Service Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingService ? 'Edit Service' : 'Add New Creative Service'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Service Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 4K Drone Videography or Color Grading"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full glass-input px-3 py-2 rounded-xl text-sm"
              >
                <option value="video_editing">Video Editing</option>
                <option value="photography">Photography</option>
                <option value="videography">Videography</option>
                <option value="photo_editing">Photo Editing</option>
                <option value="printing">Printing</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Billing Unit
              </label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full glass-input px-3 py-2 rounded-xl text-sm"
              >
                <option value="per_hour">per hour</option>
                <option value="per_day">per day</option>
                <option value="per_photo">per photo</option>
                <option value="per_video">per video</option>
                <option value="per_page">per page</option>
                <option value="per_piece">per piece</option>
                <option value="fixed">fixed / flat rate</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Rate ({sym}) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                {sym}
              </span>
              <input
                type="number"
                min="0"
                step="any"
                required
                placeholder="0.00"
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                className="w-full glass-input pl-8 pr-3.5 py-2 rounded-xl text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Description / Deliverables (Optional)
            </label>
            <textarea
              rows="3"
              placeholder="e.g. Includes color correction, sound design, and 2 rounds of review."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full glass-input px-3.5 py-2 rounded-xl text-sm resize-none"
            />
          </div>

          {editingService && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2.5">
              <p className="text-xs text-amber-200 leading-relaxed font-medium">
                Existing sent bills will not change. Only new bills use the new rate.
              </p>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(formData.updateDrafts)}
                  onChange={(e) => setFormData({ ...formData, updateDrafts: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/20"
                />
                <span className="text-xs text-slate-300">
                  Also update draft bills
                </span>
              </label>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition-transform active:scale-95"
            >
              {editingService ? 'Save Changes' : 'Add Service'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
