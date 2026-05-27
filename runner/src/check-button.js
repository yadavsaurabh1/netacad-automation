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

import { deepQuerySelectorAll } from './dom.js';

export function isCheckPending(checkView) {
    const solution = deepQuerySelectorAll('.check__solution', checkView)[0];
    if (!solution) return true;
    return solution.classList.contains('check__hidden');
}

export function tryClickVisibleCheck(doc, scope = doc, opts = {}) {
    const minVis = opts.minVis ?? 0.15;
    const visFn = opts.elementVisibilityRatio;
    if (!visFn) return false;

    let bestBtn = null;
    let bestVis = 0;

    for (const btn of deepQuerySelectorAll('button.check__button', scope)) {
        if (btn.disabled || btn.classList.contains('is-disabled') || btn.hasAttribute('disabled')) {
            continue;
        }

        const checkView = btn.closest('check-view') ||
            deepQuerySelectorAll('check-view', scope).find(cv =>
                deepQuerySelectorAll('button.check__button', cv)[0] === btn,
            );
        if (checkView && !isCheckPending(checkView)) continue;

        const vis = visFn(btn);
        if (vis < minVis || vis <= bestVis) continue;

        bestVis = vis;
        bestBtn = btn;
    }

    if (!bestBtn) return false;
    bestBtn.click();
    return true;
}
