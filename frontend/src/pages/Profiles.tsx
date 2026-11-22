import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Share2, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import type { Profile } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CHANNELS, coralLabel } from '../domain/channels';
import { useAsync } from '../hooks/useAsync';
import { Badge, Banner, Button, Card, Input, Modal, PageHeader, Spinner } from '../components/ui';

export function ProfilesPage() {
  const { can, activeOrg } = useAuth();
  const { data, loading, reload } = useAsync(() => api<{ profiles: Profile[] }>('/profiles').then((r) => r.profiles), [activeOrg?.id]);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [sharing, setSharing] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); await reload(); setNotice({ kind: 'success', text: ok }); } catch (e) { setNotice({ kind: 'error', text: errorMessage(e) }); }
  };

  if (loading && !data) return <Spinner />;
  return (
    <>
      <PageHeader title="Lighting Profiles" subtitle="Built-in presets and your custom profiles. Create new ones from Lighting Configuration → Save As New Profile." />
      {notice && <Banner kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Banner>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((p) => (
          <Card key={p.id} title={<span className="flex items-center gap-2">{p.name} {p.isBuiltIn ? <Badge tone="blue">Preset</Badge> : p.visibility === 'SHARED' ? <Badge tone="purple">Shared</Badge> : null}</span>}>
            <p className="mb-3 text-sm text-slate-500">{p.description ?? coralLabel(p.coralCategory)}</p>
            <div className="mb-3 flex h-16 items-end gap-1" aria-label={`${p.name} channel intensities`}>
              {CHANNELS.map((c) => (
                <div key={c.key} className="flex-1 rounded-t" title={`${c.label}: ${p.intensities[c.key]}%`} style={{ height: `${Math.max(p.intensities[c.key], 2)}%`, background: c.color }} />
              ))}
            </div>
            <p className="text-xs text-slate-500">{coralLabel(p.coralCategory)} · v{p.currentVersion} · ramp {p.rampUpMinutes}/{p.rampDownMinutes} min · {p.assignedTankCount} tank(s)</p>
            {can('apply') && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => act(() => api(`/profiles/${p.id}/duplicate`, { method: 'POST', json: {} }), `Duplicated "${p.name}"`)}><Copy className="h-4 w-4" /> Duplicate</Button>
                {!p.isBuiltIn && <Button variant="secondary" onClick={() => setSharing(p)}><Share2 className="h-4 w-4" /> Share</Button>}
                {!p.isBuiltIn && p.assignedTankCount === 0 && <Button variant="ghost" onClick={() => confirm(`Delete "${p.name}"?`) && act(() => api(`/profiles/${p.id}`, { method: 'DELETE' }), 'Profile deleted')}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            )}
          </Card>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-500">To edit a profile's channels, open <Link to="/lighting" className="text-reef-600 hover:underline">Lighting Configuration</Link>, select it and use <em>Update profile</em>.</p>

      <Modal open={!!sharing} title={`Share "${sharing?.name}"`} onClose={() => setSharing(null)}
        footer={<><Button variant="secondary" onClick={() => setSharing(null)}>Cancel</Button><Button onClick={() => sharing && act(() => api(`/profiles/${sharing.id}/share`, { method: 'POST', json: { email } }), 'If that user exists, the profile is now shared with them (read-only).').then(() => { setSharing(null); setEmail(''); })}>Share</Button></>}>
        <Input label="Recipient email" name="shareEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="They get a read-only copy via cloud sync and can duplicate it." />
      </Modal>
    </>
  );
}
