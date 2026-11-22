/**
 * OpenAPI 3.0 description served at /api/docs (Swagger UI) and /api/docs.json.
 * Kept next to the routes; update both together.
 */
type Op = { summary: string; tags: string[]; body?: string; auth?: boolean; tenant?: boolean; params?: string[]; responses?: Record<string, string> };

const intensities = {
  type: 'object',
  required: ['UV', 'VIOLET', 'ROYAL_BLUE', 'BLUE', 'GREEN', 'YELLOW', 'RED', 'WHITE', 'MOONLIGHT'],
  properties: Object.fromEntries(
    ['UV', 'VIOLET', 'ROYAL_BLUE', 'BLUE', 'GREEN', 'YELLOW', 'RED', 'WHITE', 'MOONLIGHT'].map((k) => [k, { type: 'integer', minimum: 0, maximum: 100 }]),
  ),
  example: { UV: 90, VIOLET: 90, ROYAL_BLUE: 90, BLUE: 95, GREEN: 2, YELLOW: 2, RED: 3, WHITE: 30, MOONLIGHT: 20 },
};

const schemas: Record<string, object> = {
  Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } },
  Intensities: intensities,
  Register: {
    type: 'object',
    required: ['email', 'password', 'displayName'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 10 },
      displayName: { type: 'string' },
      accountType: { type: 'string', enum: ['HOME', 'ENTERPRISE'] },
      organizationName: { type: 'string', description: 'Required for ENTERPRISE' },
    },
  },
  Login: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' }, remember: { type: 'boolean' } } },
  Session: { type: 'object', properties: { accessToken: { type: 'string' }, user: { type: 'object' } } },
  MfaChallenge: { type: 'object', properties: { mfaRequired: { type: 'boolean' }, mfaToken: { type: 'string' } } },
  Email: { type: 'object', required: ['email'], properties: { email: { type: 'string' } } },
  Token: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
  ResetPassword: { type: 'object', required: ['token', 'password'], properties: { token: { type: 'string' }, password: { type: 'string' } } },
  TotpCode: { type: 'object', required: ['code'], properties: { code: { type: 'string', pattern: '^\\d{6}$' } } },
  MfaVerify: { type: 'object', required: ['mfaToken', 'code'], properties: { mfaToken: { type: 'string' }, code: { type: 'string' } } },
  PasskeyVerify: { type: 'object', required: ['challengeId', 'response'], properties: { challengeId: { type: 'string' }, response: { type: 'object' }, remember: { type: 'boolean' } } },
  Tank: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, siteId: { type: 'string' }, volumeLiters: { type: 'integer' }, coralCategory: { type: 'string', enum: ['SPS', 'LPS', 'SOFT', 'MIXED_REEF', 'FISH_ONLY', 'ANEMONE'] } } },
  Site: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, timezone: { type: 'string', example: 'America/Chicago' }, address: { type: 'string' } } },
  HardwareId: { type: 'object', required: ['hardwareId'], properties: { hardwareId: { type: 'string', example: 'SIM-REEF9-A1B2' } } },
  WifiProvision: { type: 'object', required: ['hardwareId', 'ssid', 'password'], properties: { hardwareId: { type: 'string' }, ssid: { type: 'string' }, password: { type: 'string', description: 'Forwarded once; never stored' } } },
  RegisterDevice: { type: 'object', required: ['hardwareId', 'name'], properties: { hardwareId: { type: 'string' }, name: { type: 'string' }, tankId: { type: 'string' }, ssid: { type: 'string' } } },
  Wattages: { type: 'object', description: 'Partial map of channel → max watts', example: { UV: 15, WHITE: 30 } },
  SaveLighting: { type: 'object', required: ['profileId'], properties: { profileId: { type: 'string' }, intensities: { $ref: '#/components/schemas/Intensities' } } },
  CreateProfile: {
    type: 'object',
    required: ['name', 'coralCategory', 'intensities'],
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      coralCategory: { type: 'string' },
      intensities: { $ref: '#/components/schemas/Intensities' },
      rampUpMinutes: { type: 'integer' },
      rampDownMinutes: { type: 'integer' },
      assignToTankId: { type: 'string' },
    },
  },
  UpdateProfile: {
    type: 'object',
    required: ['intensities'],
    properties: {
      intensities: { $ref: '#/components/schemas/Intensities' },
      strategy: { type: 'string', enum: ['UPDATE_ALL', 'NEW_VERSION', 'FORK'], description: 'Required when profile is assigned to >1 tank (else 409 SHARED_PROFILE_CONFIRMATION)' },
      tankId: { type: 'string' },
      name: { type: 'string' },
      rampUpMinutes: { type: 'integer' },
      rampDownMinutes: { type: 'integer' },
    },
  },
  Schedule: { type: 'object', description: 'Phase 5: timezone, channelWindows[{channelKey,onTime,offTime}], ramps[{channelKey,type,startTime,durationMinutes}]' },
  VoiceIntent: { type: 'object', required: ['utterance', 'tankId'], properties: { utterance: { type: 'string', example: 'set blue to 60 percent' }, tankId: { type: 'string' } } },
  VoiceConfirm: { type: 'object', required: ['confirmationToken'], properties: { confirmationToken: { type: 'string' } } },
};

