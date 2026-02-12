/**
 * Script untuk test browser detection dan Puppeteer functionality
 * Jalankan ini di setiap device baru sebelum deploy
 */

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

console.log("========================================================");
console.log("  MELATI PRINTING SERVICE - BROWSER TEST");
console.log("========================================================\n");

async function testBrowser() {
  let browser = null;

  try {
    console.log("🔍 Step 1: Checking for Chrome installation...");

    const chromePaths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
      process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
    ];

    let chromeFound = false;
    let chromePath = null;

    for (const path of chromePaths) {
      if (fs.existsSync(path)) {
        chromeFound = true;
        chromePath = path;
        console.log(`   ✅ Chrome found at: ${path}`);
        break;
      }
    }

    if (!chromeFound) {
      console.log("   ⚠️  Chrome not found in standard locations");
      console.log("\n🔍 Step 2: Checking for Microsoft Edge...");

      const edgePaths = [
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      ];

      for (const path of edgePaths) {
        if (fs.existsSync(path)) {
          chromeFound = true;
          chromePath = path;
          console.log(`   ✅ Edge found at: ${path}`);
          break;
        }
      }
    }

    if (!chromeFound) {
      console.log("   ⚠️  Edge not found");
      console.log("\n🔍 Step 3: Will try Puppeteer bundled Chromium...");
    }

    console.log("\n🚀 Step 4: Launching browser with Puppeteer...");

    const launchOptions = {
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };

    if (chromePath) {
      launchOptions.executablePath = chromePath;
    }

    browser = await puppeteer.launch(launchOptions);
    console.log("   ✅ Browser launched successfully!");

    console.log("\n📄 Step 5: Testing PDF generation...");
    const page = await browser.newPage();

    await page.setContent(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { size: A4; margin: 1cm; }
            body { font-family: Arial; }
          </style>
        </head>
        <body>
          <h1>Test PDF Generation</h1>
          <p>If you can see this PDF, Puppeteer is working correctly!</p>
          <p>Date: ${new Date().toLocaleString()}</p>
        </body>
      </html>
    `,
      { waitUntil: "networkidle0" },
    );

    const tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const testPdfPath = path.join(tempDir, "test-browser.pdf");
    await page.pdf({
      path: testPdfPath,
      format: "A4",
      printBackground: true,
    });

    await page.close();
    console.log(`   ✅ PDF generated successfully: ${testPdfPath}`);

    console.log("\n========================================================");
    console.log("  ✅ ALL TESTS PASSED!");
    console.log("========================================================");
    console.log("\nBrowser Configuration:");
    console.log(`  Browser: ${chromePath ? path.basename(path.dirname(chromePath)) : "Puppeteer Chromium"}`);
    console.log(`  Path: ${chromePath || "Bundled with Puppeteer"}`);
    console.log(`\nYou can now safely run the printing service.`);
    console.log("========================================================\n");

    return true;
  } catch (error) {
    console.error("\n❌ TEST FAILED!");
    console.error("========================================================");
    console.error("Error:", error.message);
    console.error("========================================================\n");

    console.error("🔧 TROUBLESHOOTING STEPS:");
    console.error("\n1. Install Google Chrome:");
    console.error("   Download: https://www.google.com/chrome/");
    console.error("   Then restart this test");

    console.error("\n2. OR install Puppeteer with Chromium:");
    console.error("   npm install puppeteer");
    console.error("   Then restart this test");

    console.error("\n3. Check if antivirus is blocking:");
    console.error("   - Add exception for Node.js");
    console.error("   - Add exception for printing-service folder");

    console.error("\n4. Run as Administrator:");
    console.error("   Right-click PowerShell → Run as Administrator");
    console.error("   Then run: node test-browser.js");

    console.error("\n========================================================\n");

    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run test
testBrowser().then((success) => {
  process.exit(success ? 0 : 1);
});
