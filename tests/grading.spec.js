const { test, expect } = require('@playwright/test');
const { gotoGame, getCentroids, openState, inputFor, ABBREVIATIONS } = require('./helpers');

// Forces the submit button enabled by fabricating markers for every state
// not already answered, so grading logic can be tested without a full
// 50-click walkthrough (that's covered separately in full-game.spec.js).
async function fillRemainingStates(page, centroids, alreadyAnswered) {
    const remaining = Object.keys(centroids).filter((name) => !alreadyAnswered.includes(name));
    for (const name of remaining) {
        await openState(page, name, centroids);
        await inputFor(page, name).fill(ABBREVIATIONS[name]);
        await inputFor(page, name).press('Enter');
    }
}

test('accepts both full name and abbreviation, case-insensitively', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await openState(page, 'Oregon', centroids);
    await inputFor(page, 'Oregon').fill('oregon'); // full name, lowercase

    await openState(page, 'Nevada', centroids);
    await inputFor(page, 'Nevada').fill('nv'); // abbreviation, lowercase

    await fillRemainingStates(page, centroids, ['Oregon', 'Nevada']);

    await page.locator('#submit-btn').click();
    await expect(page.locator('#result-banner')).toContainText('50 / 50 states');
});

test('reports only the count, and wrong answers are not counted as correct', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await openState(page, 'Georgia', centroids);
    await inputFor(page, 'Georgia').fill('Wyoming'); // deliberately wrong

    await fillRemainingStates(page, centroids, ['Georgia']);

    await page.locator('#submit-btn').click();
    const bannerText = await page.locator('#result-banner').textContent();

    expect(bannerText).toContain('49 / 50 states');
    // Only an aggregate count is shown - no per-state right/wrong indication.
    expect(bannerText).not.toMatch(/wrong|incorrect|Georgia/i);
});

test('submitting can be repeated after correcting an answer (unlimited attempts)', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await openState(page, 'Georgia', centroids);
    await inputFor(page, 'Georgia').fill('Wyoming');
    await fillRemainingStates(page, centroids, ['Georgia']);

    await page.locator('#submit-btn').click();
    await expect(page.locator('#result-banner')).toContainText('49 / 50 states');
    await page.locator('#result-banner').click(); // dismiss

    await inputFor(page, 'Georgia').fill('Georgia');
    await expect(page.locator('#submit-btn')).toBeEnabled();
    await page.locator('#submit-btn').click();
    await expect(page.locator('#result-banner')).toContainText('50 / 50 states');
});
