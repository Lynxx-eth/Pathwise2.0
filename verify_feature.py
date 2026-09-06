import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Go to frontend
        await page.goto("http://localhost:5173")
        await page.wait_for_timeout(2000)

        # Click login/signup or handle onboarding if needed
        # We assume for now we might be unauthenticated, let's just get a screenshot of the root
        await page.screenshot(path="upgrade.png")

        await browser.close()

asyncio.run(main())
