import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Edit2, Trash2, Percent, Tag, ArrowUpRight, ArrowDownRight, RotateCcw, RefreshCw, CheckCircle2 } from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency } from '../utils/formatters';
import { Modal } from '../components/Modal';
import { DEFAULT_CHARGES } from '../db/seedData';
import { updateChargeAndCascade, reconcileAllBillsWithCatalog } from '../utils/catalogSync';
import { scheduleAutoSync } from '../utils/googleSheetsSync';

export function ChargesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  const [formData, setFormData] = useState({
    name: '',
    type: 'fixed',
    rate: '',
    nature: 'charge',
    description: ''
  });

  const settings = useLiveQuery(() => db.settings.get('business_profile'));
  const sym = settings?.currencySymbol || '₹';

  const charges = useLiveQuery(() => db.customCharges.toArray(), []) || [];

  const openAddModal = () => {
    setEditingCharge(null);
    setFormData({
      name: '',
      type: 'fixed',
      rate: '',
      nature: 'charge',
      description: '',
      updateDrafts: false
    });
    setIsModalOpen(true);
  };

  const openEditModal = (charge) => {
    setEditingCharge(charge);
    setFormData({
      name: charge.name,
      type: charge.type,
      rate: charge.rate,
      nature: charge.nature || 'charge',
      description: charge.description || '',
      updateDrafts: false
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.rate === '') return;

    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      rate: Number(formData.rate) || 0,
      nature: formData.nature,
      description: formData.description.trim()
    };

    if (editingCharge) {
      const res = await updateChargeAndCascade(editingCharge.id, payload, editingCharge.name, { updateDrafts: Boolean(formData.updateDrafts) });
      if (res.updatedCount > 0) {
        showToast(`Updated "${payload.name}" and refreshed ${res.updatedCount} draft bill(s) (${res.updatedInvoiceNumbers.join(', ')})!`);
      } else {
        showToast(`Updated "${payload.name}" in reusable charges.`);
      }
    } else {
      await db.customCharges.add(payload);
      scheduleAutoSync(500);
      showToast(`Added "${payload.name}" to reusable charges.`);
    }

    setIsModalOpen(false);
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Delete reusable charge "${name}"?`)) {
      await db.customCharges.delete(id);
      scheduleAutoSync(500);
    }
  };

  const handleRestoreDefaults = async () => {
    if (window.confirm('Restore default reusable charges?')) {
      for (const def of DEFAULT_CHARGES) {
        const exists = charges.find(c => c.name === def.name);
        if (!exists) {
          await db.customCharges.add(def);
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
        showToast('All existing draft bills are already aligned with your catalog.');
      }
    } catch (e) {
      console.warn('Sync all bills error:', e);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-xl font-semibold shadow-xl shadow-amber-500/20 text-xs flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-slate-950" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2.5">
            <Percent className="w-6 h-6 text-amber-400" />
            <span>Custom Charges & Discounts</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Configure reusable fees (Rush, Travel, Equipment) and client discounts to add to any bill.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncAllBills}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 text-xs font-medium py-2.5 px-3 rounded-xl border border-slate-700 transition-colors"
            title="Refresh all bills with current reusable charges and discounts"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            <span>Sync All Bills</span>
          </button>

          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium py-2.5 px-3 rounded-xl border border-slate-700 transition-colors"
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
            <span>Add New Charge</span>
          </button>
        </div>
      </div>

      {/* Charges Cards Grid */}
      {charges.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6">
          <Tag className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-slate-300">No custom charges configured</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Create charges like Rush Delivery, Travel Allowance, Extra Revisions, or Discounts.
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="mt-4 inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold px-4 py-2 rounded-xl border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Charge</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {charges.map((charge) => {
            const isDiscount = charge.nature === 'discount';
            const isPercentage = charge.type === 'percentage';

            return (
              <div
                key={charge.id}
                className="glass-card rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                        isDiscount
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}
                    >
                      {isDiscount ? (
                        <>
                          <ArrowDownRight className="w-3 h-3 text-emerald-400" />
                          <span>Discount (-)</span>
                        </>
                      ) : (
                        <>
                          <ArrowUpRight className="w-3 h-3 text-amber-400" />
                          <span>Charge (+)</span>
                        </>
                      )}
                    </span>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => openEditModal(charge)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                        title="Edit Charge"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(charge.id, charge.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        title="Delete Charge"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="font-semibold text-slate-100 text-base leading-snug">
                    {charge.name}
                  </h3>

                  {charge.description && (
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      {charge.description}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display font-bold text-lg text-slate-100">
                      {isPercentage ? `${charge.rate}%` : formatCurrency(charge.rate, sym)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {isPercentage ? 'of subtotal' : 'flat amount'}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono uppercase text-slate-500">
                    {charge.type}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Charge Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCharge ? 'Edit Reusable Charge' : 'Add Reusable Charge or Discount'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Charge Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Rush Fee, Travel Logistics, Equipment Rental"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Type
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'fixed' })}
                  className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    formData.type === 'fixed'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Flat Amount
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'percentage' })}
                  className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    formData.type === 'percentage'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Percent (%)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Nature
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, nature: 'charge' })}
                  className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    formData.nature === 'charge'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Charge (+)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, nature: 'discount' })}
                  className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    formData.nature === 'discount'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Discount (-)
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Rate Value {formData.type === 'percentage' ? '(%)' : `(${sym})`} *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                {formData.type === 'percentage' ? '%' : sym}
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
              Description (Optional)
            </label>
            <textarea
              rows="2"
              placeholder="e.g. Standard overnight rush fee for urgent projects."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full glass-input px-3.5 py-2 rounded-xl text-sm resize-none"
            />
          </div>

          {editingCharge && (
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
              {editingCharge ? 'Save Changes' : 'Create Charge'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
