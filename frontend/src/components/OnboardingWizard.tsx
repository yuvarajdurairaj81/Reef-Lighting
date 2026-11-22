import { FormEvent, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Bluetooth, CheckCircle2, Circle, Loader2, Radar, Wifi, XCircle } from 'lucide-react';
import { api, ApiError, errorMessage } from '../api/client';
import type { Tank } from '../api/types';
import { detectWebBluetooth, BrowserBleSupport } from '../iot/bluetooth';
import { Banner, Button, Input, Modal, SimulatedBadge } from './ui';

interface Discovered { hardwareId: string; name: string; model: string; rssi: number; firmwareVersion: string; simulated: boolean }
interface Step { step: string; ok: boolean; message: string }
interface Provision { success: boolean; steps: Step[]; ipAddress?: string; firmwareVersion?: string; error?: { code: string; message: string } }

const STEP_LABELS: Record<string, string> = {
  BLUETOOTH_CHECK: 'Bluetooth enabled',
  DEVICE_AVAILABLE: 'Controller available',
  BLE_CONNECTED: 'Bluetooth paired',
  WIFI_VALIDATED: 'Wi-Fi credentials valid',
  NETWORK_JOINED: 'Joined network',
  CLOUD_REACHABLE: 'Connected to cloud',
};

type Phase = 'check' | 'scan' | 'wifi' | 'provisioning' | 'register' | 'done';

