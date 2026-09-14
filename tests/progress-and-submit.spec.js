const { test, expect } = require('@playwright/test');
const { gotoGame, getCentroids, clickState, openState, inputFor, ABBREVIATIONS } = require('./helpers');

test('submit button is visible but disabled before all states are answered', async ({ page }) => {
    await gotoGame(page);
    await expect(page.locator('#submit-btn')).toBeVisible();
    await expect(page.locator('#submit-btn')).toBeDisabled();
});

test('progress counter updates live while typing, without pressing Enter', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await expect(page.locator('#progress')).toHaveText('0 / 50 answered');

    await clickState(page, 'Maine', centroids);
    await inputFor(page, 'Maine').type('ME');
    await expect(page.locator('#progress')).toHaveText('1 / 50 answered');

    await inputFor(page, 'Maine').fill('');
    await expect(page.locator('#progress')).toHaveText('0 / 50 answered');
});

test('Enter confirms the value and blurs the field', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await clickState(page, 'Iowa', centroids);
    const input = inputFor(page, 'Iowa');
    await input.type('IA');
    await input.press('Enter');

    await expect(page.locator('#progress')).toHaveText('1 / 50 answered');
    await expect(input).not.toBeFocused();
});

test('submit disables again if an answer is cleared after reaching 50/50', async ({ page }) => {
    test.setTimeout(60000);
    await gotoGame(page);
    const centroids = await getCentroids(page);

    for (const name of Object.keys(centroids)) {
        await openState(page, name, centroids);
        await inputFor(page, name).fill(ABBREVIATIONS[name]);
        await inputFor(page, name).press('Enter');
    }

    await expect(page.locator('#submit-btn')).toBeEnabled();

    // Clear one previously-correct answer; submit must disable again even
    // though it was enabled a moment ago.
    await inputFor(page, 'Wyoming').fill('');

    await expect(page.locator('#progress')).toHaveText('49 / 50 answered');
    await expect(page.locator('#submit-btn')).toBeDisabled();
});
