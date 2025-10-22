const express = require("express");
const router = express.Router();
const ultralinq = require("../connectors/ultralinqConnector");

/**
 * Middleware for consistent error handling in this router.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`Error in UltraLinq route ${req.path}:`, err);
    res.status(500).json({ success: false, error: err.message });
  });
};

/**
 * @route   GET /api/ultralinq/test
 * @desc    Tests the connection and login to UltraLinq.
 * @access  Private
 */
router.get(
  "/test",
  asyncHandler(async (req, res) => {
    await ultralinq.login();
    res.json({ success: true, message: "Successfully logged into UltraLinq." });
    // Note: In a production scenario, you might not want to leave the browser open.
    // Consider adding a closeBrowser() call here if this is purely a health check.
  })
);

/**
 * @route   GET /api/ultralinq/patient/:mrn/studies
 * @desc    Get a list of all studies for a given patient MRN.
 * @access  Private
 */
router.get(
  "/patient/:mrn/studies",
  asyncHandler(async (req, res) => {
    const { mrn } = req.params;
    if (!mrn) {
      return res
        .status(400)
        .json({ success: false, error: "MRN parameter is required." });
    }

    await ultralinq.login();
    await ultralinq.searchPatient(mrn);
    const studies = await ultralinq.scrapeStudies();

    res.json({ success: true, mrn, count: studies.length, data: studies });
  })
);

/**
 * @route   GET /api/ultralinq/patient/:mrn/latest
 * @desc    Get full details of the most recent study for a patient, including images.
 * @access  Private
 */
router.get(
  "/patient/:mrn/latest",
  asyncHandler(async (req, res) => {
    const { mrn } = req.params;
    if (!mrn) {
      return res
        .status(400)
        .json({ success: false, error: "MRN parameter is required." });
    }

    await ultralinq.login();
    await ultralinq.searchPatient(mrn);
    const studies = await ultralinq.scrapeStudies();

    if (studies.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          message: "No studies found for this patient.",
        });
    }

    // Assuming the first study in the list is the most recent one.
    // You may need to add date parsing and sorting if the order is not guaranteed.
    const latestStudy = studies[0];
    const studyDetails = await ultralinq.getStudyDetails(latestStudy.viewUrl);

    res.json({ success: true, mrn, data: studyDetails });
  })
);

module.exports = router;
