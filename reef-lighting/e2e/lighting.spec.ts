import { expect, Page, test } from '@playwright/test';

const PASSWORD = 'ReefDemo2026!';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function openNav(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).first().click();
}

test('rejects bad credentials with a clear message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('home@reef.local');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password');
});

test('single-tank home user lands on their aquarium dashboard', async ({ page }) => {
  await login(page, 'home@reef.local');
  await expect(page.getByRole('heading', { name: 'Living Room Reef' })).toBeVisible();
  await expect(page.getByLabel('Select tank')).toHaveCount(0); // no unnecessary navigation
  await expect(page.getByText(/device simulator/i)).toBeVisible();
});

test('configure nine channels, save and apply to the simulated controller', async ({ page }) => {
  await login(page, 'home@reef.local');
  await openNav(page, 'Lighting Configuration');
  await expect(page.getByRole('slider')).toHaveCount(9);

  const blue = page.getByLabel('Blue percentage');
  await blue.fill('60');
  await blue.press('Enter');
  await expect(page.getByText('Unsaved changes')).toBeVisible();

  await page.getByRole('button', { name: 'Apply Configuration' }).click();
  await expect(page.getByText(/Applied to 1 controller/)).toBeVisible();

  await page.getByRole('button', { name: 'Reset Configuration' }).isDisabled();
});

test('enterprise admin sees site summaries and user management', async ({ page }) => {
  await login(page, 'admin@aquarium.example');
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  await openNav(page, 'User Management');
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
});

test('onboard a simulated controller end-to-end', async ({ page }) => {
  await login(page, 'multi@reef.local');
  await openNav(page, 'Devices');
  await page.getByRole('button', { name: 'Add controller' }).click();
  await page.getByRole('button', { name: 'Scan for controllers' }).click();
  await page.getByRole('button', { name: /Reef9-A1B2|Reef9-C3D4/ }).first().click();
  await page.getByLabel('Wi-Fi network (SSID)').fill('ReefNet');
  await page.getByLabel('Wi-Fi password').fill('wrongpass');
  await page.getByRole('button', { name: 'Connect to Wi-Fi' }).click();
  await expect(page.getByRole('alert')).toContainText(/wrong password/i);
  await page.getByLabel('Wi-Fi password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Connect to Wi-Fi' }).click();
  await expect(page.getByText('Network connection successful')).toBeVisible();
  await page.getByRole('button', { name: 'Register controller' }).click();
  await expect(page.getByText(/is ready!/)).toBeVisible();
});
