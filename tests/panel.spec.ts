import { test, expect } from '@grafana/plugin-e2e';
import path from 'path';
import semver from 'semver';

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

test('should offer the plan editor on a new panel', async ({ panelEditPage, page, grafanaVersion }) => {
  if (semver.lt(grafanaVersion, '13.0.0')) {
    // plugin-e2e cannot open the visualization picker of Grafana 12: pick the panel as a user does.
    // A new panel opens with the picker shown or not, depending on timing.
    const search = page.getByPlaceholder('Search for...');
    const change = page.getByText('Change', { exact: true });
    await expect(search.or(change).first()).toBeVisible();
    if (!(await search.isVisible())) {
      await change.click();
    }
    const allVisualizations = page.getByRole('tab', { name: 'All visualizations' });
    if (await allVisualizations.isVisible()) {
      await allVisualizations.click();
    }
    await search.fill('Wi-Fi');
    await page.getByText('Wi-Fi coverage', { exact: true }).first().click();
  } else {
    await panelEditPage.setVisualization('Wi-Fi coverage');
  }
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

test('should read an SQL-like table with the label names set in the options', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const panel = dashboardPage.getPanelByTitle('SQL table').locator;
  await expect(panel.getByTestId('wifi-ap-hall')).toHaveAttribute('data-status', 'up');
  await expect(panel.getByTestId('wifi-ap-office')).toHaveAttribute('data-status', 'down');
  await expect(panel.getByTestId('wifi-coverage-legend')).toContainText('1/2 APs on this band · 1 down');
});

test('should zoom and pan the plan', async ({ gotoDashboardPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const panel = dashboardPage.getPanelByTitle('5 GHz').locator;
  const stage = panel.getByTestId('wifi-coverage-stage');
  const centre = async (testId: string) => {
    const box = (await panel.getByTestId(testId).boundingBox())!;
    return box.x + box.width / 2;
  };
  const gap = (await centre('wifi-ap-ap-2')) - (await centre('wifi-ap-ap-1'));
  await panel
    .getByTestId('wifi-zoom')
    .getByRole('button', { name: /Zoom in/ })
    .click();
  await expect(stage).toHaveAttribute('data-zoom', '1.5');
  expect((await centre('wifi-ap-ap-2')) - (await centre('wifi-ap-ap-1'))).toBeCloseTo(gap * 1.5, 0);

  // Dragging the zoomed plan moves it with the pointer.
  const before = await centre('wifi-ap-ap-2');
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.85);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 - 30, box.y + box.height * 0.85, { steps: 6 });
  await page.mouse.up();
  expect(await centre('wifi-ap-ap-2')).toBeCloseTo(before - 30, 0);

  await panel.getByTestId('wifi-zoom').getByRole('button', { name: 'Show the whole floor' }).click();
  await expect(stage).toHaveAttribute('data-zoom', '1');

  // Ctrl and the wheel zoom too.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect(stage).not.toHaveAttribute('data-zoom', '1');
});

test('should drop an AP where the pointer is on a zoomed plan', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoPanelEditPage({ dashboard, id: '2' });
  const x = async (testId: string) => (await page.getByTestId(testId).boundingBox())!.x;
  const gap = (await x('wifi-ap-ap-2')) - (await x('wifi-ap-ap-1'));
  const zoomIn = page.getByTestId('wifi-zoom').getByRole('button', { name: /Zoom in/ });
  await zoomIn.click();
  await zoomIn.click();
  await expect(page.getByTestId('wifi-coverage-stage')).toHaveAttribute('data-zoom', '2.25');
  const before = (await page.getByTestId('wifi-ap-ap-2').boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + 8);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 45, before.y + 8, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('wifi-edit-toolbar').getByText('Back to data position')).toBeVisible();
  // Dropped under the pointer.
  expect(await x('wifi-ap-ap-2')).toBeCloseTo(before.x + 45, 0);
  // 45 px at zoom 2.25 are 20 px once the whole floor is shown.
  await page.getByTestId('wifi-zoom').getByRole('button', { name: 'Show the whole floor' }).click();
  expect((await x('wifi-ap-ap-2')) - (await x('wifi-ap-ap-1'))).toBeCloseTo(gap + 20, 0);
});

test('should show the signal and the access points on hover', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const panel = dashboardPage.getPanelByTitle('5 GHz').locator;
  const box = (await panel.getByTestId('wifi-coverage-stage').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.5);
  await expect(page.getByTestId('wifi-coverage-tooltip')).toContainText('Predicted RSSI');
  await expect(page.getByTestId('wifi-coverage-tooltip')).toContainText('Best AP');
  const marker = (await panel.getByTestId('wifi-ap-ap-3').boundingBox())!;
  await page.mouse.move(marker.x + marker.width / 2, marker.y + 8);
  await expect(page.getByTestId('wifi-coverage-tooltip')).toContainText('Down');
  // The panel is still there: no rendering error.
  await expect(panel.getByTestId('wifi-coverage-legend')).toBeVisible();
});

test('should show the share of the floor in good coverage, and follow the what-if changes', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const panel = dashboardPage.getPanelByTitle('5 GHz').locator;
  const share = panel.getByTestId('wifi-coverage-share');
  await expect(share).toHaveText(/^\d+% good/);
  const percent = async () => Number((await share.textContent())!.match(/(\d+)%/)![1]);
  const before = await percent();
  await panel.getByRole('button', { name: 'What if' }).click();
  const marker = (await panel.getByTestId('wifi-ap-ap-1').boundingBox())!;
  await page.mouse.click(marker.x + marker.width / 2, marker.y + 8);
  await panel.getByTestId('wifi-whatif-toolbar').getByRole('button', { name: 'Switch ap-1 off' }).click();
  await expect.poll(percent).toBeLessThan(before);
});

test('should change the transmit power of an AP in the what-if mode', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const panel = dashboardPage.getPanelByTitle('5 GHz').locator;
  const share = panel.getByTestId('wifi-coverage-share');
  await expect(share).toHaveText(/^\d+% good/);
  const percent = async () => Number((await share.textContent())!.match(/(\d+)%/)![1]);
  const before = await percent();
  await panel.getByRole('button', { name: 'What if' }).click();
  const marker = (await panel.getByTestId('wifi-ap-ap-1').boundingBox())!;
  await page.mouse.click(marker.x + marker.width / 2, marker.y + 8);
  const power = panel.getByTestId('wifi-whatif-power');
  await expect(power).toContainText('16 dBm');
  const lower = power.getByRole('button', { name: 'Lower the transmit power by 1 dB' });
  await lower.click();
  await expect(power).toContainText('15 dBm (-1 dB)');
  // Down to the bound: on this small floor ap-2 alone covers most of it.
  for (let i = 1; i < 20; i++) {
    await lower.click();
  }
  await expect(power).toContainText('-4 dBm (-20 dB)');
  await expect(lower).toBeDisabled();
  await expect.poll(percent).toBeLessThan(before);
  // Done goes back to the data.
  await panel.getByTestId('wifi-whatif-toolbar').getByRole('button', { name: 'Done' }).click();
  await expect.poll(percent).toBe(before);
});

test('should paint the coverage in blue with the blue palette', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '2' });
  await panelEditPage.getCustomOptions('Coverage').getRadioGroup('Palette').check('Blue');
  // The legend's gradient starts at the light blue of the light theme, or the darker one of the dark theme.
  const bar = page.getByTestId('wifi-coverage-legend').locator('[style*="linear-gradient"]');
  await expect(bar).toHaveAttribute('style', /rgb\((109, 167, 236|37, 106, 191)\)/);
});
