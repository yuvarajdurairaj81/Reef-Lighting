// Test defaults — never real secrets.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://reef:reef@localhost:5432/reef_lighting_test?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-test-access-secret-0000';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-test-refresh-secret-000';
process.env.MFA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
process.env.REQUIRE_EMAIL_VERIFICATION ??= 'true';
process.env.SMTP_HOST = '';
process.env.IOT_ADAPTER = 'simulated';
