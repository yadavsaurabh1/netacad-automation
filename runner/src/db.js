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

import {
    expandLayerAliases,
    isGenericPtQuestion,
    normalizeText,
    questionLookupKey,
    stripChooseClause,
    stripPtActivityBoilerplate,
    textSimilarity,
} from './text.js';
import { isCheckpointExam, isModuleQuiz, isPracticeExam } from './exam-type.js';

function isProseCommaAnswer(parts) {
    if (parts.length !== 2) return false;
    return /^if (the |an |a )/.test(parts[0]) &&
        /^the (system|switch|device|router|network|led|host)/i.test(parts[1]);
}

function expandAnswerList(answers, question) {
    const expanded = [];
    const qNorm = normalizeText(question || '');
    const isOrderQuestion = /\b(correct order|in order|proper order|sequence)\b/i.test(qNorm);

    for (const raw of answers || []) {
        const n = normalizeText(raw);
        if (!n.includes(',')) {
            expanded.push(n);
            continue;
        }
        const parts = n.split(',').map(p => p.trim()).filter(Boolean);
        const looksLikeOptionList = parts.length >= 2 && parts.length <= 8 &&
            parts.every(p => p.length > 0 && p.length < 80) &&
            !isOrderQuestion &&
            !isProseCommaAnswer(parts);
        if (looksLikeOptionList) {
            expanded.push(...parts);
        } else {
            expanded.push(n);
        }
    }
    return expanded;
}

function isAssessmentQuestionItem(item) {
    return !!(item && typeof item === 'object' && typeof item.question === 'string');
}

function isAssessmentDatasetBundle(rawDb) {
    if (!Array.isArray(rawDb) || !rawDb.length) return false;
    return !isAssessmentQuestionItem(rawDb[0]);
}

function compileCyuDb(rawDb, targetMap) {
    for (const section in rawDb) {
        rawDb[section].forEach(item => {
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
    } else if (rawDb && typeof rawDb === 'object') {
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
            imageUrl: item.imageUrl || null,
        });
    }
}

function collectPracticeExamSources() {
    const sources = [];
    if (typeof PRACTICE_EXAM_DBS !== 'undefined') {
        const raw = PRACTICE_EXAM_DBS;
        if (Array.isArray(raw) && isAssessmentDatasetBundle(raw)) {
            sources.push(...raw);
        } else {
            sources.push(raw);
        }
    }
    if (typeof PRACTICE_EXAM_DB !== 'undefined') {
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
            key,
        };
    }
    return null;
}

function isAssessmentEntryMode(mode) {
    return mode === 'checkpoint' || mode === 'practice';
}

export function findBestQuestionMatch(map, qText, isCheckpoint) {
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
                key,
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
            fuzzy: true,
        };
    }
    return { entry: null, score: bestScore, key: bestKey };
}

function lookupEntry(databases, activeDb, qText) {
    if (!activeDb.ready) return null;
    const isCheckpoint = isAssessmentEntryMode(activeDb.mode);
    let result = findBestQuestionMatch(activeDb.map, qText, isCheckpoint);

    if (!result.entry && activeDb.mode === 'cyu' && typeof QUIZ_DB !== 'undefined') {
        result = findBestQuestionMatch(databases.quizMap, qText, false);
    }
    if (!result.entry && activeDb.mode === 'quiz') {
        result = findBestQuestionMatch(databases.cyuDb, qText, false);
    }
    if (!result.entry && activeDb.mode === 'cyu' && typeof CHECKPOINT_DB !== 'undefined') {
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

const LOOKUP_MISS = Symbol('lookup-miss');

export function initDatabases() {
    const cyuDb = new Map();
    const quizMap = new Map();
    const checkpointMap = new Map();
    const practiceMap = new Map();

    compileCyuDb(RAW_DB, cyuDb);
    if (typeof QUIZ_DB !== 'undefined') {
        compileCyuDb(QUIZ_DB, quizMap);
    }
    if (typeof CHECKPOINT_DB !== 'undefined') {
        compileAssessmentDb(CHECKPOINT_DB, checkpointMap);
    }
    for (const src of collectPracticeExamSources()) {
        compileAssessmentDb(src, practiceMap);
    }

    const entryLookupCache = new Map();

    function getActiveDb(doc) {
        if (isPracticeExam()) {
            if (!practiceMap.size) {
                return { mode: 'practice', ready: false, map: null };
            }
            return { mode: 'practice', ready: true, map: practiceMap };
        }
        if (isCheckpointExam()) {
            if (typeof CHECKPOINT_DB === 'undefined') {
                return { mode: 'checkpoint', ready: false, map: null };
            }
            return { mode: 'checkpoint', ready: true, map: checkpointMap };
        }
        if (isModuleQuiz(doc)) {
            if (typeof QUIZ_DB === 'undefined') {
                return { mode: 'quiz', ready: false, map: null };
            }
            return { mode: 'quiz', ready: true, map: quizMap };
        }
        return { mode: 'cyu', ready: true, map: cyuDb };
    }

    function getDbTag(mode) {
        if (mode === 'checkpoint') return '[Checkpoint]';
        if (mode === 'practice') return '[Practice]';
        if (mode === 'quiz') return '[Quiz]';
        return '[CYU]';
    }

    function getDbVarName(mode) {
        if (mode === 'checkpoint') return 'CHECKPOINT_DB';
        if (mode === 'practice') return 'PRACTICE_EXAM_DB / PRACTICE_EXAM_DBS';
        if (mode === 'quiz') return 'QUIZ_DB';
        return 'RAW_DB';
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
            qText,
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
        isAssessmentEntryMode,
    };
}
