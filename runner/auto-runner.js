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
(() => {
  var PT_ACTIVITY_BOILERPLATE = /open the pt activity\.?\s*perform the tasks in the activity instructions and then answer the question\.?\s*/gi;
  var ACTIVITY_FILE_RE = /\.(pka|pkt|zip|pdf|exe)(?:\?|#|$)/i;
  var DOWNLOAD_LINK_RE = /activity_download|download_btn|file_download/i;
  function normalizeText(str) {
    if (!str) return "";
    return str.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[\u2000-\u200F\u2028-\u202F]/g, "").replace(/\u00A0/g, " ").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>?/gm, "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\bmicrowaves\b/g, "microwave").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function stripChooseClause(text) {
    return text.replace(/\s*\(choose\s+(?:two|three|four|all\s+that\s+apply|one)[^)]*\)\s*\.?\s*$/gi, "").trim();
  }
  function stripPtActivityBoilerplate(text) {
    if (!text) return "";
    return normalizeText(text).replace(/^file_download\s*/i, "").replace(/^pt activity\s*/i, "").replace(PT_ACTIVITY_BOILERPLATE, "").trim();
  }
  function hadPtActivityBoilerplate(text) {
    const raw = normalizeText(text || "");
    const stripped = stripPtActivityBoilerplate(text);
    return stripped.length < raw.length - 15;
  }
  function isGenericPtQuestion(text) {
    const raw = normalizeText(text || "");
    if (/^(open the )?pt activity\b|perform the tasks in the activity/i.test(raw)) return true;
    const stripped = stripPtActivityBoilerplate(text);
    if (!stripped) return true;
    return hadPtActivityBoilerplate(text);
  }
  function questionLookupKey(question, answers) {
    const q = normalizeText(question || "");
    const substantive = stripPtActivityBoilerplate(q);
    if (substantive.length >= 25) return substantive;
    if (isGenericPtQuestion(q) && answers?.length) {
      return `${q}::${answers.map((a) => normalizeText(a)).sort().join("|")}`;
    }
    return q;
  }
  function extractNumbers(str) {
    return (str.match(/\d+/g) || []).join(",");
  }
  function textSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const aNums = extractNumbers(a);
    const bNums = extractNumbers(b);
    if (aNums && bNums && aNums !== bNums) return 0;
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    if (longer.includes(shorter) && shorter.length / longer.length >= 0.82) {
      return shorter.length / longer.length;
    }
    const aw = a.split(" ").filter((w) => w.length > 1);
    const bw = new Set(b.split(" ").filter((w) => w.length > 1));
    if (!aw.length) return 0;
    let hit = 0;
    for (const w of aw) if (bw.has(w)) hit++;
    return hit / aw.length;
  }
  var OSI_LAYER_ALIASES = {
    "layer 1": ["physical", "physical layer"],
    "layer 2": ["data link", "data-link", "datalink"],
    "layer 3": ["network", "network layer"],
    "layer 4": ["transport", "transport layer"],
    "layer 5": ["session", "session layer"],
    "layer 6": ["presentation", "presentation layer"],
    "layer 7": ["application", "application layer"]
  };
  function expandLayerAliases(answers) {
    const out = new Set(answers);
    for (const ans of answers) {
      const layerMatch = ans.match(/^layer\s*(\d+)$/);
      if (!layerMatch) continue;
      const key = `layer ${layerMatch[1]}`;
      for (const alias of OSI_LAYER_ALIASES[key] || []) out.add(alias);
    }
    for (const ans of answers) {
      for (const [layer, aliases] of Object.entries(OSI_LAYER_ALIASES)) {
        if (aliases.includes(ans)) out.add(layer);
      }
    }
    return [...out];
  }
  function expectedSelectionCount(questionText, correctAnswers) {
    const q = normalizeText(questionText || "");
    const chooseMatch = q.match(/choose\s+(two|three|four|five|six|seven|eight|all)/);
    if (chooseMatch) {
      const map = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, all: correctAnswers.length };
      return map[chooseMatch[1]] || correctAnswers.length;
    }
    return correctAnswers.length;
  }
  function isActivityDownloadLink(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = (el.tagName || "").toUpperCase();
    if (tag !== "A") return false;
    const href = el.getAttribute("href") || "";
    const cls = el.getAttribute("class") || "";
    if (ACTIVITY_FILE_RE.test(href)) return true;
    if (DOWNLOAD_LINK_RE.test(cls) || DOWNLOAD_LINK_RE.test(href)) return true;
    if (el.querySelector('material-icon[icon="file_download"], material-icon[iconname="file_download"], .download-icon')) {
      return true;
    }
    return false;
  }
  function isDownloadOnlyParagraph(p) {
    const text = (p.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return true;
    const links = [...p.querySelectorAll("a[href]")];
    if (!links.length || !links.every(isActivityDownloadLink)) return false;
    const linkText = links.map((a) => (a.textContent || "").trim()).join(" ");
    const extra = text.replace(linkText, "").replace(/\s+/g, " ").trim();
    return extra.length < 20;
  }
  function removeNonQuestionContent(root) {
    root.querySelectorAll(".screenReader-position-text, .accessibility-completion-indicator").forEach((n) => n.remove());
    root.querySelectorAll("a[href]").forEach((a) => {
      if (isActivityDownloadLink(a)) a.remove();
    });
    root.querySelectorAll("p").forEach((p) => {
      if (isDownloadOnlyParagraph(p)) p.remove();
    });
  }
  function extractCleanText(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
    removeNonQuestionContent(clone);
    const raw = normalizeText(clone.textContent || clone.innerText);
    const substantive = stripPtActivityBoilerplate(raw);
    return substantive.length >= 25 ? substantive : raw;
  }
  function normalizeMcqOptionText(str) {
    return normalizeText(str).replace(/\bsubnet\s+mask\b/g, "subnet mask");
  }
  function extractMcqOptionText(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
    clone.querySelectorAll(".screenReader-position-text, .accessibility-completion-indicator").forEach((n) => n.remove());
    return normalizeMcqOptionText(clone.textContent || clone.innerText || "");
  }
  function splitIosCommandParts(text) {
    return normalizeText(text).split(/(?=router\([^)]+\)#)/i).map((p) => p.trim()).filter((p) => p.length > 5);
  }
  function parseNetworkMaskPair(text) {
    const n = normalizeMcqOptionText(text);
    const ip = n.match(/(?:subnetwork|network)\s+(\d+\.\d+\.\d+\.\d+)/i)?.[1];
    const mask = n.match(/(?:subnet\s+mask|mask)\s+(\d+\.\d+\.\d+\.\d+)/i)?.[1];
    return ip && mask ? { ip, mask } : null;
  }
  function networkMaskPairMatches(ansText, optText) {
    const a = parseNetworkMaskPair(ansText);
    const o = parseNetworkMaskPair(optText);
    return !!(a && o && a.ip === o.ip && a.mask === o.mask);
  }
  function isIpv6AddressText(text) {
    const t = (text || "").replace(/\s/g, "");
    return /^[0-9a-f:]{8,}$/i.test(t) && t.includes(":");
  }
  function ipv6LiteralMatch(ansText, optText) {
    return normalizeText(ansText).replace(/\s/g, "") === normalizeText(optText).replace(/\s/g, "");
  }
  function isUriLikeText(text) {
    const t = normalizeMcqOptionText(text);
    if (!t) return false;
    if (/^https?:\/\//i.test(t)) return true;
    if (/^www\./i.test(t)) return true;
    if (/^#/.test(t)) return true;
    return /\.(html?|htm|php|asp|json)(?:#|$|\?)/i.test(t) && t.includes("/");
  }
  function uriAnswerMatchesOption(ansText, optText) {
    const a = normalizeMcqOptionText(ansText);
    const o = normalizeMcqOptionText(optText);
    if (!a || !o) return false;
    if (a === o) return true;
    const ansHasScheme = /^https?:\/\//i.test(a);
    const optHasScheme = /^https?:\/\//i.test(o);
    if (!ansHasScheme && optHasScheme) return false;
    if (ansHasScheme && !optHasScheme) return false;
    if (ansHasScheme) return a === o;
    const stripFragment = (s) => s.replace(/#.*$/, "");
    return stripFragment(a) === stripFragment(o);
  }
  function dbAnswerMatchesOption(ansNorm, optNorm) {
    if (!ansNorm || !optNorm) return false;
    const a = normalizeMcqOptionText(ansNorm);
    const o = normalizeMcqOptionText(optNorm);
    if (isIpv6AddressText(a) || isIpv6AddressText(o)) {
      return ipv6LiteralMatch(a, o);
    }
    if (isUriLikeText(a) || isUriLikeText(o)) {
      return uriAnswerMatchesOption(a, o);
    }
    if (o === a) return true;
    if (networkMaskPairMatches(a, o)) return true;
    if (o.includes(a) && a.length >= 12) {
      const lengthRatio = a.length / o.length;
      if (lengthRatio >= 0.85 || o.length - a.length <= 8) return true;
    }
    const parts = splitIosCommandParts(a);
    if (parts.length > 1) return parts.every((p) => o.includes(p));
    return false;
  }
  function scoreOptionAnswer(optNorm, correctAnswers) {
    const optMcq = normalizeMcqOptionText(optNorm);
    const raw = (correctAnswers || []).map((a) => normalizeMcqOptionText(a)).filter(Boolean);
    if (raw.includes(optMcq)) return { score: 1, tier: 0 };
    if (raw.some((ans) => dbAnswerMatchesOption(ans, optMcq))) return { score: 1, tier: 0 };
    if (raw.some(isIpv6AddressText)) return { score: 0, tier: 2 };
    const expanded = expandLayerAliases(raw);
    if (expanded.includes(optMcq)) return { score: 1, tier: 1 };
    let best = 0;
    for (const ans of expanded) {
      if (!ans) continue;
      const sim = textSimilarity(ans, optMcq);
      if (sim > best) best = sim;
    }
    return { score: best, tier: 2 };
  }
  function isMatchingAnswers(answers) {
    return answers.some((a) => a.includes("->"));
  }
  function parseMatchingPairs(answers) {
    return answers.filter((a) => a.includes("->")).map((a) => {
      const idx = a.indexOf("->");
      return {
        left: normalizeText(a.slice(0, idx)),
        right: normalizeText(a.slice(idx + 2))
      };
    });
  }
  var SCROLL_PERCENTAGE = 0.25;
  var BOTTOM_PERCENT = 99;
  var TICK_MS_SCROLL = 350;
  var TICK_MS_ASSESSMENT = 500;
  var TICK_MS_AFTER_ACTION = 300;
  var TICK_MS_POST_ACTION_POLL = 300;
  var TICK_MS_PRACTICE_POLL = 150;
  var TICK_MS_PRACTICE_IDLE = 250;
  var TICK_MS_PRACTICE_AFTER = 200;
  var POST_ACTION_FAST_POLL_MS = 2500;
  var SHADOW_CACHE_MS = 2500;
  var QUESTION_VIEW_TAGS = "mcq-view, matching-view, object-matching-view";
  function getTopDocument() {
    try {
      return window.top.document;
    } catch {
      return document;
    }
  }
  var shadowRootsCache = { roots: null, rootRef: null, at: 0 };
  function collectShadowRoots(node, out, seen) {
    if (!node || seen.has(node)) return;
    seen.add(node);
    out.push(node);
    if (node.shadowRoot) collectShadowRoots(node.shadowRoot, out, seen);
    if (!node.querySelectorAll) return;
    node.querySelectorAll("*").forEach((child) => {
      if (child.shadowRoot) collectShadowRoots(child.shadowRoot, out, seen);
    });
  }
  function getSearchRoots(root = document) {
    const now = Date.now();
    if (shadowRootsCache.roots && shadowRootsCache.rootRef === root && now - shadowRootsCache.at < SHADOW_CACHE_MS) {
      return shadowRootsCache.roots;
    }
    const roots = [];
    collectShadowRoots(root, roots, /* @__PURE__ */ new Set());
    shadowRootsCache = { roots, rootRef: root, at: now };
    return roots;
  }
  function invalidateShadowCache() {
    shadowRootsCache.roots = null;
  }
  function deepQuerySelectorAll(selector, root = document) {
    const results = [];
    const seen = /* @__PURE__ */ new Set();
    for (const searchRoot of getSearchRoots(root)) {
      if (!searchRoot.querySelectorAll) continue;
      for (const el of searchRoot.querySelectorAll(selector)) {
        if (!seen.has(el)) {
          seen.add(el);
          results.push(el);
        }
      }
      if (searchRoot.querySelectorAll) {
        searchRoot.querySelectorAll("iframe").forEach((iframe) => {
          try {
            const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!innerDoc) return;
            for (const el of deepQuerySelectorAll(selector, innerDoc)) {
              if (!seen.has(el)) {
                seen.add(el);
                results.push(el);
              }
            }
          } catch {
          }
        });
      }
    }
    return results;
  }
  function isPracticeExamTitle(text) {
    const t = (text || "").trim();
    if (!t || /checkpoint/i.test(t) || /module\s+.*quiz/i.test(t)) return false;
    if (/packet\s+tracer/i.test(t) && !/\bexam\b/i.test(t)) return false;
    if (/certification\s+practice\s+exam/i.test(t)) return true;
    if (/practice\s+final\s+exam/i.test(t)) return true;
    if (/\bpractice\s+exam\b/i.test(t)) return true;
    if (/\bpractice\b/i.test(t) && /\bexam\b/i.test(t)) return true;
    return false;
  }
  function isCheckpointExam() {
    const spans = getTopDocument().querySelectorAll('span[class*="selectedNodeName"]');
    for (const span of spans) {
      if (/checkpoint\s+exam/i.test((span.textContent || "").trim())) return true;
    }
    return false;
  }
  function isPracticeExam() {
    const spans = getTopDocument().querySelectorAll('span[class*="selectedNodeName"]');
    for (const span of spans) {
      if (isPracticeExamTitle(span.textContent)) return true;
    }
    try {
      const iframe = getTopDocument().querySelector('iframe[title="Course content"]');
      const src = iframe?.getAttribute("src") || "";
      let href = "";
      try {
        href = iframe?.contentWindow?.location?.href || "";
      } catch {
      }
      const route = `${src} ${href}`;
      if (/certification-practice-exam|practice-final-exam/i.test(route)) return true;
    } catch {
    }
    return false;
  }
  function isModuleQuiz(doc) {
    const spans = getTopDocument().querySelectorAll('span[class*="selectedNodeName"]');
    for (const span of spans) {
      if (/module\s+(practice\s+and\s+)?quiz/i.test((span.textContent || "").trim())) return true;
    }
    if (!doc) return false;
    const hints = deepQuerySelectorAll(".module-title, .page__title-inner, h1, h2", doc);
    return hints.some((el) => /module\s+quiz/i.test((el.textContent || "").trim()));
  }
  function isProseCommaAnswer(parts) {
    if (parts.length !== 2) return false;
    return /^if (the |an |a )/.test(parts[0]) && /^the (system|switch|device|router|network|led|host)/i.test(parts[1]);
  }
  function expandAnswerList(answers, question) {
    const expanded = [];
    const qNorm = normalizeText(question || "");
    const isOrderQuestion = /\b(correct order|in order|proper order|sequence)\b/i.test(qNorm);
    for (const raw of answers || []) {
      const n = normalizeText(raw);
      if (!n.includes(",")) {
        expanded.push(n);
        continue;
      }
      const parts = n.split(",").map((p) => p.trim()).filter(Boolean);
      const looksLikeOptionList = parts.length >= 2 && parts.length <= 8 && parts.every((p) => p.length > 0 && p.length < 80) && !isOrderQuestion && !isProseCommaAnswer(parts);
      if (looksLikeOptionList) {
        expanded.push(...parts);
      } else {
        expanded.push(n);
      }
    }
    return expanded;
  }
  function isAssessmentQuestionItem(item) {
    return !!(item && typeof item === "object" && typeof item.question === "string");
  }
  function isAssessmentDatasetBundle(rawDb) {
    if (!Array.isArray(rawDb) || !rawDb.length) return false;
    return !isAssessmentQuestionItem(rawDb[0]);
  }
  function compileCyuDb(rawDb, targetMap) {
    for (const section in rawDb) {
      rawDb[section].forEach((item) => {
        const key = questionLookupKey(item.question, item.answers);
        targetMap.set(key, expandAnswerList(item.answers, item.question));
      });
    }
  }
  function compileAssessmentDb(rawDb, targetMap) {
    if (isAssessmentDatasetBundle(rawDb)) {
      for (const part of rawDb) {
        compileAssessmentDb(part, targetMap);
      }
      return;
    }
    const items = [];
    if (Array.isArray(rawDb)) {
      items.push(...rawDb);
    } else if (rawDb && typeof rawDb === "object") {
      for (const section of Object.values(rawDb)) {
        if (Array.isArray(section)) items.push(...section);
      }
    }
    for (const item of items) {
      if (!isAssessmentQuestionItem(item)) continue;
      const key = questionLookupKey(item.question, item.answers);
      targetMap.set(key, {
        answers: expandAnswerList(item.answers, item.question),
        manual: !!item.manual,
        imageUrl: item.imageUrl || null
      });
    }
  }
  function collectPracticeExamSources() {
    const sources = [];
    if (typeof PRACTICE_EXAM_DBS !== "undefined") {
      const raw = PRACTICE_EXAM_DBS;
      if (Array.isArray(raw) && isAssessmentDatasetBundle(raw)) {
        sources.push(...raw);
      } else {
        sources.push(raw);
      }
    }
    if (typeof PRACTICE_EXAM_DB !== "undefined") {
      sources.push(PRACTICE_EXAM_DB);
    }
    return sources;
  }
  function findEntryByQuestionPrefix(map, qLookup, isCheckpoint) {
    const prefix = `${qLookup}::`;
    for (const [key, val] of map) {
      if (!key.startsWith(prefix)) continue;
      return {
        entry: isCheckpoint ? val : { answers: val, manual: false, imageUrl: null },
        score: 1,
        key
      };
    }
    return null;
  }
  function isAssessmentEntryMode(mode) {
    return mode === "checkpoint" || mode === "practice";
  }
  function findBestQuestionMatch(map, qText, isCheckpoint) {
    const qLookup = stripPtActivityBoilerplate(qText) || qText;
    const pageHasSubstantive = !isGenericPtQuestion(qText);
    if (map.get(qLookup)) {
      const val = map.get(qLookup);
      return { entry: isCheckpoint ? val : { answers: val, manual: false, imageUrl: null }, score: 1, key: qLookup };
    }
    if (map.get(qText)) {
      const val = map.get(qText);
      return { entry: isCheckpoint ? val : { answers: val, manual: false, imageUrl: null }, score: 1, key: qText };
    }
    const prefixHit = findEntryByQuestionPrefix(map, qLookup, isCheckpoint);
    if (prefixHit) return prefixHit;
    const qCore = stripChooseClause(qLookup);
    let bestKey = null;
    let bestScore = 0;
    for (const [key, val] of map) {
      if (pageHasSubstantive && isGenericPtQuestion(key)) continue;
      const keyLookup = stripPtActivityBoilerplate(key) || key;
      if (stripChooseClause(keyLookup) === qCore) {
        return {
          entry: isCheckpoint ? val : { answers: val, manual: false, imageUrl: null },
          score: 0.99,
          key
        };
      }
      const score = textSimilarity(keyLookup, qLookup);
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
    if (bestKey && bestScore >= 0.92) {
      const val = map.get(bestKey);
      return {
        entry: isCheckpoint ? val : { answers: val, manual: false, imageUrl: null },
        score: bestScore,
        key: bestKey,
        fuzzy: true
      };
    }
    return { entry: null, score: bestScore, key: bestKey };
  }
  function lookupEntry(databases, activeDb, qText) {
    if (!activeDb.ready) return null;
    const isCheckpoint = isAssessmentEntryMode(activeDb.mode);
    let result = findBestQuestionMatch(activeDb.map, qText, isCheckpoint);
    if (!result.entry && activeDb.mode === "cyu" && typeof QUIZ_DB !== "undefined") {
      result = findBestQuestionMatch(databases.quizMap, qText, false);
    }
    if (!result.entry && activeDb.mode === "quiz") {
      result = findBestQuestionMatch(databases.cyuDb, qText, false);
    }
    if (!result.entry && activeDb.mode === "cyu" && typeof CHECKPOINT_DB !== "undefined") {
      const cp = findBestQuestionMatch(databases.checkpointMap, qText, true);
      if (cp.entry) result = cp;
    }
    if (result.entry) {
      result.entry._matchKey = result.key;
      result.entry._fuzzy = !!result.fuzzy;
      result.entry._matchScore = result.score;
    }
    return result.entry;
  }
  var LOOKUP_MISS = /* @__PURE__ */ Symbol("lookup-miss");
  function initDatabases() {
    const cyuDb = /* @__PURE__ */ new Map();
    const quizMap = /* @__PURE__ */ new Map();
    const checkpointMap = /* @__PURE__ */ new Map();
    const practiceMap = /* @__PURE__ */ new Map();
    compileCyuDb(RAW_DB, cyuDb);
    if (typeof QUIZ_DB !== "undefined") {
      compileCyuDb(QUIZ_DB, quizMap);
    }
    if (typeof CHECKPOINT_DB !== "undefined") {
      compileAssessmentDb(CHECKPOINT_DB, checkpointMap);
    }
    for (const src of collectPracticeExamSources()) {
      compileAssessmentDb(src, practiceMap);
    }
    const entryLookupCache = /* @__PURE__ */ new Map();
    function getActiveDb(doc) {
      if (isPracticeExam()) {
        if (!practiceMap.size) {
          return { mode: "practice", ready: false, map: null };
        }
        return { mode: "practice", ready: true, map: practiceMap };
      }
      if (isCheckpointExam()) {
        if (typeof CHECKPOINT_DB === "undefined") {
          return { mode: "checkpoint", ready: false, map: null };
        }
        return { mode: "checkpoint", ready: true, map: checkpointMap };
      }
      if (isModuleQuiz(doc)) {
        if (typeof QUIZ_DB === "undefined") {
          return { mode: "quiz", ready: false, map: null };
        }
        return { mode: "quiz", ready: true, map: quizMap };
      }
      return { mode: "cyu", ready: true, map: cyuDb };
    }
    function getDbTag(mode) {
      if (mode === "checkpoint") return "[Checkpoint]";
      if (mode === "practice") return "[Practice]";
      if (mode === "quiz") return "[Quiz]";
      return "[CYU]";
    }
    function getDbVarName(mode) {
      if (mode === "checkpoint") return "CHECKPOINT_DB";
      if (mode === "practice") return "PRACTICE_EXAM_DB / PRACTICE_EXAM_DBS";
      if (mode === "quiz") return "QUIZ_DB";
      return "RAW_DB";
    }
    function lookupEntryCached(activeDb, qText) {
      const k = `${activeDb.mode}::${normalizeText(qText)}`;
      if (entryLookupCache.has(k)) {
        const hit = entryLookupCache.get(k);
        return hit === LOOKUP_MISS ? null : hit;
      }
      const entry = lookupEntry(
        { cyuDb, quizMap, checkpointMap, practiceMap },
        activeDb,
        qText
      );
      entryLookupCache.set(k, entry || LOOKUP_MISS);
      return entry;
    }
    return {
      getActiveDb,
      getDbTag,
      getDbVarName,
      lookupEntryCached,
      findBestQuestionMatch: (map, qText, isCp) => findBestQuestionMatch(map, qText, isCp),
      isAssessmentEntryMode
    };
  }
  function findCourseIframe() {
    let iframe = document.querySelector('iframe[title="Course content"]');
    if (iframe) return iframe;
    for (const topFrame of document.querySelectorAll("iframe")) {
      try {
        const innerDoc = topFrame.contentDocument || topFrame.contentWindow.document;
        const nestedFrame = innerDoc.querySelector('iframe[title="Course content"]') || innerDoc.querySelector(".fullscreen iframe");
        if (nestedFrame) return nestedFrame;
      } catch {
      }
    }
    return null;
  }
  function getQuestionBodyEl(qContainer) {
    return deepQuerySelectorAll(
      ".mcq__body-inner, .matching__body-inner, .objectMatching__body-inner, .js-question-text",
      qContainer
    )[0];
  }
  function isMatchingQuestionContainer(qContainer) {
    const tag = (qContainer.tagName || "").toLowerCase();
    if (tag === "matching-view" || tag === "object-matching-view") return true;
    return deepQuerySelectorAll(
      "matching-dropdown-view, object-matching-dropdown-view, .matching__item_main, .objectMatching-category-item-container",
      qContainer
    ).length > 0;
  }
  function isMatchingDropdownComplete(qContainer) {
    const rows = deepQuerySelectorAll(
      "matching-dropdown-view, object-matching-dropdown-view, .matching__item_main, .objectMatching-category-item-container",
      qContainer
    );
    if (!rows.length) return false;
    let required = 0;
    let done = 0;
    for (const row of rows) {
      const titleEl = deepQuerySelectorAll(
        ".matching__item-title_inner, .objectMatching__item-title_inner, .matching__item-title",
        row
      )[0];
      const left = normalizeText(titleEl?.textContent || "");
      if (!left || /please select/i.test(left)) continue;
      required++;
      const selected = deepQuerySelectorAll(".dropdown__inner, .js-dropdown-inner", row)[0];
      const selText = normalizeText(selected?.textContent || "");
      if (selText && !/please select an option/i.test(selText)) done++;
    }
    return required > 0 && done === required;
  }
  function isQuestionAnswered(qContainer) {
    if (isMatchingDropdownComplete(qContainer)) return true;
    if (deepQuerySelectorAll("input:checked", qContainer).length > 0) return true;
    const selects = deepQuerySelectorAll("select", qContainer);
    if (selects.length > 0) {
      return selects.every((s) => s.selectedIndex > 0 && s.value);
    }
    const textInputs = deepQuerySelectorAll(
      'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea',
      qContainer
    );
    if (textInputs.length > 0) {
      return textInputs.every((i) => (i.value || "").trim().length > 0);
    }
    const matched = deepQuerySelectorAll('.is-matched, .is-complete, [data-matched="true"]', qContainer);
    return matched.length > 0;
  }
  function shouldTreatAsManual(entry, qContainer) {
    if (entry?.manual) return true;
    if (isMatchingQuestionContainer(qContainer) && !(entry?.answers || []).length) return true;
    return false;
  }
  function waitForManualCompletion(qContainer, doc, entry) {
    const userDone = isQuestionAnswered(qContainer) || isSubmitEnabled(doc);
    if (!userDone) {
      if (!qContainer.dataset.manualWarned) {
        qContainer.dataset.manualWarned = "true";
      }
      return true;
    }
    delete qContainer.dataset.manualWarned;
    return false;
  }
  function trySetSelectForRow(row, rightNorm) {
    const select = row.querySelector("select");
    if (!select) return false;
    for (const opt of select.options) {
      const optNorm = normalizeText(opt.textContent);
      if (optNorm === rightNorm || optNorm.includes(rightNorm) || rightNorm.includes(optNorm)) {
        if (select.value !== opt.value) {
          select.value = opt.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          select.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
        return false;
      }
    }
    return false;
  }
  function solveMatchingQuestion(qContainer, pairs) {
    let changed = false;
    const rows = deepQuerySelectorAll('tr, li, .matching__item, .mcq__item, [class*="matching"]', qContainer);
    for (const { left, right } of pairs) {
      let pairDone = false;
      for (const row of rows) {
        const rowText = extractCleanText(row);
        if (!rowText || !rowText.includes(left) && !left.includes(rowText)) continue;
        if (trySetSelectForRow(row, right)) {
          changed = true;
          pairDone = true;
          break;
        }
      }
      if (pairDone) continue;
      const leftEls = deepQuerySelectorAll('button, [role="button"], label, .mcq__item', qContainer).filter((el) => {
        const t = extractCleanText(el);
        return t === left || t.length > 3 && (t.includes(left) || left.includes(t));
      });
      for (const leftEl of leftEls) {
        const rightEls = deepQuerySelectorAll('button, [role="button"], label, .mcq__item, [role="option"]', qContainer).filter((el) => {
          const t = extractCleanText(el);
          return t === right || t.length > 3 && (t.includes(right) || right.includes(t));
        });
        for (const rightEl of rightEls) {
          if (leftEl === rightEl) continue;
          leftEl.click();
          rightEl.click();
          changed = true;
          pairDone = true;
          break;
        }
        if (pairDone) break;
      }
    }
    return changed;
  }
  function rateMcqOptions(options, correctAnswers) {
    const rated = [];
    for (const opt of options) {
      const optTextEl = deepQuerySelectorAll(".mcq__item-text-inner", opt)[0];
      if (!optTextEl) continue;
      const text = extractMcqOptionText(optTextEl);
      if (!text) continue;
      rated.push({ opt, text, ...scoreOptionAnswer(text, correctAnswers) });
    }
    return rated;
  }
  function clickMcqOption(opt) {
    const input = deepQuerySelectorAll('input[type="radio"], input[type="checkbox"]', opt)[0] || opt.querySelector('input[type="radio"], input[type="checkbox"]');
    const label = deepQuerySelectorAll("label", opt)[0] || opt.querySelector("label");
    if (label) label.click();
    else if (input) input.click();
    else opt.click();
    if (input && !input.checked) {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
  }
  function pickOptionsToSelect(rated, maxSelect, correctAnswers) {
    if (!rated.length || maxSelect < 1) return [];
    const sorted = [...rated].sort((a, b) => a.tier - b.tier || b.score - a.score);
    const answers = (correctAnswers || []).map((a) => normalizeMcqOptionText(a)).filter(Boolean);
    const picked = [];
    const used = /* @__PURE__ */ new Set();
    for (const ans of answers) {
      if (picked.length >= maxSelect) break;
      let best = null;
      for (const row of sorted) {
        if (used.has(row.opt)) continue;
        const exact = row.text === ans;
        const match = exact || dbAnswerMatchesOption(ans, row.text);
        if (!match) continue;
        if (!best || row.tier < best.tier || row.tier === best.tier && row.score > best.score) {
          best = row;
        }
      }
      if (best) {
        picked.push(best);
        used.add(best.opt);
      }
    }
    if (picked.length >= maxSelect) return picked.slice(0, maxSelect);
    for (const row of sorted) {
      if (picked.length >= maxSelect) break;
      if (used.has(row.opt)) continue;
      if (row.tier <= 1) {
        picked.push(row);
        used.add(row.opt);
      }
    }
    if (picked.length) return picked.slice(0, maxSelect);
    const fuzzy = sorted.filter((x) => x.tier === 2 && x.score >= 0.92);
    if (!fuzzy.length) return [];
    const topScore = fuzzy[0].score;
    return fuzzy.filter((x) => x.score >= topScore - 1e-3).slice(0, maxSelect);
  }
  function getOptionsToSelect(options, correctAnswers, maxSelect) {
    return pickOptionsToSelect(rateMcqOptions(options, correctAnswers), maxSelect, correctAnswers);
  }
  function countCheckedMatchingOptions(options, correctAnswers, maxSelect) {
    const targets = new Set(getOptionsToSelect(options, correctAnswers, maxSelect).map((x) => x.opt));
    let n = 0;
    for (const opt of options) {
      if (!targets.has(opt)) continue;
      const input = deepQuerySelectorAll("input", opt)[0] || opt.querySelector("input");
      if (input && input.checked) n++;
    }
    return n;
  }
  function hasCorrectMcqSelection(options, correctAnswers, maxSelect) {
    return countCheckedMatchingOptions(options, correctAnswers, maxSelect) >= maxSelect;
  }
  function selectMcqOptions(qContainer, correctAnswers, questionText, opts = {}) {
    const needCount = expectedSelectionCount(questionText, correctAnswers);
    const multiClick = opts.multiClick ?? needCount > 1;
    const options = deepQuerySelectorAll(".mcq__item, .js-mcq-item", qContainer);
    const isRadioGroup = !!deepQuerySelectorAll('[role="radiogroup"]', qContainer).length || options.length > 0 && options.every((opt) => {
      const input = deepQuerySelectorAll('input[type="radio"]', opt)[0];
      return input || opt.querySelector('input[type="radio"]');
    });
    const maxSelect = isRadioGroup ? 1 : needCount;
    const toSelect = getOptionsToSelect(options, correctAnswers, maxSelect);
    if (!toSelect.length) return false;
    if (hasCorrectMcqSelection(options, correctAnswers, maxSelect)) return false;
    let clicked = false;
    for (const { opt } of toSelect) {
      const input = deepQuerySelectorAll("input", opt)[0] || opt.querySelector("input");
      if (input && input.checked) continue;
      clickMcqOption(opt);
      clicked = true;
      if (!multiClick) return true;
    }
    return clicked;
  }
  function isSubmitEnabled(doc) {
    const submitBtns = deepQuerySelectorAll(".submit-button", doc);
    return submitBtns.some(
      (sBtn) => !sBtn.disabled && !sBtn.classList.contains("is-disabled") && !sBtn.hasAttribute("disabled")
    );
  }
  function trySubmitAndAdvance(doc, qContainer = null) {
    const answered = !qContainer || isQuestionAnswered(qContainer);
    const submitBtns = deepQuerySelectorAll(".submit-button", doc);
    for (const sBtn of submitBtns) {
      if (!sBtn.disabled && !sBtn.classList.contains("is-disabled") && !sBtn.hasAttribute("disabled")) {
        if (!answered) return false;
        sBtn.click();
        return true;
      }
    }
    if (!answered) return false;
    const innerNextBtns = deepQuerySelectorAll('button[data-blockstrip-slider="right"], .is-right', doc);
    for (const nBtn of innerNextBtns) {
      if (nBtn.closest(".block-buttons-container") && !nBtn.disabled && !nBtn.classList.contains("is-disabled")) {
        nBtn.click();
        return true;
      }
    }
    return false;
  }
  function solveQuestion(qContainer, entry, qText, doc, multiClick) {
    const correctAnswers = entry.answers;
    if (isMatchingAnswers(correctAnswers)) {
      return solveMatchingQuestion(qContainer, parseMatchingPairs(correctAnswers));
    }
    return selectMcqOptions(qContainer, correctAnswers, qText, { multiClick });
  }
  function createAssessmentHelpers(doc, win) {
    function getViewportRect(elWindow = win) {
      const vh = elWindow.innerHeight || doc.documentElement.clientHeight;
      const vw = elWindow.innerWidth || doc.documentElement.clientWidth;
      return { vh, vw };
    }
    function getAdjustedRect(el, elWindow = win) {
      if (!el || !el.getBoundingClientRect) return null;
      const rect = el.getBoundingClientRect();
      let top = rect.top;
      let bottom = rect.bottom;
      let left = rect.left;
      let right = rect.right;
      let cw = elWindow;
      try {
        while (cw && cw !== win) {
          const frame = cw.frameElement;
          if (!frame) break;
          const frameRect = frame.getBoundingClientRect();
          top += frameRect.top;
          bottom += frameRect.top;
          left += frameRect.left;
          right += frameRect.left;
          cw = cw.parent;
        }
      } catch {
      }
      return { top, bottom, left, right, width: rect.width, height: rect.height };
    }
    function elementVisibilityRatio(el, elWindow = win) {
      const rect = getAdjustedRect(el, elWindow);
      if (!rect || rect.width <= 0 || rect.height <= 0) return 0;
      const { vh, vw } = getViewportRect(elWindow);
      const visibleW = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
      const visibleH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
      return visibleW * visibleH / (rect.width * rect.height);
    }
    function isElementSubstantiallyVisible(el, minRatio = 0.35, elWindow = win) {
      return elementVisibilityRatio(el, elWindow) >= minRatio;
    }
    function getCarouselOffsetRatio(root = doc) {
      const container = deepQuerySelectorAll(".js-abs-block-container", root)[0];
      if (!container) return null;
      const style = win.getComputedStyle(container);
      if (!style.transform || style.transform === "none") return 0;
      try {
        const matrix = new DOMMatrix(style.transform);
        const w = container.getBoundingClientRect().width;
        if (!w) return 0;
        return Math.max(0, -matrix.m41 / w);
      } catch {
        return 0;
      }
    }
    function isOnQuestionSlide(root) {
      const offset = getCarouselOffsetRatio(root);
      return offset !== null && offset >= 0.35;
    }
    function hasVisibleScorePercent(searchRoot) {
      if (deepQuerySelectorAll(".percent-text", searchRoot).some((el) => {
        const t = (el.textContent || "").trim();
        if (!/\d{1,3}\s*%/.test(t)) return false;
        return isElementSubstantiallyVisible(el, 0.08);
      })) return true;
      return deepQuerySelectorAll(".progress[aria-label]", searchRoot).some((el) => {
        const label = el.getAttribute("aria-label") || "";
        if (!/\d{1,3}\s*%/.test(label)) return false;
        return isElementSubstantiallyVisible(el, 0.08);
      });
    }
    function hasResultSummaryText(searchRoot) {
      const t = (searchRoot.textContent || "").toLowerCase();
      return /you have scored|you have passed|you did not pass|congratulations|try again|assessment results/i.test(t);
    }
    function isAssessmentResultVisible(searchRoot = doc) {
      if (deepQuerySelectorAll("assessmentresults-view", searchRoot).some(
        (el) => isElementSubstantiallyVisible(el, 0.1)
      )) return true;
      if (deepQuerySelectorAll('[class*="resultblock"]', searchRoot).some(
        (el) => el.classList.contains("is-complete") && isElementSubstantiallyVisible(el, 0.08)
      )) return true;
      if (hasVisibleScorePercent(searchRoot)) return true;
      const bodyInner = deepQuerySelectorAll(".assessmentResults__body-inner", searchRoot)[0];
      if (bodyInner && isElementSubstantiallyVisible(bodyInner, 0.08)) {
        const t = (bodyInner.textContent || "").toLowerCase();
        if (/you have scored|congratulations|you have passed|you did not pass/i.test(t)) {
          return true;
        }
      }
      if (hasResultSummaryText(searchRoot) && hasVisibleScorePercent(searchRoot)) return true;
      const retryBtn = deepQuerySelectorAll(
        ".js-assessment-retry-btn, .assessmentResults__retry-btn",
        searchRoot
      ).find((el) => isElementSubstantiallyVisible(el, 0.1));
      if (retryBtn && /reset|retry/i.test((retryBtn.textContent || "").toLowerCase())) {
        const article = retryBtn.closest('.article, .abs, [class*="article"]') || searchRoot;
        if (hasVisibleScorePercent(article) || hasResultSummaryText(article)) return true;
      }
      return false;
    }
    function isAssessmentComplete(root) {
      if (isAssessmentResultVisible(doc)) return true;
      if (!root) return false;
      for (const btn of deepQuerySelectorAll(".block-button", root)) {
        const label = (btn.textContent || "").trim();
        if (!/result\s*page/i.test(label)) continue;
        if (btn.classList.contains("active-block") || btn.classList.contains("is-active") || btn.getAttribute("aria-current") === "true") {
          return true;
        }
      }
      if (isAssessmentResultVisible(root)) return true;
      if (deepQuerySelectorAll(".final-screen-inner", root).some(
        (el) => isElementSubstantiallyVisible(el, 0.25)
      )) return true;
      if (hasVisibleScorePercent(root) && hasResultSummaryText(root)) return true;
      const summaryEls = deepQuerySelectorAll('h1, h2, h3, p, div, span, [class*="score"]', root);
      if (summaryEls.some((el) => {
        const t = (el.textContent || "").toLowerCase();
        if (!/congratulations|you have passed|you did not pass|you have scored/i.test(t)) return false;
        return isElementSubstantiallyVisible(el, 0.08);
      })) return true;
      return false;
    }
    function hasActiveQuestionToolbar(root) {
      return deepQuerySelectorAll(".question-label", root).some(
        (el) => isElementSubstantiallyVisible(el, 0.1) && /\d+\s+of\s+\d+/i.test(el.textContent || "")
      );
    }
    function isFormalExamLayout(root) {
      if (!root) return false;
      if (hasActiveQuestionToolbar(root)) return true;
      if (getInAssessmentStartButtons(root).length > 0) return true;
      if (deepQuerySelectorAll(".js-abs-block-container", root).length > 0) return true;
      if (deepQuerySelectorAll(".block-button", root).some(
        (btn) => /^Q\d+/i.test((btn.textContent || "").trim())
      )) return true;
      return false;
    }
    function isQuestionReadyToAnswer(qContainer) {
      const body = getQuestionBodyEl(qContainer);
      if (!body) return false;
      const vis = elementVisibilityRatio(body);
      if (vis < 0.35) return false;
      const rect = getAdjustedRect(body);
      if (!rect) return false;
      const { vh } = getViewportRect();
      if (rect.top > vh * 0.68) return false;
      if (rect.bottom < vh * 0.12) return false;
      return true;
    }
    function findReadyQuestionContainer(root) {
      const q = findVisibleQuestionContainer(root);
      if (!q || !isQuestionReadyToAnswer(q)) return null;
      return q;
    }
    function hasQuestionContent(root) {
      return deepQuerySelectorAll(QUESTION_VIEW_TAGS, root).some((view) => !!getQuestionBodyEl(view));
    }
    function scrollQuestionIntoView(root) {
      const { vh } = getViewportRect();
      let target = null;
      let targetTop = Infinity;
      for (const view of deepQuerySelectorAll(QUESTION_VIEW_TAGS, root)) {
        const body = getQuestionBodyEl(view);
        if (!body) continue;
        if (isQuestionReadyToAnswer(view)) return false;
        const rect = getAdjustedRect(body);
        if (!rect || rect.top >= vh) continue;
        if (rect.top < targetTop) {
          targetTop = rect.top;
          target = body;
        }
      }
      if (!target) return false;
      target.scrollIntoView({ block: "center", behavior: "auto" });
      return true;
    }
    function isActiveQuestionView(view, root) {
      if (isAssessmentComplete(root)) return false;
      const body = getQuestionBodyEl(view);
      if (!body) return false;
      const bodyVis = elementVisibilityRatio(body);
      if (bodyVis < 0.12) return false;
      const container = deepQuerySelectorAll(".js-abs-block-container", root)[0];
      if (container) {
        const offset = getCarouselOffsetRatio(root);
        if (offset !== null && offset < 0.25) return false;
      }
      if (hasActiveQuestionToolbar(root)) {
        return bodyVis >= 0.18;
      }
      const widget = deepQuerySelectorAll(
        ".mcq__widget, .matching__widget, .objectMatching__widget",
        view
      )[0];
      if (widget && elementVisibilityRatio(widget) < 0.2) return false;
      return bodyVis >= 0.35;
    }
    function getOrderedQuestionViews(root) {
      return deepQuerySelectorAll(QUESTION_VIEW_TAGS, root).filter((qContainer) => !!getQuestionBodyEl(qContainer) && isActiveQuestionView(qContainer, root));
    }
    function getCurrentQuestionNumber(root) {
      for (const el of deepQuerySelectorAll(".question-label", root)) {
        const m = (el.textContent || "").match(/(\d+)\s+of\s+(\d+)/i);
        if (m && isElementSubstantiallyVisible(el, 0.15)) {
          return { index: parseInt(m[1], 10), total: parseInt(m[2], 10) };
        }
      }
      for (const el of deepQuerySelectorAll(
        ".component__title-inner, .matching__title-inner, .objectMatching__title-inner, .mcq__title-inner",
        root
      )) {
        const m = (el.textContent || "").match(/question\s*(\d+)/i);
        if (m && isElementSubstantiallyVisible(el, 0.15)) {
          return { index: parseInt(m[1], 10), total: null };
        }
      }
      for (const btn of deepQuerySelectorAll(".block-button", root)) {
        const m = (btn.textContent || "").trim().match(/^Q(\d+)$/i);
        if (!m) continue;
        if (btn.classList.contains("active-block") || btn.classList.contains("is-active") || btn.getAttribute("aria-current") === "true") {
          return { index: parseInt(m[1], 10), total: null };
        }
      }
      const offset = getCarouselOffsetRatio(root);
      if (offset !== null && offset >= 0.35) {
        return { index: Math.round(offset) + 1, total: null };
      }
      return null;
    }
    function getQuestionContainers(root) {
      if (isAssessmentComplete(root)) return [];
      const ordered = getOrderedQuestionViews(root);
      if (!ordered.length) return [];
      const qNum = getCurrentQuestionNumber(root);
      if (qNum?.index >= 1) {
        const byLabel = ordered.filter((view) => {
          const title = deepQuerySelectorAll(
            ".component__title-inner, .mcq__title-inner, .matching__title-inner, .objectMatching__title-inner",
            view
          )[0];
          const m = (title?.textContent || "").match(/question\s*(\d+)/i);
          return m && parseInt(m[1], 10) === qNum.index;
        });
        if (byLabel.length) return [byLabel[0]];
      }
      const scored = ordered.map((qContainer) => {
        const body = getQuestionBodyEl(qContainer);
        if (!body) return null;
        return { qContainer, visibility: elementVisibilityRatio(body) };
      }).filter((item) => item && item.visibility >= (hasActiveQuestionToolbar(root) ? 0.18 : 0.35));
      if (!scored.length) return [];
      scored.sort((a, b) => b.visibility - a.visibility);
      const best = scored[0];
      const second = scored[1];
      if (best.visibility >= 0.4 && (!second || best.visibility >= second.visibility * 1.25)) {
        return [best.qContainer];
      }
      const slideIdx = Math.round(getCarouselOffsetRatio(root) || 0);
      if (slideIdx >= 0 && slideIdx < ordered.length) {
        return [ordered[slideIdx]];
      }
      return [best.qContainer];
    }
    function findVisibleQuestionContainer(root) {
      if (isAssessmentComplete(root)) return null;
      const ordered = getQuestionContainers(root);
      if (ordered.length) return ordered[0];
      const views = deepQuerySelectorAll(QUESTION_VIEW_TAGS, root);
      let best = null;
      let bestVis = 0;
      for (const view of views) {
        if (!isActiveQuestionView(view, root)) continue;
        const body = getQuestionBodyEl(view);
        if (!body) continue;
        const vis = elementVisibilityRatio(body);
        if (vis > bestVis) {
          bestVis = vis;
          best = view;
        }
      }
      const minVis = hasActiveQuestionToolbar(root) ? 0.18 : 0.35;
      return bestVis >= minVis ? best : null;
    }
    function getVisibleAssessmentRoot(minRatio = 0.2) {
      const shells = deepQuerySelectorAll(".assessment-1q, .abs__container.has-arrows", doc);
      return shells.find((shell) => isElementSubstantiallyVisible(shell, minRatio)) || null;
    }
    function getInAssessmentStartButtons(root = doc) {
      return deepQuerySelectorAll(
        'adaptive-start-screen-view .start-button, .assessment-start-screen .start-button, adaptive-start-screen-view div.start-button[role="button"]',
        root
      );
    }
    function isOnQuizResultScreen(root) {
      if (isAssessmentResultVisible(doc)) return true;
      return !!(root && isAssessmentResultVisible(root));
    }
    function tryExitQuizResult(root) {
      if (!root) return false;
      for (const btn of deepQuerySelectorAll(".block-button", root)) {
        const label = (btn.textContent || "").trim();
        if (!/result/i.test(label)) continue;
        if (btn.classList.contains("active-block") || btn.classList.contains("is-active") || btn.getAttribute("aria-current") === "true") {
          continue;
        }
        btn.click();
        return true;
      }
      const nextBtns = deepQuerySelectorAll(
        'button[data-blockstrip-slider="right"], button.article__btn-arrow.is-right, .block-buttons-container button.is-right',
        root
      );
      for (const btn of nextBtns) {
        if (btn.disabled || btn.classList.contains("is-disabled")) continue;
        if (!isElementSubstantiallyVisible(btn, 0.12)) continue;
        btn.click();
        return true;
      }
      return false;
    }
    function isAssessmentInProgress() {
      const root = getVisibleAssessmentRoot(0.2);
      if (!root) return false;
      if (isAssessmentComplete(root)) return false;
      if (isOnQuizResultScreen(root)) return false;
      if (findReadyQuestionContainer(root)) return true;
      if (!isFormalExamLayout(root)) return false;
      const offset = getCarouselOffsetRatio(root);
      if (offset !== null && offset >= 0.35) return true;
      if (hasActiveQuestionToolbar(root)) return true;
      return deepQuerySelectorAll(".block-button.active-block", root).some(
        (btn) => /^Q\d+/i.test((btn.textContent || "").trim()) && isElementSubstantiallyVisible(btn, 0.2)
      );
    }
    function shouldBlockModuleAdvance(root, isSubmitEnabledFn, isQuestionAnsweredFn) {
      if (isOnQuizResultScreen(root)) return false;
      if (!root || !isAssessmentInProgress()) return false;
      const qContainer = findReadyQuestionContainer(root);
      if (!qContainer) return false;
      if (isSubmitEnabledFn(doc)) return false;
      return !isQuestionAnsweredFn(qContainer);
    }
    function markInAssessmentStartsHandled(root, clickedButtons) {
      getInAssessmentStartButtons(root).forEach((btn) => clickedButtons.add(btn));
    }
    function isAssessmentStarted(clickedButtons) {
      const root = getVisibleAssessmentRoot(0.15);
      if (!root) return false;
      if (isAssessmentComplete(root)) {
        markInAssessmentStartsHandled(root, clickedButtons);
        return true;
      }
      if (findReadyQuestionContainer(root)) {
        markInAssessmentStartsHandled(root, clickedButtons);
        return true;
      }
      if (isFormalExamLayout(root) && isAssessmentInProgress()) {
        markInAssessmentStartsHandled(root, clickedButtons);
        return true;
      }
      const starts = getInAssessmentStartButtons(root);
      if (starts.length === 0) return true;
      return starts.every((btn) => clickedButtons.has(btn));
    }
    function needsMoreScrollForAssessment(clickedButtons) {
      if (isAssessmentResultVisible(doc)) return false;
      const root = getVisibleAssessmentRoot(0.15);
      if (!root) return false;
      if (isAssessmentComplete(root)) return false;
      if (isAssessmentStarted(clickedButtons)) return false;
      const pendingStarts = getInAssessmentStartButtons(root).filter((btn) => !clickedButtons.has(btn));
      return pendingStarts.some((btn) => !isElementSubstantiallyVisible(btn, 0.5));
    }
    return {
      elementVisibilityRatio,
      isElementSubstantiallyVisible,
      isOnQuestionSlide,
      isAssessmentResultVisible,
      isAssessmentComplete,
      findVisibleQuestionContainer,
      findReadyQuestionContainer,
      hasQuestionContent,
      scrollQuestionIntoView,
      isQuestionReadyToAnswer,
      isOnQuizResultScreen,
      tryExitQuizResult,
      getVisibleAssessmentRoot,
      getInAssessmentStartButtons,
      isAssessmentInProgress,
      shouldBlockModuleAdvance,
      markInAssessmentStartsHandled,
      isAssessmentStarted,
      needsMoreScrollForAssessment,
      getCurrentQuestionNumber
    };
  }
  function createContentHelpers(doc, win, assessment) {
    const { elementVisibilityRatio, isElementSubstantiallyVisible, isAssessmentResultVisible, isOnQuestionSlide } = assessment;
    function getFirstBrightcoveArticle() {
      for (const av of deepQuerySelectorAll("article-view", doc)) {
        if (deepQuerySelectorAll("brightcove-view", av).length) return av;
      }
      return null;
    }
    function hasReadableContentBeforeMedia() {
      if (isAssessmentResultVisible(doc)) return false;
      if (isOnQuestionSlide(doc)) return false;
      const mediaArticle = getFirstBrightcoveArticle();
      if (!mediaArticle) return false;
      const rect = mediaArticle.getBoundingClientRect();
      const vh = win.innerHeight || doc.documentElement.clientHeight;
      if (rect.top > vh * 0.45) return true;
      if (rect.bottom > 0 && rect.top > vh * 0.35) return true;
      return false;
    }
    function shouldInteractWithVideo(video, elWindow = win) {
      if (!video) return false;
      if (isAssessmentResultVisible(doc)) return false;
      if (hasReadableContentBeforeMedia()) return false;
      const brightcove = video.closest("brightcove-view");
      if (brightcove?.classList.contains("animated-hide")) return false;
      const rect = video.getBoundingClientRect();
      if (rect.width < 64 || rect.height < 48) return false;
      const vis = elementVisibilityRatio(video, elWindow);
      if (vis < 0.4) return false;
      const vh = elWindow.innerHeight || doc.documentElement.clientHeight;
      const vw = elWindow.innerWidth || doc.documentElement.clientWidth;
      const cy = rect.top + rect.height / 2;
      const cx = rect.left + rect.width / 2;
      const inset = 12;
      if (cy < inset || cy > vh - inset || cx < inset || cx > vw - inset) return false;
      let el = video.parentElement;
      while (el && el !== doc.body) {
        const style = elWindow.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (parseFloat(style.opacity) < 0.05) return false;
        el = el.parentElement;
      }
      const block = video.closest('block-view, [class*="block"]');
      if (block && elementVisibilityRatio(block, elWindow) < 0.2) return false;
      return true;
    }
    function findScrollContainer() {
      const scrollingElement = doc.scrollingElement || doc.documentElement;
      const docScrollHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      if (docScrollHeight > win.innerHeight + 1) return { useWindow: true };
      const candidates = [
        doc.querySelector(".page__inner"),
        doc.querySelector(".article__container"),
        doc.body,
        doc.documentElement
      ];
      let best = null;
      let bestArea = 0;
      for (const el of candidates) {
        if (!el) continue;
        const sh = el.scrollHeight;
        const ch = el.clientHeight;
        if (sh > ch + 50 && el.clientWidth * ch > bestArea) {
          bestArea = el.clientWidth * ch;
          best = el;
        }
      }
      if (best) return { useWindow: false, element: best };
      if (scrollingElement.scrollHeight > scrollingElement.clientHeight + 1) {
        return { useWindow: false, element: scrollingElement };
      }
      return { useWindow: true };
    }
    function createScrollState() {
      let scrollContainer = findScrollContainer();
      function getScrollElement() {
        if (!scrollContainer.useWindow && scrollContainer.element) {
          return scrollContainer.element;
        }
        return doc.scrollingElement || doc.documentElement;
      }
      function getScrollTop() {
        if (scrollContainer.useWindow) return win.scrollY;
        return scrollContainer.element.scrollTop;
      }
      function getMaxScrollPx() {
        const clientHeight = scrollContainer.useWindow ? win.innerHeight : scrollContainer.element.clientHeight;
        const scrollHeight = scrollContainer.useWindow ? Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight) : scrollContainer.element.scrollHeight;
        return Math.max(0, scrollHeight - clientHeight);
      }
      function getScrollPercent() {
        const maxScroll = getMaxScrollPx();
        if (maxScroll <= 5) return 100;
        const scrollTop = scrollContainer.useWindow ? win.scrollY : scrollContainer.element.scrollTop;
        return scrollTop / maxScroll * 100;
      }
      function scrollByStep(amount) {
        if (scrollContainer.useWindow) win.scrollBy({ top: amount, behavior: "instant" });
        else scrollContainer.element.scrollTop += amount;
      }
      function isAtScrollBottom() {
        if (getScrollPercent() < BOTTOM_PERCENT && getMaxScrollPx() > 5) return false;
        const docMax = Math.max(
          doc.documentElement.scrollHeight,
          doc.body.scrollHeight
        ) - win.innerHeight;
        return docMax <= 5 || win.scrollY >= docMax - 8;
      }
      function scrollToBottom() {
        const max = getMaxScrollPx();
        if (scrollContainer.useWindow) {
          win.scrollTo({ top: max, behavior: "instant" });
        } else {
          scrollContainer.element.scrollTop = max;
        }
        const docMax = Math.max(
          doc.documentElement.scrollHeight,
          doc.body.scrollHeight
        ) - win.innerHeight;
        if (docMax > 5 && win.scrollY < docMax - 8) {
          win.scrollTo({ top: docMax, behavior: "instant" });
        }
      }
      function refreshScrollContainer() {
        scrollContainer = findScrollContainer();
      }
      return {
        getScrollElement,
        getScrollTop,
        getScrollPercent,
        getMaxScrollPx,
        scrollByStep,
        isAtScrollBottom,
        scrollToBottom,
        refreshScrollContainer,
        get scrollContainer() {
          return scrollContainer;
        }
      };
    }
    function isModuleNavButton(btn) {
      if (!btn) return false;
      const cls = typeof btn.className === "string" ? btn.className : "";
      return /moduleNavBtn|moduleNavIcon/i.test(cls);
    }
    function findInContentNextButton(getVisibleAssessmentRoot, isAssessmentInProgress, root = doc, opts = {}) {
      const allowOnResult = opts.allowOnResult ?? false;
      if (!allowOnResult && getVisibleAssessmentRoot(0.15) && isAssessmentInProgress()) return null;
      const candidates = deepQuerySelectorAll(
        'button.article__btn-arrow.is-right, button[data-blockstrip-slider="right"]',
        root
      );
      for (const btn of candidates) {
        if (isModuleNavButton(btn)) continue;
        if (btn.closest(".assessment-1q, .abs__toolbar, .secure-toolbar-container")) continue;
        if (btn.closest(".block-buttons-container") && btn.closest(".assessment-1q, .abs__container.has-arrows")) {
          continue;
        }
        if (btn.disabled || btn.classList.contains("is-disabled") || btn.getAttribute("aria-disabled") === "true") continue;
        if (!isElementSubstantiallyVisible(btn, 0.12)) continue;
        return btn;
      }
      return null;
    }
    function findModuleNavNextButton() {
      const topDoc = getTopDocument();
      const btns = topDoc.querySelectorAll(
        'button.moduleNavBtn--sFwjV.next--3dfUb, button[class*="moduleNavBtn"][class*="next--"]'
      );
      for (const btn of btns) {
        if (btn.disabled || btn.classList.contains("disabled")) continue;
        return btn;
      }
      return null;
    }
    function handleVideoTick(video, processedVideos, runtime) {
      if (processedVideos.has(video)) return false;
      if (!shouldInteractWithVideo(video, win)) {
        if (elementVisibilityRatio(video, win) < 0.12) {
          processedVideos.add(video);
        }
        return false;
      }
      processedVideos.add(video);
      runtime.isPaused = true;
      const failsafeTimer = setTimeout(() => {
        if (runtime.isPaused) runtime.isPaused = false;
      }, 1e4);
      video.muted = true;
      const performSkip = () => {
        setTimeout(() => {
          const doSkip = () => {
            video.currentTime = video.duration && !isNaN(video.duration) ? Math.max(0, video.duration - 0.5) : 99999;
            video.addEventListener("ended", () => {
              clearTimeout(failsafeTimer);
              runtime.isPaused = false;
            }, { once: true });
          };
          if (!isNaN(video.duration) && video.duration > 0) doSkip();
          else {
            video.addEventListener("loadedmetadata", doSkip, { once: true });
            setTimeout(doSkip, 1500);
          }
        }, 300);
      };
      if (!video.paused && video.currentTime > 0) performSkip();
      else {
        video.addEventListener("play", performSkip, { once: true });
        const playerWrapper = video.closest(".video-js, .plyr, .player-wrapper") || video.parentElement;
        let playClicked = false;
        if (playerWrapper) {
          const bigPlayBtn = playerWrapper.querySelector(
            '.vjs-big-play-button, .play-button, .plyr__control--overlaid, button[aria-label="Play"]'
          );
          if (bigPlayBtn && bigPlayBtn.offsetParent !== null) {
            setTimeout(() => {
              bigPlayBtn.click();
              playClicked = true;
            }, 200);
          }
        }
        setTimeout(() => {
          if (video.paused) {
            const playPromise = video.play();
            if (playPromise !== void 0) playPromise.catch(() => {
            });
          }
        }, playClicked ? 600 : 200);
      }
      return true;
    }
    return {
      hasReadableContentBeforeMedia,
      shouldInteractWithVideo,
      createScrollState,
      findInContentNextButton,
      findModuleNavNextButton,
      handleVideoTick,
      isElementSubstantiallyVisible
    };
  }
  var lastText = "";
  var lastAt = 0;
  function setStatus(text) {
    const t = String(text || "").trim();
    if (!t) return;
    const now = Date.now();
    if (t === lastText && now - lastAt < 600) return;
    lastText = t;
    lastAt = now;
    if (typeof window.__netacadSetStatus === "function") {
      window.__netacadSetStatus(t);
    }
  }
  function resetStatusThrottle() {
    lastText = "";
    lastAt = 0;
  }
  function createMainLoop(doc, win, databases) {
    const assessment = createAssessmentHelpers(doc, win);
    const content = createContentHelpers(doc, win, assessment);
    const scroll = content.createScrollState();
    const clickedButtons = /* @__PURE__ */ new Set();
    const processedVideos = /* @__PURE__ */ new Set();
    const runtime = { isAdvancing: false, isPaused: false, stopped: false };
    let lastAssessmentQContainer = null;
    let lastAssessmentQContainerTick = 0;
    let tickTimer = null;
    let restartTimer = null;
    let cooldownUntil = 0;
    let lastActionAt = 0;
    let loopTicks = 0;
    function defaultActionCooldownMs() {
      return isPracticeExam() ? TICK_MS_PRACTICE_AFTER : TICK_MS_AFTER_ACTION;
    }
    function bumpCooldown(ms) {
      const delay = ms ?? defaultActionCooldownMs();
      cooldownUntil = Date.now() + delay;
      lastActionAt = Date.now();
    }
    function getAssessmentPollMs() {
      if (isPracticeExam()) return TICK_MS_PRACTICE_POLL;
      if (Date.now() - lastActionAt < POST_ACTION_FAST_POLL_MS) return TICK_MS_POST_ACTION_POLL;
      return TICK_MS_ASSESSMENT;
    }
    function getAssessmentIdleMs() {
      return isPracticeExam() ? TICK_MS_PRACTICE_IDLE : TICK_MS_ASSESSMENT;
    }
    function getTickDelay() {
      if (runtime.isPaused || runtime.isAdvancing) return 300;
      const wait = cooldownUntil - Date.now();
      if (wait > 0) return wait;
      if (assessment.isAssessmentInProgress() && assessment.isAssessmentStarted(clickedButtons)) {
        return getAssessmentPollMs();
      }
      return TICK_MS_SCROLL;
    }
    function scheduleNextTick(delay) {
      if (runtime.stopped) return;
      clearTimeout(tickTimer);
      tickTimer = setTimeout(runMainTick, delay);
    }
    function scheduleAssessmentPoll() {
      const afterAction = Date.now() - lastActionAt < POST_ACTION_FAST_POLL_MS;
      const delay = isPracticeExam() ? TICK_MS_PRACTICE_POLL : afterAction ? TICK_MS_POST_ACTION_POLL : getAssessmentIdleMs();
      scheduleNextTick(delay);
    }
    function runMainTick() {
      if (runtime.stopped) return;
      try {
        runMainTickBody();
      } catch (e) {
        console.error("[AutoRunner] tick:", e);
        scheduleNextTick(TICK_MS_SCROLL);
      }
    }
    function runMainTickBody() {
      if (runtime.isAdvancing) {
        scheduleNextTick(300);
        return;
      }
      if (runtime.isPaused) {
        scheduleNextTick(300);
        return;
      }
      if (Date.now() < cooldownUntil) {
        scheduleNextTick(getTickDelay());
        return;
      }
      loopTicks++;
      const assessmentRoot = assessment.getVisibleAssessmentRoot(0.15);
      const assessmentDone = assessment.isAssessmentResultVisible(doc) || assessmentRoot && assessment.isAssessmentComplete(assessmentRoot);
      if (assessmentDone) {
        setStatus("Done");
        if (assessmentRoot) {
          delete assessmentRoot.dataset.quizInProgress;
          delete assessmentRoot.dataset.blockedNavWarned;
          delete assessmentRoot.dataset.waitingStart;
          assessment.markInAssessmentStartsHandled(assessmentRoot, clickedButtons);
        }
      } else if (assessmentRoot) {
        if (assessment.isAssessmentInProgress()) {
          delete assessmentRoot.dataset.waitingStart;
          assessmentRoot.dataset.quizInProgress = "true";
          assessment.markInAssessmentStartsHandled(assessmentRoot, clickedButtons);
        } else {
          delete assessmentRoot.dataset.quizInProgress;
          delete assessmentRoot.dataset.waitingStart;
          for (const btn of assessment.getInAssessmentStartButtons(assessmentRoot)) {
            if (clickedButtons.has(btn)) continue;
            if (!assessment.isElementSubstantiallyVisible(btn, 0.4)) continue;
            btn.click();
            clickedButtons.add(btn);
            setStatus("Start");
            bumpCooldown(isPracticeExam() ? 300 : 600);
            invalidateShadowCache();
            scheduleNextTick(getTickDelay());
            return;
          }
        }
      }
      const finalScreens = deepQuerySelectorAll(".final-screen-inner", doc);
      for (const screen of finalScreens) {
        if (!assessment.isElementSubstantiallyVisible(screen, 0.35)) continue;
        const confirmCheckbox = deepQuerySelectorAll('#confirm-exam, input[name="confirm"]', screen)[0];
        if (confirmCheckbox && !confirmCheckbox.checked) {
          confirmCheckbox.click();
          bumpCooldown(500);
          scheduleNextTick(getTickDelay());
          return;
        }
        const finalSubmitBtn = deepQuerySelectorAll(".adaptive-assessment-submit", screen)[0];
        if (finalSubmitBtn && !finalSubmitBtn.classList.contains("is-disabled") && !finalSubmitBtn.disabled) {
          finalSubmitBtn.click();
          setStatus("Submit");
          bumpCooldown(800);
          invalidateShadowCache();
          scheduleNextTick(getTickDelay());
          return;
        }
      }
      if (!assessmentDone && assessmentRoot && assessment.isAssessmentStarted(clickedButtons)) {
        const activeDb = databases.getActiveDb(doc);
        let qContainer = assessment.findReadyQuestionContainer(assessmentRoot);
        if (!qContainer && assessment.hasQuestionContent(assessmentRoot)) {
          if (assessment.scrollQuestionIntoView(assessmentRoot)) {
            setStatus("Scroll");
            scheduleNextTick(TICK_MS_SCROLL);
            return;
          }
        }
        if (qContainer) {
          setStatus("Quiz");
          lastAssessmentQContainer = qContainer;
          lastAssessmentQContainerTick = loopTicks;
        } else if (lastAssessmentQContainer && loopTicks - lastAssessmentQContainerTick <= 20 && assessment.isQuestionReadyToAnswer(lastAssessmentQContainer)) {
          qContainer = lastAssessmentQContainer;
          setStatus("Quiz");
        }
        if (assessment.isAssessmentInProgress() && !qContainer && !assessmentRoot.dataset.noMcqWarned) {
          assessmentRoot.dataset.noMcqWarned = "true";
          scheduleAssessmentPoll();
          return;
        }
        if (qContainer) delete assessmentRoot.dataset.noMcqWarned;
        if (qContainer) {
          const qTextEl = getQuestionBodyEl(qContainer);
          if (!qTextEl) {
            scheduleAssessmentPoll();
            return;
          }
          const qText = extractCleanText(qTextEl);
          const tag = databases.getDbTag(activeDb.mode);
          if (!activeDb.ready) {
            if (!qContainer.dataset.warned) {
              const dbName = databases.getDbVarName(activeDb.mode);
              console.error(`[AutoRunner] ${tag} ${dbName} is not defined. Paste the JSON database before running.`);
              qContainer.dataset.warned = "true";
            }
            scheduleAssessmentPoll();
            return;
          }
          const entry = databases.lookupEntryCached(activeDb, qText);
          if (!entry) {
            if (!qContainer.dataset.warned) {
              qContainer.dataset.warned = "true";
            }
            const userDone = isQuestionAnswered(qContainer) || isSubmitEnabled(doc);
            if (!userDone) {
              scheduleAssessmentPoll();
              return;
            }
            delete qContainer.dataset.warned;
            if (trySubmitAndAdvance(doc, qContainer)) {
              setStatus("Submit");
              bumpCooldown();
              invalidateShadowCache();
            }
            scheduleAssessmentPoll();
            return;
          }
          if (shouldTreatAsManual(entry, qContainer)) {
            if (waitForManualCompletion(qContainer, doc, entry)) {
              setStatus("Manual");
              scheduleAssessmentPoll();
              return;
            }
            if (trySubmitAndAdvance(doc, qContainer)) bumpCooldown();
            scheduleAssessmentPoll();
            return;
          }
          runtime.isPaused = false;
          const acted = solveQuestion(
            qContainer,
            entry,
            qText,
            doc,
            isPracticeExam()
          );
          if (acted) {
            setStatus("Answer");
            bumpCooldown();
          }
          if (acted) {
            if (isPracticeExam() && isQuestionAnswered(qContainer) && trySubmitAndAdvance(doc, qContainer)) {
              bumpCooldown();
              invalidateShadowCache();
            }
            scheduleAssessmentPoll();
            return;
          }
          if (!isQuestionAnswered(qContainer)) {
            scheduleAssessmentPoll();
            return;
          }
          if (trySubmitAndAdvance(doc, qContainer)) {
            bumpCooldown();
            invalidateShadowCache();
            scheduleAssessmentPoll();
            return;
          }
          scheduleAssessmentPoll();
          return;
        }
      } else if (assessmentRoot && !assessment.isAssessmentResultVisible(doc) && !assessment.isAssessmentComplete(assessmentRoot) && !assessment.isAssessmentInProgress() && !assessment.isAssessmentStarted(clickedButtons)) {
        assessmentRoot.dataset.waitingStart = "true";
      }
      if (!assessmentDone && assessmentRoot && assessment.hasQuestionContent(assessmentRoot)) {
        if (assessment.scrollQuestionIntoView(assessmentRoot)) {
          setStatus("Scroll");
          scheduleNextTick(TICK_MS_SCROLL);
          return;
        }
      }
      if (!assessmentDone && assessmentRoot && assessment.isAssessmentInProgress()) {
        const pending = assessment.findReadyQuestionContainer(assessmentRoot);
        if (!pending) {
          if (assessment.scrollQuestionIntoView(assessmentRoot)) {
            setStatus("Scroll");
            scheduleNextTick(TICK_MS_SCROLL);
            return;
          }
        }
        scheduleAssessmentPoll();
        return;
      }
      if (content.hasReadableContentBeforeMedia() && scroll.getScrollPercent() < 99) {
        const scrollEl = scroll.getScrollElement();
        const step = scroll.scrollContainer.useWindow ? win.innerHeight * 0.55 : scrollEl.clientHeight * 0.55;
        if (scroll.scrollContainer.useWindow) win.scrollBy(0, step);
        else scrollEl.scrollTop += step;
        setStatus("Scroll");
        scheduleNextTick(TICK_MS_SCROLL);
        return;
      }
      const allowInlineButtons = !content.hasReadableContentBeforeMedia() && (scroll.getScrollPercent() > 10 || scroll.getScrollTop() > 100);
      const buttons = deepQuerySelectorAll(
        "button.open-dialog, button.btn__action:not(.reset-answer):not(.change-question):not(.adaptive-assessment-submit):not(.submit-button), button.tabs__nav-item-btn",
        doc
      );
      for (const btn of buttons) {
        if (btn.disabled || btn.classList.contains("disabled")) continue;
        if (!allowInlineButtons) continue;
        if (!clickedButtons.has(btn) && content.isElementSubstantiallyVisible(btn, 0.35, win)) {
          runtime.isPaused = true;
          setStatus("Click");
          btn.click();
          clickedButtons.add(btn);
          bumpCooldown(400);
          setTimeout(() => {
            runtime.isPaused = false;
          }, 400);
          scheduleNextTick(getTickDelay());
          return;
        }
      }
      if (!content.hasReadableContentBeforeMedia()) {
        const videos = deepQuerySelectorAll("video", doc).map((v) => ({ video: v }));
        if (assessment.isAssessmentResultVisible(doc)) {
          videos.forEach(({ video }) => processedVideos.add(video));
        }
        for (const { video } of videos) {
          if (content.handleVideoTick(video, processedVideos, runtime)) {
            setStatus("Video");
            scheduleNextTick(getTickDelay());
            return;
          }
        }
      }
      const percentDown = scroll.getScrollPercent();
      const keepScrollingForAssessment = assessment.needsMoreScrollForAssessment(clickedButtons);
      const navRoot = assessmentRoot || assessment.getVisibleAssessmentRoot(0.15);
      const onQuizResult = assessmentDone || assessment.isOnQuizResultScreen(navRoot);
      if (!onQuizResult && assessment.shouldBlockModuleAdvance(navRoot, isSubmitEnabled, isQuestionAnswered)) {
        if (navRoot) navRoot.dataset.blockedNavWarned = "true";
        scheduleAssessmentPoll();
        return;
      }
      if (navRoot) delete navRoot.dataset.blockedNavWarned;
      if (onQuizResult) {
        const moduleNext2 = content.findModuleNavNextButton();
        if (moduleNext2) {
          runtime.isAdvancing = true;
          clearTimeout(tickTimer);
          setStatus("Next");
          moduleNext2.click();
          clearTimeout(restartTimer);
          restartTimer = setTimeout(() => window.autoRunnerRestart?.(), 4e3);
          return;
        }
        if (navRoot && assessment.tryExitQuizResult(navRoot)) {
          setStatus("Next");
          bumpCooldown(500);
          scheduleNextTick(getTickDelay());
          return;
        }
        if (!scroll.isAtScrollBottom()) {
          scroll.scrollToBottom();
          setStatus("Scroll");
          scheduleNextTick(TICK_MS_SCROLL);
          return;
        }
      }
      const contentNext = content.findInContentNextButton(
        assessment.getVisibleAssessmentRoot,
        assessment.isAssessmentInProgress,
        doc,
        { allowOnResult: onQuizResult }
      );
      const atScrollBottom = scroll.isAtScrollBottom();
      if (contentNext && atScrollBottom && !keepScrollingForAssessment) {
        setStatus("Next");
        contentNext.click();
        scroll.refreshScrollContainer();
        invalidateShadowCache();
        bumpCooldown(500);
        scheduleNextTick(getTickDelay());
        return;
      }
      if (onQuizResult && !scroll.isAtScrollBottom()) {
        scroll.scrollToBottom();
        setStatus("Scroll");
        scheduleNextTick(TICK_MS_SCROLL);
        return;
      }
      if (percentDown < BOTTOM_PERCENT || keepScrollingForAssessment) {
        const viewport = scroll.scrollContainer.useWindow ? win.innerHeight : scroll.scrollContainer.element.clientHeight;
        scroll.scrollByStep(Math.round(viewport * SCROLL_PERCENTAGE));
        setStatus("Scroll");
        scheduleNextTick(TICK_MS_SCROLL);
        return;
      }
      const moduleNext = content.findModuleNavNextButton();
      if (moduleNext) {
        runtime.isAdvancing = true;
        clearTimeout(tickTimer);
        setStatus("Next");
        moduleNext.click();
        clearTimeout(restartTimer);
        restartTimer = setTimeout(() => window.autoRunnerRestart?.(), 4e3);
        return;
      }
      scheduleNextTick(getTickDelay());
    }
    function stop() {
      runtime.stopped = true;
      clearTimeout(tickTimer);
      clearTimeout(restartTimer);
      tickTimer = null;
      restartTimer = null;
    }
    return {
      start() {
        runtime.stopped = false;
        runMainTick();
      },
      stop
    };
  }
  var activeLoop = null;
  var iframeRetryTimer = null;
  var running = false;
  function clearIframeRetry() {
    if (iframeRetryTimer) {
      clearTimeout(iframeRetryTimer);
      iframeRetryTimer = null;
    }
  }
  function attachLoop(doc, win) {
    const databases = initDatabases();
    activeLoop = createMainLoop(doc, win, databases);
  }
  function startRunner() {
    if (activeLoop) return;
    running = true;
    resetStatusThrottle();
    setStatus("Running");
    try {
      if (typeof RAW_DB === "undefined") {
        console.error("[AutoRunner] RAW_DB is not defined.");
        setStatus("No data");
        running = false;
        return;
      }
      const iframe = findCourseIframe();
      if (!iframe) {
        setStatus("Find frame");
        clearIframeRetry();
        iframeRetryTimer = setTimeout(() => {
          iframeRetryTimer = null;
          startRunner();
        }, 2e3);
        return;
      }
      clearIframeRetry();
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument || win.document;
      attachLoop(doc, win);
      activeLoop.start();
    } catch (e) {
      console.error("[AutoRunner] FATAL:", e);
      try {
        window.top.console.error("[AutoRunner] FATAL:", e);
      } catch {
      }
      setStatus("Error");
      running = false;
    }
  }
  function stopRunner() {
    running = false;
    clearIframeRetry();
    if (activeLoop) {
      activeLoop.stop();
      activeLoop = null;
    }
    setStatus("Stopped");
  }
  function isRunnerActive() {
    return running;
  }
  function restartRunner() {
    stopRunner();
    startRunner();
  }
  window.__netacadRunner = {
    start: startRunner,
    stop: stopRunner,
    isRunning: isRunnerActive,
    restart: restartRunner
  };
  window.autoRunnerRestart = () => {
    if (isRunnerActive()) restartRunner();
  };
  if (!window.__NETACAD_EXTENSION) {
    startRunner();
  }
})();
