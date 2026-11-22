/**
 * End-to-end API tests against a real PostgreSQL database.
 *   createdb reef_lighting_test
 *   DATABASE_URL=postgresql://reef:reef@localhost:5432/reef_lighting_test npx prisma migrate deploy
 *   npm run test:integration
 */
import request from 'supertest';
import { createApp } from '../../src/app';
import { AB_PLUS } from '../../src/domain/channels';
import { prisma } from '../../src/lib/prisma';
import { sha256 } from '../../src/lib/crypto';
import { ensureSystemPresets } from '../../src/modules/lighting/presets.service';

const app = createApp();
const PASSWORD = 'IntegrationTest123';

async function reset() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(',')} CASCADE`);
  await ensureSystemPresets();
}

/** Registers, verifies email via the stored token, logs in. */
async function signUp(email: string, accountType: 'HOME' | 'ENTERPRISE' = 'HOME') {
  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: PASSWORD, displayName: email.split('@')[0], accountType, organizationName: accountType === 'ENTERPRISE' ? 'Big Aquarium' : undefined })
    .expect(201);
  const blocked = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(blocked.status).toBe(403);
  expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

  // Simulate clicking the email link: swap the stored hash for a known token.
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.emailToken.updateMany({ where: { userId: user.id, purpose: 'EMAIL_VERIFICATION', usedAt: null }, data: { tokenHash: sha256(`verify-${email}`) } });
  await request(app).post('/api/v1/auth/verify-email').send({ token: `verify-${email}` }).expect(200);

  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
  return { token: login.body.accessToken as string, cookie: login.headers['set-cookie'] as unknown as string[] };
}

beforeAll(reset);
afterAll(() => prisma.$disconnect());

describe('auth + tenancy', () => {
  it('home registration auto-creates organization, site and tank with AB+', async () => {
    const { token } = await signUp('home@test.local');
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.organizations).toHaveLength(1);
    expect(me.body.organizations[0]).toMatchObject({ type: 'PERSONAL', role: 'OWNER', tankCount: 1, siteCount: 1 });

    const tanks = await request(app).get('/api/v1/tanks').set('Authorization', `Bearer ${token}`).expect(200);
    expect(tanks.body.tanks[0].assignment.profile.name).toBe('AB+');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const { cookie } = await signUp('rotate@test.local');
    const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);
    expect(first.body.accessToken).toBeTruthy();
    await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401); // old token reused
    await request(app).post('/api/v1/auth/refresh').set('Cookie', first.headers['set-cookie']).expect(401); // family revoked
  });

  it('isolates tenants', async () => {
    const a = await signUp('a@test.local');
    const b = await signUp('b@test.local');
    const tanksA = await request(app).get('/api/v1/tanks').set('Authorization', `Bearer ${a.token}`);
    const tankA = tanksA.body.tanks[0].id;
    await request(app).get(`/api/v1/tanks/${tankA}/lighting`).set('Authorization', `Bearer ${b.token}`).expect(404);
    const orgA = (await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${a.token}`)).body.organizations[0].id;
    await request(app).get('/api/v1/tanks').set('Authorization', `Bearer ${b.token}`).set('X-Organization-Id', orgA).expect(403);
  });
});

