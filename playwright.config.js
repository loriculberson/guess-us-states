// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: false,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:8791',
    },
    webServer: {
        command: 'python3 -m http.server 8791',
        url: 'http://localhost:8791/index.html',
        reuseExistingServer: !process.env.CI,
    },
});
