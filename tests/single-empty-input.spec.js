const { test, expect } = require('@playwright/test');
const { gotoGame, getCentroids, clickState, inputFor } = require('./helpers');

test('switching to a different state closes the previous input if it was left empty', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await clickState(page, 'Nevada', centroids);
    await expect(page.locator('.state-input')).toHaveCount(1);

    await clickState(page, 'Utah', centroids);
    await expect(page.locator('.state-input')).toHaveCount(1);
    await expect(inputFor(page, 'Utah')).toBeVisible();
    await expect(inputFor(page, 'Nevada')).toHaveCount(0);
});

test('an input with a value is not closed when switching states', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await clickState(page, 'Utah', centroids);
    await inputFor(page, 'Utah').fill('UT');

    await clickState(page, 'Colorado', centroids);
    await expect(page.locator('.state-input')).toHaveCount(2);
    await expect(inputFor(page, 'Utah')).toHaveValue('UT');
});

test('focusing directly into an existing input also closes an unrelated empty one', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await clickState(page, 'Utah', centroids);
    await inputFor(page, 'Utah').fill('UT');

    await clickState(page, 'Colorado', centroids); // Colorado opens empty
    await expect(page.locator('.state-input')).toHaveCount(2);

    // Click straight into Utah's existing input rather than a fresh polygon.
    await inputFor(page, 'Utah').click();

    await expect(page.locator('.state-input')).toHaveCount(1);
    await expect(inputFor(page, 'Utah')).toBeVisible();
});
