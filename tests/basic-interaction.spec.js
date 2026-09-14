const { test, expect } = require('@playwright/test');
const { gotoGame, getCentroids, clickState, inputFor } = require('./helpers');

test('clicking a large state opens an input positioned on that state', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await clickState(page, 'California', centroids);

    const input = inputFor(page, 'California');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
});

test('clicking a small East Coast state draws a callout line into the Atlantic', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await clickState(page, 'Rhode Island', centroids);

    await expect(inputFor(page, 'Rhode Island')).toBeVisible();
    await expect(page.locator('.callout-line')).toHaveCount(1);
});

test('typing is echoed live in the input', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await clickState(page, 'Texas', centroids);
    const input = inputFor(page, 'Texas');
    await input.type('TX');

    await expect(input).toHaveValue('TX');
});

test('clicking an already-open state refocuses it instead of creating a duplicate', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await clickState(page, 'Ohio', centroids);
    await clickState(page, 'Ohio', centroids);

    await expect(page.locator('.state-input')).toHaveCount(1);
});