const ops: Record<string, Record<string, Op>> = {
  '/auth/register': { post: { summary: 'Register (auto-creates organization, site, tank)', tags: ['Auth'], body: 'Register', responses: { 201: 'Created', 409: 'Email in use' } } },
  '/auth/verify-email': { post: { summary: 'Confirm email with link token', tags: ['Auth'], body: 'Token' } },
  '/auth/resend-verification': { post: { summary: 'Resend verification email', tags: ['Auth'], body: 'Email' } },
  '/auth/login': { post: { summary: 'Email/password login → Session or MFA challenge', tags: ['Auth'], body: 'Login', responses: { 200: 'Session | MfaChallenge', 401: 'Bad credentials', 403: 'Email not verified' } } },
  '/auth/mfa/verify': { post: { summary: 'Complete login with TOTP code', tags: ['Auth'], body: 'MfaVerify' } },
  '/auth/refresh': { post: { summary: 'Rotate refresh cookie and get a new access token', tags: ['Auth'] } },
  '/auth/logout': { post: { summary: 'Revoke refresh token', tags: ['Auth'], responses: { 204: 'Logged out' } } },
  '/auth/forgot-password': { post: { summary: 'Send password reset email', tags: ['Auth'], body: 'Email' } },
  '/auth/reset-password': { post: { summary: 'Reset password with token', tags: ['Auth'], body: 'ResetPassword' } },
  '/auth/me': { get: { summary: 'Current user and organizations', tags: ['Auth'], auth: true } },
  '/auth/mfa/setup': { post: { summary: 'Start TOTP setup (QR code)', tags: ['Auth'], auth: true } },
  '/auth/mfa/enable': { post: { summary: 'Confirm TOTP and enable MFA', tags: ['Auth'], auth: true, body: 'TotpCode' } },
  '/auth/passkeys/register/options': { post: { summary: 'WebAuthn registration options', tags: ['Passkeys'], auth: true } },
  '/auth/passkeys/register/verify': { post: { summary: 'Verify and store passkey', tags: ['Passkeys'], auth: true, body: 'PasskeyVerify' } },
  '/auth/passkeys/login/options': { post: { summary: 'WebAuthn login options', tags: ['Passkeys'] } },
  '/auth/passkeys/login/verify': { post: { summary: 'Passkey (Face ID / Touch ID) login', tags: ['Passkeys'], body: 'PasskeyVerify' } },
  '/auth/passkeys': { get: { summary: 'List my passkeys', tags: ['Passkeys'], auth: true } },
  '/meta/lighting': { get: { summary: 'Channels, coral categories, presets', tags: ['Meta'] } },
  '/organization': { get: { summary: 'Active organization', tags: ['Tenancy'], tenant: true } },
  '/organization/members': { get: { summary: 'Members (enterprise admin)', tags: ['Tenancy'], tenant: true } },
  '/sites': { get: { summary: 'List sites', tags: ['Tenancy'], tenant: true }, post: { summary: 'Create site', tags: ['Tenancy'], tenant: true, body: 'Site' } },
  '/tanks': { get: { summary: 'List tanks', tags: ['Tenancy'], tenant: true }, post: { summary: 'Create tank (assigned AB+)', tags: ['Tenancy'], tenant: true, body: 'Tank' } },
  '/tanks/{tankId}': { patch: { summary: 'Update tank', tags: ['Tenancy'], tenant: true, body: 'Tank', params: ['tankId'] }, delete: { summary: 'Delete tank', tags: ['Tenancy'], tenant: true, params: ['tankId'] } },
  '/tanks/{tankId}/lighting': {
    get: { summary: 'Effective lighting config, devices, power', tags: ['Lighting'], tenant: true, params: ['tankId'] },
    put: { summary: 'Save configuration (no hardware push)', tags: ['Lighting'], tenant: true, params: ['tankId'], body: 'SaveLighting' },
  },
  '/tanks/{tankId}/lighting/apply': { post: { summary: 'Validate and apply to controller(s)', tags: ['Lighting'], tenant: true, params: ['tankId'], responses: { 200: 'All applied', 207: 'Partial failure' } } },
  '/tanks/{tankId}/lighting/preview': { post: { summary: 'Power estimate for unsaved values', tags: ['Lighting'], tenant: true, params: ['tankId'] } },
  '/profiles': { get: { summary: 'Visible profiles (presets, org, shared)', tags: ['Profiles'], tenant: true }, post: { summary: 'Save As New Profile', tags: ['Profiles'], tenant: true, body: 'CreateProfile' } },
  '/profiles/{id}': {
    get: { summary: 'Profile detail, versions, tanks', tags: ['Profiles'], tenant: true, params: ['id'] },
    put: { summary: 'Edit profile (new version / update all / fork)', tags: ['Profiles'], tenant: true, params: ['id'], body: 'UpdateProfile', responses: { 200: 'Updated', 409: 'Shared profile — choose strategy' } },
    delete: { summary: 'Delete unassigned custom profile', tags: ['Profiles'], tenant: true, params: ['id'] },
  },
  '/profiles/{id}/duplicate': { post: { summary: 'Duplicate profile', tags: ['Profiles'], tenant: true, params: ['id'] } },
  '/profiles/{id}/share': { post: { summary: 'Share with user by email', tags: ['Profiles'], tenant: true, params: ['id'], body: 'Email' } },
  '/profiles/{id}/versions/{version}/schedule': {
    get: { summary: 'Get schedule (Phase 5)', tags: ['Scheduler'], tenant: true, params: ['id', 'version'] },
    put: { summary: 'Store schedule (Phase 5)', tags: ['Scheduler'], tenant: true, params: ['id', 'version'], body: 'Schedule' },
  },
  '/devices': { get: { summary: 'List controllers', tags: ['Devices'], tenant: true }, post: { summary: 'Register controller', tags: ['Devices'], tenant: true, body: 'RegisterDevice' } },
  '/devices/onboarding/bluetooth': { get: { summary: 'Is Bluetooth available', tags: ['Devices'], tenant: true } },
  '/devices/onboarding/scan': { post: { summary: 'Discover nearby controllers', tags: ['Devices'], tenant: true } },
  '/devices/onboarding/connect': { post: { summary: 'BLE connect', tags: ['Devices'], tenant: true, body: 'HardwareId' } },
  '/devices/onboarding/wifi': { post: { summary: 'Provision Wi-Fi with step-by-step validation', tags: ['Devices'], tenant: true, body: 'WifiProvision', responses: { 200: 'Joined', 422: 'Failed (see steps/error)' } } },
  '/devices/{id}': {
    get: { summary: 'Controller detail', tags: ['Devices'], tenant: true, params: ['id'] },
    patch: { summary: 'Rename / assign tank', tags: ['Devices'], tenant: true, params: ['id'] },
    delete: { summary: 'Remove controller', tags: ['Devices'], tenant: true, params: ['id'] },
  },
  '/devices/{id}/refresh': { post: { summary: 'Poll status, firmware, telemetry', tags: ['Devices'], tenant: true, params: ['id'] } },
  '/devices/{id}/wattage': { put: { summary: 'Set per-channel max wattage (admin)', tags: ['Devices'], tenant: true, params: ['id'], body: 'Wattages' } },
  '/dashboard': { get: { summary: 'Dashboard summary (?tankId, ?deviceId)', tags: ['Dashboard'], tenant: true } },
  '/dashboard/energy': { get: { summary: 'Energy telemetry (7 days)', tags: ['Dashboard'], tenant: true } },
  '/alerts': { get: { summary: 'List alerts (?status)', tags: ['Alerts'], tenant: true } },
  '/alerts/{id}': { patch: { summary: 'Acknowledge / resolve', tags: ['Alerts'], tenant: true, params: ['id'] } },
  '/audit-logs': { get: { summary: 'Audit log (admin)', tags: ['Alerts'], tenant: true } },
  '/voice/intents': { post: { summary: 'Interpret a voice/text command (no changes)', tags: ['Voice'], tenant: true, body: 'VoiceIntent' } },
  '/voice/confirm': { post: { summary: 'Execute a confirmed command', tags: ['Voice'], tenant: true, body: 'VoiceConfirm' } },
};