describe('device onboarding + lighting', () => {
  let token: string;
  let tankId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ token } = await signUp('lights@test.local'));
    tankId = (await request(app).get('/api/v1/tanks').set(auth())).body.tanks[0].id;
  });

  it('onboards a simulated controller', async () => {
    const scan = await request(app).post('/api/v1/devices/onboarding/scan').set(auth()).expect(200);
    expect(scan.body.simulated).toBe(true);
    const hw = scan.body.devices[0].hardwareId;
    await request(app).post('/api/v1/devices/onboarding/connect').set(auth()).send({ hardwareId: hw }).expect(200);
    const bad = await request(app).post('/api/v1/devices/onboarding/wifi').set(auth()).send({ hardwareId: hw, ssid: 'Home', password: 'wrongpass' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('WIFI_AUTH_FAILED');
    await request(app).post('/api/v1/devices/onboarding/wifi').set(auth()).send({ hardwareId: hw, ssid: 'Home', password: 'goodpassword' }).expect(200);
    const created = await request(app).post('/api/v1/devices').set(auth()).send({ hardwareId: hw, name: 'Main Light', tankId }).expect(201);
    expect(created.body.device.isSimulated).toBe(true);
  });

  it('validates, saves and applies configuration', async () => {
    const lighting = await request(app).get(`/api/v1/tanks/${tankId}/lighting`).set(auth()).expect(200);
    expect(lighting.body.effective).toEqual(AB_PLUS);
    expect(lighting.body.devices[0].power.estimatedWatts).toBe(73.2);

    await request(app).put(`/api/v1/tanks/${tankId}/lighting`).set(auth()).send({ profileId: lighting.body.profile.id, intensities: { ...AB_PLUS, UV: 120 } }).expect(400);

    const saved = await request(app).put(`/api/v1/tanks/${tankId}/lighting`).set(auth()).send({ profileId: lighting.body.profile.id, intensities: { ...AB_PLUS, BLUE: 50 } }).expect(200);
    expect(saved.body.overrides).toEqual({ BLUE: 50 });
    expect(saved.body.devices[0].syncStatus).toBe('PENDING');

    const applied = await request(app).post(`/api/v1/tanks/${tankId}/lighting/apply`).set(auth()).expect(200);
    expect(applied.body.results[0]).toMatchObject({ ok: true, storedOnDevice: true });
    expect(applied.body.devices[0].syncStatus).toBe('SYNCED');
  });

  it('requires a strategy when editing a profile shared by several tanks', async () => {
    const t2 = await request(app).post('/api/v1/tanks').set(auth()).send({ name: 'Frag Tank' }).expect(201);
    const created = await request(app)
      .post('/api/v1/profiles')
      .set(auth())
      .send({ name: 'Shared Custom', coralCategory: 'MIXED_REEF', intensities: AB_PLUS, assignToTankId: tankId })
      .expect(201);
    const pid = created.body.profile.id;
    await request(app).put(`/api/v1/tanks/${t2.body.tank.id}/lighting`).set(auth()).send({ profileId: pid }).expect(200);

    const conflict = await request(app).put(`/api/v1/profiles/${pid}`).set(auth()).send({ intensities: { ...AB_PLUS, RED: 10 } });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.details.affectedTanks).toHaveLength(2);

    const fork = await request(app).put(`/api/v1/profiles/${pid}`).set(auth()).send({ intensities: { ...AB_PLUS, RED: 10 }, strategy: 'FORK', tankId }).expect(201);
    expect(fork.body.profile.id).not.toBe(pid);

    const builtIn = (await request(app).get('/api/v1/profiles').set(auth())).body.profiles.find((p: { presetKey: string }) => p.presetKey === 'AB_PLUS');
    await request(app).put(`/api/v1/profiles/${builtIn.id}`).set(auth()).send({ intensities: AB_PLUS }).expect(403);
  });

  it('voice commands need explicit confirmation', async () => {
    const proposal = await request(app).post('/api/v1/voice/intents').set(auth()).send({ utterance: 'set white to 40%', tankId }).expect(200);
    expect(proposal.body.requiresConfirmation).toBe(true);
    const before = await request(app).get(`/api/v1/tanks/${tankId}/lighting`).set(auth());
    expect(before.body.effective.WHITE).not.toBe(40);
    await request(app).post('/api/v1/voice/confirm').set(auth()).send({ confirmationToken: proposal.body.confirmationToken }).expect(200);
    const after = await request(app).get(`/api/v1/tanks/${tankId}/lighting`).set(auth());
    expect(after.body.effective.WHITE).toBe(40);
  });

  it('dashboard summarises the tank', async () => {
    const d = await request(app).get('/api/v1/dashboard').set(auth()).expect(200);
    expect(d.body.totals).toMatchObject({ tanks: 2, devices: 1, connected: 1, offline: 0 });
    expect(d.body.focus.power.isMeasured).toBe(false);
  });
});
