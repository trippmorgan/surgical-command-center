const puppeteer = require("puppeteer");

// Configuration - values should be in your .env file
const ULTRALINQ_URL = process.env.ULTRALINQ_URL || "https://app.ultralinq.net";
const ULTRALINQ_USERNAME = process.env.ULTRALINQ_USERNAME;
const ULTRALINQ_PASSWORD = process.env.ULTRALINQ_PASSWORD;
const HEADLESS_MODE = process.env.ULTRALINQ_HEADLESS !== "false"; // true unless 'false'
const TIMEOUT = process.env.ULTRALINQ_TIMEOUT
  ? parseInt(process.env.ULTRALINQ_TIMEOUT)
  : 60000;

let browser = null;
let page = null;

/**
 * Initializes the Puppeteer browser and a new page.
 * Reuses existing instance if available.
 */
async function initializeBrowser() {
  if (browser) return; // Reuse existing browser instance
  console.log("Initializing Puppeteer browser...");
  browser = await puppeteer.launch({
    headless: HEADLESS_MODE,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1600, height: 900 },
  });
  page = await browser.newPage();
  console.log("Browser initialized.");
}

/**
 * Logs into UltraLinq and handles session management.
 */
async function login() {
  if (!browser || !page) {
    await initializeBrowser();
  }

  console.log("Navigating to UltraLinq login page...");
  await page.goto(ULTRALINQ_URL, { waitUntil: "networkidle2" });

  // Check if we are already logged in by looking for a logout button or a known element
  const isLoggedIn = await page.$('a[href*="logout"]');
  if (isLoggedIn) {
    console.log("Already logged in.");
    return;
  }

  console.log("Attempting to log in...");
  if (!ULTRALINQ_USERNAME || !ULTRALINQ_PASSWORD) {
    throw new Error(
      "UltraLinq username or password not configured in .env file."
    );
  }

  await page.type("#username", ULTRALINQ_USERNAME);
  await page.type("#password", ULTRALINQ_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: TIMEOUT });

  // Verify login success by checking for a known element on the dashboard
  await page.waitForSelector("input#search", { timeout: TIMEOUT });
  console.log("Successfully logged into UltraLinq.");
}

/**
 * Searches for a patient by MRN and navigates to their study list.
 * @param {string} mrn - The patient's Medical Record Number.
 */
async function searchPatient(mrn) {
  console.log(`Searching for patient with MRN: ${mrn}...`);
  const searchInputSelector = "input#search";
  await page.waitForSelector(searchInputSelector);
  await page.click(searchInputSelector, { clickCount: 3 }); // Clear existing text
  await page.type(searchInputSelector, mrn);
  await page.keyboard.press("Enter");

  // Wait for search results to load, indicated by the presence of the patient table
  await page.waitForSelector(".exam-row", { timeout: TIMEOUT });
  console.log("Patient search completed.");
}

/**
 * Scrapes all studies for the currently loaded patient.
 * This function must be run after a successful patient search.
 */
async function scrapeStudies() {
  console.log("Scraping studies from patient chart...");
  await page.waitForSelector(".exam-row", { timeout: TIMEOUT });

  const studies = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".exam-row"));
    return rows
      .map((row) => {
        const studyDate = row.querySelector(".exam-date")?.innerText.trim();
        const procedure = row.querySelector(".procedure")?.innerText.trim();
        const accession = row.querySelector(".accession")?.innerText.trim();
        // The click action is based on a unique identifier, like an href or data-id
        const viewUrl = row.querySelector('a[href*="exam.php"]')?.href;
        return { studyDate, procedure, accession, viewUrl };
      })
      .filter((study) => study.viewUrl); // Only include studies we can navigate to
  });

  console.log(`Found ${studies.length} studies.`);
  return studies;
}

/**
 * Navigates to a specific study and extracts detailed information, including from the iframe.
 * @param {string} studyUrl - The URL to the specific study view.
 */
async function getStudyDetails(studyUrl) {
  console.log(`Navigating to study details: ${studyUrl}`);
  await page.goto(studyUrl, { waitUntil: "networkidle2" });

  // This is the critical step that replicates the chrome.debugger functionality
  // We find the iframe and then use the Chrome DevTools Protocol (CDP) to inspect its content
  const iframeElement = await page.waitForSelector('iframe[name="viewer"]');
  const iframe = await iframeElement.contentFrame();

  if (!iframe) {
    throw new Error("Could not find the viewer iframe.");
  }

  // Wait for a known element inside the iframe to ensure it's loaded
  await iframe.waitForSelector("#worksheet_and_obs", { timeout: TIMEOUT });
  console.log("Viewer iframe loaded.");

  // Use CDP session to execute code and get runtime properties from the iframe's window object
  const client = await page.target().createCDPSession();
  await client.send("Runtime.enable");

  // Poll for the `window.clips` object to be available in the iframe's context
  console.log("Polling for window.clips data in iframe...");
  const clipsData = await new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 20; // Try for 10 seconds (20 * 500ms)
    const interval = setInterval(async () => {
      try {
        const response = await client.send("Runtime.evaluate", {
          expression: "JSON.stringify(window.clips)",
          returnByValue: true,
          contextId: iframe._executionContext._id,
        });

        if (response.result.value) {
          clearInterval(interval);
          resolve(JSON.parse(response.result.value));
        } else if (++attempts >= maxAttempts) {
          clearInterval(interval);
          reject(
            new Error(
              "Timeout: window.clips object not found in iframe after multiple attempts."
            )
          );
        }
      } catch (error) {
        // Ignore errors during polling, they might be temporary
      }
    }, 500);
  });

  console.log("Successfully extracted window.clips data.");
  await client.detach();

  // Extract other patient info from the main page
  const patientInfo = await page.evaluate(() => {
    const name = document.querySelector(".patient-name")?.innerText.trim();
    const dob = document
      .querySelector(".dob")
      ?.innerText.replace("DOB:", "")
      .trim();
    const mrn = document
      .querySelector(".mrn")
      ?.innerText.replace("MRN:", "")
      .trim();
    return { name, dob, mrn };
  });

  // Structure the final result
  const result = {
    patientInfo,
    studyData: {
      measurements: clipsData.ob,
      images: clipsData.images.map((img) => ({
        id: img.id,
        label: img.label,
        // Construct the full image URL if necessary, or prepare for download
        // Assuming base64 data is preferred for API transfer
        data: `data:image/jpeg;base64,${img.imageData}`, // Assuming imageData is base64
      })),
      conclusion: clipsData.conclusion, // Example, adjust based on actual structure
    },
  };

  return result;
}

/**
 * Closes the browser instance.
 */
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    console.log("Browser closed.");
  }
}

module.exports = {
  initializeBrowser,
  login,
  searchPatient,
  scrapeStudies,
  getStudyDetails,
  closeBrowser,
};
