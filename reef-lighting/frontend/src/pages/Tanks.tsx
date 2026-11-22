import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Fish, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import type { Tank } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CORAL_CATEGORIES, coralLabel } from '../domain/channels';
import { useAsync } from '../hooks/useAsync';
import { Badge, Banner, Button, Card, Input, Modal, PageHeader, SimulatedBadge, Spinner, StatusBadge } from '../components/ui';

interface Site { id: string; name: string; timezone: string; _count: { tanks: number } }

export function TanksPage() {
  const { isEnterprise, can, reload: reloadMe, activeOrg } = useAuth();
  const tanks = useAsync(() => api<{ tanks: Tank[] }>('/tanks').then((r) => r.tanks), [activeOrg?.id]);
  const sites = useAsync(() => api<{ sites: Site[] }>('/sites').then((r) => r.sites), [activeOrg?.id]);
  const [open, setOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [form, setForm] = useState({ name: '', coralCategory: 'MIXED_REEF', volumeLiters: '', siteId: '' });
  const [siteForm, setSiteForm] = useState({ name: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  const [error, setError] = useState<string | null>(null);

  const createTank = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/tanks', { method: 'POST', json: { name: form.name, coralCategory: form.coralCategory, volumeLiters: form.volumeLiters ? Number(form.volumeLiters) : undefined, siteId: form.siteId || undefined } });
      setOpen(false); setForm({ name: '', coralCategory: 'MIXED_REEF', volumeLiters: '', siteId: '' });
      await Promise.all([tanks.reload(), sites.reload(), reloadMe()]);
    } catch (err) { setError(errorMessage(err)); }
  };

  const createSite = async (e: FormEvent) => {
    e.preventDefault();
    try { await api('/sites', { method: 'POST', json: siteForm }); setSiteOpen(false); await sites.reload(); } catch (err) { setError(errorMessage(err)); }
  };

  const remove = async (t: Tank) => {
    if (!confirm(`Delete "${t.name}"? Its controllers will be unassigned, not removed.`)) return;
    try { await api(`/tanks/${t.id}`, { method: 'DELETE' }); await Promise.all([tanks.reload(), reloadMe()]); } catch (err) { setError(errorMessage(err)); }
  };

  return (
    <>
      <PageHeader
        title="My Tanks"
        subtitle={isEnterprise ? 'Tanks grouped by site' : 'Add a tank for each aquarium you light'}
        actions={can('manage') && <>
          {isEnterprise && <Button variant="secondary" onClick={() => setSiteOpen(true)}><Plus className="h-4 w-4" /> Add site</Button>}
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add tank</Button>
        </>}
      />
      {error && <Banner kind="error" onClose={() => setError(null)}>{error}</Banner>}
      {tanks.loading && !tanks.data ? <Spinner /> : (
        <div className="space-y-6">
          {(isEnterprise ? sites.data ?? [] : [{ id: '', name: '', timezone: '', _count: { tanks: 0 } }]).map((site) => {
            const list = (tanks.data ?? []).filter((t) => !site.id || t.site.id === site.id);
            return (
              <div key={site.id || 'all'}>
                {isEnterprise && <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{site.name} <span className="font-normal normal-case">· {site.timezone}</span></h2>}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((t) => (
                    <Card key={t.id} title={<span className="flex items-center gap-2"><Fish className="h-4 w-4 text-reef-500" />{t.name}</span>}
                      actions={can('manage') && <button aria-label={`Delete ${t.name}`} onClick={() => remove(t)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}>
                      <div className="space-y-2 text-sm">
                        <p><span className="text-slate-500">Coral:</span> {coralLabel(t.coralCategory)}{t.volumeLiters ? ` · ${t.volumeLiters} L` : ''}</p>
                        <p><span className="text-slate-500">Profile:</span> {t.assignment?.profile.name ?? '—'}</p>
                        <div className="flex flex-wrap gap-1">
                          {t.devices.length === 0 ? <Badge>No controller</Badge> : t.devices.map((d) => (
                            <span key={d.id} className="flex items-center gap-1"><StatusBadge status={d.status} /><span className="text-xs">{d.name}</span>{d.isSimulated && <SimulatedBadge />}</span>
                          ))}
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Link to={`/?tankId=${t.id}`}><Button variant="secondary">Dashboard</Button></Link>
                          <Link to={`/lighting?tankId=${t.id}`}><Button variant="secondary">Lighting</Button></Link>
                        </div>
                      </div>
                    </Card>
                  ))}
                  {list.length === 0 && <p className="text-sm text-slate-500">No tanks in this site yet.</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} title="Add tank" onClose={() => setOpen(false)}>
        <form onSubmit={createTank} className="space-y-4">
          <Input label="Tank name" name="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div>
            <label className="label" htmlFor="coral">Coral type</label>
            <select id="coral" className="input" value={form.coralCategory} onChange={(e) => setForm({ ...form, coralCategory: e.target.value })}>
              {CORAL_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <Input label="Volume (liters, optional)" name="volume" type="number" min={1} value={form.volumeLiters} onChange={(e) => setForm({ ...form, volumeLiters: e.target.value })} />
          {isEnterprise && (
            <div>
              <label className="label" htmlFor="site">Site</label>
              <select id="site" className="input" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                <option value="">Default site</option>
                {sites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <p className="text-xs text-slate-500">New tanks start on the AB+ profile. You can change it in Lighting Configuration.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Create tank</Button></div>
        </form>
      </Modal>

      <Modal open={siteOpen} title="Add site" onClose={() => setSiteOpen(false)}>
        <form onSubmit={createSite} className="space-y-4">
          <Input label="Site name" name="siteName" required value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} />
          <Input label="Time zone (IANA)" name="tz" required value={siteForm.timezone} onChange={(e) => setSiteForm({ ...siteForm, timezone: e.target.value })} hint="Used for schedules, e.g. America/Chicago" />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setSiteOpen(false)}>Cancel</Button><Button type="submit">Create site</Button></div>
        </form>
      </Modal>
    </>
  );
}
