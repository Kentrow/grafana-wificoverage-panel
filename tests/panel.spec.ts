import { test, expect } from '@grafana/plugin-e2e';
import path from 'path';

// The provisioned dashboard.json (written by dev/generate.py) feeds the panel TestData frames
// shaped like the Prometheus ones: ap-1 and ap-3 are AP-635, ap-2 is an AP-535 without 6 GHz, ap-3 is down.

test('should display "No data" when the query returns nothing', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const dashboardPage = await gotoDashboardPage(dashboard);
  await expect(dashboardPage.getPanelByTitle('No data').locator).toContainText('No data');
});

test('should place the APs and draw the coverage', async ({ gotoDashboardPage, readProvisionedDashboard }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const panel = dashboardPage.getPanelByTitle('5 GHz').locator;
  await expect(panel.getByTestId('wifi-coverage-heatmap')).toBeVisible();
  await expect(panel.getByTestId('wifi-ap-ap-1')).toHaveAttribute('data-status', 'up');
  await expect(panel.getByTestId('wifi-ap-ap-3')).toHaveAttribute('data-status', 'down');
  await expect(panel.getByTestId('wifi-coverage-legend')).toContainText('2/3 APs on this band · 1 down');
});

test('should leave an AP without a 6 GHz radio off the 6 GHz map', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const panel = dashboardPage.getPanelByTitle('6 GHz').locator;
  await expect(panel.getByTestId('wifi-coverage-legend')).toContainText('Predicted coverage · 6 GHz');
  await expect(panel.getByTestId('wifi-coverage-legend')).toContainText('1/3 APs on this band');
  await expect(panel.getByTestId('wifi-ap-range')).toHaveCount(1);
});

test('should redraw for another band from the options', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '2' });
  await panelEditPage.getCustomOptions('Coverage').getSelect('Band').selectOption('2.4 GHz');
  await expect(page.getByTestId('wifi-coverage-legend')).toContainText('Predicted coverage · 2.4 GHz');
});

test('should move an AP in the panel editor', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '2' });
  const toolbar = page.getByTestId('wifi-edit-toolbar');
  await expect(toolbar).toBeVisible();
  const marker = page.getByTestId('wifi-ap-ap-1');
  const before = (await marker.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + 8);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 40, before.y + 28, { steps: 8 });
  await page.mouse.up();
  await expect(toolbar.getByText('Back to data position')).toBeVisible();
  expect((await marker.boundingBox())!.x).toBeGreaterThan(before.x + 20);
});

test('should draw a wall in the panel editor', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '2' });
  await page.getByTestId('wifi-edit-toolbar').getByRole('radio', { name: 'Draw walls' }).check({ force: true });
  const walls = page.getByTestId('wifi-layout-wall');
  await expect(walls).toHaveCount(1);
  const stage = (await page.getByTestId('wifi-coverage-stage').boundingBox())!;
  await page.mouse.move(stage.x + stage.width * 0.6, stage.y + stage.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * 0.6, stage.y + stage.height * 0.8, { steps: 8 });
  await page.mouse.up();
  await expect(walls).toHaveCount(2);
});

test('should upload a floor plan in the panel editor', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '2' });
  await page.getByTestId('wifi-edit-toolbar').getByRole('button', { name: 'Floor plan' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles(path.join(__dirname, 'fixtures', 'plan.svg'));
  await expect(page.getByTestId('wifi-plan-preview')).toContainText('SVG · 300 × 100 px');
  // The 30 m wide test floor keeps the image proportions: 10 m high.
  await expect(dialog.getByLabel('Floor height in metres')).toHaveValue('10');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('wifi-floor-plan')).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/);
});

test('should undo a wall in the panel editor', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '2' });
  const toolbar = page.getByTestId('wifi-edit-toolbar');
  await toolbar.getByRole('radio', { name: 'Draw walls' }).check({ force: true });
  const walls = page.getByTestId('wifi-layout-wall');
  const stage = (await page.getByTestId('wifi-coverage-stage').boundingBox())!;
  await page.mouse.move(stage.x + stage.width * 0.6, stage.y + stage.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * 0.6, stage.y + stage.height * 0.8, { steps: 8 });
  await page.mouse.up();
  await expect(walls).toHaveCount(2);
  await toolbar.getByRole('button', { name: /Undo/ }).click();
  await expect(walls).toHaveCount(1);
  await toolbar.getByRole('button', { name: /Redo/ }).click();
  await expect(walls).toHaveCount(2);
});

