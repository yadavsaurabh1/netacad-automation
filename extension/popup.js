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

const courseEl = document.getElementById('course');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const stateEl = document.getElementById('state');
const logEl = document.getElementById('log');
const hintEl = document.getElementById('hint');

function renderLog(entries) {
    logEl.innerHTML = '';
    const items = entries.length ? entries : ['Idle'];
    for (const text of items) {
        const li = document.createElement('li');
        li.textContent = text;
        logEl.appendChild(li);
    }
}

function setUi(running, lastStatus) {
    startBtn.disabled = running;
    stopBtn.disabled = !running;
    courseEl.disabled = running;

    stateEl.classList.remove('off', 'err');
    if (lastStatus === 'Error' || lastStatus === 'Bad tab') {
        stateEl.classList.add('err');
        stateEl.textContent = lastStatus;
    } else if (running) {
        stateEl.textContent = lastStatus || 'Running';
    } else {
        stateEl.classList.add('off');
        stateEl.textContent = lastStatus || 'Idle';
    }
}

async function loadState() {
    const data = await chrome.storage.local.get(['course', 'running', 'lastStatus', 'statusLog']);
    if (data.course) courseEl.value = data.course;
    renderLog(data.statusLog || []);
    setUi(!!data.running, data.lastStatus);
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    chrome.storage.local.get(['running', 'lastStatus', 'statusLog', 'course']).then((data) => {
        if (changes.course?.newValue) courseEl.value = changes.course.newValue;
        renderLog(data.statusLog || []);
        setUi(!!data.running, data.lastStatus);
    });
});

courseEl.addEventListener('change', () => {
    chrome.storage.local.set({ course: courseEl.value });
});

startBtn.addEventListener('click', async () => {
    const course = courseEl.value;
    await chrome.storage.local.set({ course });
    hintEl.classList.add('hidden');
    startBtn.disabled = true;

    const res = await chrome.runtime.sendMessage({ type: 'start', course });
    if (!res?.ok) {
        hintEl.textContent = res?.error || 'Could not start.';
        hintEl.classList.remove('hidden');
    }
    await loadState();
});

stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    await chrome.runtime.sendMessage({ type: 'stop' });
    await loadState();
});

loadState();
