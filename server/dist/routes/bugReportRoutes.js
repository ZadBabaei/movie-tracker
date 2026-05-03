"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const BugReport_1 = __importDefault(require("../models/BugReport"));
const user_1 = __importDefault(require("../models/user"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const emailService_1 = require("../utils/emailService");
const router = express_1.default.Router();
const allowedSeverities = new Set(["Low", "Medium", "High", "Critical"]);
const normalizeText = (value) => String(value ?? "").trim();
const requireBugReportsEnabled = (_req, res, next) => {
    if (process.env.ENABLE_BUG_REPORTS !== "true") {
        res.status(404).json({ msg: "Bug reports are not enabled." });
        return;
    }
    next();
};
const getScreenshotReference = (bugReport) => {
    if (!bugReport.screenshotUrl)
        return "None";
    return bugReport.screenshotUrl.startsWith("data:")
        ? "Stored with the bug report payload."
        : bugReport.screenshotUrl;
};
const buildGitHubIssueBody = (bugReport) => `## Bug Report

**Severity:** ${bugReport.severity}
**Status:** ${bugReport.status}
**Reporter:** ${bugReport.userName || "Unknown"} (${bugReport.userEmail || "Unknown email"})
**Affected page:** ${bugReport.affectedPage}
**Current URL:** ${bugReport.pageUrl}
**Browser:** ${bugReport.browserInfo}
**Screenshot:** ${getScreenshotReference(bugReport)}

### What happened?
${bugReport.description}

### Steps to reproduce
${bugReport.stepsToReproduce}

### Expected result
${bugReport.expectedResult}

### Actual result
${bugReport.actualResult}

### Internal report id
${bugReport._id}
`;
const createGitHubIssue = async (bugReport) => {
    const { GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, } = process.env;
    if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
        throw new Error("GitHub issue creation is enabled but GitHub env vars are incomplete.");
    }
    const postIssue = async (includeLabels) => fetch(`https://api.github.com/repos/${encodeURIComponent(GITHUB_REPO_OWNER)}/${encodeURIComponent(GITHUB_REPO_NAME)}/issues`, {
        method: "POST",
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            "Content-Type": "application/json",
            "User-Agent": "movie-tracker-bug-reports",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
            title: `[Bug][${bugReport.severity}] ${bugReport.title}`,
            body: buildGitHubIssueBody(bugReport),
            ...(includeLabels ? { labels: ["bug", `severity: ${bugReport.severity.toLowerCase()}`] } : {}),
        }),
    });
    let response = await postIssue(true);
    if (!response.ok) {
        const firstError = await response.clone().json().catch(() => ({}));
        console.error("GitHub issue creation with labels failed, retrying without labels:", firstError?.message || response.statusText);
        response = await postIssue(false);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || "GitHub issue creation failed.");
    }
    if (!data.html_url) {
        throw new Error("GitHub issue response did not include an issue URL.");
    }
    return data.html_url;
};
router.post("/", requireBugReportsEnabled, authMiddleware_1.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { title, description, stepsToReproduce, expectedResult, actualResult, affectedPage, severity, pageUrl, browserInfo, screenshotUrl, } = req.body;
        const payload = {
            title: normalizeText(title),
            description: normalizeText(description),
            stepsToReproduce: normalizeText(stepsToReproduce),
            expectedResult: normalizeText(expectedResult),
            actualResult: normalizeText(actualResult),
            affectedPage: normalizeText(affectedPage),
            severity: normalizeText(severity) || "Medium",
            pageUrl: normalizeText(pageUrl),
            browserInfo: normalizeText(browserInfo),
            screenshotUrl: normalizeText(screenshotUrl),
        };
        if (!payload.title ||
            !payload.description ||
            !payload.stepsToReproduce ||
            !payload.expectedResult ||
            !payload.actualResult ||
            !payload.affectedPage) {
            res.status(400).json({ msg: "Please complete all required bug report fields." });
            return;
        }
        if (!allowedSeverities.has(payload.severity)) {
            res.status(400).json({ msg: "Invalid severity." });
            return;
        }
        if (payload.screenshotUrl && payload.screenshotUrl.length > 2800000) {
            res.status(400).json({ msg: "Screenshot is too large. Please upload an image under 2MB." });
            return;
        }
        const user = await user_1.default.findById(userId).select("name email");
        const bugReport = await BugReport_1.default.create({
            userId,
            userEmail: user?.email || "",
            userName: user?.name || "",
            ...payload,
            pageUrl: payload.pageUrl || "Unknown page",
            browserInfo: payload.browserInfo || "Unknown browser",
        });
        const integrations = {
            emailSent: false,
            githubIssueCreated: false,
            githubIssueUrl: "",
        };
        if (process.env.ENABLE_BUG_REPORT_EMAILS === "true") {
            try {
                const notifyEmail = normalizeText(process.env.BUG_REPORT_NOTIFY_EMAIL);
                if (!notifyEmail) {
                    throw new Error("BUG_REPORT_NOTIFY_EMAIL is not configured.");
                }
                await (0, emailService_1.sendBugReportEmail)(notifyEmail, bugReport);
                integrations.emailSent = true;
            }
            catch (error) {
                console.error("Bug report saved, but email notification failed:", error);
            }
        }
        if (process.env.ENABLE_GITHUB_BUG_ISSUES === "true") {
            try {
                const githubIssueUrl = await createGitHubIssue(bugReport);
                bugReport.githubIssueUrl = githubIssueUrl;
                await bugReport.save();
                integrations.githubIssueCreated = true;
                integrations.githubIssueUrl = githubIssueUrl;
            }
            catch (error) {
                console.error("Bug report saved, but GitHub issue creation failed:", error);
            }
        }
        res.status(201).json({
            msg: "Bug report submitted.",
            bugReport,
            integrations,
        });
    }
    catch (error) {
        console.error("Error creating bug report:", error);
        res.status(500).json({ msg: "Failed to submit bug report." });
    }
});
router.get("/my", requireBugReportsEnabled, authMiddleware_1.authenticate, async (req, res) => {
    try {
        const reports = await BugReport_1.default.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .select("-__v");
        res.json(reports);
    }
    catch (error) {
        console.error("Error fetching user bug reports:", error);
        res.status(500).json({ msg: "Failed to fetch bug reports." });
    }
});
exports.default = router;