test('should try an extra AP in the what-if mode without saving it', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const panel = dashboardPage.getPanelByTitle('5 GHz').locator;
  await panel.getByRole('button', { name: 'What if' }).click();
  await panel.getByTestId('wifi-whatif-toolbar').getByRole('button', { name: 'Add AP' }).click();
  await expect(panel.getByTestId('wifi-ap-What-if 1')).toBeVisible();
  await expect(panel.getByTestId('wifi-coverage-legend')).toContainText('3/4 APs on this band');
  await panel.getByTestId('wifi-whatif-toolbar').getByRole('button', { name: 'Done' }).click();
  await expect(panel.getByTestId('wifi-ap-What-if 1')).toHaveCount(0);
  await expect(panel.getByTestId('wifi-coverage-legend')).toContainText('2/3 APs on this band');
});

test('should let the plan be edited before there is any data', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '1' });
  await expect(page.getByTestId('wifi-no-ap-notice')).toBeVisible();
  await expect(page.getByTestId('wifi-edit-toolbar').getByRole('button', { name: 'Floor plan' })).toBeVisible();
});

test('should offer the plan editor on a new panel', async ({ panelEditPage, page }) => {
  await panelEditPage.setVisualization('Wi-Fi coverage');
  await expect(page.getByTestId('wifi-edit-toolbar').getByRole('button', { name: 'Floor plan' })).toBeVisible();
  await expect(page.getByTestId('wifi-coverage-stage')).toBeVisible();
});

test('should add a room in the panel editor', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '2' });
  await page.getByTestId('wifi-edit-toolbar').getByRole('radio', { name: 'Rooms' }).check({ force: true });
  const walls = page.getByTestId('wifi-layout-wall');
  await expect(walls).toHaveCount(1);
  const stage = (await page.getByTestId('wifi-coverage-stage').boundingBox())!;
  await page.mouse.move(stage.x + stage.width * 0.55, stage.y + stage.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * 0.9, stage.y + stage.height * 0.8, { steps: 8 });
  await page.mouse.up();
  await expect(walls).toHaveCount(5);
});

test('should set the floor size from a known length', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '2' });
  const toolbar = page.getByTestId('wifi-edit-toolbar');
  await toolbar.getByRole('radio', { name: 'Scale' }).check({ force: true });
  // A line across the whole 30 m wide test floor, said to be 60 m long: the floor doubles.
  const stage = (await page.getByTestId('wifi-coverage-stage').boundingBox())!;
  await page.mouse.move(stage.x + 1, stage.y + stage.height * 0.9);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width - 1, stage.y + stage.height * 0.9, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('wifi-scale-line')).toBeVisible();
  await toolbar.getByLabel('Real length in metres').fill(String(60));
  await toolbar.getByRole('button', { name: 'Apply' }).click();
  await toolbar.getByRole('button', { name: 'Floor plan' }).click();
  const width = Number(await page.getByRole('dialog').getByLabel('Floor width in metres').inputValue());
  expect(width).toBeGreaterThan(59);
  expect(width).toBeLessThan(61);
});

test('should edit the plan in place from the dashboard', async ({ gotoDashboardPage, readProvisionedDashboard }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const panel = dashboardPage.getPanelByTitle('5 GHz').locator;
  await panel.getByRole('button', { name: 'Edit plan' }).click();
  const toolbar = panel.getByTestId('wifi-edit-toolbar');
  await expect(toolbar).toBeVisible();
  const marker = panel.getByTestId('wifi-ap-ap-1');
  const before = (await marker.boundingBox())!;
  const page = panel.page();
  await page.mouse.move(before.x + before.width / 2, before.y + 8);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 40, before.y + 28, { steps: 8 });
  await page.mouse.up();
  await expect(toolbar.getByText('Back to data position')).toBeVisible();
  await toolbar.getByRole('button', { name: 'Done' }).click();
  await expect(toolbar).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Edit plan' })).toBeVisible();
});

test('should select several walls with Ctrl+click and delete them together', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '2' });
  const toolbar = page.getByTestId('wifi-edit-toolbar');
  await toolbar.getByRole('radio', { name: 'Rooms' }).check({ force: true });
  const walls = page.getByTestId('wifi-layout-wall');
  const stage = (await page.getByTestId('wifi-coverage-stage').boundingBox())!;
  const at = (x: number, y: number) => [stage.x + stage.width * x, stage.y + stage.height * y] as const;
  await page.mouse.move(...at(0.55, 0.2));
  await page.mouse.down();
  await page.mouse.move(...at(0.9, 0.8), { steps: 8 });
  await page.mouse.up();
  await expect(walls).toHaveCount(5);
  // The top and right walls of the new room.
  await page.mouse.click(...at(0.72, 0.2));
  await page.keyboard.down('Control');
  await page.mouse.click(...at(0.9, 0.5));
  await page.keyboard.up('Control');
  await toolbar.getByRole('button', { name: 'Delete 2 walls' }).click();
  await expect(walls).toHaveCount(3);
  await toolbar.getByRole('button', { name: /Undo/ }).click();
  await expect(walls).toHaveCount(5);
});
