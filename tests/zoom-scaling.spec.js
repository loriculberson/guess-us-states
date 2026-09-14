const { test, expect } = require('@playwright/test');
const { gotoGame, getCentroids, clickState, inputFor, setZoom } = require('./helpers');

test('input field grows as the map zooms in and shrinks as it zooms out', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await clickState(page, 'Kansas', centroids);
    const input = inputFor(page, 'Kansas');

    const widthAtDefaultZoom = (await input.boundingBox()).width;

    await setZoom(page, 7);
    const widthZoomedIn = (await inputFor(page, 'Kansas').boundingBox()).width;
    expect(widthZoomedIn).toBeGreaterThan(widthAtDefaultZoom);

    await setZoom(page, 3);
    const widthZoomedOut = (await inputFor(page, 'Kansas').boundingBox()).width;
    expect(widthZoomedOut).toBeLessThan(widthAtDefaultZoom);
});

test('typed value and focus survive a zoom-triggered resize', async ({ page }) => {
    await gotoGame(page);
    const centroids = await getCentroids(page);

    await clickState(page, 'Kansas', centroids);
    const input = inputFor(page, 'Kansas');
    await input.fill('KS');

    await setZoom(page, 6);

    await expect(inputFor(page, 'Kansas')).toHaveValue('KS');
});
