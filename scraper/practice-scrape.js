#!/usr/bin/env node
/*
    netacad-automation
    Copyright (C) 2026 Saurabh Kumar Yadav

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/


import { extractExamAnswers } from "./exam-extract.js";
import {
    countManual,
    ensureOutputDir,
    formatQuestions,
    getOutputPath,
    launchBrowser,
    parseBrowserArgs,
    preparePageForExtract,
    sanitizeQuestion,
    saveJson,
    warnLazyParseFailures,
    warnMissingNumbers,
    warnValidation,
    validatePayload,
} from "./shared.js";

const DEFAULT_URL =
    "https://itexamanswers.net/ccna-2-version-7-00-srwe-practice-final-exam-answers.html";

const HELP = `Usage: node scraper/practice-scrape.js [--url URL] [--executable PATH]`;

const opts = parseBrowserArgs(process.argv, { url: DEFAULT_URL, maxPages: 1 });
if (!opts) {
    console.log(HELP);
    process.exit(0);
}

await ensureOutputDir();
const outputPath = getOutputPath("practice");
const browser = await launchBrowser(opts.executablePath);
const page = await browser.newPage();

try {
    console.log(opts.url);
    await page.goto(opts.url, { waitUntil: "networkidle2", timeout: 120000 });
    await page
        .waitForSelector(
            'p > strong, .thecontent > strong, ul[style*="content-visibility"]',
            { timeout: 30000 },
        )
        .catch(() => {});
    await preparePageForExtract(page);

    const extracted = await page.evaluate(extractExamAnswers);
    warnLazyParseFailures(extracted.questions);
    warnMissingNumbers(extracted);

    const questions = extracted.questions.map(sanitizeQuestion);
    if (!questions.length) {
        console.warn("No questions extracted.");
    } else {
        const manual = countManual(questions);
        console.log(`${questions.length} questions` + (manual ? ` (${manual} manual)` : ""));
        console.log(formatQuestions(questions, "Practice exam"));
    }

    warnValidation(validatePayload(questions));
    await saveJson(outputPath, questions);

    console.log("\nSummary");
    console.log("Questions:", questions.length);
    console.log("Manual:", countManual(questions));
    console.log("Saved:", outputPath);
    console.log("Use as PRACTICE_EXAM_DB or PRACTICE_EXAM_DBS entry.");
    console.log("Browser open. Ctrl+C to exit.");
} catch (err) {
    console.error("Failed:", err.message);
    await browser.close();
    process.exit(1);
}