const paths: Record<string, Record<string, object>> = {};
for (const [path, methods] of Object.entries(ops)) {
  paths[path] = {};
  for (const [method, op] of Object.entries(methods)) {
    const secured = op.auth || op.tenant;
    paths[path][method] = {
      summary: op.summary,
      tags: op.tags,
      security: secured ? [{ bearerAuth: [] }] : [],
      parameters: [
        ...(op.params ?? []).map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
        ...(op.tenant ? [{ name: 'X-Organization-Id', in: 'header', required: false, schema: { type: 'string' }, description: 'Defaults to your default organization' }] : []),
      ],
      ...(op.body ? { requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${op.body}` } } } } } : {}),
      responses: Object.fromEntries(
        Object.entries({ 200: 'OK', ...(op.responses ?? {}), ...(secured ? { 401: 'Unauthorized', 403: 'Forbidden' } : {}), 400: 'Validation error' }).map(([c, d]) => [
          c,
          { description: d, ...(Number(c) >= 400 ? { content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } : {}) },
        ]),
      ),
    };
  }
}

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Reef Lighting Platform API',
    version: '0.1.0',
    description: 'Multi-tenant reef aquarium LED lighting management. IoT calls use a SIMULATED controller adapter in this release.',
  },
  servers: [{ url: '/api/v1' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas },
  paths,
};
