import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, RotateCcw, Save, Send, Sparkles, Upload } from 'lucide-react';
import { ApiError, api, errorMessage } from '../api/client';
import type { Profile, Tank, TankLighting } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CHANNELS, CHANNEL_KEYS, CORAL_CATEGORIES, CoralCategory, Intensities, RECOMMENDED_PRESET, estimatePower, validateIntensities } from '../domain/channels';
import { useAsync } from '../hooks/useAsync';
import { ChannelSlider } from '../components/ChannelSlider';
import { PowerPanel } from '../components/PowerPanel';
import { SpectrumPreview } from '../components/SpectrumPreview';
import { Badge, Banner, Button, Card, Input, Modal, PageHeader, SimulatedBadge, Spinner, StatusBadge, timeAgo } from '../components/ui';

type Notice = { kind: 'success' | 'error' | 'warning' | 'info'; text: string } | null;

export function LightingConfigPage() {
  const { isSingleTankHome, can, activeOrg } = useAuth();
  const [params, setParams] = useSearchParams();
  const tanks = useAsync(() => api<{ tanks: Tank[] }>('/tanks').then((r) => r.tanks), [activeOrg?.id]);
  const profiles = useAsync(() => api<{ profiles: Profile[] }>('/profiles').then((r) => r.profiles), [activeOrg?.id]);
  const tankId = params.get('tankId') ?? tanks.data?.[0]?.id ?? '';

  const [lighting, setLighting] = useState<TankLighting | null>(null);
  const [values, setValues] = useState<Intensities | null>(null);
  const [profileId, setProfileId] = useState('');
  const [coral, setCoral] = useState<CoralCategory | ''>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [conflict, setConflict] = useState<{ tanks: { id: string; name: string }[] } | null>(null);

  const load = async (id: string) => {
    if (!id) return;
    const l = await api<TankLighting>(`/tanks/${id}/lighting`);
    setLighting(l);
    setValues(l.effective);
    setProfileId(l.profile.id);
    setCoral(l.tank.coralCategory as CoralCategory);
  };
  useEffect(() => { load(tankId).catch((e) => setNotice({ kind: 'error', text: errorMessage(e) })); }, [tankId]);

  const selectedProfile = profiles.data?.find((p) => p.id === profileId);
  const device = lighting?.devices[0];
  const errors = values ? validateIntensities(values) : [];
  const dirty = !!lighting && !!values && (profileId !== lighting.profile.id || CHANNEL_KEYS.some((k) => values[k] !== lighting.effective[k]));
  const baseline = selectedProfile?.intensities ?? lighting?.baseIntensities;
  const power = useMemo(() => (values ? estimatePower(values, device?.wattages) : null), [values, device]);
  const editableProfile = selectedProfile && !selectedProfile.isBuiltIn && selectedProfile.visibility !== 'SYSTEM';

  if (tanks.loading && !tanks.data) return <Spinner />;
  if (!tanks.data?.length) return <Banner kind="info">Create a tank first on the My Tanks page.</Banner>;
  if (!lighting || !values) return <Spinner label="Loading lighting configuration…" />;

  const pickProfile = (id: string) => {
    const p = profiles.data?.find((x) => x.id === id);
    setProfileId(id);
    if (p) setValues({ ...p.intensities });
  };

  const pickCoral = (c: CoralCategory) => {
    setCoral(c);
    const rec = profiles.data?.find((p) => p.presetKey === RECOMMENDED_PRESET[c]);
    if (rec) {
      pickProfile(rec.id);
      setNotice({ kind: 'info', text: `Loaded the recommended "${rec.name}" preset for ${CORAL_CATEGORIES.find((x) => x.key === c)?.label}. Adjust as needed, then Save or Apply.` });
    }
  };

  const guard = () => {
    if (errors.length) { setNotice({ kind: 'error', text: `Fix before continuing: ${errors[0]}` }); return false; }
    return true;
  };

  const save = async (quiet = false) => {
    if (!guard()) return false;
    setBusy('save');
    try {
      const l = await api<TankLighting>(`/tanks/${tankId}/lighting`, { method: 'PUT', json: { profileId, intensities: values } });
      if (coral && coral !== lighting.tank.coralCategory) await api(`/tanks/${tankId}`, { method: 'PATCH', json: { coralCategory: coral } });
      setLighting(l); setValues(l.effective);
      if (!quiet) setNotice({ kind: 'success', text: 'Configuration saved. Press Apply to send it to the controller.' });
      return true;
    } catch (e) { setNotice({ kind: 'error', text: errorMessage(e) }); return false; } finally { setBusy(null); }
  };

  const apply = async () => {
    if (!guard()) return;
    if (dirty && !(await save(true))) return;
    setBusy('apply');
    try {
      const r = await api<TankLighting & { results: { name: string; ok: boolean; error?: string; syncStatus: string }[] }>(`/tanks/${tankId}/lighting/apply`, { method: 'POST' });
      setLighting(r); setValues(r.effective);
      const failed = r.results.filter((x) => !x.ok);
      setNotice(failed.length
        ? { kind: 'warning', text: failed.map((f) => `${f.name}: ${f.error}`).join(' · ') }
        : { kind: 'success', text: `Applied to ${r.results.length} controller(s). The profile is stored on the controller and keeps running offline.` });
    } catch (e) { setNotice({ kind: 'error', text: errorMessage(e) }); } finally { setBusy(null); }
  };

  const reset = () => { setValues({ ...lighting.effective }); setProfileId(lighting.profile.id); setCoral(lighting.tank.coralCategory as CoralCategory); setNotice({ kind: 'info', text: 'Reverted to the last saved configuration.' }); };

  const duplicate = async () => {
    setBusy('dup');
    try {
      const r = await api<{ profile: Profile }>(`/profiles/${profileId}/duplicate`, { method: 'POST', json: {} });
      await profiles.reload();
      setProfileId(r.profile.id);
      setNotice({ kind: 'success', text: `Created "${r.profile.name}". Save to use it on this tank.` });
    } catch (e) { setNotice({ kind: 'error', text: errorMessage(e) }); } finally { setBusy(null); }
  };

  const saveAsNew = async () => {
    if (!guard() || !newName.trim()) return;
    setBusy('saveas');
    try {
      const r = await api<{ profile: Profile }>('/profiles', {
        method: 'POST',
        json: { name: newName.trim(), coralCategory: coral || 'MIXED_REEF', intensities: values, rampUpMinutes: selectedProfile?.rampUpMinutes ?? 60, rampDownMinutes: selectedProfile?.rampDownMinutes ?? 60, assignToTankId: tankId },
      });
      await Promise.all([profiles.reload(), load(tankId)]);
      setProfileId(r.profile.id); setSaveAsOpen(false); setNewName('');
      setNotice({ kind: 'success', text: `Saved as "${r.profile.name}" and assigned to this tank.` });
    } catch (e) { setNotice({ kind: 'error', text: errorMessage(e) }); } finally { setBusy(null); }
  };

  /** Edit the profile itself (affects every tank that uses it). */
  const updateProfile = async (strategy?: 'UPDATE_ALL' | 'NEW_VERSION' | 'FORK') => {
    if (!guard()) return;
    setBusy('profile');
    try {
      await api(`/profiles/${profileId}`, { method: 'PUT', json: { intensities: values, strategy, tankId } });
      setConflict(null);
      await Promise.all([profiles.reload()]);
      if (strategy !== 'FORK') await api(`/tanks/${tankId}/lighting`, { method: 'PUT', json: { profileId } });
      await load(tankId);
      setNotice({ kind: 'success', text: strategy === 'FORK' ? 'Forked a copy of the profile for this tank.' : strategy === 'NEW_VERSION' ? 'New version created; other tanks stay on the previous version.' : 'Profile updated.' });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SHARED_PROFILE_CONFIRMATION') setConflict({ tanks: (e.details as { affectedTanks: { id: string; name: string }[] }).affectedTanks });
      else setNotice({ kind: 'error', text: errorMessage(e) });
    } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader
        title="Lighting Configuration"
        subtitle={<>Profile: <strong>{selectedProfile?.name ?? lighting.profile.name}</strong>{selectedProfile && ` v${selectedProfile.currentVersion}`}{lighting.pinnedVersion && ` (pinned to v${lighting.pinnedVersion})`}{dirty && <Badge tone="amber">Unsaved changes</Badge>}</>}
        actions={!isSingleTankHome && (
          <select aria-label="Select tank" className="input w-auto" value={tankId} onChange={(e) => setParams({ tankId: e.target.value })}>
            {tanks.data.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      />
      {notice && <Banner kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Banner>}
      {lighting.sharedTankCount > 1 && <Banner kind="info">This profile is shared by {lighting.sharedTankCount} tanks. <strong>Save</strong> stores your changes as overrides for this tank only; <strong>Update profile</strong> changes it for everyone (you'll be asked to confirm).</Banner>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="coral">Coral type</label>
                <select id="coral" className="input" value={coral} onChange={(e) => pickCoral(e.target.value as CoralCategory)}>
                  {CORAL_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="profile">Lighting profile</label>
                <select id="profile" className="input" value={profileId} onChange={(e) => pickProfile(e.target.value)}>
                  <optgroup label="Presets">{profiles.data?.filter((p) => p.isBuiltIn).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                  <optgroup label="My profiles">{profiles.data?.filter((p) => !p.isBuiltIn).map((p) => <option key={p.id} value={p.id}>{p.name}{p.visibility === 'SHARED' ? ' (shared)' : ''}</option>)}</optgroup>
                </select>
              </div>
            </div>
          </Card>

          <Card title="Channels" actions={<span className="text-xs text-slate-500">0–100% · 1% steps</span>}>
            <div className="grid gap-3 md:grid-cols-2">
              {CHANNELS.map((c) => (
                <ChannelSlider key={c.key} channelKey={c.key} label={c.label} color={c.color} value={values[c.key]}
                  watts={power?.perChannel[c.key]} maxWatts={device?.wattages[c.key] ?? c.defaultMaxWattage}
                  overridden={!!baseline && baseline[c.key] !== values[c.key]}
                  disabled={!can('apply')}
                  onChange={(v) => setValues((prev) => ({ ...prev!, [c.key]: v }))} />
              ))}
            </div>
            {errors.length > 0 && <p className="mt-3 text-sm text-red-600">{errors[0]}</p>}
            <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-abyss-600">
              <Button onClick={() => save()} loading={busy === 'save'} disabled={!can('apply') || !dirty}><Save className="h-4 w-4" /> Save Configuration</Button>
              <Button onClick={apply} loading={busy === 'apply'} disabled={!can('apply') || !device} title={!device ? 'Assign a controller to this tank first' : undefined}><Send className="h-4 w-4" /> Apply Configuration</Button>
              <Button variant="secondary" onClick={reset} disabled={!dirty}><RotateCcw className="h-4 w-4" /> Reset Configuration</Button>
              <Button variant="secondary" onClick={duplicate} loading={busy === 'dup'} disabled={!can('apply')}><Copy className="h-4 w-4" /> Duplicate Profile</Button>
              <Button variant="secondary" onClick={() => { setNewName(`${selectedProfile?.name ?? 'Custom'} – ${lighting.tank.name}`); setSaveAsOpen(true); }} disabled={!can('apply')}><Sparkles className="h-4 w-4" /> Save As New Profile</Button>
              {editableProfile && <Button variant="secondary" onClick={() => updateProfile()} loading={busy === 'profile'}><Upload className="h-4 w-4" /> Update profile</Button>}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Real-time preview"><SpectrumPreview intensities={values} /></Card>
          <Card title="Estimated power">{power && <PowerPanel intensities={values} wattages={device?.wattages} />}</Card>
          <Card title="Controller sync">
            {!device ? <p className="text-sm text-slate-500">No controller assigned to this tank.</p> : (
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-slate-500">Controller</dt><dd className="text-right">{device.name} {device.isSimulated && <SimulatedBadge />}</dd>
                <dt className="text-slate-500">Connection</dt><dd className="text-right"><StatusBadge status={device.status} /></dd>
                <dt className="text-slate-500">Sync status</dt><dd className="text-right"><StatusBadge status={device.syncStatus} /></dd>
                <dt className="text-slate-500">Last synced</dt><dd className="text-right">{timeAgo(device.lastSyncedAt)}</dd>
              </dl>
            )}
            <p className="mt-3 text-xs text-slate-500">Applied profiles are stored on the controller, which runs its schedule with its own clock — losing internet or Wi-Fi does not interrupt lighting.</p>
          </Card>
        </div>
      </div>

      <Modal open={saveAsOpen} title="Save as new profile" onClose={() => setSaveAsOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setSaveAsOpen(false)}>Cancel</Button><Button onClick={saveAsNew} loading={busy === 'saveas'} disabled={!newName.trim()}>Save profile</Button></>}>
        <Input label="Profile name" name="newProfile" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
        <p className="mt-2 text-sm text-slate-500">The new profile will use the current slider values and be assigned to {lighting.tank.name}.</p>
      </Modal>

      <Modal open={!!conflict} title="This profile is used by multiple tanks" onClose={() => setConflict(null)}>
        <p className="mb-3 text-sm">"{selectedProfile?.name}" is assigned to:</p>
        <ul className="mb-4 list-disc pl-5 text-sm">{conflict?.tanks.map((t) => <li key={t.id}>{t.name}</li>)}</ul>
        <div className="space-y-2">
          <Button className="w-full justify-start" onClick={() => updateProfile('UPDATE_ALL')} loading={busy === 'profile'}>Update all assigned tanks</Button>
          <Button variant="secondary" className="w-full justify-start" onClick={() => updateProfile('NEW_VERSION')}>Create a new version (only this tank moves to it)</Button>
          <Button variant="secondary" className="w-full justify-start" onClick={() => updateProfile('FORK')}>Fork a copy for {lighting.tank.name}</Button>
          <Button variant="ghost" className="w-full justify-start" onClick={() => { setConflict(null); void save(); }}>Just override this tank (keep the profile unchanged)</Button>
        </div>
      </Modal>
    </>
  );
}
