const { test, expect } = require('@playwright/test');
const { gotoGame, getCentroids, openState, inputFor, ABBREVIATIONS } = require('./helpers');

test.setTimeout(60000);

test('answering all 50 states enables submit and grades a perfect run correctly', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    for (const name of Object.keys(centroids)) {
        await openState(page, name, centroids);

        // inputFor() is a Locator, not a handle, so it re-resolves on every
        // action - safe even if a zoom change rebuilds this DOM node.
        await inputFor(page, name).fill(ABBREVIATIONS[name]);
        await inputFor(page, name).press('Enter');
    }

    await expect(page.locator('#progress')).toHaveText('50 / 50 answered');
    await expect(page.locator('#submit-btn')).toBeEnabled();

    await page.locator('#submit-btn').click();
    await expect(page.locator('#result-banner')).toContainText('You correctly identified 50 / 50 states.');
});
