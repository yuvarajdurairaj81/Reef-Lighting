import { useState } from 'react';
import { Cpu, Pencil, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import type { Device, Tank } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CHANNELS } from '../domain/channels';
import { useAsync } from '../hooks/useAsync';
import { OnboardingWizard } from '../components/OnboardingWizard';
import { Banner, Button, EmptyState, Input, Modal, PageHeader, SimulatedBadge, Spinner, StatusBadge, timeAgo } from '../components/ui';

interface Channel { channelKey: string; label: string; maxWattage: number }

export function DevicesPage() {
  const { can, activeOrg } = useAuth();
  const devices = useAsync(() => api<{ devices: Device[] }>('/devices').then((r) => r.devices), [activeOrg?.id]);
  const tanks = useAsync(() => api<{ tanks: Tank[] }>('/tanks').then((r) => r.tanks), [activeOrg?.id]);
  const [wizard, setWizard] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [wattDevice, setWattDevice] = useState<{ device: Device; channels: Channel[] } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async (d: Device) => {
    setBusyId(d.id);
    try {
      const r = await api<{ error?: string }>(`/devices/${d.id}/refresh`, { method: 'POST' });
      if (r.error) setError(r.error);
      await devices.reload();
    } catch (e) { setError(errorMessage(e)); } finally { setBusyId(null); }
  };

  const remove = async (d: Device) => {
    if (!confirm(`Remove "${d.name}" from your account? The light keeps running its stored profile.`)) return;
    try { await api(`/devices/${d.id}`, { method: 'DELETE' }); await Promise.all([devices.reload(), tanks.reload()]); setNotice(`${d.name} removed.`); } catch (e) { setError(errorMessage(e)); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api(`/devices/${editing.id}`, { method: 'PATCH', json: { name: editing.name, tankId: editing.tank?.id ?? null } });
      setEditing(null); await Promise.all([devices.reload(), tanks.reload()]);
    } catch (e) { setError(errorMessage(e)); }
  };

  const openWattage = async (d: Device) => {
    const r = await api<{ device: { channels: Channel[] } }>(`/devices/${d.id}`);
    setWattDevice({ device: d, channels: [...r.device.channels].sort((a, b) => CHANNELS.findIndex((c) => c.key === a.channelKey) - CHANNELS.findIndex((c) => c.key === b.channelKey)) });
  };

  const saveWattage = async () => {
    if (!wattDevice) return;
    try {
      await api(`/devices/${wattDevice.device.id}/wattage`, { method: 'PUT', json: Object.fromEntries(wattDevice.channels.map((c) => [c.channelKey, Number(c.maxWattage)])) });
      setWattDevice(null); await devices.reload(); setNotice('Channel wattage updated.');
    } catch (e) { setError(errorMessage(e)); }
  };

  return (
    <>
      <PageHeader title="Devices" subtitle="Reef LED controllers registered to your account"
        actions={can('manage') && <Button onClick={() => setWizard(true)}><Plus className="h-4 w-4" /> Add controller</Button>} />
      {error && <Banner kind="error" onClose={() => setError(null)}>{error}</Banner>}
      {notice && <Banner kind="success" onClose={() => setNotice(null)}>{notice}</Banner>}

      {devices.loading && !devices.data ? <Spinner /> : !devices.data?.length ? (
        <EmptyState icon={<Cpu className="h-10 w-10" />} title="No controllers yet" action={can('manage') && <Button onClick={() => setWizard(true)}>Add your first controller</Button>}>
          Pair a controller over Bluetooth, connect it to Wi-Fi, and assign it to a tank.
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-abyss-600">
              <tr><th className="p-3">Controller</th><th className="p-3">Tank</th><th className="p-3">Status</th><th className="p-3">Sync</th><th className="p-3">Firmware</th><th className="p-3">Last communication</th><th className="p-3">Max W</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-abyss-700">
              {devices.data.map((d) => (
                <tr key={d.id}>
                  <td className="p-3"><p className="font-medium">{d.name} {d.isSimulated && <SimulatedBadge />}</p><p className="font-mono text-xs text-slate-500">{d.hardwareId}</p></td>
                  <td className="p-3">{d.tank?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
                  <td className="p-3"><StatusBadge status={d.status} /></td>
                  <td className="p-3"><StatusBadge status={d.syncStatus} /></td>
                  <td className="p-3 font-mono text-xs">{d.firmwareVersion ?? '—'}</td>
                  <td className="p-3">{timeAgo(d.lastSeenAt)}</td>
                  <td className="p-3 tabular-nums">{d.maxWatts}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <button aria-label={`Refresh ${d.name}`} title="Refresh status" onClick={() => refresh(d)} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-abyss-700"><RefreshCw className={busyId === d.id ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /></button>
                      {can('manage') && <>
                        <button aria-label={`Edit ${d.name}`} title="Rename / assign" onClick={() => setEditing({ ...d })} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-abyss-700"><Pencil className="h-4 w-4" /></button>
                        <button aria-label={`Wattage for ${d.name}`} title="Channel wattage" onClick={() => openWattage(d)} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-abyss-700"><Zap className="h-4 w-4" /></button>
                        <button aria-label={`Remove ${d.name}`} title="Remove" onClick={() => remove(d)} className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <OnboardingWizard open={wizard} onClose={() => setWizard(false)} tanks={tanks.data ?? []} onDone={() => { void devices.reload(); void tanks.reload(); }} />

      <Modal open={!!editing} title="Edit controller" onClose={() => setEditing(null)} footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={saveEdit}>Save</Button></>}>
        {editing && (
          <div className="space-y-4">
            <Input label="Name" name="editName" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <div>
              <label className="label" htmlFor="editTank">Tank</label>
              <select id="editTank" className="input" value={editing.tank?.id ?? ''} onChange={(e) => setEditing({ ...editing, tank: e.target.value ? { id: e.target.value, name: '' } : null })}>
                <option value="">Unassigned</option>
                {tanks.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!wattDevice} title="Maximum wattage per channel" onClose={() => setWattDevice(null)} footer={<><Button variant="secondary" onClick={() => setWattDevice(null)}>Cancel</Button><Button onClick={saveWattage}>Save</Button></>}>
        {wattDevice && (
          <div className="grid grid-cols-2 gap-3">
            {wattDevice.channels.map((c, i) => (
              <Input key={c.channelKey} label={c.label} name={`w-${c.channelKey}`} type="number" min={0} max={500} step={0.5} value={c.maxWattage}
                onChange={(e) => setWattDevice({ ...wattDevice, channels: wattDevice.channels.map((x, j) => (j === i ? { ...x, maxWattage: Number(e.target.value) } : x)) })} />
            ))}
            <p className="col-span-2 text-sm text-slate-500">Total maximum: <strong>{wattDevice.channels.reduce((s, c) => s + Number(c.maxWattage || 0), 0)} W</strong></p>
          </div>
        )}
      </Modal>
    </>
  );
}