export function OnboardingWizard({ open, onClose, tanks, onDone }: { open: boolean; onClose: () => void; tanks: Tank[]; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('check');
  const [ble, setBle] = useState<{ available: boolean; simulated: boolean } | null>(null);
  const [browserBle, setBrowserBle] = useState<BrowserBleSupport | null>(null);
  const [devices, setDevices] = useState<Discovered[]>([]);
  const [selected, setSelected] = useState<Discovered | null>(null);
  const [ssid, setSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [result, setResult] = useState<Provision | null>(null);
  const [name, setName] = useState('');
  const [tankId, setTankId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase('check'); setSelected(null); setResult(null); setError(null); setSsid(''); setWifiPassword('');
    setTankId(tanks.find((t) => t.devices.length === 0)?.id ?? tanks[0]?.id ?? '');
    void detectWebBluetooth().then(setBrowserBle);
    api<{ available: boolean; simulated: boolean }>('/devices/onboarding/bluetooth').then(setBle).catch((e) => setError(errorMessage(e)));
  }, [open, tanks]);

  const scan = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ devices: Discovered[] }>('/devices/onboarding/scan', { method: 'POST' });
      setDevices(r.devices);
      setPhase('scan');
      if (!r.devices.length) setError('No controllers found. Make sure the light is powered on and in pairing mode (LED blinking blue).');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  const connect = async (d: Discovered) => {
    setBusy(true); setError(null);
    try {
      await api('/devices/onboarding/connect', { method: 'POST', json: { hardwareId: d.hardwareId } });
      setSelected(d); setName(d.name); setPhase('wifi');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  const provision = async (e: FormEvent) => {
    e.preventDefault();
    if (wifiPassword.length < 8) { setError('Wi-Fi passwords are at least 8 characters (WPA2/WPA3).'); return; }
    setBusy(true); setError(null); setPhase('provisioning'); setResult(null);
    try {
      const r = await api<Provision>('/devices/onboarding/wifi', { method: 'POST', json: { hardwareId: selected!.hardwareId, ssid, password: wifiPassword } });
      setResult(r);
      setWifiPassword(''); // never keep the Wi-Fi password around
      setPhase('register');
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        // Provisioning failure: the API returns the step trail
        setResult({ success: false, steps: [], error: { code: err.code, message: err.message } });
      }
      setError(errorMessage(err));
      setPhase('wifi');
    } finally { setBusy(false); }
  };

  const register = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/devices', { method: 'POST', json: { hardwareId: selected!.hardwareId, name, tankId: tankId || undefined, ssid } });
      setPhase('done');
      onDone();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  const steps = (['check', 'scan', 'wifi', 'register'] as const);
  const idx = { check: 0, scan: 1, wifi: 2, provisioning: 2, register: 3, done: 4 }[phase];

  return (
    <Modal open={open} title="Add a reef LED controller" onClose={onClose}>
      <ol className="mb-5 flex items-center gap-2 text-xs">
        {steps.map((s, i) => (
          <li key={s} className={clsx('flex flex-1 items-center gap-1', i <= idx ? 'text-reef-600' : 'text-slate-400')}>
            {i < idx ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            {['Bluetooth', 'Discover', 'Wi-Fi', 'Register'][i]}
          </li>
        ))}
      </ol>
      {ble?.simulated && <Banner kind="info">Onboarding uses the <strong>device simulator</strong> <SimulatedBadge />. No real Bluetooth or Wi-Fi traffic is sent. Tip: password <code>wrongpass</code> or SSID <code>fail-network</code> demo error handling.</Banner>}
      {error && <Banner kind="error" onClose={() => setError(null)}>{error}</Banner>}

      {phase === 'check' && (
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3 rounded-lg border p-3 dark:border-abyss-600">
            <Bluetooth className="h-5 w-5 text-reef-600" />
            <div className="flex-1">
              <p className="font-medium">Bluetooth</p>
              <p className="text-slate-500">{ble === null ? 'Checking…' : ble.available ? 'Available' : 'Bluetooth is off. Turn it on and try again.'}</p>
            </div>
            {ble?.available ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : ble ? <XCircle className="h-5 w-5 text-red-500" /> : <Loader2 className="h-5 w-5 animate-spin" />}
          </div>
          {browserBle && !browserBle.apiPresent && (
            <p className="text-xs text-slate-500">Note for real hardware: {browserBle.reason} Physical controllers will be onboarded from Chrome/Edge or the upcoming mobile app.</p>
          )}
          <ol className="list-decimal space-y-1 pl-5 text-slate-600 dark:text-slate-300">
            <li>Power on the controller.</li>
            <li>Hold the button for 5 seconds until the LED blinks blue (pairing mode).</li>
            <li>Keep your phone or computer within 3 m.</li>
          </ol>
          <Button className="w-full" onClick={scan} loading={busy} disabled={!ble?.available}><Radar className="h-4 w-4" /> Scan for controllers</Button>
        </div>
      )}

      {phase === 'scan' && (
        <div className="space-y-2">
          {devices.map((d) => (
            <button key={d.hardwareId} disabled={busy} onClick={() => connect(d)} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:border-reef-500 dark:border-abyss-600">
              <Bluetooth className="h-5 w-5 text-reef-600" />
              <div className="flex-1">
                <p className="font-medium">{d.name} {d.simulated && <SimulatedBadge />}</p>
                <p className="text-xs text-slate-500">{d.model} · fw {d.firmwareVersion} · {d.rssi} dBm</p>
              </div>
              <span className="text-xs text-slate-500">{d.rssi > -60 ? 'Strong' : d.rssi > -75 ? 'Fair' : 'Weak'}</span>
            </button>
          ))}
          <Button variant="secondary" className="w-full" onClick={scan} loading={busy}>Scan again</Button>
        </div>
      )}

      {(phase === 'wifi' || phase === 'provisioning') && selected && (
        <form onSubmit={provision} className="space-y-4">
          <p className="text-sm">Connected to <strong>{selected.name}</strong> over Bluetooth. Now give it your Wi-Fi so it can sync with the cloud.</p>
          <Input label="Wi-Fi network (SSID)" name="ssid" required maxLength={32} value={ssid} onChange={(e) => setSsid(e.target.value)} hint="2.4 GHz networks only" />
          <Input label="Wi-Fi password" name="wifiPassword" type="password" required autoComplete="off" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} hint="Sent to the controller once. Never stored by Reef Lighting." />
          {phase === 'provisioning' && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Connecting controller to {ssid}…</p>}
          <Button type="submit" className="w-full" loading={busy}><Wifi className="h-4 w-4" /> Connect to Wi-Fi</Button>
        </form>
      )}

      {phase === 'register' && result && (
        <form onSubmit={register} className="space-y-4">
          <ul className="space-y-1 text-sm">
            {result.steps.map((s) => (
              <li key={s.step} className="flex items-center gap-2">
                {s.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                <span className="font-medium">{STEP_LABELS[s.step] ?? s.step}</span>
                <span className="text-slate-500">— {s.message}</span>
              </li>
            ))}
          </ul>
          <Banner kind="success">Network connection successful{result.ipAddress ? ` (IP ${result.ipAddress})` : ''}. Firmware {result.firmwareVersion}.</Banner>
          <Input label="Controller name" name="deviceName" required value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <label className="label" htmlFor="tank">Assign to tank</label>
            <select id="tank" className="input" value={tankId} onChange={(e) => setTankId(e.target.value)}>
              <option value="">Not assigned</option>
              {tanks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <Button type="submit" className="w-full" loading={busy}>Register controller</Button>
        </form>
      )}

      {phase === 'done' && (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <p className="font-semibold">{name} is ready!</p>
          <p className="text-sm text-slate-500">Open Lighting Configuration and press <strong>Apply</strong> to send your profile to the controller.</p>
          <Button className="w-full" onClick={onClose}>Done</Button>
        </div>
      )}
    </Modal>
  );
}
